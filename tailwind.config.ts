import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

/**
 * Tailwind config (scoped to console/ subtree).
 *
 * The marketing static pages don't use Tailwind — they're vanilla CSS files
 * under styles/. `content` only globs into console/ so Tailwind purges
 * everything except classes actually used in the console SPA.
 *
 * Tokens mirror styles/variables.css. When the mega-x palette changes,
 * update both files.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./console/index.html", "./console/src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        bg: "#07090F",
        surface: "#0D1119",
        "surface-2": "#151B28",
        "surface-3": "#1E2838",

        heading: "#E8DCC8",
        body: "#B8AFA0",
        muted: "#8A95A8",
        dim: "#5A6678",

        primary: {
          DEFAULT: "#D4A84E",
          dim: "#8A6A18",
          muted: "#2A2010",
        },
        accent: { DEFAULT: "#E8C05A", "2": "#F5DFA0" },
        gold: "#D4A84E",

        wifi: "#D4A84E",
        ai: { DEFAULT: "#B8B0C8", dim: "#4B4A5F" },
        fusion: { DEFAULT: "#E8884A", dim: "#4A2610" },

        border: "rgba(212, 170, 76, 0.1)",
        "border-solid": "#2A2438",

        background: "#07090F",
        foreground: "#E8DCC8",
        card: { DEFAULT: "#0D1119", foreground: "#E8DCC8" },
        popover: { DEFAULT: "#151B28", foreground: "#E8DCC8" },
        destructive: { DEFAULT: "#E8884A", foreground: "#0D1119" },
        input: "#2A2438",
        ring: "#D4A84E",
      },
      fontFamily: {
        display: ['"Instrument Serif"', "serif"],
        body: ['"Barlow"', "sans-serif"],
        mono: ['"Share Tech Mono"', "monospace"],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "2px",
        md: "6px",
        lg: "6px",
        glass: "20px",
      },
    },
  },
  plugins: [animatePlugin],
};

export default config;
