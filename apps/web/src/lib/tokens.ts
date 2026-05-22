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

// Category palette — locked to the single brand blue. Categories are told
// apart by shape (facility glyphs vs. budget dots) and label, not colour.
export const CATEGORY_FILL: Record<ProjectCategory, RGB> = {
  capital: BLUE,
  other: BLUE,
  school: BLUE,
  police: BLUE,
  hospital: BLUE,
};

export const CATEGORY_STROKE: Record<ProjectCategory, RGB> = {
  capital: BLUE_K25,
  other: BLUE_K25,
  school: BLUE_K25,
  police: BLUE_K25,
  hospital: BLUE_K25,
};

export const CATEGORY_HEX: Record<ProjectCategory, string> = {
  capital: QLD.blue,
  other: QLD.blue,
  school: QLD.blue,
  police: QLD.blue,
  hospital: QLD.blue,
};

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
