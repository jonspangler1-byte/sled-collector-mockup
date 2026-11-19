# Sled Finder Feature Spec: Searchable Maker Map

Status: Proposed (updated 19 Nov 2026)
Owner: Jonathan Spangler

## Summary
A map view that shows where sleds from each maker have been found, built from the origin zip codes users give when they submit sleds. The makers shown in the dropdown are driven by submission counts, not a fixed "top 20."

## Requirements
1. **Origin zip code on submissions.** When users submit a sled, they can enter the zip code of the sled's origin (where it was found).
2. **Searchable map view.** Users pick makers from a dropdown. Which makers appear is driven by how many submitted sleds each maker has. The initial focus list is the black-list makers from Joan Palicia's books (*Flexible Flyer and Other Great Sleds for Collectors* and *Great Sleds & Wagons*) only. Jonathan's green-list discoveries are added later. There is no fixed "top 20."
3. **Known locations.** The map shows every known location where sleds from the selected maker have been found. Submitted zip codes are geocoded to latitude/longitude points.
4. **Color-coded pins.** Each maker gets its own pin color, so overlapping regions stay readable.
5. **Multi-maker toggle.** Users can turn on several makers at once to compare where each one's sleds turn up (for example, Flexible Flyer across the Midwest versus Auto Wheel Coaster clustered around its home base in North Tonawanda, New York).
6. **Clickable pins.** Clicking a pin shows the sled details at that location.

## Source for the maker lists
Jonathan's "List of American Sled Manufacturers (1850–1990)" matrix (61 companies). The copy emailed to Eric Peterson (Daily Herald) on 17 Nov 2026 at 9:46 PM CST matches `American_Sled_Manufacturers_Matrix.pdf` on this project. Black versus green was read from the PDF text color, not guessed:

- Black (`#000000`): makers 1–24, also marked "Y" in the "In books?" column. These are the Palicia-book (black-list) makers.
- Green (`#1e8a2e`): makers 25–61, also marked "N." These are Jonathan's own discoveries.

Locations below are as written in that matrix, unless a note says otherwise.

## Initial focus list (black-list only, for now)
Jonathan's named initial set, with classification:

| Maker (as named) | Matrix? | Color | Location in matrix |
| --- | --- | --- | --- |
| Flexible Flyer / S.L. Allen | #1 Flexible Flyer – Planet Jr Allen Co | Black | Philadelphia, PA; Medina, OH |
| Garton (Garton Toy Company) | #7 | Black | Sheboygan, WI |
| Pratt (Pratt Mfg. Co.) | #8 | Black | Cold Water, MI (briefs use Coldwater) |
| Kalamazoo | #11 Kalamazoo Sled Company | Black | Kalamazoo, MI |
| Auto Wheel Coaster | #6 Buffalo Sled Co. to Auto Wheel Coaster Co. | Black | North Tonawanda, NY |
| American Acme | #5 American Acme Company | Black | Emigsville, PA |
| Paris Manufacturing | #3 Paris | Black | Paris, ME (briefs use South Paris) |
| Lightning Guider (Standard Novelty Works) | #4 | Black | Duncannon, PA |
| Wagner | #16 | Black | Cedar Falls, IA |
| Sherwood Brothers | Not on the 61-company matrix | Cannot classify by font color | Canastota, NY (from Jonathan's naming and the company briefs, not the matrix) |
| Rosebud Sled Company | Not on the 61-company matrix | Cannot classify by font color | St. Joseph, MI (from Jonathan's naming only; not in the matrix or the company briefs as a manufacturer) |

Nine of the eleven named makers are on the Palicia black list. Sherwood Brothers and Rosebud Sled Company are absent from the matrix, so they are not part of the black-list focus list until Jonathan decides otherwise. The company briefs do include Sherwood Bros. Mfg. Co. of Canastota and cite a collector's book, so Sherwood may belong on the black list; that is uncertain. The briefs mention a "Rosebud sled" only as an American Acme Iceplane in the museum collection, which is not evidence of a separate St. Joseph company.

Matrix #2, Fire Fly / Yankee Clipper – Planet JR (Philadelphia, PA; Medina, OH), is also black-list, but it is the same S.L. Allen / Planet Jr firm as #1 and should not take a separate slot in a top 15.

## Suggested top 15 (pending Jonathan's approval)
The nine confirmed black-list makers from the named initial set, plus six further black-list makers suggested to round the list out to 15. These six are suggestions only.

Confirmed from the named set:
1. Flexible Flyer / S.L. Allen (Philadelphia, PA; Medina, OH)
2. Garton Toy Company (Sheboygan, WI)
3. Pratt Mfg. Co. (Cold Water, MI)
4. Kalamazoo Sled Company (Kalamazoo, MI)
5. Auto Wheel Coaster / Buffalo Sled Co. (North Tonawanda, NY)
6. American Acme Company (Emigsville, PA)
7. Paris Manufacturing (Paris, ME)
8. Standard Novelty Works / Lightning Guider (Duncannon, PA)
9. Wagner (Cedar Falls, IA)

Suggested additions, with a one-line reason each, grounded in the matrix and/or company briefs:
10. **The American National Company** (Toledo, OH) — Matrix lists it as Runner, 1920–1940, with a large named model line (Viking, American Ace, Pioneer, Skippy Sno Plane, Skippy Racer). No company brief was found; this is from the matrix only.
11. **C.J. Johnson Co. Safety sled** (Mount Jewitt & Bradford, PA, as written in the matrix) — Matrix lists it as Runner, 1911–1941, with several named models including Streamline klipper, safety sled, Victor easy guider, and race-o'plane. No company brief was found; this is from the matrix only.
12. **Turner and Thomas** (Chicago, IL) — Matrix: one-piece runner, Steel Flyer, 1909. The briefs document a sheet-metal Steel Flyer on sale by December 1909 (U.S. Patent 978,515, 13 Dec 1910).
13. **Chicago Rollerskate Co** (Chicago, IL) — Matrix: Runner & Summer Sled Wheels, ~1940s, model name Steer Sled. No company brief was found; this is from the matrix only.
14. **Richards & Wilcox** (Aurora, IL) — Matrix: bar runner, folding, 1903–1915 (Flex-o-fold, little giant). The briefs say the firm sold folding and steering sleds, including the Flex-O-Fold steering sleds, and discontinued sleds about 1915–1916.
15. **Wilkinson** — The matrix lists only the name (no type, years, models, or location). The briefs identify Wilkinson Manufacturing Co. of Binghamton, New York, and say the collector's book records Storm King and National Coaster sleds from 1912; the runner type is not stated, so relevance to steel-runner steering sleds is uncertain.

If Jonathan confirms Sherwood Brothers as a Palicia/black-list maker, it could take one of these six suggested slots. Hunt, Helm, Ferris & Co. (Starline) of Harvard, IL, is another black-list candidate (matrix: steel sleds, plus Skeeboggan and Skee-Bob; briefs document a Star steel sled), but the product mix is not only runner sleds.

## Black-list makers especially relevant to vintage runner-sled collecting
"Vintage runner sled collecting" here means steel-runner steering sleds. The notes below stay with what the matrix and briefs actually say.

Especially relevant (steering and/or steel runners are documented):
- **Flexible Flyer / S.L. Allen** — Briefs: U.S. Patent 408,681 (1889) for a wooden crossbar that flexed spring-steel runners so the rider could steer.
- **Standard Novelty Works (Lightning Guider)** — Briefs: the Lightning Guider steering sled was the signature product, made 1904–1988; in 1920 the plant was credited with 1,600 to 1,800 children's sleds a day.
- **Paris Manufacturing** — Matrix: runner and iron bar. Briefs: the collector's books say its first steering sled, the Speedway, came in 1912, the same year it switched from wood to metal runners, and the firm competed with Flexible Flyer for decades.
- **Auto Wheel Coaster / Buffalo Sled** — Matrix: runner; Fleetwing line. The Auto-Wheel catalog page used in the briefs is for Fleetwing steering sleds and racers.
- **Wagner** — Matrix: runner. Briefs: Adam Wagner received a patent for a steel hand sled on 28 June 1904; the wood-decked Winner was its signature sled.
- **Turner and Thomas** — Matrix: one-piece runner, Steel Flyer. Briefs: a sled stamped from sheet metal (Steel Flyer).
- **Richards & Wilcox** — Briefs: Flex-O-Fold steering sleds (as well as folding sleds).
- **Garton, Pratt, Kalamazoo, and American Acme** — Matrix lists each as Runner, with named model lines and (except Kalamazoo, whose years are blank in the matrix) multi-decade spans; all four have company briefs and examples in the Rosebud collection. The briefs do not, in the passages checked, spell out a steering-sled patent the way they do for Flexible Flyer, but they are core Palicia-book runner-sled makers.

Relevant from the matrix only (no brief found; type or model name is the evidence):
- **The American National Company** — Runner, 1920–1940, several named models.
- **C.J. Johnson Co.** — Runner, 1911–1941; models include "easy guider."
- **Chicago Rollerskate Co** — model name Steer Sled.

Less central, or uncertain, for this kind of collecting (still black-list):
- Maplewood Craft Industries — single ski sled (Steermaster Bob-ski).
- "Snow Hawk" / American Gold company — ski sled.
- Maynard Miller — cutters and clippers, not runner sleds.
- Duralite — aluminum runner (Duralite Racer), not steel.
- Crosby Gilzinger Co and Ellingwood Turning Company — iron or metal bar runners; how they compare with later steel-runner steering sleds is not stated in the matrix or briefs.
- Hunt, Helm, Ferris & Co. (Starline) — briefs document a Star steel sled, but also a Skeeboggan, Skee-Bob, and ice scooter-sled, so the line is mixed.
- Withington — name only in the matrix (no type or location).
- Wilkinson — no type in the matrix; Storm King / National Coaster in the briefs, runner type not stated.
- Fire Fly / Yankee Clipper — black-list runner, but the same S.L. Allen firm as Flexible Flyer.

## Full black list (24)
1. Flexible Flyer – Planet Jr Allen Co — Runner — Philadelphia, PA; Medina, OH
2. Fire Fly / Yankee Clipper – Planet JR — Runner — Philadelphia, PA; Medina, OH
3. Paris — Runner and Iron bar — Paris, ME
4. Standard Novelty Works — Runner — Duncannon, PA
5. American Acme Company — Runner — Emigsville, PA
6. Buffalo Sled Co. to Auto Wheel Coaster Co. — Runner — North Tonawanda, NY
7. Garton Toy Company — Runner — Sheboygan, WI
8. Pratt Mfg Co. — Runner — Cold Water, MI
9. Chicago Rollerskate Co — Runner & Summer Sled Wheels — Chicago, IL
10. Turner and Thomas — One piece runner — Chicago, IL
11. Kalamazoo Sled Company — Runner — Kalamazoo, MI
12. The American National Company — Runner — Toledo OH
13. Richards & Wilcox — Bar runner, folding — Aurora, IL
14. CJ Johnson Co Safety sled — Runner — Mount Jewitt & Bradford PA
15. Maplewood Craft Industries — Single ski sled — Maplewood MN
16. Wagner — Runner — Cedar Falls, IA
17. Hunt, Helm, Ferris & Co. (Starline) — Steel sleds, Skeeboggan, Skee-Bob — Harvard, IL
18. Duralite — Aluminum Runner — Passaic, NY
19. "Snow Hawk" distributed by American Gold company — Ski sled — Unknown, possibly Boston, MA
20. Crosby Gilzinger Co — Iron Bar Runner — Rondout, NY
21. Ellingwood Turning Company — Metal bar Runner — West Paris, ME
22. Withington — (no type or location in the matrix)
23. Wilkinson — (no type or location in the matrix)
24. Maynard Miller — Cutters and Clippers — Seneca Falls, NY

## Full green list (37)
25. Helund — runner — Nokomis, IL
26. Turco / Matel — Bobsleds — St. Louis, MO
27. Strand — Runner — Menomonee, WI
28. Clark Auto Equipment Co — Pressed Steel (three tubular runners) — Columbus, OH
29. "Snow Rocket" Sled — Bar runner heavy — Unknown
30. Thompson Corporation — Runner — Brownstown, IN
31. Firms Inc — Heavy Bar Runner — Detroit, MI
32. Quasi Manufacturing Co. — Runner — Chicago, IL
33. Viking Corp / Fliteaway — Ski Sled (four) — Stoughton, WI
34. Sheboygan Wagon Works — Runner — Sheboygan, WI
35. Mirro — Flat runner with Seat — Manitowoc WI
36. Folbot — Aluminum Runner — Charleston, SC
37. Ski Sled Corporation — Ski Sled (two) — Chicago, IL
38. Sheffield Manufacturing Company — Runner — Burr Oak, MI
39. Seymour Manufacturing Co. — Runner — Seymour, IN
40. W.P. Prittchard Co — Single Ski Sled — Adams, MA
41. Woodstock Manufacturing Co — Ski sled or Ski-bob (two) — Rochester, NY
42. Winner Boat Company — Tri Runner Sled — Trenton, NJ
43. PEERLESS — Cutter, single wrapped/folded runner — ???, IL
44. Monoblade (possibly American Acme) — Mono Runner — ?
45. Winner Ice Cycle — Tri Runner — ?
46. Crandell Toy — Cutter — NYC
47. True Temper — Runner — Harrisburg PA
48. Snow Clipper (possibly Desposit Co.) — Scotter, 3 runner — ?
49. Chicago Wire Chair — Folding Sled — Chicago, IL
50. Ice Surfer — Ski board — Libertyville, IL
51. Flying Bob — Bob, Round steering bar — ?
52. Tubular Steel Sled Co. — Cutter — Montrose, PA
53. Ney Mfg — Cutter — Canton OH
54. Barry Toycraft — Ski bob sled — St Paul, MN
55. Thrill Coaster — Airplane — possibly NJ
56. Gendron Wheel Co — runner — Toledo OH
57. Deposit Mfg Co. — Cutter — Deposit NY
58. Wabash — Steel "Hand Sleds" Cutter, Clipper — Wabash IN
59. Martin & Heagy Mfg Company — Unkown — Elizabethtown PA
60. Bent Run Ladder Mfg Co. — Steerable Runner ? — Indiana PA
61. Rumsey Mfg Co. — Tubular steel — Detroit, MI

## Notes
- Auto-Wheel Coaster Company was a New York company (North Tonawanda, NY; formerly Buffalo Sled Company of Buffalo, NY), not Pennsylvania. Corrected 19 Nov 2026.
- Green-list makers are out of scope for the first map focus list; they can be added later once submission counts support it.
- Spellings, punctuation, and blank fields above follow the emailed matrix (for example "Matel," "Prittchard," "Desposit," "Unkown," "Scotter," "Mount Jewitt," "Cold Water," "Passaic, NY").

## Open questions
- Is the map a Premium feature, given that community posts need a paid membership?
- Is the zip code required or optional, and should the map show it only at zip level for privacy?
- Where do sleds with an "Unknown maker" or "Custom" identification go: left off the map, or shown in their own layer?
- Should Sherwood Brothers and Rosebud Sled Company be added to the matrix, and if so, as black or green?
- Does Jonathan approve the six suggested additions that round the named black-list set out to 15?
