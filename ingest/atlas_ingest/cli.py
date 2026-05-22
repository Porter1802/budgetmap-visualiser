"""Run ingest loaders without the Dagster daemon (used by `make ingest`).

    python -m atlas_ingest.cli                 # rdp + projects + sa2 join
    python -m atlas_ingest.cli --sa2 path.json # also (re)load SA2 boundaries
"""
from __future__ import annotations

import argparse

from .loaders import boundaries, projects, spatial


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="QLD Atlas ingest")
    ap.add_argument("--rdp", metavar="SRC", nargs="?", const="", help="load RDP regions")
    ap.add_argument("--sa2", metavar="SRC", help="load SA2 boundaries from GeoJSON URL/path")
    ap.add_argument("--lga", metavar="SRC", help="load LGA boundaries from GeoJSON URL/path")
    ap.add_argument("--projects", action="store_true", help="load capital projects")
    ap.add_argument("--join", action="store_true", help="refresh project_location_sa2")
    args = ap.parse_args(argv)

    # Default run: everything reachable without a manual boundary download.
    default = not any([args.rdp is not None, args.sa2, args.lga, args.projects, args.join])

    if args.rdp is not None or default:
        src = args.rdp or None
        print(f"RDP regions: {boundaries.load_rdp(src)} loaded")
    if args.sa2:
        print(f"SA2: {boundaries.load_sa2(args.sa2)} loaded")
    if args.lga:
        print(f"LGA: {boundaries.load_lga(args.lga)} loaded")
    if args.projects or default:
        print(f"Projects: {projects.load_projects()}")
    if args.join or default:
        print(f"project_location_sa2: {spatial.refresh_sa2_join()} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
