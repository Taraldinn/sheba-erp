"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycle = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        className="relative h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <span className="h-4 w-4" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label="Toggle theme"
      title={`Current: ${theme}. Click to switch.`}
      className="relative h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {theme === "light" ? (
        <Sun className="h-4 w-4 text-amber-500 transition-transform duration-200" />
      ) : theme === "dark" ? (
        <Moon className="h-4 w-4 text-indigo-400 transition-transform duration-200" />
      ) : (
        <Monitor className="h-4 w-4 text-slate-400 transition-transform duration-200" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
