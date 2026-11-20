// Signed-in member opens the Stripe Customer Portal to update their card or cancel.
//   supabase functions deploy create-portal-session
import { json, requireUser, readBody } from "../_shared/http.ts";
import { stripeClient } from "../_shared/stripe_client.ts";
import { appHashUrl, safeAppBase } from "../_shared/membership.mjs";

Deno.serve(async (req) => {
  const auth = await requireUser(req);
  if ("preflight" in auth) return auth.preflight!;
  if ("error" in auth) return auth.error!;
  const { db, user } = auth;
  const body = await readBody(req);
  const base = safeAppBase(String(body.return_origin || ""), Deno.env.get("SITE_URL") || "");
  if (!base) return json({ error: "SITE_URL is not set" }, 500);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "Payments are not configured yet" }, 503);

  const { data: prof, error: pErr } = await db.from("profiles")
    .select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (pErr) return json({ error: pErr.message }, 500);
  if (!prof?.stripe_customer_id) return json({ error: "no_customer" }, 400);

  const stripe = stripeClient();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: appHashUrl(base, "account"),
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message || "Couldn't open the billing portal" }, 502);
  }
});
