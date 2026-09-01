"use client";

import { useEffect, useState } from "react";

export function useTheme() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Initialise from localStorage or system preference
    const stored = localStorage.getItem("sheba-theme");
    if (stored) {
      setIsDark(stored === "dark");
    } else {
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("sheba-theme", isDark ? "dark" : "light");
  }, [isDark]);

  return { isDark, toggle: () => setIsDark((v) => !v) };
}
