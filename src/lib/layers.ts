import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer, PathLayer, PolygonLayer } from "@deck.gl/layers";
import { latLngToCell, cellToBoundary } from "h3-js";
import {
  BLUE,
  BLUE_K25,
  INFO,
  HEX_RAMP,
  NAVY,
  rgba,
  agencyBucket,
  type RGB,
  type RGBA,
} from "./tokens";
import type { ProjectFeature, MapMode } from "./types";

const H3_RES = 5;

// Radius/width scale gently with funding on a log curve so a $9b project does
// not swamp a $10k one.
function fundingRadius(funding: number): number {
  return 4 + 6 * Math.log10(Math.max(funding, 1) / 1e4 + 1);
}
function fundingWidth(funding: number): number {
  return 2 + 3 * Math.log10(Math.max(funding, 1) / 1e4 + 1);
}

function fillFor(f: ProjectFeature, mode: MapMode): RGB {
  if (mode === "agency") return agencyBucket(f.properties.agency).rgb;
  return BLUE;
}

interface BuildArgs {
  features: ProjectFeature[];
  mode: MapMode;
  hoveredId: number | null;
  selectedId: number | null;
  visibleAgencies: Set<string> | null; // null = all visible
  reducedMotion: boolean;
}

function isVisible(f: ProjectFeature, visibleAgencies: Set<string> | null): boolean {
  return !visibleAgencies || visibleAgencies.has(f.properties.agency);
}

// Filtered-out features fade rather than vanish, preserving spatial context.
function alphaFor(f: ProjectFeature, args: BuildArgs, base: number): number {
  return isVisible(f, args.visibleAgencies) ? base : 0.08;
}

const TRANSITION = (reduced: boolean) =>
  reduced
    ? undefined
    : {
        getFillColor: { duration: 600, easing: (t: number) => t },
        getLineColor: { duration: 600, easing: (t: number) => t },
        getRadius: { duration: 600 },
      };

export function buildLayers(args: BuildArgs): Layer[] {
  const { features, mode, hoveredId, selectedId, reducedMotion } = args;

  if (mode === "hexbin") return [hexbinLayer(args)];

  const points = features.filter((f) => f.geometry.type === "Point");
  const lines = features.filter((f) => /LineString/.test(f.geometry.type));
  const polys = features.filter((f) => /Polygon/.test(f.geometry.type));

  const layers: Layer[] = [];

  layers.push(
    new ScatterplotLayer<ProjectFeature>({
      id: "points",
      data: points,
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      getPosition: (f) => f.geometry.coordinates as [number, number],
      getRadius: (f) => {
        const r = fundingRadius(f.properties.total_funding);
        const active = f.properties.project_id === hoveredId || f.properties.project_id === selectedId;
        return active ? r * 1.25 : r;
      },
      getFillColor: (f) => {
        const active = f.properties.project_id === hoveredId;
        const c = active ? INFO : fillFor(f, mode);
        return rgba(c, alphaFor(f, args, active ? 0.95 : 0.75));
      },
      getLineColor: (f) => {
        const active = f.properties.project_id === hoveredId || f.properties.project_id === selectedId;
        const c = active ? INFO : BLUE_K25;
        return rgba(c, alphaFor(f, args, 1));
      },
      getLineWidth: 1.5,
      updateTriggers: {
        getFillColor: [mode, hoveredId, args.visibleAgencies],
        getLineColor: [mode, hoveredId, selectedId, args.visibleAgencies],
        getRadius: [hoveredId, selectedId],
      },
      transitions: TRANSITION(reducedMotion) as object | undefined,
    })
  );

  // Lines and polygons are dispatched for completeness; the current published
  // payload is points-only, so these are typically empty.
  if (lines.length) {
    layers.push(
      new PathLayer<ProjectFeature>({
        id: "lines",
        data: lines,
        pickable: true,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        getPath: (f) => f.geometry.coordinates as [number, number][],
        getColor: (f) => {
          const active = f.properties.project_id === hoveredId;
          return rgba(active ? INFO : fillFor(f, mode), alphaFor(f, args, 0.9));
        },
        getWidth: (f) => fundingWidth(f.properties.total_funding),
        updateTriggers: { getColor: [mode, hoveredId, args.visibleAgencies] },
      })
    );
  }

  if (polys.length) {
    layers.push(
      new PolygonLayer<ProjectFeature>({
        id: "polys",
        data: polys,
        pickable: true,
        stroked: true,
        filled: true,
        lineWidthUnits: "pixels",
        getPolygon: (f) => f.geometry.coordinates as number[][][],
        getFillColor: (f) => {
          const active = f.properties.project_id === hoveredId;
          return rgba(active ? INFO : fillFor(f, mode), alphaFor(f, args, 0.3));
        },
        getLineColor: (f) => rgba(NAVY, alphaFor(f, args, 1)),
        getLineWidth: 1.5,
        updateTriggers: { getFillColor: [mode, hoveredId, args.visibleAgencies] },
      })
    );
  }

  return layers;
}

interface HexCell {
  hex: string;
  funding: number;
  count: number;
}

export function aggregateHexes(features: ProjectFeature[], visibleAgencies: Set<string> | null): HexCell[] {
  const map = new Map<string, HexCell>();
  for (const f of features) {
    if (f.geometry.type !== "Point") continue;
    if (visibleAgencies && !visibleAgencies.has(f.properties.agency)) continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const hex = latLngToCell(lat, lon, H3_RES);
    const cell = map.get(hex) || { hex, funding: 0, count: 0 };
    cell.funding += f.properties.total_funding;
    cell.count += 1;
    map.set(hex, cell);
  }
  return [...map.values()];
}

function rampColor(t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (HEX_RAMP.length - 1);
  const i = Math.floor(x);
  const frac = x - i;
  const a = HEX_RAMP[i];
  const b = HEX_RAMP[Math.min(i + 1, HEX_RAMP.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

// H3 hexagons rendered via PolygonLayer (boundaries from h3-js) so we avoid
// @deck.gl/geo-layers and its heavy loaders.gl dependency chain. cellToBoundary
// returns [lat, lng] pairs; PolygonLayer wants [lng, lat].
function hexbinLayer(args: BuildArgs) {
  const cells = aggregateHexes(args.features, args.visibleAgencies);
  const max = Math.max(1, ...cells.map((c) => Math.log10(c.funding + 1)));
  return new PolygonLayer<HexCell>({
    id: "hexbin",
    data: cells,
    pickable: true,
    extruded: true,
    filled: true,
    stroked: false,
    elevationScale: 30,
    getPolygon: (c) => cellToBoundary(c.hex).map(([lat, lng]) => [lng, lat]),
    getFillColor: (c): RGBA => {
      const t = Math.log10(c.funding + 1) / max;
      return rgba(rampColor(t), 0.85);
    },
    getElevation: (c) => Math.log10(c.funding + 1) * 1000,
    updateTriggers: {
      getFillColor: [args.visibleAgencies],
      getElevation: [args.visibleAgencies],
    },
    transitions: args.reducedMotion ? undefined : { getElevation: { duration: 600 } },
  });
}
