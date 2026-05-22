#!/usr/bin/env python3
"""Pull QLD budget projects, capital works, and public facilities into static files.

Run ad-hoc:  python3 scripts/fetch_projects.py

Sources, each tagged with a `category` so the app can colour and filter them:
  - other    : Budget Map projects        (/api/projects)
  - capital  : Capital Statement / BP3     (/api/bp3projects, geometry in locations[])
  - school   : State + non-state schools   (data.qld CKAN datastore, has lat/long)
  - police   : QPS police stations         (open-crime-data zip, QPS_STATIONS.csv)
  - hospital : Queensland public hospitals  (data.qld CKAN datastore — address only,
               so facility names are geocoded via Nominatim and cached on disk)

Facilities carry no funding; each is assigned an RDP region by point-in-polygon
against the bundled region geometry so the region zoom/filter still applies.

This also bundles the RDP region polygons (S3 geojson) and region metadata
(regions API) so the app serves them locally with no runtime CORS exposure.
"""

import csv
import io
import json
import re
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

API = "https://budgetmap.treasury.qld.gov.au/api/projects"
BP3_API = "https://budgetmap.treasury.qld.gov.au/api/bp3projects"
REGIONS_API = "https://budgetmap.treasury.qld.gov.au/api/regions"
REGIONS_GEOJSON = (
    "https://budgetmapprodstorage.s3-ap-southeast-2.amazonaws.com/prod/data/RDP.geojson"
)

# Open-data facility sources.
DATASTORE = "https://www.data.qld.gov.au/api/3/action/datastore_search"
SCHOOLS_RESOURCE = "5b39065c-df32-415c-994c-5ff12f8de997"
HOSPITALS_RESOURCE = "7de61fec-6670-4cad-a163-d955f0102cef"
POLICE_ZIP = "https://open-crime-data.s3-ap-southeast-2.amazonaws.com/document/QPS_STATIONS.zip"

NOMINATIM = "https://nominatim.openstreetmap.org/search"
NOMINATIM_UA = "budgetmap-visualiser/0.3 (open data enrichment; contact jake1802@gmail.com)"
GEOCODE_CACHE = Path(__file__).resolve().parent / "geocode_cache.json"

# Synthetic id offsets keep each non-/api/projects source collision-free.
ID_OFFSET = {"capital": 90_000_000, "school": 91_000_000, "police": 92_000_000, "hospital": 93_000_000}

CATEGORIES = ("capital", "other", "school", "police", "hospital")

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"

# QLD bounding box — guards against stray null-island / out-of-state coords.
QLD_BBOX = (137.5, -29.5, 154.5, -9.5)  # minLon, minLat, maxLon, maxLat


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "qld-budget-poc"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def in_qld(lon, lat):
    return QLD_BBOX[0] <= lon <= QLD_BBOX[2] and QLD_BBOX[1] <= lat <= QLD_BBOX[3]


def total_funding(funding):
    return sum(
        funding.get(k) or 0
        for k in (
            "totalQldFunding",
            "totalFedFunding",
            "totalLocalFunding",
            "totalOwnSrcFunding",
            "totalPrivateFunding",
        )
    )


def clean_agency(name):
    # Every department in the published package carries an "(Archived)" suffix;
    # strip it for display.
    return (name or "").replace(" (Archived)", "").strip()


def region_codes(project):
    # project.regions[].code is the RDP code (string); coerce to int to match
    # the polygon layer's RDP_code. Skip blanks defensively.
    codes = []
    for r in project.get("regions") or []:
        code = r.get("code")
        if code is None:
            continue
        try:
            codes.append(int(code))
        except (TypeError, ValueError):
            continue
    return sorted(set(codes))


def to_feature(project):
    lon = project.get("longitude")
    lat = project.get("latitude")
    if lon is None or lat is None or not in_qld(lon, lat):
        return None

    funding = project.get("projectFunding") or {}
    agency = project.get("agency") or {}
    ptype = project.get("type") or {}

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "project_id": project["id"],
            "name": project.get("name"),
            "description": project.get("description"),
            "agency": clean_agency(agency.get("name")),
            "type": ptype.get("name"),
            "status": project.get("status"),
            "qld_funding": funding.get("totalQldFunding") or 0,
            "fed_funding": funding.get("totalFedFunding") or 0,
            "local_funding": funding.get("totalLocalFunding") or 0,
            "own_funding": funding.get("totalOwnSrcFunding") or 0,
            "private_funding": funding.get("totalPrivateFunding") or 0,
            "total_funding": total_funding(funding),
            "region_codes": region_codes(project),
            "region_lga": project.get("regionLGA"),
            "region_sed": project.get("regionSED"),
            "region_sa4": project.get("regionSA4"),
            "address": project.get("address"),
            "web_link": project.get("webLink"),
            "category": "other",
        },
    }


def parse_codes(s):
    # bp3 carries region codes as a comma-separated string of RDP codes.
    codes = []
    for c in (s or "").split(","):
        c = c.strip()
        if not c:
            continue
        try:
            codes.append(int(c))
        except ValueError:
            continue
    return sorted(set(codes))


def bp3_to_feature(project, idx):
    # BP3 (Capital Statement) projects differ from /api/projects: geometry lives
    # in locations[] (project-level lat/long is always null), funding is a single
    # budgetValue in thousands, and there's no funding split, status, or id. We
    # emit one Point at the primary location and synthesise a collision-free id.
    locs = project.get("locations") or []
    if not locs:
        return None
    loc = locs[0]
    lon = loc.get("longitude")
    lat = loc.get("latitude")
    if lon is None or lat is None or not in_qld(lon, lat):
        return None

    try:
        budget_k = int(project.get("budgetValue") or 0)
    except (TypeError, ValueError):
        budget_k = 0

    agency = project.get("agency") or {}
    ptype = project.get("type") or {}

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "project_id": 90_000_000 + idx,
            "name": project.get("name"),
            "description": project.get("description"),
            "agency": clean_agency(agency.get("name")),
            "type": ptype.get("name"),
            "status": None,
            "qld_funding": 0,
            "fed_funding": 0,
            "local_funding": 0,
            "own_funding": 0,
            "private_funding": 0,
            "total_funding": budget_k * 1000,
            "region_codes": parse_codes(loc.get("sa4Code") or project.get("sa4Code")),
            "region_lga": None,
            "region_sed": None,
            "region_sa4": None,
            "address": None,
            "web_link": project.get("webLink"),
            "category": "capital",
        },
    }


# ── Region point-in-polygon (assigns facilities to an RDP region) ────────────
def build_region_index(rdp):
    index = []
    for f in rdp["features"]:
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        minx = miny = float("inf")
        maxx = maxy = float("-inf")
        for poly in polys:
            for ring in poly:
                for x, y in ring:
                    minx, maxx = min(minx, x), max(maxx, x)
                    miny, maxy = min(miny, y), max(maxy, y)
        index.append((int(f["properties"]["RDP_code"]), (minx, miny, maxx, maxy), polys))
    return index


def _in_ring(lon, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _in_polygon(lon, lat, polygon):
    # Even-odd across all rings: an exterior hit toggles in, a hole hit toggles
    # back out, so points inside cut-outs are correctly excluded.
    inside = False
    for ring in polygon:
        if _in_ring(lon, lat, ring):
            inside = not inside
    return inside


def region_for_point(lon, lat, region_index):
    for code, (minx, miny, maxx, maxy), polys in region_index:
        if lon < minx or lon > maxx or lat < miny or lat > maxy:
            continue
        for poly in polys:
            if _in_polygon(lon, lat, poly):
                return [code]
    return []


# ── Facility helpers ─────────────────────────────────────────────────────────
def facility_props(category, idx, name, ptype, codes, *, agency="", description=None,
                   address=None, region_lga=None, web_link=None):
    return {
        "project_id": ID_OFFSET[category] + idx,
        "name": name,
        "description": description,
        "agency": agency,
        "type": ptype,
        "status": None,
        "qld_funding": 0,
        "fed_funding": 0,
        "local_funding": 0,
        "own_funding": 0,
        "private_funding": 0,
        "total_funding": 0,
        "region_codes": codes,
        "region_lga": region_lga,
        "region_sed": None,
        "region_sa4": None,
        "address": address,
        "web_link": web_link,
        "category": category,
    }


def point_feature(lon, lat, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


def to_coord(rec, lat_key="Latitude", lon_key="Longitude"):
    try:
        return float(rec[lon_key]), float(rec[lat_key])
    except (KeyError, TypeError, ValueError):
        return None


def fetch_datastore(resource_id, limit=5000):
    url = f"{DATASTORE}?{urllib.parse.urlencode({'resource_id': resource_id, 'limit': limit})}"
    return fetch_json(url)["result"]["records"]


def fetch_police():
    req = urllib.request.Request(POLICE_ZIP, headers={"User-Agent": "qld-budget-poc"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        blob = resp.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as zf, zf.open("QPS_STATIONS.csv") as fh:
        return list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")))


def _nominatim(query):
    # Returns [lon, lat] or None. A parseable (even empty) JSON body is a real
    # answer; a non-JSON body means the shared instance throttled us, so we back
    # off and retry rather than mistaking a throttle for "not found".
    for attempt in range(4):
        params = urllib.parse.urlencode({"q": query, "format": "json", "limit": 1, "countrycodes": "au"})
        req = urllib.request.Request(
            f"{NOMINATIM}?{params}", headers={"User-Agent": NOMINATIM_UA, "Accept-Language": "en"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res = json.loads(resp.read())
            time.sleep(1.2)  # Nominatim usage policy: at most ~1 request/second.
            return [float(res[0]["lon"]), float(res[0]["lat"])] if res else None
        except Exception:
            time.sleep(2 ** attempt)  # 1, 2, 4, 8s backoff on throttle/error.
    return None


def geocode(cache_key, queries, cache):
    if cache_key in cache:
        return cache[cache_key]
    coord = None
    for q in queries:
        coord = _nominatim(q)
        if coord:
            break
    cache[cache_key] = coord
    return coord


def school_feature(rec, idx, region_index):
    coord = to_coord(rec)
    if not coord or not in_qld(*coord):
        return None
    # Only state (government) schools are mapped.
    if (rec.get("Sector") or "").strip().lower() != "state":
        return None
    lon, lat = coord
    low, high = rec.get("Official Low Year Level"), rec.get("Official High Year Level")
    bits = []
    if low and high:
        bits.append(f"Years {low} – {high}")
    elif low:
        bits.append(str(low))
    if rec.get("Sector"):
        bits.append(f"{rec['Sector']} sector")
    if rec.get("All Student Count"):
        bits.append(f"{rec['All Student Count']} students")
    return point_feature(lon, lat, facility_props(
        "school", idx, rec.get("Centre Name"), rec.get("Centre Type") or "School",
        region_for_point(lon, lat, region_index),
        agency="Department of Education",
        description=" · ".join(bits) or None,
        region_lga=rec.get("Local Government Area"),
        web_link=rec.get("Internet Site"),
    ))


def police_feature(rec, idx, region_index):
    coord = to_coord(rec)
    if not coord or not in_qld(*coord):
        return None
    lon, lat = coord
    return point_feature(lon, lat, facility_props(
        "police", idx, rec.get("Name"), "Police station",
        region_for_point(lon, lat, region_index),
        agency="Queensland Police Service",
    ))


def hospital_queries(name, address):
    # Try the facility name first (precise when OSM has it), then fall back to
    # the address suburb + postcode, which geocodes reliably to a locality.
    queries = [f"{name}, Queensland, Australia"]
    parts = [p.strip() for p in (address or "").split(",") if p.strip()]
    if parts and re.fullmatch(r"\d{4}", parts[-1]):
        postcode = parts[-1]
        suburb = parts[-2] if len(parts) >= 2 else None
        if suburb:
            queries.append(f"{suburb} {postcode}, Queensland, Australia")
        queries.append(f"{postcode}, Queensland, Australia")
    return queries


def hospital_feature(rec, idx, region_index, cache):
    name = rec.get("Facility Name")
    if not name:
        return None
    coord = geocode(name, hospital_queries(name, rec.get("Address")), cache)
    if not coord or not in_qld(*coord):
        return None
    lon, lat = coord
    hhs = rec.get("Hospital and Health Service")
    bits = []
    if hhs:
        bits.append(f"{hhs} Hospital and Health Service")
    if rec.get("Phone Number"):
        bits.append(rec["Phone Number"])
    return point_feature(lon, lat, facility_props(
        "hospital", idx, name, "Public hospital",
        region_for_point(lon, lat, region_index),
        agency="Queensland Health",
        description=" · ".join(bits) or None,
        address=rec.get("Address"),
    ))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    raw = fetch_json(API)
    features = [f for f in (to_feature(p) for p in raw) if f is not None]

    # BP3 capital projects, merged into the same feature collection and tagged
    # category="capital" so the app can style and filter them apart.
    bp3_raw = fetch_json(BP3_API)
    bp3_list = bp3_raw.get("projects") if isinstance(bp3_raw, dict) else bp3_raw
    capital = [
        f for f in (bp3_to_feature(p, i) for i, p in enumerate(bp3_list or [])) if f is not None
    ]
    features.extend(capital)

    # Region polygons (RDP_code / Name) — bundled verbatim for the map layer.
    rdp = fetch_json(REGIONS_GEOJSON)
    (OUT_DIR / "regions.geojson").write_text(json.dumps(rdp))
    region_index = build_region_index(rdp)

    # Open-data facilities. Each is assigned its RDP region by point-in-polygon.
    schools_raw = fetch_datastore(SCHOOLS_RESOURCE)
    schools = [f for f in (school_feature(r, i, region_index) for i, r in enumerate(schools_raw)) if f]
    features.extend(schools)

    police_raw = fetch_police()
    police = [f for f in (police_feature(r, i, region_index) for i, r in enumerate(police_raw)) if f]
    features.extend(police)

    geocode_cache = json.loads(GEOCODE_CACHE.read_text()) if GEOCODE_CACHE.exists() else {}
    hospitals_raw = fetch_datastore(HOSPITALS_RESOURCE)
    hospitals = [
        f for f in (hospital_feature(r, i, region_index, geocode_cache) for i, r in enumerate(hospitals_raw)) if f
    ]
    GEOCODE_CACHE.write_text(json.dumps(geocode_cache, indent=0, sort_keys=True))
    features.extend(hospitals)

    # Region metadata. Count is the mapped-feature count per region (what the
    # filter actually shows), not the API's full projectCount.
    mapped_per_code = {}
    for f in features:
        for code in f["properties"]["region_codes"]:
            mapped_per_code[code] = mapped_per_code.get(code, 0) + 1

    regions_raw = fetch_json(REGIONS_API)
    regions = []
    for r in regions_raw:
        try:
            code = int(r["code"])
        except (KeyError, TypeError, ValueError):
            continue
        regions.append(
            {"code": code, "name": r.get("name"), "count": mapped_per_code.get(code, 0)}
        )
    regions.sort(key=lambda r: r["code"])

    (OUT_DIR / "projects.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features})
    )
    category_counts = {c: 0 for c in CATEGORIES}
    for f in features:
        category_counts[f["properties"]["category"]] += 1

    total_sources = len(raw) + len(bp3_list or []) + len(schools_raw) + len(police_raw) + len(hospitals_raw)
    (OUT_DIR / "meta.json").write_text(
        json.dumps(
            {
                "total_projects": total_sources,
                "mapped_projects": len(features),
                "regions": regions,
                "categories": category_counts,
                "total_funding": sum(f["properties"]["total_funding"] for f in features),
            }
        )
    )
    print(
        f"Wrote {len(features)} mapped features ("
        + ", ".join(f"{category_counts[c]} {c}" for c in CATEGORIES)
        + f"), {len(regions)} regions, {len(rdp['features'])} polygons"
    )


if __name__ == "__main__":
    main()
