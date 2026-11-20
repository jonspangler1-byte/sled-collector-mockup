# Sled Finder: going live

Status on 20 Nov 2026: the code is on the **`backend`** branch. It isn't merged, so the live demo on `main`
(GitHub Pages) hasn't changed. The branch also includes the unmerged `drive-sync` work (the Fire Fly / Yankee
Clipper split, the country fields and the Drive sync).

With `config.js` left empty, the branch still behaves as the demo. Filling in the Supabase URL and anon key
turns on the real app.

Five pieces, in the order to do them:

1. Accounts and a shared database (Supabase). The code is done and tested offline. It needs a Supabase project.
2. Premium payments (Stripe). The code is done (Checkout Session plus webhook and Customer Portal). It needs a Stripe account, test-mode objects, and the SQL migration if the project already exists.
3. The Drive photo sync for training. The code is done. It needs the Apps Script deployed (see /workspace/sled-finder-drive-sync/DEPLOY.md).
4. A custom domain. It needs a purchase, which is Jonathan's call.
5. iOS and Android apps (Capacitor). The config and build script are ready. It needs the store accounts (fees, which are Jonathan's call) and a Mac for iOS builds.

---

## 1. Backend choice: Supabase (free plan)

**Why Supabase over Firebase**

- **Photos:** Supabase's free plan includes 1 GB of file storage. Firebase now needs the pay-as-you-go
  **Blaze** plan, with a card on file, for *any* Cloud Storage bucket. Since 3 Feb 2026, free Spark projects can't
  use Storage at all. Sled Finder is photo-first, so this settles it.
- **Data shape:** sleds, makers, members and ads are relational. Postgres row-level security can express
  "Premium members see shared sleds of other *current* members" in a few lines (`docs/supabase-schema.sql`),
  and those rules are tested.
- **Auth:** email code / magic link with no passwords, and 50,000 monthly active users free.
- **Portability:** it's plain Postgres. If Sled Finder outgrows the free plan, the data can be exported anywhere.

**Free plan limits to know** (supabase.com/pricing, checked 20 Nov 2026)

| | Free plan |
|---|---|
| Database | 500 MB |
| File storage | 1 GB (at about 150 KB per 1000-px photo, that's roughly 6,000 photos) |
| Egress | 5 GB/month (+5 GB cached) |
| Monthly active users | 50,000 |
| Edge Function calls | 500,000/month |
| **Pausing** | **The project pauses after 1 week of low activity.** Restoring it is free (Dashboard → Resume). It won't happen once people use the app daily. Pro ($25/mo) never pauses, but we're staying free. |
| **Email** | The built-in sender is test-only: **2 emails/hour, and only to project team members.** Real sign-ins need free custom SMTP (below). |
| Backups | No automatic backups on Free. Download a backup now and then (`pg_dump` with the connection string, or Dashboard → Database → Backups where offered). |

**What's built (branch `backend`)**

| File | What it does |
|---|---|
| `config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_CHECKOUT`, `STRIPE_PAYMENT_LINK`, `STRIPE_PORTAL_LINK`, `SITE_URL`, `SHOW_SAMPLE_DATA`. Empty Supabase keys mean demo mode. Set `STRIPE_CHECKOUT` to `true` after the Checkout function is deployed. Payment Link / portal login links are fallbacks only. The anon key is public by design. **Never** put the service_role key or a Stripe secret key here. |
| `cloud.js` | Sign-in (6-digit email code, or the magic link on the same phone), membership role from the server, an offline **outbox** (saves go to the phone first, then upload when online), photo upload to Storage, pulling the member's sleds onto any device, shared sleds from other Premium members, public sale ads, admin corrections, account deletion, Checkout and Customer Portal session starts. |
| `app.js` | Account screen (`#/account`), real paywall (Join opens a server-created Checkout Session), Profile shows `@handle`. The "Viewing as" switcher is gone for members and kept for the admin as a screen-only preview. Sample collectors and ads are hidden when live. |
| `docs/supabase-schema.sql` | Tables `profiles` (including `stripe_subscription_status`), `sleds`, `listings`, `stripe_events`, a `photos` storage bucket, and all RLS policies. Safe to re-run. If the project already exists, also run `docs/migrations/2026-11-20-stripe-subscription-status.sql` in the SQL editor of project `cpmieqcsbvozwrbjagqm` (do not run it from this machine). |
| `supabase/functions/create-checkout` | JWT-required. Creates a Stripe Checkout Session for the signed-in member (or sends them to the Customer Portal if they already have an active or past-due subscription). |
| `supabase/functions/create-portal-session` | JWT-required. Opens a Customer Portal session for the signed-in member. |
| `supabase/functions/stripe-webhook` | Sets `premium_until` and Stripe ids from Stripe events. Signature-verified; idempotent. |
| `supabase/functions/delete-account` | In-app account deletion (required by Apple and Google). Does not delete the login if Stripe cancel fails and the subscription still exists. |
| `tests/schema` | RLS checks against real Postgres (PGlite): free users can't post, lapsed members are hidden, members can't grant themselves Premium or change Stripe columns, etc. |
| `tests/e2e` | Browser checks: the demo is unchanged, sign-in, migration, Checkout session start, payment refresh, portal for an open subscription, offline then back online, second phone, other member's view, delete, sign-out, account deletion. |
| `tests/stripe` | Unit checks for membership helpers (trusted user id, paid-only grants, refunds, disputes, cancel errors, return URLs). |

**Rules the server enforces** (not just the app)

- Anyone can browse active sale ads. Only **Premium/admin** can post sleds, post ads, upload photos, or edit their own posts.
- Premium members see other members' **shared** sleds. **Private** sleds are visible only to their owner (and the admin).
- When a membership lapses, that member's shared sleds and ads disappear for others. They come back on renewal. The owner always keeps their own data and can delete it.
- Only the server (the Stripe webhook or the SQL editor) can change `premium_until` or `is_admin`.
- `lat`/`lng` are rounded to about 1 km on save. Locations are town level only, never a street address.

**Migration of sleds already saved on phones**

After someone signs in, Account shows "N items saved on this phone, add them to your account?". Tapping
**Add to my account** uploads those sleds and ads with their photos. If the account isn't Premium yet, they stay
queued and upload automatically once the membership is active. Nothing is deleted from the phone.

Signing out removes only the copies that are safely in the cloud. It refuses to sign out while changes
are still waiting to upload.

**Known limits / next steps (not built yet)**

- Likes and comments aren't synced (they're still demo buttons).
- Shared sleds are cached on the phone (up to 1,000 newest). Past that, search and the map need server-side queries.
- If the admin adds new *photos* while correcting someone else's post, only the text changes are uploaded.
- The Drive training sync still uploads from the admin's phone. Later, the Apps Script can read from Supabase Storage instead.
- Sale-ad contact email is shown publicly, as in the demo. Consider a "contact seller" form instead.

---

## 2. Payments: Stripe (recommended) vs Shopify

| | **Stripe Payment Link + webhook** (built) | Shopify |
|---|---|---|
| Monthly cost | $0 | Basic plan about $39/mo (or Starter about $5/mo) **plus** a subscription app |
| Per sale on $15/yr | 2.9% + 30¢ card fee + 0.7% Stripe Billing, about **$0.84** → you keep about **$14.16** | Shopify Payments fees + plan + app fees |
| Fits a membership | Yes: yearly auto-renewing subscription, customer portal for cancel/card changes | Built for physical products; subscriptions need a third-party app |
| Unlocks the app automatically | Yes: webhook → Supabase sets `premium_until` | Would need custom webhook work anyway |

Jonathan already has a Shopify store, but merch is shelved and Shopify would add monthly fees. **Use Stripe.**

**How it works**

1. The member taps **Join Premium · $15/yr**. The app calls the `create-checkout` Edge Function (the member must be signed in). That function creates a Stripe **Checkout Session** (`mode: subscription`) with `client_reference_id` and `metadata.supabase_user_id` set on the server, reusing the stored Stripe customer id when there is one. If the member already has an **active** or **past_due** (or trialing/unpaid) subscription, the function returns a Customer Portal URL instead, and no second subscription is created.
2. Stripe sends `checkout.session.completed` (and, for delayed payment methods, `checkout.session.async_payment_succeeded`) to `stripe-webhook`. The webhook only grants Premium when `payment_status` is `paid` (or `no_payment_required`). It trusts `metadata.supabase_user_id` from the server-created session. A Payment Link fallback is accepted only if the Checkout email matches the Sled Finder account email.
3. Renewals, cancellations and failed cards arrive as `customer.subscription.*` / `invoice.paid` / `invoice.payment_failed` and update `premium_until` and `stripe_subscription_status`. Failed renewals get 3 days' grace. A membership cancelled in the Customer Portal (cancel at period end) stays on until the end of the paid year, then shows as "lapsed". Full refunds, and disputes that are lost, lapse Premium (and a still-open subscription is cancelled). Failed async payments are logged and do not grant access.
4. The member taps **I've paid, refresh** (or just reopens the app) and Premium is on. **Manage or cancel membership** on the Account screen calls `create-portal-session`.

If the Checkout function is not turned on (`STRIPE_CHECKOUT` is false) and a Payment Link is set, the app falls back to that link. Prefer the function.

**Setup steps (after Jonathan's Stripe account exists)**

Do this in **Test mode** (or a sandbox) first. Do not create live products until a test payment has upgraded a test account.

1. If the Supabase project already exists, run `docs/migrations/2026-11-20-stripe-subscription-status.sql` in the SQL editor of project `cpmieqcsbvozwrbjagqm`. (A brand-new run of `docs/supabase-schema.sql` already includes the column.) Do not run this from the agent machine.
2. Stripe → Product catalog → **Add product** "Sled Finder Premium", **Recurring, Yearly, $15.00 USD**. Copy the price id (`price_...`). Do not enable Stripe Tax.
3. Settings → Billing → **Customer portal** → activate. Allow payment-method updates, cancel at period end, and invoice history. Do not offer other plans. A portal login link can be copied into `STRIPE_PORTAL_LINK` as a fallback; the app prefers `create-portal-session`.
4. Optional fallback: Payment Links → **New** for that price, redirect to `https://<domain>/#/upgrade` after payment, and paste the `https://buy.stripe.com/...` URL into `STRIPE_PAYMENT_LINK`. Not required once Checkout Sessions work.
5. Deploy the functions (Supabase CLI, free, or Dashboard → Edge Functions):
   `supabase functions deploy create-checkout`
   `supabase functions deploy create-portal-session`
   `supabase functions deploy delete-account`
   `supabase functions deploy stripe-webhook --no-verify-jwt`
6. Stripe → Developers → Webhooks → **Add endpoint** `https://cpmieqcsbvozwrbjagqm.supabase.co/functions/v1/stripe-webhook`
   (use the Test mode endpoint first), events:
   `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`,
   `customer.subscription.created`,
   `customer.subscription.updated`,
   `customer.subscription.deleted`,
   `invoice.paid`,
   `invoice.payment_failed`,
   `charge.refunded`,
   `charge.dispute.created`,
   `charge.dispute.closed`.
   Copy the signing secret (`whsec_...`).
7. Set Edge Function secrets (Dashboard → Edge Functions → Secrets, or the CLI). **Prefer a restricted API key** (`rk_test_...` in test, `rk_live_...` later) over a secret key (`sk_...`). Grant the key permission to read and write Customers, Checkout Sessions, Subscriptions (including cancel), Billing Portal sessions, Invoices, and Charges. Do not put keys in chat or in the repo.

   `supabase secrets set STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_PRICE_ID=price_... SITE_URL=https://<domain-or-github-pages-url>`

8. In `config.js` on this branch, set `STRIPE_CHECKOUT: true` and `SITE_URL` to the same public origin (and path, if any) used above. Leave `STRIPE_PAYMENT_LINK` / `STRIPE_PORTAL_LINK` empty unless you want the fallbacks.
9. Test in **Test mode** first with card `4242 4242 4242 4242`, then switch the secrets (and webhook endpoint) to live keys and a live price id. Do not enable `automatic_tax`. Do not pass `payment_method_types` (let Stripe's dashboard payment methods apply).

**Phone apps and payments.** On the **US** App Store, Apple has allowed buttons and links to outside payment pages
since 1 May 2025, and it currently charges no commission on those (a fee proposal is still before the court, so
this could change). Outside the US, Apple still requires in-app purchase for digital memberships.
Google Play (US) has opt-in programs for alternative billing or external links, with service fees (about 10% on
subscriptions) and reporting. The simplest launch: **sell memberships on the website**, and have the apps sign in to
an existing membership (or link out on the US storefront). Re-check both stores' rules right before submitting.

---

## 3. Drive photo sync (training)

Already on this branch (from `drive-sync`). One-time browser steps in Jonathan's Google account are in
`/workspace/sled-finder-drive-sync/DEPLOY.md`: create the Apps Script, run `makeToken`, deploy as a web app, and save the
`SYNC_TOKEN` to the vault. Then paste the `/exec` URL and the key in Profile → Drive sync on the admin phone.

---

## 4. Custom domain

Checked 20 Nov 2026. Availability is from the registries' RDAP lookups, where "not registered" means nobody owns it today.
Prices are Porkbun's public price list (the same registrar as raisasballoons.com). **Nothing was bought.**

| Domain | Status | 1st year | Renewal/yr | Notes |
|---|---|---|---|---|
| **sledfinder.com** | not registered | **$11.81** | $11.81 | Best choice; same price as raisasballoons.com |
| sledfinder.app | not registered | $8.75 | $14.93 | HTTPS-only by design (fine on GitHub Pages) |
| sledfinder.org | not registered | $7.98 | $11.84 | |
| sledfinder.net | not registered | $12.52 | $12.52 | |
| sledfinder.co | not registered | $15.76 | $31.20 | Expensive renewal |
| sledfinder.us | not registered | $4.43 | $7.00 | **Avoid:** .us doesn't allow WHOIS privacy, so the owner's street address would be public |
| sledfinderapp.com, getsledfinder.com, rosebudsledfinder.com, findmysled.com | not registered | $11.81 | $11.81 | Fallbacks |

Porkbun includes free WHOIS privacy on .com/.app/.org/.net. Confirm at checkout that no "premium" price is shown.

**Setup (same as raisasballoons.com):** buy it at Porkbun (Jonathan approves and pays), then add DNS records:
`A @ → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153`, plus `CNAME www → jonspangler1-byte.github.io`.
Add a `CNAME` file with the domain to the repo, set it in GitHub → Settings → Pages → Custom domain, and tick
**Enforce HTTPS** once the certificate is issued (this can take up to 24 h).
Then set `SITE_URL`, and add the domain to Supabase → Authentication → URL Configuration (Site URL + Redirect URLs).

The domain also lets sign-in emails come from `no-reply@sledfinder.com`. Add the SPF/DKIM records that the email service
(Brevo or Resend) gives you at Porkbun.

**Sign-in email (required before launch, free):** Supabase's built-in email only reaches project team members.
Set up **Brevo** (free: 300 emails/day) or **Resend** (free: 100/day, 3,000/month, needs the domain verified).
Then go to Supabase → Authentication → Emails → SMTP Settings. After that, edit the "Magic Link" template so it shows the code:
`Your Sled Finder sign-in code is {{ .Token }}` plus the link `{{ .ConfirmationURL }}`.

---

## 5. iOS and Android apps

**Approach: Capacitor** (free, open source) wraps this same web app as real iOS and Android apps. The same
account works in the app and on the website, because both talk to the same Supabase project.
`capacitor.config.json` and `scripts/build-www.sh` are in the repo. A PWA manifest and icons are added too (the icons are placeholders, pending Jonathan's review).
That means Android users can already "Add to Home screen" from the website.

Steps (developer machine; iOS needs a Mac with Xcode, or a cloud Mac build service):
```
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
./scripts/build-www.sh
npx cap add ios && npx cap add android
npx cap sync && npx cap open ios   # or: npx cap open android
```

Store requirements to plan for:
- **Apple Developer Program: $99/year** and **Google Play Console: $25 one-time**. Both are Jonathan's decision; nothing has been paid.
- Google Play (current policy, re-check when signing up): new personal developer accounts must run a closed test with at least 12 testers for 14 days before production. An organization account (needs a D-U-N-S number, which is free) skips that.
- Both stores need a **privacy policy URL** and an **account-deletion** option. Deletion is built (Account → Delete my account). Google also wants a web page explaining how to delete.
- Apple may reject "just a website in a wrapper" (guideline 4.2). Native camera access for Photo ID and offline use help. Plan for possible review back-and-forth.
- Email-only sign-in means "Sign in with Apple" is **not** required (it's only required alongside Google or Facebook sign-in).

---

## Ordered checklist: who does what

**Needs Jonathan** (sign-ups, identity, money, approvals):
1. Approve the plan: Supabase + Stripe, and the domain choice (recommend **sledfinder.com, $11.81/yr**).
2. **Supabase account** (free) and the project "sled-finder". Sign up with GitHub or email. Choose a region near Chicago (us-east-1 / us-east-2). Save the database password to the vault.
3. **Stripe account**: legal name, date of birth, SSN (or an EIN if the museum has one), a **bank account for payouts**, and the business name and statement descriptor ("SLED FINDER"). Only Jonathan can complete identity verification.
4. **Brevo** (or Resend) free account for sign-in emails.
5. **Buy the domain** at Porkbun (his existing account), when approved.
6. **Google Apps Script** deploy for the Drive sync (DEPLOY.md), and save the SYNC_TOKEN to the vault.
7. Review the **privacy policy and Terms** drafts before the public launch.
8. Later, only if he chooses: **Apple Developer ($99/yr)** and **Google Play ($25)**, and a Mac or cloud build service for iOS.

**The agent can do after each sign-up** (no cost):
- Run `docs/supabase-schema.sql`, paste the URL and anon key into `config.js`, and set up the auth URLs, the email template and SMTP.
- Make Jonathan's account the admin (SQL at the bottom of the schema file).
- Create the Stripe product and yearly price in **test mode**, deploy the four Edge Functions, set restricted-key secrets and the webhook events listed above, set `STRIPE_CHECKOUT: true`, and test end-to-end with card 4242 4242 4242 4242. After that, repeat with live keys. Remind Jonathan to run the subscription-status SQL migration in the project's SQL editor if it hasn't been run.
- Wire up DNS and GitHub Pages for the domain.
- Merge `backend` → `main` **only after Jonathan has tried it** on a preview.
