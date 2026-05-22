import type { ProjectCategory } from "./types";

// Thematic glyphs for the three facility types. Stored as SVG path data on a
// 24×24 viewBox so the same shape feeds both the deck.gl IconLayer (rendered
// as a tinted mask on the map) and the inline SVG swatches in the legend.
export const CATEGORY_PATH: Record<"school" | "police" | "hospital", string> = {
  // Mortarboard over a graduation base.
  school:
    "M12 3 L1 8 l11 5 l9-4.09 V14 h2 V8 Z M5 11.5 V15 c0 1.66 3.13 3 7 3 s7-1.34 7-3 v-3.5 l-7 3.18 Z",
  // Security shield.
  police: "M12 1 L3 5 v6 c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12 V5 Z",
  // Medical cross.
  hospital: "M9 4 h6 v5 h5 v6 h-5 v5 h-6 v-5 h-5 v-6 h5 Z",
};

const FACILITY = new Set<ProjectCategory>(["school", "police", "hospital"]);

export function isFacility(c: ProjectCategory): c is "school" | "police" | "hospital" {
  return FACILITY.has(c);
}

interface IconDef {
  id: string;
  url: string;
  width: number;
  height: number;
  mask: true;
}

function maskUrl(path: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><path d="${path}" fill="#fff"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// deck.gl IconLayer icon mapping. `mask: true` makes the layer tint these
// white silhouettes via getColor, keeping every pin on the brand blue.
export const FACILITY_ICONS: Record<"school" | "police" | "hospital", IconDef> = {
  school: { id: "school", url: maskUrl(CATEGORY_PATH.school), width: 48, height: 48, mask: true },
  police: { id: "police", url: maskUrl(CATEGORY_PATH.police), width: 48, height: 48, mask: true },
  hospital: { id: "hospital", url: maskUrl(CATEGORY_PATH.hospital), width: 48, height: 48, mask: true },
};
