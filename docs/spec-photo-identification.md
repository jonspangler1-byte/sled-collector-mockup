# Sled Finder Feature Spec: Image Search / Photo Identification

Status: Proposed (19 Nov 2026)
Owner: Jonathan Spangler
Companion: [Searchable Maker Map](spec-searchable-maker-map.md)

## Summary
Users take or upload a photo of a vintage sled and get a ranked identification of the likely maker (and, later, model). This is the visual counterpart to the searchable maker map: the map filters known finds by maker, and photo identification helps the user decide which maker a sled is before it is submitted.

The intended advantage over a general tool such as Google Lens is that scores come from a model fine-tuned on verified collection photos, results stay inside Sled Finder, and a confirmed identification can feed the submission database and the maker map. That loop should compound in value as more confirmed photos are added.

This document is the feature specification only. Jonathan will gather and organize the photo database later. No model should be trained, and no identification UI should ship, until that work is done and the per-class photo targets below are reviewed.

## Goals and non-goals

### Goals
- Identify a sled from one or more user photos, returning a ranked list of likely makers with confidence scores.
- Cover, as the primary scope, the same 25 black-list dropdown entries used by the maker map (see below). Fire Fly and Yankee Clipper remain separate entries, not folded into Flexible Flyer.
- Let the user confirm or correct the result, including **Unknown maker** and **Custom** (free text), then continue into a normal sled submission when they choose to post.
- Keep confirmed, reviewed identifications available as future training data, so the feature improves over time.

### Non-goals (for this spec and the first version)
- Training a vision model from scratch. Use a pre-trained model (ResNet, EfficientNet, or similar) and fine-tune it on sled photos.
- Treating the company briefs (the 12–15 prose descriptions prepared for the Elgin / Gail Borden presentation) as the class list or the training-label source.
- Auto-adding green-list makers, or makers not in the matrix (Sherwood Brothers; Rosebud Sled Company of St. Joseph, MI), to the identifier. Those stay out until Jonathan says otherwise.
- Auto-posting a community submission, inventing estimated years of manufacture, or inventing an origin location from a photo.
- Replacing Jonathan's review of identifications that will be used for training.

## Relationship to existing app rules
Photo identification must follow the rules already in the Sled Finder mockup and the companion map spec:

- A submission can include estimated years of manufacture, the origin zip code of the sled, and a maker chosen from the dropdown. The dropdown includes **Unknown maker** and **Custom** (free text, for example "Likely Pratt or Kalamazoo"). Custom values are saved as typed and shown as unconfirmed. Sled Finder (admin) may reassign them later.
- Posting community posts, and viewing community posts, require a paid Sled Finder Premium membership. A lapsed member cannot see community posts, including their own old posts.
- Admin (Jonathan) can edit or delete any post.
- Posting requires an acknowledgment that the post and photos become part of Sled Finder and may be edited or removed for accuracy, plus a link to the in-app Terms (currently marked draft and not legal advice).
- Locations are shown at zip or town level only. Never collect, display, or store a street address.

Whether running a photo identification (without posting) also requires Premium is an open question, below.

## Dropdown source and class list (authoritative)
Source: Jonathan's maker matrix, "List of American Sled Manufacturers (1850–1990)", 61 makers. BLACK makers (marked "Y" under "In books?") are the well-known makers documented in Joan Palicia's books. GREEN makers ("N") are Jonathan's own discoveries.

- Photo identification should primarily classify against the black-list dropdown, reused exactly from the companion map spec.
- Ignore the green makers for now. If a photo is likely a green-list or otherwise unlisted maker, the app should fail gracefully (low confidence, **Unknown maker**, or **Custom**), not force a black-list guess.
- The company briefs are not the class list.

### Black-list dropdown set (25 entries)
The matrix has 24 black makers. Matrix #2 "Fire Fly / Yankee Clipper" is split into two separate dropdown entries, kept apart from Flexible Flyer, so users can search Fire Fly and Yankee Clipper on their own (Jonathan, 19 Nov 2026). Locations are lightly normalized from the matrix. These 25 entries are the identifier's class labels and the labels shown in results.

1. Flexible Flyer – Planet Jr / S.L. Allen Co. — Philadelphia, PA; Medina, OH
2. Fire Fly – Planet Jr / S.L. Allen Co. — Philadelphia, PA; Medina, OH (own entry; matrix #2 split)
3. Yankee Clipper – Planet Jr / S.L. Allen Co. — Philadelphia, PA; Medina, OH (own entry; matrix #2 split)
4. Paris — Paris, ME
5. Standard Novelty Works (Lightning Guider) — Duncannon, PA
6. American Acme Company — Emigsville, PA
7. Buffalo Sled Co. / Auto Wheel Coaster Co. — North Tonawanda, NY
8. Garton Toy Company — Sheboygan, WI
9. Pratt Mfg Co. — Coldwater, MI
10. Chicago Rollerskate Co. — Chicago, IL
11. Turner and Thomas — Chicago, IL
12. Kalamazoo Sled Company — Kalamazoo, MI
13. The American National Company — Toledo, OH
14. Richards & Wilcox — Aurora, IL
15. C.J. Johnson Co. (Safety sled) — Mount Jewett & Bradford, PA
16. Maplewood Craft Industries — Maplewood, MN
17. Wagner — Cedar Falls, IA
18. Hunt, Helm, Ferris & Co. (Starline) — Harvard, IL
19. Duralite — Passaic (matrix says NY)
20. "Snow Hawk" (American Gold Co.) — unknown, possibly Boston, MA
21. Crosby Gilzinger Co. — Rondout, NY
22. Ellingwood Turning Company — West Paris, ME
23. Withington — no location in matrix
24. Wilkinson — no location in matrix
25. Maynard Miller — Seneca Falls, NY

Dropdown IDs 1–25 above are the stable `maker_id` values for this feature and should stay aligned with the map dropdown. They are not matrix row numbers (the Fire Fly / Yankee Clipper split is the difference).

**Unknown maker** and **Custom** are submission options, not model classes in the MVP.

### Not in the matrix (flagged, not added)
Jonathan has named Sherwood Brothers (Canastota, NY) and Rosebud Sled Company (St. Joseph, MI), but neither is in the 61-maker matrix. Flagged as a gap to fix in the matrix. Do not add either one to the black list, the dropdown, or the identifier until Jonathan says so.

### Notes
- Auto-Wheel Coaster Company was a New York company (North Tonawanda, NY; formerly Buffalo Sled Company of Buffalo, NY), not Pennsylvania. In this dropdown it is one entry with Buffalo Sled Co. Whether training should later split Buffalo Sled-era photos from Auto-Wheel-era photos is an open question; the MVP treats them as a single class matching the dropdown.
- Fire Fly, Yankee Clipper, and Flexible Flyer are related S.L. Allen / Planet Jr. lines but must remain three separate classes. They are expected to be a hard case for the model.

## User flow

### Entry
- A clear **Identify a sled** (or **Photo search**) action from Home, and the same action on the **Add a sled** form so a user can identify first and then post.
- If Premium-gated (open question), free or lapsed users see the existing upgrade / renew path rather than the camera. If not gated, anyone may run an identification, but posting or viewing the resulting community post still follows the membership rules above.

### Capture or upload
1. The user takes a new photo or uploads an existing one. MVP is one photo per request. The UI should encourage a sharp, well-lit view of the whole sled, and mention that a decal, runner profile, or underside photo can be added in a later version.
2. Before the image is stored or sent for inference, the client (and the server, as a backstop) strips EXIF location data and other GPS fields. See Privacy.
3. The user sees a preview and can retake or choose a different photo.
4. An optional short tip can list preferred angles (top-down, side profile of the runners, close-up of a decal or stamp, underside hardware / bolt patterns) without blocking a single casual photo.

### Results
5. While the model runs, show a simple in-progress state. Do not show a guessed maker until the response arrives.
6. Present a ranked list of likely makers (top 5, or fewer if the model returns fewer usable scores), each with a confidence score. Use the exact dropdown labels above.
7. Interpret confidence in plain language (proposed bands are in Model output). Never present a low-confidence result as a confirmed identification.
8. If confidence is low, the photo looks unlike a sled, or several objects are detected, say so clearly and keep **Unknown maker** and **Custom** equally easy to choose.

### Confirm or correct
9. The user must confirm a suggestion, pick a different black-list maker, choose **Unknown maker**, or enter a **Custom** value. The model never writes a maker onto a record by itself.
10. If the user wants to add the sled to Sled Finder, continue into the existing Add a sled flow with the chosen maker pre-filled. The user still supplies estimated years of manufacture, origin zip code (if they have it), any additional photos, and the posting acknowledgment.
11. If the user only wanted an identification, they can stop there. Those photos are not community posts. Whether they may be used for training is an open question and must not be assumed.

### After a post
12. A posted, confirmed sled can appear in the community feed (Premium) and, when an origin zip is present, on the searchable maker map, subject to the companion spec and its open privacy questions.
13. Admin can edit or delete the post, including correcting the maker. A corrected maker is what later training review should use, not the original model guess.

## Technical architecture (high-level)
Do not train a network from random initialization. Start from a pre-trained image-classification backbone (ResNet, EfficientNet, or a comparable model) and fine-tune it on labeled sled photos.

A practical shape for the first build:

1. **Client (Sled Finder app).** Camera or photo-library picker, preview, EXIF/GPS stripping, request to the identification API, ranked-results UI, and a confirm/correct step that reuses the existing maker dropdown. For the current static mockup, this is a front-end flow only; a live model is out of scope until the dataset exists.
2. **Identification API.** Accepts an image (and later, multiple images), runs the current production model, and returns the JSON described below. Authenticate the caller, reject non-image payloads, cap file size, and do not persist original GPS metadata.
3. **Model training and packaging.** Photos are sorted into folders by class label, cleaned, split, augmented, and used to fine-tune the pre-trained model. Tooling such as Roboflow or Google Vertex AI is acceptable for labeling, augmentation, and training; this spec does not lock a vendor. Export a versioned model (for example `photo-id-v0.1`) and record which photo set and split produced it.
4. **Training store.** Keep labeled images, a manifest (class, angle if known, source, review status), and the train/test split so runs are reproducible. Source tags should distinguish Rosebud collection photos from later community photos.
5. **Review queue.** Confirmed user identifications, and admin corrections, enter a queue. They become training data only after Jonathan (admin) accepts them.
6. **Map and submissions.** Identification does not write map pins by itself. Pins come from submitted origin zip codes, geocoded as in the companion spec, and only after the user posts a sled with a confirmed or manually chosen maker.

Inference may run in the cloud or, later, on device. That choice is an open question. Until it is decided, design the API so the client does not depend on a particular vendor SDK.

No vendor prices are included here; cost should be estimated only after a hosting option is chosen and quoted.

## Training data requirements and guidelines

### Seed dataset (what is known, and what is not)
The intended seed is the Rosebud Sled Museum collection: on the order of **about 400 sleds**. That figure is an estimate, not an inventory count.

Be precise about makers versus companies:

- The Rosebud collection is described as covering **55 makers**.
- The maker matrix lists **61 companies**.
- Those two numbers are not interchangeable. Do not describe the seed set as "400 sleds across 61 makers."

Coverage per maker is uneven and **unknown until the collection is inventoried and the photos are sorted**. Do not assume that each of the 25 black-list entries already has enough images, or that all ~400 sleds belong to black-list makers. Some sleds may be green-list makers, unknown, or otherwise outside the MVP classes.

Jonathan will work on gathering and organizing the photo database later. Dataset work starts with an inventory: how many sleds and usable photos exist for each of the 25 classes, and which classes are short of the target.

### Target volume
Aim for **at least 30–50 solid photos per class** before treating that class as reliable enough to show confident scores in the app. This is a target, not a current count.

A "solid" photo is sharp enough to use, shows the sled (or a planned detail angle), is not a near-duplicate of another training image, and is labeled with a reviewed class. Several photos of the same sled, taken from the required angles, count toward the target, but the split rules below should keep those views from leaking across train and test.

### Folder and label scheme
Organize files by the 25 dropdown classes, using stable slugs and the `maker_id` values above. Suggested layout:

```text
dataset/
  manifest.csv
  by-class/
    01-flexible-flyer/
    02-fire-fly/
    03-yankee-clipper/
    04-paris/
    05-standard-novelty-works-lightning-guider/
    06-american-acme/
    07-buffalo-sled-auto-wheel-coaster/
    08-garton/
    09-pratt/
    10-chicago-rollerskate/
    11-turner-and-thomas/
    12-kalamazoo/
    13-american-national/
    14-richards-and-wilcox/
    15-cj-johnson/
    16-maplewood-craft/
    17-wagner/
    18-hunt-helm-ferris-starline/
    19-duralite/
    20-snow-hawk/
    21-crosby-gilzinger/
    22-ellingwood-turning/
    23-withington/
    24-wilkinson/
    25-maynard-miller/
  held-out/
    unknown-or-custom/
    green-list/
    non-sled/
    reproductions/
    needs-review/
```

`manifest.csv` should record at least: file path, `maker_id`, class slug, angle (if known), sled inventory id (if it is a Rosebud collection piece), source (`collection` or `community`), review status, and whether the image is in train or test.

Optional angle suffixes on filenames (for example `01-flexible-flyer/sled-0142-top.jpg`) are helpful but not required if the manifest stores the angle.

Do not put Unknown, Custom, or green-list photos into the 25 training class folders. Keep them in `held-out` for evaluation of graceful failure and, later, for an optional "other" class.

### Photography guidelines
When new reference photos are taken, prefer a consistent set of angles for each sled:

- Top-down, showing the deck and overall plan.
- Side profile of the runners.
- Close-up of a decal, stamp, or other maker marking.
- Underside hardware and bolt patterns.

A complete reference set for one sled is those four angles, taken in even light, with the sled filling most of the frame and no other sleds behind it. Field photos from users will often be messier; the model must still be evaluated on that kind of image, but the seed set should be as clean and complete as practical.

### Quality rules
- Remove blurry, extremely dark, extremely overexposed, or badly cropped images from training.
- Deduplicate near-copies (burst shots, resaves, slight crops of the same frame).
- Prefer one primary sled per training image.
- Do not train on screenshots of other listings, catalog page photos, or photos-of-photos unless they are in a clearly marked evaluation folder.
- Strip GPS and street-level location from files in the training store, just as in the app.
- People, especially children's faces, should be cropped or avoided in reference photography when possible.

### Train / test split
Use an **80/20 train/test split**, stratified by class. The unit of splitting should be the **sled**, not the individual file, so that multiple angles of the same sled do not appear in both train and test. Record the split in the manifest and do not reshuffle it between comparable training runs.

If a class has too few distinct sleds for a meaningful split, keep that class out of the live model (see below) rather than stretching a handful of photos across train and test.

### Class balance and makers with few photos
Some classes will almost certainly have many more photos than others. Fine-tuning should use whatever class-weighting or augmentation the chosen tool supports so a frequent class (whatever the inventory later shows it to be) does not dominate predictions.

Until a class has met the 30–50 solid-photo target, or Jonathan accepts a lower temporary threshold:

- Do not show that class as a high-confidence identification.
- The class may be omitted from the live model, or returned only with a "limited reference photos" flag and no confident wording.
- Users can still assign that maker by hand from the dropdown.

Augmentation (crops, light color and exposure shifts, mild rotation) may be done in Roboflow, Vertex AI, or an equivalent tool. Do not augment so aggressively that runner profiles or decals become unrealistic.

Held-out Unknown, Custom, green-list, reproduction, and non-sled images should be used to test whether the model correctly stays low-confidence, not to force a 26th maker class in the MVP.

## Model output format
The API returns a ranked list of predictions, each with a confidence score, plus flags the UI can use. Confidence values are probabilities between 0 and 1, rounded to two decimal places for display. `maker_id` and `label` must match the 25-entry dropdown.

### Example JSON

```json
{
  "request_id": "img_20261119_001",
  "model_version": "photo-id-v0.1",
  "image": {
    "angles_received": ["unknown"],
    "exif_gps_stripped": true
  },
  "predictions": [
    {
      "rank": 1,
      "maker_id": 7,
      "label": "Buffalo Sled Co. / Auto Wheel Coaster Co.",
      "confidence": 0.81
    },
    {
      "rank": 2,
      "maker_id": 1,
      "label": "Flexible Flyer – Planet Jr / S.L. Allen Co.",
      "confidence": 0.07
    },
    {
      "rank": 3,
      "maker_id": 8,
      "label": "Garton Toy Company",
      "confidence": 0.04
    }
  ],
  "top_confidence": 0.81,
  "flags": {
    "low_confidence": false,
    "limited_reference_data": false,
    "possible_non_sled": false,
    "possible_multiple_objects": false
  }
}
```

Return at most five predictions, in descending confidence, and omit classes the live model does not include. Do not invent a model or years-of-manufacture field in the MVP.

### Proposed confidence bands
These bands are starting proposals to be tuned on the held-out test set. They are not decided thresholds.

| Band | Proposed range | UI behavior |
| --- | --- | --- |
| High | top score ≥ 0.80 | Present the top result as a likely match; still require user confirmation. |
| Medium | 0.50–0.79 | Present as possible matches ("it might be one of these"); do not auto-select. |
| Low | top score < 0.50 | Say the app is not sure. Offer the list for reference, but default the next step toward **Unknown maker** or a manual / **Custom** choice. |

Other proposed flag behavior:

- `limited_reference_data`: the top class is still below the photo target. Soften the wording even if the raw score is high.
- `possible_non_sled`: ask the user to try another photo; do not pre-fill a maker.
- `possible_multiple_objects`: ask the user to photograph one sled, or to choose which sled they mean, rather than trusting the top score.

If two related classes (especially Flexible Flyer, Fire Fly, and Yankee Clipper) are close in score, show both and say the model is unsure which of those it is, rather than hiding the runner-up.

## Integration with the map, maker dropdown, and submissions
- Photo identification and the searchable maker map share the same 25-entry black-list dropdown. A confirmed maker on a posted sled is the maker the map should filter on.
- The model suggestion is only a hint. The saved maker is whatever the user confirms or types, subject to later admin edit.
- Origin zip codes, geocoding, color-coded pins, and multi-maker comparison remain the map spec's job. Photo identification does not place pins and does not use GPS from the image.
- Estimated years of manufacture stay a user-entered (or admin-edited) field. The identifier does not estimate years in the MVP.
- Sleds saved as **Unknown maker** or **Custom** follow the companion spec's still-open question: left off the map, or shown in their own layer. Until that is decided, do not silently put them under a black-list pin.
- Community visibility is unchanged: posting and viewing posts require Premium; lapsed members lose access to community posts, including their own; admin can edit or delete any post.
- Confirmed identifications become future training data only after admin review. Admin corrections override both the model and the user's first choice for training purposes.
- A later retraining pass can use those reviewed photos, then ship a new `model_version`. Old posts keep their saved maker unless admin changes them.

## Edge cases
- **Poor lighting, blur, glare, snow, or dirt.** Ask for a sharper or better-lit photo; use the low-confidence path rather than a forced guess.
- **Partial views.** A single runner, a fragment of a decal, or a packed-away sled may be useful later, especially once underside and decal classes are common in training, but the MVP should stay low-confidence when the view is incomplete.
- **Multiple sleds in one frame.** Do not assign one maker to the whole photo. Flag `possible_multiple_objects` and ask for a photo of a single sled.
- **Unknown, Custom, and green-list sleds.** If the sled is not one of the 25 classes, the model should come back low-confidence rather than "helpfully" picking a look-alike black-list maker. The user can choose **Unknown maker** or **Custom**. Green-list makers are not suggested in the MVP.
- **Look-alike makers.** Some makers will resemble one another. Do not hard-code unverified look-alike pairs. Use score gaps and the related-class rule for Flexible Flyer / Fire Fly / Yankee Clipper, and refine other confusion pairs only after test-set errors are reviewed.
- **Repainted or restored sleds.** Missing or replaced decals, new paint, or replaced hardware will hide the cues the model leans on. Offer the underside / runner angles as a follow-up and keep confirmation manual.
- **Reproductions and modern copies.** The MVP will not reliably detect reproductions. If the user or admin believes a sled is a reproduction, that should be a manual note or correction, and such photos should stay out of the ordinary training folders until a later enhancement.
- **Non-sled items.** Wagons, scooters, toys, or random objects should trip `possible_non_sled` when possible. Auto-Wheel Coaster also made coaster wagons and other wheeled toys; a wagon photo must not be silently labeled as a runner sled just because the company name matches. Fine-grained product-type detection is a later enhancement.
- **Catalog pages, drawings, or photos of photos.** Treat as poor input; ask for a photo of the actual sled.
- **People in the frame.** Identification should still run, but training and public display should avoid relying on or publishing recognizable faces.

## Privacy
- Strip GPS and other location EXIF on the device before upload, and again on the server. Do not store the original tagged file. Do not infer or display a street address from a photo.
- If the user later posts the sled, only the origin zip or town they enter is used, consistent with the map spec's privacy question (zip-level display).
- Identification photos are not sent to a general consumer image-search service. Staying in-app is part of the product point. If a training vendor (for example Roboflow or Vertex AI) processes images, that is a backend processing choice and needs a written understanding of retention, training use, and deletion; this spec is not legal advice.
- Community posts already require an acknowledgment that posts and photos become part of Sled Finder. That acknowledgment is not, by itself, clearly permission to use a photo that was only submitted for an identification and never posted. Training use of identify-only photos needs an explicit consent path or a decision not to use them (open question).
- Do not put a street address for the museum or for any contributor in the app, the dataset manifests, or this feature's copy. The museum is in Schaumburg, Illinois.
- Retention of abandoned or failed identification images should be short and is an open question.

## Suggested MVP versus later enhancements

### MVP
- One photo per identification request (camera or upload).
- Fine-tuned pre-trained classifier, maker-level only, against those of the 25 black-list classes that meet the photo target (or an accepted temporary threshold).
- Ranked top-N results with confidence scores, proposed bands, and the flags above.
- Required confirm/correct step into the existing dropdown, including **Unknown maker** and **Custom**.
- EXIF/GPS stripping; no street-level location.
- Handoff into Add a sled (estimated years, origin zip, acknowledgment) when the user chooses to post.
- Admin review before any community photo enters the training set.
- Evaluation on a held-out test set, including unknown / non-sled samples if they exist.
- No live feature in the mockup until the dataset work begins; this spec is the deliverable for now.

### Later
- Guided multi-angle capture (the four reference views) in one request, with the model using all of them.
- Model-level identification within a maker, once enough labeled model photos exist.
- Green-list makers, and any matrix additions Jonathan approves (including the Sherwood Brothers and Rosebud Sled Company questions in the companion spec).
- An explicit "other / none of these" model class, or true open-set recognition.
- On-device inference, if privacy or cost makes that worthwhile.
- Stronger detection of non-sleds, wagons versus runner sleds, reproductions, and restored / repainted examples.
- Active learning: send uncertain or disagreed cases to Jonathan's review queue first.
- Automatic (but still confirmation-gated) flow from a confirmed ID plus origin zip onto the maker map.

## Open questions
- Is photo identification a Premium feature, or can free users run an ID even though posting and viewing community posts require paid membership?
- Should the first live model be maker-level only (recommended for MVP), or also try model-level IDs for makers that already have distinct named models?
- Cloud inference versus on-device, and which training / hosting tool to use? Cost should be quoted before any paid plan is chosen; this spec does not include vendor prices.
- What is the go-live minimum: 30–50 solid photos per class, a different number, or a staged rollout where only ready classes appear in results?
- What confidence thresholds should ship, once test-set numbers exist?
- May photos from an identification that is never posted be used for training, and if so, what consent language should be added to the (still draft) Terms?
- How long should unused identification images be retained?
- Should Buffalo Sled Co. and Auto Wheel Coaster Co. remain one training class, matching the dropdown, or be split by era once the photos are dated?
- How should the UI handle close scores among Flexible Flyer, Fire Fly, and Yankee Clipper beyond the general related-class rule above?
- When a user types a Custom value such as "Likely Pratt or Kalamazoo," should the map and later training treat that as unconfirmed text only (current add-form behavior), or also offer a follow-up to pick one black-list maker?
- Sherwood Brothers and Rosebud Sled Company: add to the matrix? If so, black or green? (Jonathan's call, same as the companion spec.)
