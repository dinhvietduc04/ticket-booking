import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#f8fafc",
        paper: "#0b1326",
        mist: "#1e293b",
        moss: "#10b981",
        coral: "#6366f1",
        gold: "#f59e0b",
        slate: "#94a3b8",
        midnight: "#060e20",
        panel: "#131b2e",
        panelHigh: "#222a3d",
        danger: "#ef4444",
      },
      boxShadow: {
        focus: "0 0 0 3px rgba(99, 102, 241, 0.38)",
        glow: "0 0 24px rgba(99, 102, 241, 0.28)",
        soft: "0 18px 45px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
