# Sled Finder

Static HTML/CSS/JS app for antique sled collectors, built for the Rosebud Sled Museum (Schaumburg, IL).

- **Demo mode** (default, what GitHub Pages serves from `main`): no accounts. Everything is saved in the browser, a "Viewing as" role switcher is shown, and collector entries are example data.
- **Live mode** (branch `backend`): fill in `config.js` with a Supabase project URL and anon key to turn on real accounts, cloud sync, photo storage and Stripe memberships. See `docs/go-live.md`.

The app name is set in `data.js` (`APP_NAME`).

## Checks
```
cd tests/schema && npm i && npm test   # RLS rules in docs/supabase-schema.sql (PGlite, no server needed)
cd tests/e2e && npm i && npm test      # demo + live mode in headless Chromium with a fake Supabase
```
