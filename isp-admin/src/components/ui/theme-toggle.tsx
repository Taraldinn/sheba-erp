"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Sun01Icon, Moon01Icon, ComputerIcon } from "@hugeicons/core-free-icons";
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
        className="size-9 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <span className="size-4" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onPress={cycle}
      aria-label="Toggle theme"
      title={`Current: ${theme}. Click to switch.`}
      className="size-9 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {theme === "light" ? (
        <HugeiconsIcon icon={Sun01Icon} strokeWidth={2} className="size-4 text-warning" />
      ) : theme === "dark" ? (
        <HugeiconsIcon icon={Moon01Icon} strokeWidth={2} className="size-4 text-secondary-foreground" />
      ) : (
        <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} className="size-4 text-default-400" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
