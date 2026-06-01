import { describe, it, expect } from "vitest";
import { stableStringify } from "../lib/stable-stringify.js";

describe("stableStringify", () => {
  it("sorts object keys so semantically-equal payloads serialise identically", () => {
    expect(stableStringify({ src: "a", alt: "b" })).toBe(
      stableStringify({ alt: "b", src: "a" }),
    );
  });

  it("sorts keys recursively through nested objects", () => {
    const a = { outer: { z: 1, a: 2 }, name: "x" };
    const b = { name: "x", outer: { a: 2, z: 1 } };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a)).toBe('{"name":"x","outer":{"a":2,"z":1}}');
  });

  it("preserves array order (only object keys are sorted)", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(stableStringify({ list: [{ b: 1, a: 2 }] })).toBe('{"list":[{"a":2,"b":1}]}');
  });

  it("matches JSON.stringify for primitives", () => {
    expect(stableStringify("hi")).toBe('"hi"');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify(null)).toBe("null");
  });

  it("distinguishes payloads that actually differ", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });

  it("treats key order in nested arrays of objects as insignificant", () => {
    const published = { items: [{ href: "/x", label: "X" }] };
    const draft = { items: [{ label: "X", href: "/x" }] };
    expect(stableStringify(published)).toBe(stableStringify(draft));
  });
});