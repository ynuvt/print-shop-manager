/**
 * Design tokens mirroring the web CSS variables exactly.
 * Light = blue brand, Dark = yellow/gold brand (matches Zopy desktop).
 */

export type ThemeColors = {
  bg: string;
  panel: string;
  panelMuted: string;
  text: string;
  textMuted: string;
  border: string;
  brand: string;
  brandStrong: string;
  accent: string;
  error: string;
  success: string;
};

export const LightColors: ThemeColors = {
  bg: "#f5f6f8",
  panel: "#ffffff",
  panelMuted: "#f2f4f7",
  text: "#0f1624",
  textMuted: "#667184",
  border: "#d9dce2",
  brand: "#1a7af8",
  brandStrong: "#0f65d6",
  accent: "#0b1220",
  error: "#c43636",
  success: "#1f9d57",
};

export const DarkColors: ThemeColors = {
  bg: "#0f0f0f",
  panel: "#1a1a1a",
  panelMuted: "#141414",
  text: "#fafafa",
  textMuted: "#9ca3af",
  border: "#2a2a2a",
  brand: "#FACC15",
  brandStrong: "#EAB308",
  accent: "#FACC15",
  error: "#ef4444",
  success: "#4ade80",
};

export const RADIUS = 14;
