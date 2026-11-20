// Supabase Edge Function: Stripe → Sled Finder membership.
// Stripe calls this URL after checkout, renewals, cancellations, failed payments, refunds and lost disputes.
// It sets profiles.premium_until (and the Stripe ids) with the service-role key, which the app itself never has.
//
// Deploy (see docs/go-live.md):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_PRICE_ID=price_... SITE_URL=https://...
// Prefer a restricted key (rk_test_ / rk_live_) over a secret key (sk_...). Never put keys in the repo.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.
import Stripe from "npm:stripe@23";
import { stripeClient } from "../_shared/stripe_client.ts";
import { serviceDb } from "../_shared/http.ts";
import {
  customerId,
  invoiceSubscriptionId,
  isStripeSubscriptionGoneError,
  profilePatchFromSubscription,
  shouldRevokeOnDispute,
  shouldRevokeOnRefund,
  trustedCheckoutUserId,
  paymentIsPaid,
  userIdFromMetadata,
  uuidOrNull,
} from "../_shared/membership.mjs";

const stripe = stripeClient();
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const db = serviceDb();

async function accountEmail(userId: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) { console.warn("getUserById", userId, error.message); return null; }
  return data?.user?.email ?? null;
}

async function applySubscription(sub: Stripe.Subscription, userId?: string | null) {
  const patch = profilePatchFromSubscription(sub);
  if (!patch) return; // incomplete first payment
  const customer = patch.stripe_customer_id;
  const metaUser = userIdFromMetadata(sub);
  const uid = uuidOrNull(userId) || metaUser;
  const q = db.from("profiles").update(patch, { count: "exact" });
  const { error, count } = await (uid ? q.eq("id", uid) : q.eq("stripe_customer_id", customer!));
  if (error) throw error;
  if (!count) console.warn("no profile matched", { userId: uid, customer, sub: sub.id });
  if (uid && customer) {
    try { await stripe.customers.update(customer, { metadata: { supabase_user_id: uid } }); }
    catch (e) { console.warn("customer metadata", (e as Error).message); }
  }
}

async function applyCheckoutSession(s: Stripe.Checkout.Session) {
  if (!paymentIsPaid(s)) {
    console.log("checkout not paid yet", s.id, s.payment_status);
    return;
  }
  const hinted = uuidOrNull(s.metadata?.supabase_user_id) || uuidOrNull(s.client_reference_id);
  const email = hinted ? await accountEmail(hinted) : null;
  const userId = trustedCheckoutUserId(s, email);
  if (!userId) { console.warn("checkout without a trusted Sled Finder account id", s.id); return; }
  if (s.mode === "subscription" && s.subscription) {
    const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
    await applySubscription(sub, userId);
  } else if (s.payment_status === "paid") {
    const { error } = await db.from("profiles").update({
      stripe_customer_id: customerId(s.customer),
      premium_until: new Date(Date.now() + 365 * 86400000).toISOString(),
    }).eq("id", userId);
    if (error) throw error;
  }
}

async function loadSubscriptionFromCharge(charge: Stripe.Charge): Promise<Stripe.Subscription | null> {
  const invoiceRef = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  if (invoiceRef) {
    const inv = await stripe.invoices.retrieve(invoiceRef);
    const subId = invoiceSubscriptionId(inv);
    if (subId) return await stripe.subscriptions.retrieve(subId);
  }
  return null;
}

async function revokeForCustomer(customer: string | null, reason: string) {
  console.log("revoke premium", reason, customer);
  if (!customer) return;
  const until = new Date().toISOString();
  const { error, count } = await db.from("profiles").update({ premium_until: until }, { count: "exact" }).eq("stripe_customer_id", customer);
  if (error) throw error;
  if (!count) console.warn("refund/dispute: no profile for", customer);
}

async function handleFullRefund(charge: Stripe.Charge) {
  console.log("full refund", charge.id, customerId(charge.customer));
  const sub = await loadSubscriptionFromCharge(charge);
  if (sub && sub.status !== "canceled") {
    try { await stripe.subscriptions.cancel(sub.id); }
    catch (e) {
      if (!isStripeSubscriptionGoneError(e)) console.warn("cancel after refund failed", (e as Error).message);
    }
    try { await applySubscription(await stripe.subscriptions.retrieve(sub.id)); return; }
    catch (e) { console.warn("reload sub after refund", (e as Error).message); }
  }
  await revokeForCustomer(customerId(charge.customer), "refund " + charge.id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig ?? "",
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    return new Response(`bad signature: ${(e as Error).message}`, { status: 400 });
  }
  const { error: dup } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) {
    if (dup.code === "23505") return new Response("duplicate", { status: 200 });
    return new Response(dup.message, { status: 500 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await applyCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        console.warn("checkout async payment failed", s.id, s.payment_status);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        if (event.type === "invoice.payment_failed") console.warn("invoice payment failed", inv.id);
        const subId = invoiceSubscriptionId(inv);
        if (subId) await applySubscription(await stripe.subscriptions.retrieve(subId));
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        console.log("charge.refunded", charge.id, { refunded: charge.refunded, amount: charge.amount, amount_refunded: charge.amount_refunded });
        if (shouldRevokeOnRefund(charge)) await handleFullRefund(charge);
        break;
      }
      case "charge.dispute.created": {
        const d = event.data.object as Stripe.Dispute;
        console.warn("charge.dispute.created", d.id, d.status, d.charge);
        break;
      }
      case "charge.dispute.closed": {
        const d = event.data.object as Stripe.Dispute;
        console.warn("charge.dispute.closed", d.id, d.status, d.charge);
        if (shouldRevokeOnDispute(d)) {
          const chargeRef = typeof d.charge === "string" ? d.charge : d.charge?.id;
          const charge = chargeRef ? await stripe.charges.retrieve(chargeRef) : null;
          if (charge) await handleFullRefund(charge);
          else await revokeForCustomer(customerId(d.charge && typeof d.charge !== "string" ? (d.charge as Stripe.Charge).customer : null), "dispute lost " + d.id);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    await db.from("stripe_events").delete().eq("id", event.id);
    console.error(event.type, e);
    return new Response("error", { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
