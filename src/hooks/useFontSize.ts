import { useState, useEffect } from "react";

export type FontSize = "small" | "medium" | "large";

const FONT_SIZE_MAP: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "Kecil",
  medium: "Sedang",
  large: "Besar",
};

function getInitialFontSize(): FontSize {
  const stored = localStorage.getItem("polaris-font-size") as FontSize | null;
  if (stored && stored in FONT_SIZE_MAP) return stored;
  return "medium";
}

export function useFontSize() {
  const [fontSize, setFontSize] = useState<FontSize>(getInitialFontSize);

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_MAP[fontSize];
    localStorage.setItem("polaris-font-size", fontSize);
  }, [fontSize]);

  return { fontSize, setFontSize };
}
