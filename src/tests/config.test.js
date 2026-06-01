import { describe, it, expect } from "vitest";
import { createCmsConfig } from "../lib/config.js";

describe("createCmsConfig", () => {
  it("requires a string baseUrl", () => {
    expect(() => createCmsConfig({})).toThrow(/baseUrl is required/);
    expect(() => createCmsConfig({ baseUrl: "" })).toThrow(/baseUrl is required/);
    // @ts-expect-error - intentional wrong type
    expect(() => createCmsConfig({ baseUrl: 123 })).toThrow(/baseUrl is required/);
  });

  it("strips trailing slashes from baseUrl and cdnUrl", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test//", cdnUrl: "https://cdn.test/" });
    expect(cfg.baseUrl).toBe("https://api.test");
    expect(cfg.cdnUrl).toBe("https://cdn.test");
  });

  it("defaults cdnUrl and clientId to null", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test" });
    expect(cfg.cdnUrl).toBeNull();
    expect(cfg.clientId).toBeNull();
  });

  it("defaults globalSlug to __global and honours an override", () => {
    expect(createCmsConfig({ baseUrl: "https://api.test" }).globalSlug).toBe("__global");
    expect(
      createCmsConfig({ baseUrl: "https://api.test", globalSlug: "site" }).globalSlug,
    ).toBe("site");
  });

  it("returns a frozen object (safe to pass across the RSC boundary)", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test" });
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it("does not embed a transport (non-serializable) on the config", () => {
    const cfg = createCmsConfig({ baseUrl: "https://api.test" });
    expect(cfg.transport).toBeUndefined();
  });
});