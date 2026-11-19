# Sled Finder Feature Spec: Searchable Maker Map

Status: Proposed (saved 19 Nov 2026)
Owner: Jonathan Spangler

## Summary
A map view that shows where sleds from each maker have been found, built from the origin zip codes users give when they submit sleds.

## Requirements
1. **Origin zip code on submissions.** When users submit a sled, they can enter the zip code of the sled's origin (where it was found).
2. **Searchable map view.** Users pick from the top 20 sled makers in a dropdown (for example, Flexible Flyer, Auto Wheel Coaster, and others).
3. **Known locations.** The map shows every known location where sleds from the selected maker have been found. Submitted zip codes are geocoded to latitude/longitude points.
4. **Color-coded pins.** Each maker gets its own pin color, so overlapping regions stay readable.
5. **Multi-maker toggle.** Users can turn on several makers at once to compare where each one's sleds turn up (for example, Flexible Flyer across the Midwest versus Auto Wheel Coaster clustered around its home base in North Tonawanda, New York).
6. **Clickable pins.** Clicking a pin shows the sled details at that location.

## Notes
- Auto-Wheel Coaster Company was a New York company (North Tonawanda, NY; formerly Buffalo Sled Company of Buffalo, NY), not Pennsylvania. Corrected 19 Nov 2026.

## Open questions
- Which 20 makers make the list: the ones with the most submissions, or a fixed curated list?
- Is the map a Premium feature, given that community posts need a paid membership?
- Is the zip code required or optional, and should the map show it only at zip level for privacy?
- Where do sleds with an "Unknown maker" or "Custom" identification go: left off the map, or shown in their own layer?
