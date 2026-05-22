import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer, GeoJsonLayer, IconLayer } from "@deck.gl/layers";
import type { Feature } from "geojson";
import {
  BLUE,
  BLUE_K25,
  BLUE_W80,
  CATEGORY_FILL,
  CATEGORY_STROKE,
  rgba,
} from "./tokens";
import { FACILITY_ICONS, isFacility } from "./icons";
import type {
  ProjectCategory,
  ProjectFeature,
  RegionProps,
  RegionCollection,
} from "./types";

// Fixed pin radius — points are not sized by spend.
const DOT_RADIUS = 6;
// Facility glyphs read best a touch larger than the budget dots.
const ICON_SIZE = 22;

export interface ClusterPoint {
  key: string;
  coords: [number, number];
  category: ProjectCategory;
  members: ProjectFeature[];
  visible: boolean; // passes the active region filter
}

interface BuildArgs {
  features: ProjectFeature[];
  regions: RegionCollection | null;
  selectedRegions: Set<number>; // empty = all
  hoveredKey: string | null;
  selectedId: number | null;
  reducedMotion: boolean;
}

function passesRegion(f: ProjectFeature, selected: Set<number>): boolean {
  if (selected.size === 0) return true;
  return f.properties.region_codes.some((c) => selected.has(c));
}

// Group points sharing an exact coordinate so coincident pins render as one dot
// with a count badge instead of stacking invisibly.
export function clusterPoints(
  features: ProjectFeature[],
  selected: Set<number>
): ClusterPoint[] {
  const map = new Map<string, ClusterPoint>();
  for (const f of features) {
    if (f.geometry.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const category = f.properties.category;
    // Key on category too so capital and other pins at one coordinate stay
    // distinct dots rather than merging into a single ambiguous cluster.
    const key = `${lon},${lat},${category}`;
    let cell = map.get(key);
    if (!cell) {
      cell = { key, coords: [lon, lat], category, members: [], visible: false };
      map.set(key, cell);
    }
    cell.members.push(f);
    if (passesRegion(f, selected)) cell.visible = true;
  }
  return [...map.values()];
}

const TRANSITION = (reduced: boolean) =>
  reduced
    ? undefined
    : {
        getFillColor: { duration: 400, easing: (t: number) => t },
        getLineColor: { duration: 400, easing: (t: number) => t },
        getColor: { duration: 400, easing: (t: number) => t },
      };

export function buildLayers(args: BuildArgs): Layer[] {
  const { regions, selectedRegions, hoveredKey, selectedId, reducedMotion } = args;
  const layers: Layer[] = [];

  // ── Region polygons (blue) ────────────────────────────────────────────────
  if (regions) {
    const hasFilter = selectedRegions.size > 0;
    const codeOf = (f: { properties: unknown }) =>
      (f.properties as RegionProps).RDP_code;
    layers.push(
      new GeoJsonLayer({
        id: "regions",
        data: regions.features as unknown as Feature[],
        pickable: false,
        stroked: true,
        filled: true,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        getFillColor: (f) => {
          const sel = selectedRegions.has(codeOf(f));
          if (!hasFilter) return rgba(BLUE, 0.16);
          return sel ? rgba(BLUE, 0.42) : rgba(BLUE_W80, 0.08);
        },
        getLineColor: (f) => {
          const sel = selectedRegions.has(codeOf(f));
          if (!hasFilter) return rgba(BLUE_K25, 0.75);
          return sel ? rgba(BLUE_K25, 1) : rgba(BLUE_K25, 0.28);
        },
        getLineWidth: (f) => (hasFilter && selectedRegions.has(codeOf(f)) ? 2.5 : 1.25),
        updateTriggers: {
          getFillColor: [selectedRegions],
          getLineColor: [selectedRegions],
          getLineWidth: [selectedRegions],
        },
        transitions: TRANSITION(reducedMotion) as object | undefined,
      })
    );
  }

  const clusters = clusterPoints(args.features, selectedRegions);
  const dots = clusters.filter((c) => !isFacility(c.category));
  const facilities = clusters.filter((c) => isFacility(c.category));

  const isActive = (c: ClusterPoint) =>
    c.key === hoveredKey || c.members.some((m) => m.properties.project_id === selectedId);

  // ── Budget pins (blue dots, fixed size) ─────────────────────────────────────
  layers.push(
    new ScatterplotLayer<ClusterPoint>({
      id: "points",
      data: dots,
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      getPosition: (c) => c.coords,
      getRadius: (c) => {
        const base = c.members.length > 1 ? DOT_RADIUS + 3 : DOT_RADIUS;
        return isActive(c) ? base * 1.25 : base;
      },
      getFillColor: (c) => {
        const active = c.key === hoveredKey;
        return rgba(CATEGORY_FILL[c.category], c.visible ? (active ? 0.95 : 0.8) : 0.12);
      },
      getLineColor: (c) =>
        rgba(CATEGORY_STROKE[c.category], c.visible ? (isActive(c) ? 1 : 0.85) : 0.15),
      getLineWidth: 1.5,
      updateTriggers: {
        getFillColor: [hoveredKey, selectedRegions],
        getLineColor: [hoveredKey, selectedId, selectedRegions],
        getRadius: [hoveredKey, selectedId],
      },
      transitions: TRANSITION(reducedMotion) as object | undefined,
    })
  );

  // ── Facility pins (thematic blue glyphs: schools, police, hospitals) ────────
  layers.push(
    new IconLayer<ClusterPoint>({
      id: "facilities",
      data: facilities,
      pickable: true,
      getPosition: (c) => c.coords,
      getIcon: (c) => FACILITY_ICONS[c.category as "school" | "police" | "hospital"],
      sizeUnits: "pixels",
      getSize: (c) => (isActive(c) ? ICON_SIZE * 1.25 : ICON_SIZE),
      getColor: (c) => {
        const active = c.key === hoveredKey;
        return rgba(BLUE, c.visible ? (active ? 1 : 0.9) : 0.18);
      },
      updateTriggers: {
        getColor: [hoveredKey, selectedRegions],
        getSize: [hoveredKey, selectedId],
      },
      transitions: TRANSITION(reducedMotion) as object | undefined,
    })
  );

  // ── Cluster count badges ────────────────────────────────────────────────────
  const multi = clusters.filter((c) => c.members.length > 1);
  if (multi.length) {
    layers.push(
      new TextLayer<ClusterPoint>({
        id: "counts",
        data: multi,
        pickable: false,
        getPosition: (c) => c.coords,
        getText: (c) => String(c.members.length),
        getSize: 12,
        sizeUnits: "pixels",
        getColor: (c) => rgba([255, 255, 255], c.visible ? 1 : 0.4),
        fontWeight: 700,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        updateTriggers: { getColor: [selectedRegions] },
      })
    );
  }

  return layers;
}
