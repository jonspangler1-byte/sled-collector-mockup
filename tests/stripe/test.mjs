import {
  paymentIsPaid, trustedCheckoutUserId, profilePatchFromSubscription,
  shouldRevokeOnRefund, shouldRevokeOnDispute, isStripeSubscriptionGoneError,
  hasOpenSubscription, invoiceSubscriptionId, emailsMatch, safeAppBase, appHashUrl,
  GITHUB_PAGES_BASE, userIdFromCheckoutSession, randomIntegrationId,
} from "../../supabase/functions/_shared/membership.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); if (!c && c !== true) console.log("   got", c); };

const UID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

ok(paymentIsPaid({ payment_status: "paid" }), "paid session grants");
ok(paymentIsPaid({ payment_status: "no_payment_required" }), "no_payment_required also grants");
ok(!paymentIsPaid({ payment_status: "unpaid" }), "unpaid session does not grant (wait for async success)");
ok(!paymentIsPaid({ payment_status: "failed" }), "failed session does not grant");

ok(trustedCheckoutUserId({ metadata: { supabase_user_id: UID }, client_reference_id: OTHER }, "x@y.com") === UID,
  "server metadata wins over an editable client_reference_id");
ok(trustedCheckoutUserId({ client_reference_id: UID, customer_details: { email: "sam@example.com" } }, "sam@example.com") === UID,
  "Payment Link fallback accepted when emails match");
ok(trustedCheckoutUserId({ client_reference_id: UID, customer_email: "Sam@Example.com" }, "sam@example.com") === UID,
  "email compare is case-insensitive");
ok(trustedCheckoutUserId({ client_reference_id: UID, customer_details: { email: "attacker@x.com" } }, "sam@example.com") === null,
  "Payment Link fallback rejected when emails do not match");
ok(trustedCheckoutUserId({ client_reference_id: "not-a-uuid", customer_details: { email: "sam@example.com" } }, "sam@example.com") === null,
  "non-uuid reference is ignored");
ok(userIdFromCheckoutSession({ metadata: { supabase_user_id: UID } }) === UID, "user id from metadata");

const now = Date.parse("2026-11-20T15:00:00Z");
const period = 1796000000; // some future unix
let patch = profilePatchFromSubscription({ id: "sub_1", status: "active", customer: "cus_1", current_period_end: period }, now);
ok(patch && patch.premium_until === new Date(period * 1000).toISOString() && patch.stripe_subscription_id === "sub_1" && patch.stripe_subscription_status === "active",
  "active sub sets period end and keeps subscription id");
patch = profilePatchFromSubscription({ id: "sub_1", status: "past_due", customer: { id: "cus_1" }, items: { data: [{ current_period_end: period }] } }, now);
ok(patch && Date.parse(patch.premium_until) === (period + 3 * 86400) * 1000, "past_due gets 3-day grace");
patch = profilePatchFromSubscription({ id: "sub_1", status: "canceled", customer: "cus_1", ended_at: period }, now);
ok(patch && patch.stripe_subscription_id === null && patch.stripe_subscription_status === "canceled" && patch.premium_until === new Date(period * 1000).toISOString(),
  "canceled sub clears subscription id and lapses at ended_at");
ok(profilePatchFromSubscription({ id: "sub_1", status: "incomplete", customer: "cus_1" }, now) === null,
  "incomplete first payment is ignored");

ok(hasOpenSubscription("active") && hasOpenSubscription("past_due") && hasOpenSubscription("trialing") && hasOpenSubscription("unpaid"),
  "open subscription statuses");
ok(!hasOpenSubscription("canceled") && !hasOpenSubscription(null), "canceled is not an open subscription");

ok(shouldRevokeOnRefund({ refunded: true, amount: 1500, amount_refunded: 1500 }), "full refund flag revokes");
ok(shouldRevokeOnRefund({ refunded: false, amount: 1500, amount_refunded: 1500 }), "amount fully refunded revokes");
ok(!shouldRevokeOnRefund({ refunded: false, amount: 1500, amount_refunded: 500 }), "partial refund does not revoke");
ok(shouldRevokeOnDispute({ status: "lost" }), "lost dispute revokes");
ok(!shouldRevokeOnDispute({ status: "needs_response" }) && !shouldRevokeOnDispute({ status: "won" }),
  "open or won dispute does not revoke");

ok(isStripeSubscriptionGoneError({ code: "resource_missing" }), "resource_missing is gone");
ok(isStripeSubscriptionGoneError({ message: "No such subscription: sub_x" }), "no such subscription is gone");
ok(isStripeSubscriptionGoneError({ message: "This subscription has already been canceled." }), "already canceled is gone");
ok(!isStripeSubscriptionGoneError({ message: "rate limit" }), "other Stripe errors are not treated as gone");

ok(invoiceSubscriptionId({ subscription: "sub_a" }) === "sub_a", "legacy invoice.subscription");
ok(invoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: "sub_b" } } } }) === "sub_b",
  "newer invoice parent.subscription_details");

ok(emailsMatch("A@B.com", "a@b.com") && !emailsMatch("a@b.com", ""), "emailsMatch");
ok(safeAppBase("https://evil.example", "https://sledfinder.app/") === "https://sledfinder.app",
  "untrusted return origin falls back to SITE_URL");
ok(safeAppBase("https://jonspangler1-byte.github.io/sled-collector-mockup/", "") === GITHUB_PAGES_BASE,
  "GitHub Pages origin is allowed");
ok(appHashUrl("https://sledfinder.app/", "upgrade") === "https://sledfinder.app/#/upgrade",
  "hash URL is built with a single slash");
ok(/^sled-finder-web-[a-z]{8}$/.test(randomIntegrationId()), "integration identifier has 8 random letters");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
