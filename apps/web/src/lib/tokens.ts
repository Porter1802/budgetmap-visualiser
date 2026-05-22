// QGDS palette — locked. The brand ships a single primary blue (#005EB8);
// every tint/shade here is that blue mixed with white or near-black.
//
// CSS-facing surfaces (panels, chips, pills) use real `color-mix(in oklch, …)`
// strings so the browser does the perceptual mix. The deck.gl WebGL canvas
// cannot consume CSS colours, so the same mixes are precomputed as RGB arrays.

import type { ProjectCategory } from "./types";

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
} as const;

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

// color-mix(in oklch, #005EB8, white X%) — precomputed for the canvas.
export const BLUE: RGB = [0, 94, 184];
export const BLUE_W80: RGB = [204, 223, 241];
// color-mix(in oklch, #005EB8, #131212 25%) — shade for strokes.
export const BLUE_K25: RGB = [5, 75, 143];

export const INFO: RGB = [0, 133, 179];
export const INFO_DARKER: RGB = [0, 106, 143];

// Portfolio accent palette (Atlas dark theme, spec §5.1). A deliberately limited
// set of muted accents — distinguishable on the dark basemap without going
// neon. Categories now read by colour *and* shape. The stroke is a near-black
// hairline so pins stay legible where accents overlap bright context.
export const ACCENT_HEX: Record<ProjectCategory, string> = {
  capital: "#E0A458", // capital works — amber
  other: "#4DA6D9", // budget projects — brand-adjacent cyan-blue
  school: "#5BC0A7", // schools — teal
  police: "#8C7BE0", // police — indigo
  hospital: "#E07A8B", // hospitals — rose
};

export const CATEGORY_FILL: Record<ProjectCategory, RGB> = {
  capital: [224, 164, 88],
  other: [77, 166, 217],
  school: [91, 192, 167],
  police: [140, 123, 224],
  hospital: [224, 122, 139],
};

const PIN_STROKE: RGB = [14, 17, 22]; // basemap background — hairline ring
export const CATEGORY_STROKE: Record<ProjectCategory, RGB> = {
  capital: PIN_STROKE,
  other: PIN_STROKE,
  school: PIN_STROKE,
  police: PIN_STROKE,
  hospital: PIN_STROKE,
};

export const CATEGORY_HEX: Record<ProjectCategory, string> = ACCENT_HEX;

export const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  capital: "Capital works",
  other: "Other projects",
  school: "Schools",
  police: "Police stations",
  hospital: "Hospitals",
};

export function rgba(rgb: RGB, alpha: number): RGBA {
  return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
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
