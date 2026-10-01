import { describe, it, expect } from "vitest";
import { buildUrl, getApiBase } from "@/lib/api";

describe("lib/api", () => {
  it("builds URL with query parameters properly", () => {
    const url = buildUrl("/saas/tenants", { page: 1, search: "acme" });
    expect(url).toContain("page=1");
    expect(url).toContain("search=acme");
    expect(url).toContain("/saas/tenants");
  });

  it("handles empty query parameters without trailing question mark", () => {
    const url = buildUrl("/saas/tenants", {});
    expect(url.endsWith("/saas/tenants")).toBe(true);
    expect(url).not.toContain("?");
  });

  it("resolves API base URL correctly as a non-empty string", () => {
    const base = getApiBase();
    expect(base).toBeDefined();
    expect(typeof base).toBe("string");
    expect(base.length).toBeGreaterThan(0);
  });
});
