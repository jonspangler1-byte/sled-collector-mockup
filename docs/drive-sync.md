# Drive sync for training photos (branch `drive-sync`, not live)

**Goal:** every sled the admin (Jonathan) saves in the app is also copied to the Google Drive folder
**Sled Finder Uploads**. That folder becomes the labeled training set for Photo ID.

## How it works
- The app is static (GitHub Pages), so it posts to a small **Google Apps Script web app** that runs under
  Jonathan's Google account and writes into his Drive. It's free and no server is needed. The script lives outside this repo, in
  `/workspace/sled-finder-drive-sync/` (Code.gs + appsscript.json).
- On **Save sled** (new or edited), if the role is Admin and the upload link + sync key are set on that
  device, the app sends: photos the user added (re-encoded by the browser canvas, so EXIF/GPS is dropped;
  new uploads go at up to 1600 px, older saved sleds at their stored 700 px), maker, model, years,
  **origin ZIP only**, condition, size, where found, notes, shared flag. Demo sample images are skipped.
- localStorage stays the source of truth. If an upload fails, the sled is still saved on the phone and can
  be retried from Profile → **Sync my saved sleds to Drive**, which also uploads sleds saved before this
  feature existed. Re-syncing a sled replaces its earlier copy (the old files go to Drive Trash).
- The sync key is never in the code. It is typed once in Profile on the admin's phone and checked by the
  script (Script Properties `SYNC_TOKEN`). City/state, map coordinates and street addresses are never sent;
  the script also redacts anything in notes that looks like a street address.

## Folder layout in Drive
```
Sled Finder Uploads/
  Sled Finder Upload Log   (Google Sheet, one row per sled; acts as manifest.csv)
  by-class/01-flexible-flyer … 25-maynard-miller   (the 25 maker_id classes from the spec)
  held-out/unknown | custom | green-list | needs-review
```
App maker ids are matrix row numbers; the script maps matrix 1–24 to the 25 classes. Fire Fly and Yankee Clipper
are now separate choices in the app (saved as maker 2 + `brand`) and go straight to 02 / 03. Older row-2 posts
with no brand go to 02 or 03 only if the model or notes name one of them, otherwise `held-out/needs-review`.
Matrix 25–61 (green list) → `held-out/green-list`. Files are named `<sledId>-01-cover.jpg`, `<sledId>-02.jpg` … plus `<sledId>.json`.

## Later: training from this folder (not built yet)
1. Read the Upload Log, count photos per class, and only train classes with ~30–50+ reviewed photos.
2. Split train/test **by sled id** (all views of one sled on the same side) and write the `split` column.
3. Fine-tune a pre-trained image model (e.g. a small EfficientNet/ConvNeXt or CLIP-style backbone) on
   `by-class/`. Use `held-out/` to check that Unknown, Custom and green-list sleds get low confidence.
4. Swap the canned `ID_DEMO` results in `R.identify` for the model's top-3 + confidence bands.
