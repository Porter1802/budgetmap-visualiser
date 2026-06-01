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
import { GLYPH_ICONS, hasGlyph } from "./icons";
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
  zoom: number; // current (rounded) map zoom — drives proximity clustering
}

function passesRegion(f: ProjectFeature, selected: Set<number>): boolean {
  if (selected.size === 0) return true;
  return f.properties.region_codes.some((c) => selected.has(c));
}

// Side of the square (in screen pixels) each pin claims when clustering. Sized
// to comfortably fit a pin plus its count badge so neighbours don't collide.
const CLUSTER_CELL_PX = 44;
// MapLibre renders 512px tiles, so world pixel size at a zoom is 512 * 2^zoom.
const TILE_SIZE = 512;

// Project lon/lat to absolute world-pixel coordinates at a given zoom. The grid
// is anchored in world space, so cell membership is stable while panning and
// only changes (splitting clusters apart) as you zoom in.
function worldPixels(lon: number, lat: number, worldSize: number): [number, number] {
  const x = ((lon + 180) / 360) * worldSize;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize;
  return [x, y];
}

// Group nearby pins into one cluster per zoom level so coincident — and merely
// close — projects render as a single dot with a count badge instead of an
// illegible pile. Clusters split apart as the user zooms in.
export function clusterPoints(
  features: ProjectFeature[],
  selected: Set<number>,
  zoom: number
): ClusterPoint[] {
  const worldSize = TILE_SIZE * Math.pow(2, zoom);
  const map = new Map<string, ClusterPoint>();
  for (const f of features) {
    if (f.geometry.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const category = f.properties.category;
    const [px, py] = worldPixels(lon, lat, worldSize);
    // Key on category too so distinct pin types at one spot stay separate dots
    // rather than merging into a single ambiguous cluster.
    const cellX = Math.floor(px / CLUSTER_CELL_PX);
    const cellY = Math.floor(py / CLUSTER_CELL_PX);
    const key = `${cellX},${cellY},${category}`;
    let cell = map.get(key);
    if (!cell) {
      cell = { key, coords: [lon, lat], category, members: [], visible: false };
      map.set(key, cell);
    }
    cell.members.push(f);
    if (passesRegion(f, selected)) cell.visible = true;
  }
  // Place each cluster at the centroid of its members so the dot sits over the
  // points it represents rather than snapping to a grid corner.
  for (const cell of map.values()) {
    if (cell.members.length === 1) continue;
    let lon = 0;
    let lat = 0;
    for (const m of cell.members) {
      const [mx, my] = m.geometry.coordinates as [number, number];
      lon += mx;
      lat += my;
    }
    cell.coords = [lon / cell.members.length, lat / cell.members.length];
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
  const { regions, selectedRegions, hoveredKey, selectedId, reducedMotion, zoom } = args;
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

  const clusters = clusterPoints(args.features, selectedRegions, zoom);
  const dots = clusters.filter((c) => !hasGlyph(c.category));
  const glyphs = clusters.filter((c) => hasGlyph(c.category));

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
        // Nudge the dot larger as a cluster grows so denser spots read as
        // weightier, capping the growth so it never dominates the map.
        const n = c.members.length;
        const base = n > 1 ? DOT_RADIUS + 3 + Math.min(Math.log2(n) * 1.5, 6) : DOT_RADIUS;
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

  // ── Glyph pins (thematic blue icons: capital works, schools, police, etc) ───
  layers.push(
    new IconLayer<ClusterPoint>({
      id: "glyphs",
      data: glyphs,
      pickable: true,
      getPosition: (c) => c.coords,
      getIcon: (c) => GLYPH_ICONS[c.category as "capital" | "school" | "police" | "hospital"],
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
  // Rendered as a notification-style chip in the pin's upper-right: a solid
  // dark-blue pill with a white border keeps the number legible over any pin,
  // dot or glyph, and the offset stops it from masking the icon underneath.
  const multi = clusters.filter((c) => c.members.length > 1);
  if (multi.length) {
    layers.push(
      new TextLayer<ClusterPoint>({
        id: "counts",
        data: multi,
        pickable: false,
        getPosition: (c) => c.coords,
        getText: (c) => String(c.members.length),
        getSize: 11,
        sizeUnits: "pixels",
        getPixelOffset: [9, -9],
        getColor: (c) => rgba([255, 255, 255], c.visible ? 1 : 0.4),
        fontWeight: 700,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        background: true,
        getBackgroundColor: (c) => rgba(BLUE_K25, c.visible ? 1 : 0.4),
        backgroundPadding: [4, 2, 4, 2],
        getBorderColor: (c) => rgba([255, 255, 255], c.visible ? 0.95 : 0.3),
        getBorderWidth: 1,
        updateTriggers: {
          getColor: [selectedRegions],
          getBackgroundColor: [selectedRegions],
          getBorderColor: [selectedRegions],
        },
      })
    );
  }

  return layers;
}
