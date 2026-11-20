// Supabase Edge Function: a signed-in member deletes their own Sled Finder account.
// Required by Apple (App Review 5.1.1(v)) and Google Play for apps that let people create accounts.
// Cancels any Stripe subscription, removes the member's photos, then deletes the auth user; the database
// cascades to their profile, sleds and sale ads.
// If Stripe cancel fails and the subscription still exists, the account is left in place so billing
// cannot continue after the login is gone.
//   supabase functions deploy delete-account        (keeps JWT verification on)
import { json, requireUser } from "../_shared/http.ts";
import { stripeClient } from "../_shared/stripe_client.ts";
import { isStripeSubscriptionGoneError } from "../_shared/membership.mjs";

Deno.serve(async (req) => {
  const auth = await requireUser(req);
  if ("preflight" in auth) return auth.preflight!;
  if ("error" in auth) return auth.error!;
  const { db: admin, user } = auth;
  const uid = user.id;

  const { data: prof } = await admin.from("profiles").select("stripe_subscription_id").eq("id", uid).maybeSingle();
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (prof?.stripe_subscription_id) {
    if (!key) return json({ error: "Couldn't cancel the membership (payments aren't configured). Try again later, or use Manage membership first." }, 503);
    try {
      const stripe = stripeClient();
      await stripe.subscriptions.cancel(prof.stripe_subscription_id);
    } catch (e) {
      if (!isStripeSubscriptionGoneError(e)) {
        console.warn("stripe cancel failed", (e as Error).message);
        return json({ error: "Couldn't cancel the membership. Try again, or use Manage membership first." }, 502);
      }
    }
  }

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
