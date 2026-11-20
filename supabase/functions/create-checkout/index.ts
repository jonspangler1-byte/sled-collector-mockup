// Signed-in member starts (or is sent to manage) a $15/yr Premium subscription.
// Creates a Stripe Checkout Session on the server so the user id cannot be edited in the URL.
//   supabase functions deploy create-checkout
import { json, requireUser, readBody } from "../_shared/http.ts";
import { stripeClient } from "../_shared/stripe_client.ts";
import {
  appHashUrl,
  hasOpenSubscription,
  METADATA_USER_KEY,
  randomIntegrationId,
  safeAppBase,
} from "../_shared/membership.mjs";

const OPEN = ["active", "past_due", "trialing", "unpaid"];

Deno.serve(async (req) => {
  const auth = await requireUser(req);
  if ("preflight" in auth) return auth.preflight!;
  if ("error" in auth) return auth.error!;
  const { db, user } = auth;
  const body = await readBody(req);
  const base = safeAppBase(String(body.return_origin || ""), Deno.env.get("SITE_URL") || "");
  if (!base) return json({ error: "SITE_URL is not set" }, 500);

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const price = Deno.env.get("STRIPE_PRICE_ID");
  if (!key || !price) return json({ error: "Payments are not configured yet" }, 503);

  const { data: prof, error: pErr } = await db.from("profiles")
    .select("stripe_customer_id,stripe_subscription_id,stripe_subscription_status")
    .eq("id", user.id).maybeSingle();
  if (pErr) return json({ error: pErr.message }, 500);

  const stripe = stripeClient();

  async function portalFor(customer: string) {
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: appHashUrl(base, "account"),
    });
    return json({ url: session.url, portal: true });
  }

  let customerId = prof?.stripe_customer_id as string | null;
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if ((customer as { deleted?: boolean }).deleted) customerId = null;
    } catch {
      customerId = null;
    }
  }

  if (customerId) {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const open = subs.data.find((s) => OPEN.includes(s.status) || hasOpenSubscription(s.status));
    if (open) return await portalFor(customerId);
  } else if (hasOpenSubscription(prof?.stripe_subscription_status)) {
    return json({ error: "An existing membership is on file, but the billing portal isn't available. Email Sled Finder for help." }, 409);
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { [METADATA_USER_KEY]: user.id },
    });
    customerId = customer.id;
    const { error } = await db.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    if (error) console.warn("could not save stripe_customer_id", error.message);
  } else {
    try {
      await stripe.customers.update(customerId, { metadata: { [METADATA_USER_KEY]: user.id } });
    } catch (e) { console.warn("could not tag customer", (e as Error).message); }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    success_url: appHashUrl(base, "upgrade"),
    cancel_url: appHashUrl(base, "upgrade"),
    metadata: { [METADATA_USER_KEY]: user.id },
    subscription_data: {
      metadata: { [METADATA_USER_KEY]: user.id },
      billing_mode: { type: "flexible" },
    },
    integration_identifier: randomIntegrationId(),
  });
  if (!session.url) return json({ error: "Checkout did not return a URL" }, 500);
  return json({ url: session.url });
});
