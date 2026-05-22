import type { RegionCollection } from "./types";

export type Bounds = [[number, number], [number, number]];

interface Acc {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

// Recursively fold every [lon, lat] pair in a GeoJSON coordinate array into a
// running bounding box. Handles Polygon and MultiPolygon nesting alike.
function walk(arr: unknown, acc: Acc): void {
  if (!Array.isArray(arr)) return;
  if (typeof arr[0] === "number" && typeof arr[1] === "number") {
    const lon = arr[0] as number;
    const lat = arr[1] as number;
    if (lon < acc.minLon) acc.minLon = lon;
    if (lat < acc.minLat) acc.minLat = lat;
    if (lon > acc.maxLon) acc.maxLon = lon;
    if (lat > acc.maxLat) acc.maxLat = lat;
    return;
  }
  for (const el of arr) walk(el, acc);
}

function fresh(): Acc {
  return { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
}

function finalize(acc: Acc): Bounds | null {
  if (!isFinite(acc.minLon)) return null;
  return [
    [acc.minLon, acc.minLat],
    [acc.maxLon, acc.maxLat],
  ];
}

export function regionBounds(regions: RegionCollection, code: number): Bounds | null {
  const f = regions.features.find((x) => x.properties.RDP_code === code);
  if (!f) return null;
  const acc = fresh();
  walk(f.geometry.coordinates, acc);
  return finalize(acc);
}

export function allRegionsBounds(regions: RegionCollection): Bounds | null {
  const acc = fresh();
  for (const f of regions.features) walk(f.geometry.coordinates, acc);
  return finalize(acc);
}
