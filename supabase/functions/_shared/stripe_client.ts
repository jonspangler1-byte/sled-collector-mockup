import Stripe from "npm:stripe@23";

/** Stripe client for Edge Functions. Use a restricted key (rk_test_ / rk_live_), never a secret in the repo. */
export function stripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2026-09-30.endive",
  });
}
