// Supabase Edge Function: Stripe → Sled Finder membership.
// Stripe calls this URL after checkout, renewals, cancellations and failed payments. It sets
// profiles.premium_until (and the Stripe ids) with the service-role key, which the app itself never has.
//
// Deploy (see docs/go-live.md):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_DAYS = 3; // keep Premium on a few days past the period end while Stripe retries a failed renewal

// Newer Stripe API versions keep the period end on the subscription item; older ones on the subscription.
function periodEnd(sub: Stripe.Subscription): number | null {
  // deno-lint-ignore no-explicit-any
  const s = sub as any;
  return s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
}
const iso = (unix: number) => new Date(unix * 1000).toISOString();
const custId = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null) => (typeof c === "string" ? c : c?.id ?? null);

async function applySubscription(sub: Stripe.Subscription, userId?: string | null) {
  const customer = custId(sub.customer);
  let until: string | null = null;
  const end = periodEnd(sub);
  if (["active", "trialing"].includes(sub.status) && end) until = iso(end);
  else if (["past_due", "unpaid"].includes(sub.status) && end) until = iso(end + GRACE_DAYS * 86400);
  else if (sub.status === "canceled") until = iso(sub.ended_at ?? Math.floor(Date.now() / 1000)); // ends now → "lapsed"
  else if (sub.status === "incomplete" || sub.status === "incomplete_expired") return; // first payment never went through

  const patch: Record<string, unknown> = { stripe_customer_id: customer, stripe_subscription_id: sub.id, premium_until: until };
  const q = db.from("profiles").update(patch, { count: "exact" });
  const { error, count } = await (userId ? q.eq("id", userId) : q.eq("stripe_customer_id", customer!));
  if (error) throw error;
  if (!count) console.warn("no profile matched", { userId, customer, sub: sub.id });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", undefined, cryptoProvider);
  } catch (e) {
    return new Response(`bad signature: ${(e as Error).message}`, { status: 400 });
  }
  // Idempotency: Stripe may deliver the same event more than once.
  const { error: dup } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) {
    if (dup.code === "23505") return new Response("duplicate", { status: 200 });
    return new Response(dup.message, { status: 500 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id && UUID.test(s.client_reference_id) ? s.client_reference_id : null;
        if (!userId) { console.warn("checkout without a Sled Finder account id", s.id); break; }
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          await applySubscription(sub, userId);
        } else if (s.payment_status === "paid") {
          // One-time payment link (no auto-renew): one year from today.
          const { error } = await db.from("profiles").update({
            stripe_customer_id: custId(s.customer), premium_until: new Date(Date.now() + 365 * 86400000).toISOString(),
          }).eq("id", userId);
          if (error) throw error;
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        // deno-lint-ignore no-explicit-any
        const subId = (inv as any).subscription ?? (inv as any).parent?.subscription_details?.subscription;
        if (subId) await applySubscription(await stripe.subscriptions.retrieve(typeof subId === "string" ? subId : subId.id));
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Let Stripe retry: forget the event id so the retry is processed.
    await db.from("stripe_events").delete().eq("id", event.id);
    console.error(event.type, e);
    return new Response("error", { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
