# Sled Finder Feature Spec: Searchable Maker Map

Status: Proposed (updated 19 Nov 2026)
Owner: Jonathan Spangler

## Summary
A map view that shows where sleds from each maker have been found, built from the origin zip codes users give when they submit sleds.

## Requirements
1. **Origin zip code on submissions.** When users submit a sled, they can enter the zip code of the sled's origin (where it was found).
2. **Searchable map view.** Users pick makers from a dropdown. The dropdown uses ONLY the black makers from Jonathan's maker matrix (see below). Within that list, how makers are ordered or emphasized can follow submission counts.
3. **Known locations.** The map shows every known location where sleds from the selected maker have been found. Submitted zip codes are geocoded to latitude/longitude points.
4. **Color-coded pins.** Each maker gets its own pin color, so overlapping regions stay readable.
5. **Multi-maker toggle.** Users can turn on several makers at once to compare where each one's sleds turn up (for example, Flexible Flyer across the Midwest versus Auto Wheel Coaster clustered around its home base in North Tonawanda, New York).
6. **Clickable pins.** Clicking a pin shows the sled details at that location.

## Dropdown source (authoritative)
Source: Jonathan's maker matrix, "List of American Sled Manufacturers (1850–1990)", 61 makers. BLACK makers (marked "Y" under "In books?") are the well-known makers documented in Joan Palicia's books. GREEN makers ("N") are Jonathan's own discoveries.

- Use ONLY the black makers for the map dropdown.
- Ignore the green makers for now.
- The company briefs (the 12–15 prose descriptions prepared for the Elgin / Gail Borden presentation) are NOT the dropdown source.

## Black-list dropdown set (24 makers, as written in the matrix)
1. Flexible Flyer – Planet Jr / S.L. Allen Co. — Philadelphia, PA; Medina, OH
2. Fire Fly / Yankee Clipper – Planet Jr — Philadelphia, PA; Medina, OH (same firm as #1; decide whether to merge)
3. Paris — Paris, ME
4. Standard Novelty Works (Lightning Guider) — Duncannon, PA
5. American Acme Company — Emigsville, PA
6. Buffalo Sled Co. / Auto Wheel Coaster Co. — North Tonawanda, NY
7. Garton Toy Company — Sheboygan, WI
8. Pratt Mfg Co. — Coldwater, MI
9. Chicago Rollerskate Co. — Chicago, IL
10. Turner and Thomas — Chicago, IL
11. Kalamazoo Sled Company — Kalamazoo, MI
12. The American National Company — Toledo, OH
13. Richards & Wilcox — Aurora, IL
14. C.J. Johnson Co. (Safety sled) — Mount Jewett & Bradford, PA
15. Maplewood Craft Industries — Maplewood, MN
16. Wagner — Cedar Falls, IA
17. Hunt, Helm, Ferris & Co. (Starline) — Harvard, IL
18. Duralite — Passaic (matrix says NY)
19. "Snow Hawk" (American Gold Co.) — unknown, possibly Boston, MA
20. Crosby Gilzinger Co. — Rondout, NY
21. Ellingwood Turning Company — West Paris, ME
22. Withington — no location in matrix
23. Wilkinson — no location in matrix
24. Maynard Miller — Seneca Falls, NY

## Not in the matrix (flagged, NOT added)
Jonathan has named Sherwood Brothers (Canastota, NY) and Rosebud Sled Company (St. Joseph, MI), but neither is in the 61-maker matrix. Flagged as a gap to fix in the matrix. Do not add either one to the black list or the dropdown until Jonathan says so.

## Notes
- Auto-Wheel Coaster Company was a New York company (North Tonawanda, NY; formerly Buffalo Sled Company of Buffalo, NY), not Pennsylvania.

## Open questions
- Should Fire Fly / Yankee Clipper (#2) be merged into Flexible Flyer (#1) in the dropdown?
- Is the map a Premium feature, given that community posts need a paid membership?
- Is the zip code required or optional, and should the map show it only at zip level for privacy?
- Where do sleds with an "Unknown maker" or "Custom" identification go: left off the map, or shown in their own layer?
- Sherwood Brothers and Rosebud Sled Company: add to the matrix? If so, black or green? (Jonathan's call.)
