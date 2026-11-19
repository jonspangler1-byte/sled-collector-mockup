#!/usr/bin/env python3
"""Deterministic Northeast demo pins for the Sled Picker Map.

Seeded sample data only — not real finds. Town / ZIP points come from
GeoNames postal codes (CC BY 4.0, https://download.geonames.org/export/zip/).
Re-run: python3 scripts/generate-sled-picker-pins.py
Expects a GeoNames US.txt (default: /tmp/ne-zips/US.txt), or pass a path.
Writes map-pins.js in the mockup root.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

SEED = 20261119
OUT_COUNT = 200
ROOT = Path(__file__).resolve().parents[1]
GEONAMES = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/ne-zips/US.txt")

STATES = ("ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA")
STATE_QUOTA = {"ME": 20, "NH": 16, "VT": 14, "MA": 28, "RI": 10, "CT": 18, "NY": 42, "NJ": 20, "PA": 32}
assert sum(STATE_QUOTA.values()) == OUT_COUNT

# Varied but even-ish mix across the 10 demo makers.
MAKER_QUOTA = {
    "fflyer": 28,
    "firefly": 16,
    "yclipper": 16,
    "paris": 24,
    "snw": 22,
    "acme": 18,
    "autowheel": 22,
    "garton": 16,
    "pratt": 18,
    "kal": 20,
}
assert sum(MAKER_QUOTA.values()) == OUT_COUNT

# Regional preference for a plausible mix (still sample data).
PREF = {
    "fflyer":    dict(ME=2, NH=2, VT=2, MA=3, RI=2, CT=3, NY=3, NJ=3, PA=4),
    "firefly":   dict(ME=2, NH=2, VT=2, MA=3, RI=2, CT=3, NY=3, NJ=3, PA=3),
    "yclipper":  dict(ME=2, NH=2, VT=2, MA=3, RI=2, CT=3, NY=3, NJ=2, PA=3),
    "paris":     dict(ME=5, NH=4, VT=3, MA=4, RI=2, CT=2, NY=1, NJ=1, PA=1),
    "snw":       dict(ME=1, NH=1, VT=1, MA=2, RI=1, CT=2, NY=3, NJ=3, PA=5),
    "acme":      dict(ME=1, NH=1, VT=1, MA=2, RI=1, CT=2, NY=3, NJ=3, PA=5),
    "autowheel": dict(ME=1, NH=1, VT=1, MA=2, RI=1, CT=2, NY=5, NJ=2, PA=2),
    "garton":    dict(ME=2, NH=2, VT=2, MA=3, RI=2, CT=2, NY=3, NJ=2, PA=3),
    "pratt":     dict(ME=2, NH=2, VT=2, MA=3, RI=2, CT=2, NY=3, NJ=2, PA=3),
    "kal":       dict(ME=2, NH=2, VT=2, MA=3, RI=2, CT=2, NY=3, NJ=2, PA=3),
}

MODELS = {
    "fflyer": ["No. 2", "No. 3C", "No. 4", "Racer"],
    "firefly": ["Fire Fly"],
    "yclipper": ["Yankee Clipper"],
    "paris": ["Speedway", "Paris Racer", "Dirigo Clipper", "Speedster"],
    "snw": ["Lightning Guider"],
    "acme": ["American Acme sled"],
    "autowheel": ["Fleetwing", "Fleetwing Racer", "Coaster King"],
    "garton": ["Penguin", "Streamliner"],
    "pratt": ["Red Rocket", "Chieftain"],
    "kal": ["Kalamazoo sled"],
}
YEARS = ["c. 1910s", "c. 1915–1925", "c. 1920s", "c. 1925–1935", "c. 1930s", "c. 1940s"]

# Always try to include these land town/ZIP points so the view spans Maine through Pennsylvania.
ANCHORS = [
    ("04769", "autowheel"),  # Presque Isle, ME — north
    ("04619", None),         # Calais, ME — east
    ("04101", "paris"),      # Portland, ME
    ("04281", "paris"),      # South Paris, ME
    ("03301", "paris"),      # Concord, NH
    ("03101", None),         # Manchester, NH
    ("05401", None),         # Burlington, VT
    ("05602", None),         # Montpelier, VT
    ("02116", "fflyer"),     # Boston, MA
    ("01301", None),         # Greenfield, MA
    ("01103", None),         # Springfield, MA
    ("02903", None),         # Providence, RI
    ("02840", None),         # Newport, RI
    ("06103", "fflyer"),     # Hartford, CT
    ("06510", None),         # New Haven, CT
    ("14202", "autowheel"),  # Buffalo, NY
    ("14120", "autowheel"),  # North Tonawanda, NY
    ("14604", "autowheel"),  # Rochester, NY
    ("13202", "autowheel"),  # Syracuse, NY
    ("12207", "fflyer"),     # Albany, NY
    ("10001", "fflyer"),     # New York, NY
    ("07102", "fflyer"),     # Newark, NJ
    ("08608", None),         # Trenton, NJ
    ("19103", "fflyer"),     # Philadelphia, PA
    ("15222", None),         # Pittsburgh, PA — west/south-west
    ("16501", None),         # Erie, PA — west
    ("17101", "snw"),        # Harrisburg, PA
    ("17020", "snw"),        # Duncannon, PA (Lightning Guider home) if present
]

# Interiors of the Great Lakes only — not the shore cities.
WATER_BOXES = [
    # Lake Erie interior
    (42.28, 42.70, -82.0, -79.55),
    # Lake Ontario interior
    (43.40, 43.90, -78.85, -76.70),
]

NE_BBOX = (39.65, 47.50, -80.62, -66.88)  # south, north, west, east


class RNG:
    """Mulberry32, seeded, so the pin file is reproducible."""

    def __init__(self, seed: int):
        self.s = seed & 0xFFFFFFFF

    def next(self) -> float:
        self.s = (self.s + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.s
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def choice(self, seq):
        return seq[int(self.next() * len(seq)) % len(seq)]

    def shuffle(self, seq):
        a = list(seq)
        for i in range(len(a) - 1, 0, -1):
            j = int(self.next() * (i + 1))
            a[i], a[j] = a[j], a[i]
        return a


def in_water(lat: float, lng: float) -> bool:
    for s, n, w, e in WATER_BOXES:
        if s <= lat <= n and w <= lng <= e:
            return True
    return False


def in_ne(lat: float, lng: float) -> bool:
    s, n, w, e = NE_BBOX
    return s <= lat <= n and w <= lng <= e


def load_towns(path: Path):
    by_zip = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 12:
                continue
            st = p[4]
            if st not in STATES:
                continue
            zipc, name = p[1], p[2]
            try:
                lat, lng = float(p[9]), float(p[10])
            except ValueError:
                continue
            if not zipc.isdigit() or len(zipc) != 5:
                continue
            if not name or name.upper() in {"GENERAL", "GENERAL DELIVERY"}:
                continue
            if not in_ne(lat, lng) or in_water(lat, lng):
                continue
            # Prefer the first (primary) place name for a ZIP.
            if zipc not in by_zip:
                by_zip[zipc] = {"zip": zipc, "town": f"{name}, {st}", "name": name, "state": st, "lat": lat, "lng": lng}
    return by_zip


def pick_towns(by_zip, rng: RNG):
    chosen = {}
    # Anchors first, if present and they don't overflow a state quota.
    state_count = defaultdict(int)
    for zipc, _pref in ANCHORS:
        t = by_zip.get(zipc)
        if not t:
            print(f"warning: anchor ZIP {zipc} not found")
            continue
        if state_count[t["state"]] >= STATE_QUOTA[t["state"]]:
            continue
        chosen[zipc] = t
        state_count[t["state"]] += 1

    by_state = defaultdict(list)
    for t in by_zip.values():
        by_state[t["state"]].append(t)

    for st, quota in STATE_QUOTA.items():
        pool = [t for t in rng.shuffle(by_state[st]) if t["zip"] not in chosen]
        need = quota - state_count[st]
        if need > len(pool):
            raise SystemExit(f"not enough towns in {st}: need {need}, have {len(pool)}")
        for t in pool[:need]:
            chosen[t["zip"]] = t
            state_count[st] += 1

    towns = list(chosen.values())
    if len(towns) != OUT_COUNT:
        raise SystemExit(f"expected {OUT_COUNT} towns, got {len(towns)}")
    return towns


def assign_makers(towns, rng: RNG):
    remaining = dict(MAKER_QUOTA)
    # Honor a few anchor maker preferences first.
    assigned = {}
    for zipc, pref in ANCHORS:
        if pref and zipc in {t["zip"] for t in towns} and remaining.get(pref, 0) > 0:
            assigned[zipc] = pref
            remaining[pref] -= 1

    leftover = rng.shuffle([t for t in towns if t["zip"] not in assigned])
    for t in leftover:
        weights = []
        keys = []
        for k, left in remaining.items():
            if left <= 0:
                continue
            w = PREF[k].get(t["state"], 1) * left
            keys.append(k)
            weights.append(w)
        total = sum(weights)
        if not keys:
            raise SystemExit("ran out of maker slots")
        r = rng.next() * total
        acc = 0
        pick = keys[-1]
        for k, w in zip(keys, weights):
            acc += w
            if r <= acc:
                pick = k
                break
        assigned[t["zip"]] = pick
        remaining[pick] -= 1

    if any(v != 0 for v in remaining.values()):
        raise SystemExit(f"maker leftover {remaining}")
    return assigned


def main():
    if not GEONAMES.exists():
        raise SystemExit(f"GeoNames file not found: {GEONAMES}")
    rng = RNG(SEED)
    by_zip = load_towns(GEONAMES)
    towns = pick_towns(by_zip, rng)
    makers = assign_makers(towns, rng)
    # Stable order: by state, then town name, then zip.
    towns = sorted(towns, key=lambda t: (STATES.index(t["state"]), t["town"], t["zip"]))
    pins = []
    for i, t in enumerate(towns, 1):
        key = makers[t["zip"]]
        pins.append({
            "id": f"sp{i:03d}",
            "key": key,
            "zip": t["zip"],
            "town": t["town"],
            "lat": round(t["lat"], 4),
            "lng": round(t["lng"], 4),
            "model": rng.choice(MODELS[key]),
            "years": rng.choice(YEARS),
            **({"home": True} if t["zip"] == "14120" and key == "autowheel" else {}),
        })

    # Sanity
    assert len(pins) == OUT_COUNT
    assert len({p["zip"] for p in pins}) == OUT_COUNT
    by_m = defaultdict(int)
    by_s = defaultdict(int)
    for p in pins:
        by_m[p["key"]] += 1
        by_s[p["town"].split(", ")[-1]] += 1
        if in_water(p["lat"], p["lng"]) or not in_ne(p["lat"], p["lng"]):
            raise SystemExit(f"bad point {p}")
    assert dict(by_m) == MAKER_QUOTA
    assert dict(by_s) == STATE_QUOTA

    out = ROOT / "map-pins.js"
    header = f"""/* Sled Picker Map — Northeast demo pins.
   Demo only: {OUT_COUNT} SAMPLE pins, not real finds. Town / ZIP level only.
   Generated deterministically with seed {SEED} by scripts/generate-sled-picker-pins.py
   from GeoNames postal codes (CC BY 4.0). Do not treat as a find inventory.
*/
window.MAP_DEMO = {{
  seed: {SEED},
  count: {OUT_COUNT},
  region: "Northeast (Maine through Pennsylvania)",
  label: "Demo — 200 sample pins, not real finds.",
  makers: {json.dumps(list(MAKER_QUOTA.keys()))}
}};
window.SAMPLE_MAP_PINS =
"""
    # Compact but readable JSON
    body = json.dumps(pins, indent=2, ensure_ascii=False)
    out.write_text(header + body + ";\n", encoding="utf-8")
    print(f"wrote {out} ({len(pins)} pins)")
    print("makers", dict(by_m))
    print("states", dict(by_s))
    print("lat", min(p["lat"] for p in pins), max(p["lat"] for p in pins))
    print("lng", min(p["lng"] for p in pins), max(p["lng"] for p in pins))


if __name__ == "__main__":
    main()
