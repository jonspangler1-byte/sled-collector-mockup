// Supabase Edge Function: a signed-in member deletes their own Sled Finder account.
// Required by Apple (App Review 5.1.1(v)) and Google Play for apps that let people create accounts.
// Cancels any Stripe subscription, removes the member's photos, then deletes the auth user; the database
// cascades to their profile, sleds and sale ads.
//   supabase functions deploy delete-account        (keeps JWT verification on)
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ error: "not signed in" }, 401);
  const uid = who.user.id;

  const { data: prof } = await admin.from("profiles").select("stripe_subscription_id").eq("id", uid).maybeSingle();
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (prof?.stripe_subscription_id && key) {
    try {
      const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
      await stripe.subscriptions.cancel(prof.stripe_subscription_id);
    } catch (e) { console.warn("stripe cancel failed", (e as Error).message); }
  }
  // Remove photos: <uid>/<kind-clientId>/<file>
  const bucket = admin.storage.from("photos");
  const { data: folders } = await bucket.list(uid, { limit: 1000 });
  for (const f of folders ?? []) {
    const { data: files } = await bucket.list(`${uid}/${f.name}`, { limit: 1000 });
    const paths = (files ?? []).map((x) => `${uid}/${f.name}/${x.name}`);
    if (paths.length) await bucket.remove(paths);
  }
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
});
