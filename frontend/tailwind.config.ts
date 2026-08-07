import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        kennek: {
          orange: "var(--kennek-orange)",
          "orange-dim": "var(--kennek-orange-dim)",
          "orange-glow": "var(--kennek-orange-glow)",
          black: "var(--kennek-black)",
          charcoal: "var(--kennek-charcoal)",
          panel: "var(--kennek-panel)",
          steel: "var(--kennek-steel)",
          mist: "var(--kennek-mist)",
          ash: "var(--kennek-ash)",
          ink: "var(--kennek-ink)",
          overlay: "var(--kennek-overlay)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-be-vietnam)",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "kennek-glow": "0 0 0 1px var(--kennek-orange-dim), 0 12px 40px rgba(255, 106, 0, 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
