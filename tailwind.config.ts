import type { Config } from "tailwindcss";

// Palette mirrors src/lib/tokens.ts. QGDS ships ONE brand blue; tints/shades
// are produced via opacity or color-mix at use sites, not as a forked scale.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        qld: {
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
          "info-darker": "#006A8F",
          "info-lighter": "#E5EEF5",
          "info-lightest": "#EFF4F9",
          success: "#339D37",
          caution: "#FFCC2C",
          error: "#E22339",
        },
      },
      fontFamily: {
        sans: ["var(--font-noto-sans)", "Noto Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(19,18,18,0.06), 0 4px 12px rgba(19,18,18,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
