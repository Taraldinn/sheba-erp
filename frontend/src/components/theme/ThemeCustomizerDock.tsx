"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { RadiusSize } from "@/lib/theme/color-utils";
import {
  Sparkles,
  Sun,
  Moon,
  Laptop,
  ChevronDown,
  Dices,
  Sliders,
  Type,
  Maximize2,
  Minimize2,
  X,
  Palette,
} from "lucide-react";

const FONT_OPTIONS = [
  { id: "var(--font-sans), system-ui, sans-serif", label: "Space Grotesk" },
  { id: "'Inter', sans-serif", label: "Inter" },
  { id: "'Roboto', sans-serif", label: "Roboto" },
  { id: "'Outfit', sans-serif", label: "Outfit" },
];

const RADIUS_OPTIONS: { id: RadiusSize; label: string; short: string }[] = [
  { id: "none", label: "None", short: "0" },
  { id: "sm", label: "Small", short: "S" },
  { id: "md", label: "Medium", short: "M" },
  { id: "lg", label: "Large", short: "L" },
  { id: "full", label: "Full", short: "F" },
];

export function ThemeCustomizerDock() {
  const {
    theme,
    setTheme,
    themeState,
    activePreset,
    availablePresets,
    setPreset,
    setAccentHue,
    setRadius,
    setRadiusForm,
    setFontFamily,
    setVibrant,
    randomizeTheme,
  } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  // Close preset popup on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (presetsRef.current && !presetsRef.current.contains(event.target as Node)) {
        setIsPresetsOpen(false);
      }
    }
    if (isPresetsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isPresetsOpen]);

  return (
    <>
      {/* Floating launcher trigger at bottom right */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (isMinimized) {
              setIsMinimized(false);
            } else {
              setIsOpen((prev) => !prev);
            }
          }}
          className="relative group p-2.5 rounded-full bg-accent text-accent-foreground shadow-xl ring-2 ring-background hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
          title="HeroUI Theme Customizer (Press T to randomize)"
          aria-label="Toggle Theme Customizer"
        >
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span className="sr-only">Toggle Theme Customizer</span>
          <div className="absolute right-full mr-3 hidden group-hover:flex items-center px-2 py-1 bg-popover/90 backdrop-blur-md border border-border text-popover-foreground text-xs rounded-md shadow-lg whitespace-nowrap">
            Theme Customizer <kbd className="ml-1.5 px-1 py-0.5 bg-muted rounded text-[10px] font-mono">T</kbd>
          </div>
        </button>
      </div>

      {/* Main floating dock bar */}
      {isOpen && !isMinimized && (
        <aside
          aria-label="HeroUI Theme Customizer Dock"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[96vw] w-fit flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-surface/90 dark:bg-surface/95 backdrop-blur-xl border border-border shadow-2xl text-foreground text-xs animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Preset Selector Button & Dropdown */}
          <div className="relative" ref={presetsRef}>
            <button
              type="button"
              onClick={() => setIsPresetsOpen((prev) => !prev)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-muted/60 hover:bg-muted border border-border text-foreground font-medium transition-all cursor-pointer"
            >
              <span
                className="w-3.5 h-3.5 rounded-full shadow-xs ring-1 ring-border/50"
                style={{ backgroundColor: activePreset.colorHex }}
              />
              <span className="font-semibold text-xs tracking-tight">{activePreset.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Presets Grid Popover (Matches HeroUI reference image) */}
            {isPresetsOpen && (
              <div className="absolute bottom-full mb-3 left-0 w-64 p-3 rounded-2xl bg-surface dark:bg-surface/95 backdrop-blur-2xl border border-border shadow-2xl z-50 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                    HeroUI Themes
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPresetsOpen(false)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 11 Theme Presets Grid */}
                <div className="grid grid-cols-4 gap-2.5 py-1">
                  {availablePresets.map((preset) => {
                    const isSelected = preset.id === themeState.presetId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setPreset(preset.id);
                          setIsPresetsOpen(false);
                        }}
                        className="flex flex-col items-center gap-1 group/preset p-1.5 rounded-xl hover:bg-muted/50 transition-all cursor-pointer"
                      >
                        <div
                          className={`w-7 h-7 rounded-full shadow-md flex items-center justify-center transition-all ${
                            isSelected
                              ? "ring-2 ring-primary scale-110 ring-offset-2 ring-offset-background"
                              : "group-hover/preset:scale-105"
                          }`}
                          style={{ backgroundColor: preset.colorHex }}
                        />
                        <span
                          className={`text-[10px] truncate max-w-full font-medium ${
                            isSelected ? "text-primary font-bold" : "text-muted-foreground"
                          }`}
                        >
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Vibrant Palette Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Vibrant palette</span>
                    <span className="text-[10px] text-muted-foreground">More saturated, less contrast</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={themeState.isVibrant}
                      onChange={(e) => setVibrant(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>

                {/* Randomizer notice */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Press <kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">T</kbd> to pick random</span>
                  <button
                    type="button"
                    onClick={randomizeTheme}
                    className="p-1 rounded-lg hover:bg-muted text-primary cursor-pointer"
                    title="Randomize Theme"
                  >
                    <Dices className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Accent OKLCH Rainbow Slider */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Accent</span>
            <div className="relative flex items-center">
              <input
                type="range"
                min="0"
                max="360"
                value={Math.round(themeState.accentHue)}
                onChange={(e) => setAccentHue(Number(e.target.value))}
                className="w-24 sm:w-28 h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background:
                    "linear-gradient(to right, #ff0000, #ff7700, #ffff00, #00ff00, #00ffff, #0066ff, #9900ff, #ff0099, #ff0000)",
                }}
                title={`Accent Hue: ${Math.round(themeState.accentHue)}°`}
              />
            </div>
            <div
              className="w-4 h-4 rounded-full border border-border shadow-xs"
              style={{ backgroundColor: "var(--accent)" }}
            />
          </div>

          <div className="h-4 w-px bg-border hidden md:block" />

          {/* Typography Selector */}
          <div className="hidden md:flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={themeState.fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="bg-transparent text-xs text-foreground font-medium rounded px-1.5 py-1 outline-none border border-transparent hover:border-border cursor-pointer"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.label} value={f.id} className="bg-popover text-popover-foreground">
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-border hidden lg:block" />

          {/* Radius Selector */}
          <div className="hidden lg:flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Radius</span>
            <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRadius(r.id)}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                    themeState.radius === r.id
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Border Radius: ${r.label}`}
                >
                  {r.short}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-border hidden xl:block" />

          {/* Radius Form Selector */}
          <div className="hidden xl:flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Form</span>
            <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRadiusForm(r.id)}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                    themeState.radiusForm === r.id
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Form Field Radius: ${r.label}`}
                >
                  {r.short}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Mode Selector (Light, Dark, System) */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                theme === "light"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Light Mode"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                theme === "dark"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Dark Mode"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("system")}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                theme === "system"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="System Theme"
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Randomizer Button */}
          <button
            type="button"
            onClick={randomizeTheme}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted/80 transition-all cursor-pointer"
            title="Randomize Theme (T)"
          >
            <Dices className="w-4 h-4" />
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer ml-0.5"
            title="Close Customizer Dock"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}
    </>
  );
}
