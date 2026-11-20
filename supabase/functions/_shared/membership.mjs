// Pure membership helpers shared by Stripe Edge Functions and Node tests.
// No Deno or Stripe SDK imports, so tests/stripe/test.mjs can load this file directly.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const GRACE_DAYS = 3;
export const METADATA_USER_KEY = "supabase_user_id";
export const OPEN_SUBSCRIPTION_STATUSES = ["active", "past_due", "trialing", "unpaid"];
export const GITHUB_PAGES_BASE = "https://jonspangler1-byte.github.io/sled-collector-mockup";

export function uuidOrNull(v) {
  return typeof v === "string" && UUID.test(v) ? v : null;
}

export function iso(unix) {
  return new Date(unix * 1000).toISOString();
}

export function customerId(c) {
  return typeof c === "string" ? c : (c && c.id) || null;
}

export function periodEnd(sub) {
  return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
}

export function userIdFromMetadata(obj) {
  return uuidOrNull(obj && obj.metadata && obj.metadata[METADATA_USER_KEY]);
}

export function userIdFromCheckoutSession(session) {
  return userIdFromMetadata(session) || uuidOrNull(session.client_reference_id);
}

/** True when Checkout has collected a successful payment (or no payment was due). */
export function paymentIsPaid(session) {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

/**
 * Membership end time from a Stripe subscription, or undefined if the event
 * should be ignored (first payment never went through).
 */
export function premiumUntilFromSubscription(sub, nowMs = Date.now()) {
  const end = periodEnd(sub);
  if (["active", "trialing"].includes(sub.status) && end) return iso(end);
  if (["past_due", "unpaid"].includes(sub.status) && end) return iso(end + GRACE_DAYS * 86400);
  if (sub.status === "canceled") return iso(sub.ended_at ?? Math.floor(nowMs / 1000));
  if (sub.status === "incomplete" || sub.status === "incomplete_expired") return undefined;
  return null;
}

export function profilePatchFromSubscription(sub, nowMs = Date.now()) {
  const until = premiumUntilFromSubscription(sub, nowMs);
  if (until === undefined) return null;
  const closed = sub.status === "canceled" || sub.status === "incomplete_expired";
  return {
    stripe_customer_id: customerId(sub.customer),
    stripe_subscription_id: closed ? null : sub.id,
    stripe_subscription_status: sub.status,
    premium_until: until,
  };
}

export function emailsMatch(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * User id we are willing to upgrade from a Checkout Session.
 * Server-created sessions set metadata.supabase_user_id — trust that.
 * Payment Link fallback only has client_reference_id, which a payer can edit,
 * so the Checkout email must match the Sled Finder account email.
 */
export function trustedCheckoutUserId(session, accountEmail) {
  const fromMeta = userIdFromMetadata(session);
  if (fromMeta) return fromMeta;
  const fromRef = uuidOrNull(session.client_reference_id);
  if (!fromRef) return null;
  const checkoutEmail = (session.customer_details && session.customer_details.email) || session.customer_email;
  if (!emailsMatch(checkoutEmail, accountEmail)) return null;
  return fromRef;
}

export function hasOpenSubscription(status) {
  return OPEN_SUBSCRIPTION_STATUSES.includes(status);
}

export function shouldRevokeOnRefund(charge) {
  if (!charge) return false;
  if (charge.refunded === true) return true;
  if (typeof charge.amount === "number" && typeof charge.amount_refunded === "number") {
    return charge.amount_refunded >= charge.amount && charge.amount > 0;
  }
  return false;
}

export function shouldRevokeOnDispute(dispute) {
  return !!dispute && dispute.status === "lost";
}

export function isStripeSubscriptionGoneError(err) {
  const code = (err && (err.code || (err.raw && err.raw.code))) || "";
  const msg = String((err && err.message) || "");
  if (code === "resource_missing") return true;
  if (/no such subscription/i.test(msg)) return true;
  if (/already (been )?cancel(?:ed|led)/i.test(msg)) return true;
  return false;
}

export function invoiceSubscriptionId(inv) {
  if (!inv) return null;
  const raw = inv.subscription ?? (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription);
  if (!raw) return null;
  return typeof raw === "string" ? raw : raw.id || null;
}

export function randomIntegrationId(base = "sled-finder-web") {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 8; i++) s += letters[Math.floor(Math.random() * 26)];
  return `${base}-${s}`;
}

export function allowedSitePrefixes(siteUrl) {
  const prefixes = [];
  if (siteUrl) prefixes.push(String(siteUrl).replace(/\/$/, ""));
  prefixes.push(GITHUB_PAGES_BASE);
  return [...new Set(prefixes)];
}

export function safeAppBase(candidate, siteUrl) {
  const prefixes = allowedSitePrefixes(siteUrl);
  const raw = String(candidate || "").split("#")[0].split("?")[0].replace(/\/$/, "");
  if (raw && prefixes.some((p) => raw === p || raw.startsWith(p + "/"))) return raw;
  return prefixes[0] || "";
}

export function appHashUrl(base, hashPath) {
  const b = String(base || "").replace(/\/$/, "");
  const h = String(hashPath || "").replace(/^#\/?/, "");
  return `${b}/#/${h}`;
}
