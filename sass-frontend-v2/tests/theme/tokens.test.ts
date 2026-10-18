import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Theme Tokens CSS", () => {
  it("defines signal and indigo theme variables as well as density rules", () => {
    const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
    const content = fs.readFileSync(cssPath, "utf-8");

    expect(content).toContain('[data-theme="signal"]');
    expect(content).toContain('[data-theme="indigo"]');
    expect(content).toContain('[data-density="compact"]');
    expect(content).toContain('[data-density="comfortable"]');
    expect(content).toContain("--status-online");
    expect(content).toContain("--font-space-grotesk");
    expect(content).toContain("@utility glow-hover");
    expect(content).toContain("@utility luxury-sheen");

    // Ensure all @utility names are alphanumeric without pseudo-classes
    const utilityMatches = content.match(/@utility\s+([^\s{]+)/g) || [];
    for (const match of utilityMatches) {
      const name = match.replace(/@utility\s+/, "");
      expect(name).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
