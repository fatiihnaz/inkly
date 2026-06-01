import { describe, it, expect } from "vitest";
import {
  getBlock,
  getBlockValue,
  groupBlocksByPrefix,
  indexBlocksByPath,
} from "../lib/blocks.js";

/** @type {import("../lib/schemas.js").BlockResponse[]} */
const blocks = [
  { blockPath: "hero.title", blockType: "Text", value: "Welcome", sortOrder: 0, version: 1 },
  { blockPath: "hero.subtitle", blockType: "Text", value: "Sub", sortOrder: 1, version: 1 },
  { blockPath: "hero", blockType: "Text", value: "exact", sortOrder: 2, version: 1 },
  { blockPath: "footer.note", blockType: "Text", value: "Note", sortOrder: 3, version: 1 },
];

describe("getBlock", () => {
  it("finds a block by path in an array", () => {
    expect(getBlock(blocks, "hero.subtitle")?.value).toBe("Sub");
  });

  it("finds a block by path in a Map", () => {
    const map = indexBlocksByPath(blocks);
    expect(getBlock(map, "footer.note")?.value).toBe("Note");
  });

  it("returns undefined for a missing path", () => {
    expect(getBlock(blocks, "nope")).toBeUndefined();
  });
});

describe("getBlockValue", () => {
  it("returns the value of a found block", () => {
    expect(getBlockValue(blocks, "hero.title")).toBe("Welcome");
  });

  it("returns undefined when the block is missing", () => {
    expect(getBlockValue(blocks, "missing")).toBeUndefined();
  });
});

describe("groupBlocksByPrefix", () => {
  it("returns blocks matching the prefix exactly or as a dotted child", () => {
    const out = groupBlocksByPrefix(blocks, "hero").map((b) => b.blockPath);
    expect(out).toEqual(["hero.title", "hero.subtitle", "hero"]);
  });

  it("does not match a prefix that is only a string prefix of another segment", () => {
    // "footer" must not match "footer.note" via bare startsWith without the dot
    // boundary check - here we assert a non-dotted near-miss is excluded.
    const near = [{ blockPath: "heroic.x", blockType: "Text", value: 1, sortOrder: 0, version: 1 }];
    expect(groupBlocksByPrefix(near, "hero")).toEqual([]);
  });

  it("preserves input order and works over a Map", () => {
    const map = indexBlocksByPath(blocks);
    expect(groupBlocksByPrefix(map, "footer").map((b) => b.blockPath)).toEqual(["footer.note"]);
  });
});

describe("indexBlocksByPath", () => {
  it("keys a Map by blockPath", () => {
    const map = indexBlocksByPath(blocks);
    expect(map.size).toBe(4);
    expect(map.get("hero.title")?.value).toBe("Welcome");
  });
});
