// QGDS palette — locked. The brand ships a single primary blue (#005EB8);
// every tint/shade here is that blue mixed with white or near-black.
//
// CSS-facing surfaces (panels, chips, pills) use real `color-mix(in oklch, …)`
// strings so the browser does the perceptual mix. The deck.gl WebGL canvas
// cannot consume CSS colours, so the same mixes are precomputed as RGB arrays.
// The two are kept visually in step; if you retune one, retune the other.

export const QLD = {
  blue: "#005EB8",
  black: "#131212",
  darkest: "#222020",
  darker: "#444444",
  dark: "#78797E",
  light: "#E0E0E0",
  lighter: "#EBEBEB",
  lightest: "#F5F5F5",
  white: "#FFFFFF",
  info: "#0085B3",
  infoDarker: "#006A8F",
  infoLighter: "#E5EEF5",
  infoLightest: "#EFF4F9",
  success: "#339D37",
  successDarker: "#0A690D",
  caution: "#FFCC2C",
  cautionDarker: "#B38800",
  error: "#E22339",
} as const;

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

// color-mix(in oklch, #005EB8, white X%) — precomputed for the canvas.
export const BLUE: RGB = [0, 94, 184];
export const BLUE_W25: RGB = [64, 134, 202];
export const BLUE_W35: RGB = [89, 150, 209];
export const BLUE_W45: RGB = [115, 166, 216];
export const BLUE_W50: RGB = [128, 175, 220];
export const BLUE_W55: RGB = [140, 183, 223];
export const BLUE_W65: RGB = [166, 199, 230];
export const BLUE_W80: RGB = [204, 223, 241];
// color-mix(in oklch, #005EB8, #131212 X%) — shades for strokes.
export const BLUE_K25: RGB = [5, 75, 143];
export const BLUE_K35: RGB = [7, 67, 126];
export const NAVY = BLUE_K35;

export const INFO: RGB = [0, 133, 179];
export const INFO_W30: RGB = [77, 173, 207];
export const SUCCESS: RGB = [51, 157, 55];
export const CAUTION: RGB = [255, 204, 44];
export const NEUTRAL_DARKER: RGB = [68, 68, 68];
export const NEUTRAL_DARK: RGB = [120, 121, 126];
export const NEUTRAL_LIGHT: RGB = [224, 224, 224];

// Sequential blue ramp for the hexbin heatmap, light → dark.
export const HEX_RAMP: RGB[] = [
  [239, 244, 249], // info lightest
  [229, 238, 245], // info lighter
  BLUE_W50,
  BLUE,
  BLUE_K25,
];

export function rgba(rgb: RGB, alpha: number): RGBA {
  return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
}

// ── Agency → on-brand colour bucket ───────────────────────────────────────
// The published payload carries 28 long department names. They collapse into
// the controlled QGDS palette from the spec's "By agency" mode. Maroon and
// error-red are deliberately excluded. Match is keyword-based and order
// matters (first hit wins).
export interface AgencyBucket {
  label: string;
  rgb: RGB;
  css: string; // for DOM swatches / panel tab
}

const BUCKETS: { test: RegExp; label: string; rgb: RGB; css: string }[] = [
  { test: /transport|main roads/i, label: "Transport", rgb: BLUE, css: "#005EB8" },
  { test: /health/i, label: "Health", rgb: BLUE_W35, css: "color-mix(in oklch, #005EB8, #FFFFFF 35%)" },
  { test: /education|training/i, label: "Education", rgb: NAVY, css: "color-mix(in oklch, #005EB8, #131212 35%)" },
  { test: /housing|public works/i, label: "Housing", rgb: BLUE_W55, css: "color-mix(in oklch, #005EB8, #FFFFFF 55%)" },
  { test: /sport|racing|olympic|arts|museum|library/i, label: "Sport & Culture", rgb: INFO_W30, css: "color-mix(in oklch, #0085B3, #FFFFFF 30%)" },
  { test: /environment|tourism|science/i, label: "Environment", rgb: SUCCESS, css: "#339D37" },
  { test: /energy|water|powerlink|stanwell|sunwater/i, label: "Energy & Water", rgb: INFO, css: "#0085B3" },
  { test: /justice|police|fire|corrective|youth/i, label: "Justice & Safety", rgb: NEUTRAL_DARKER, css: "#444444" },
  { test: /families|seniors|disability|communities|child/i, label: "Communities", rgb: NEUTRAL_DARK, css: "#78797E" },
  { test: /resources|mines|natural/i, label: "Resources", rgb: CAUTION, css: "#FFCC2C" },
];

const OTHER: AgencyBucket = { label: "Other", rgb: NEUTRAL_LIGHT, css: "#E0E0E0" };

export function agencyBucket(agency: string | null | undefined): AgencyBucket {
  if (!agency) return OTHER;
  for (const b of BUCKETS) if (b.test.test(agency)) return { label: b.label, rgb: b.rgb, css: b.css };
  return OTHER;
}

// Status enum is inferred (the published package exposes only status=2).
export function statusMeta(status: number | null | undefined): { label: string; css: string; text: string } {
  switch (status) {
    case 3:
      return { label: "Completed", css: "#E8F4E9", text: "#0A690D" };
    case 4:
      return { label: "On hold", css: "#FFF6D6", text: "#B38800" };
    default:
      return { label: "Underway", css: "#E5EEF5", text: "#006A8F" };
  }
}
