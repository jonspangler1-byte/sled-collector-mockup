// Sled Finder live-service settings.
// Leave SUPABASE_URL and SUPABASE_ANON_KEY empty and the app runs exactly as the demo (no accounts, everything
// saved only on this phone, "Viewing as" role switcher). Fill them in to turn on real accounts and cloud sync.
// The anon key is meant to be public: every table is locked down by row-level security (docs/supabase-schema.sql).
// NEVER put the Supabase service_role key or a Stripe secret key in this file.
window.SF_CONFIG = {
  SUPABASE_URL: "https://cpmieqcsbvozwrbjagqm.supabase.co",          // e.g. "https://abcd1234.supabase.co"  (Supabase → Project Settings → API)
  SUPABASE_ANON_KEY: "sb_publishable_tZSCKKnzcS51iyKWnDvddw_shhcX3Q4",     // the "anon public" key from the same page
  // Stripe Payment Link for the $15/yr Premium membership (Stripe → Payment Links). Empty = mock paywall.
  STRIPE_PAYMENT_LINK: "",   // e.g. "https://buy.stripe.com/xxxxxxxx"
  STRIPE_PORTAL_LINK: "",    // Stripe customer-portal login link, for members to cancel or update their card
  // Where magic-link emails send people back to. Empty = the page they signed in from.
  SITE_URL: "",              // e.g. "https://sledfinder.app/"
  // Show the made-up sample collectors and sample sale ads when live? Keep false for the real launch.
  SHOW_SAMPLE_DATA: false
};
