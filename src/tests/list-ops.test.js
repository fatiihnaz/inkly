import { describe, it, expect } from "vitest";
import { makeDefaultItem, moveItem, removeItem, addItem } from "../lib/list-ops.js";

describe("makeDefaultItem", () => {
  it("builds an object from each field's defaultValue", () => {
    const schema = {
      title: { blockType: "Text", defaultValue: "" },
      count: { blockType: "Text", defaultValue: 0 },
    };
    expect(makeDefaultItem(schema)).toEqual({ title: "", count: 0 });
  });

  it("deep-clones non-null defaults so new items don't share references", () => {
    const schema = { img: { blockType: "Image", defaultValue: { src: "", alt: "" } } };
    const a = makeDefaultItem(schema);
    const b = makeDefaultItem(schema);
    expect(a.img).toEqual(b.img);
    expect(a.img).not.toBe(b.img); // distinct references
    a.img.src = "mutated";
    expect(b.img.src).toBe(""); // mutation does not leak
  });

  it("passes null/undefined defaults through without cloning", () => {
    const schema = { a: { blockType: "Text", defaultValue: null } };
    expect(makeDefaultItem(schema)).toEqual({ a: null });
  });

  it("returns an empty object for nullish schema", () => {
    expect(makeDefaultItem(null)).toEqual({});
    expect(makeDefaultItem(undefined)).toEqual({});
  });
});

describe("moveItem", () => {
  it("swaps an item with its neighbour and returns a new array", () => {
    const items = ["a", "b", "c"];
    const moved = moveItem(items, 0, 1);
    expect(moved).toEqual(["b", "a", "c"]);
    expect(moved).not.toBe(items); // new reference
    expect(items).toEqual(["a", "b", "c"]); // original untouched
  });

  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("returns the SAME reference on an out-of-bounds move (no-op signal)", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 0, -1)).toBe(items); // can't go up from top
    expect(moveItem(items, 1, 1)).toBe(items); // can't go down from bottom
  });
});

describe("removeItem", () => {
  it("removes the item at index and returns a new array", () => {
    const items = ["a", "b", "c"];
    const next = removeItem(items, 1);
    expect(next).toEqual(["a", "c"]);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("is a no-op value-wise for an out-of-range index", () => {
    expect(removeItem(["a", "b"], 5)).toEqual(["a", "b"]);
  });
});

describe("addItem", () => {
  it("appends a fresh schema-defaulted item", () => {
    const schema = { title: { blockType: "Text", defaultValue: "" } };
    const next = addItem([{ title: "x" }], schema);
    expect(next).toEqual([{ title: "x" }, { title: "" }]);
  });

  it("does not mutate the input array", () => {
    const items = [];
    addItem(items, { title: { blockType: "Text", defaultValue: "" } });
    expect(items).toEqual([]);
  });
});