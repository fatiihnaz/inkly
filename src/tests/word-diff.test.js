import { describe, it, expect } from "vitest";
import { diffWords, diffLines, stripHtml } from "../lib/word-diff.js";

/** Reconstruct the "before" text: everything unchanged or removed, in order. */
const before = (ops) =>
  ops.filter((o) => o.type !== "added").map((o) => o.text).join("");
/** Reconstruct the "after" text: everything unchanged or added, in order. */
const after = (ops) =>
  ops.filter((o) => o.type !== "removed").map((o) => o.text).join("");

describe("diffWords - reconstruction invariant", () => {
  // The diff must be lossless: removed+unchanged rebuilds `a`, added+unchanged
  // rebuilds `b`. This holds even after char-level refinement.
  const cases = [
    ["", ""],
    ["hello world", "hello world"],
    ["", "brand new"],
    ["gone now", ""],
    ["the quick brown fox", "the slow brown fox"],
    ["color", "colour"],
    ["cat", "dog"],
    ["one two three", "one three"],
    ["a b c", "a x b c d"],
    ["Visit https://old.example.com", "Visit https://new.example.com"],
  ];
  it.each(cases)("rebuilds both sides for (%j -> %j)", (a, b) => {
    const ops = diffWords(a, b);
    expect(before(ops)).toBe(a);
    expect(after(ops)).toBe(b);
  });
});

describe("diffWords - behaviour", () => {
  it("returns no ops for two empty strings", () => {
    expect(diffWords("", "")).toEqual([]);
  });

  it("tolerates null / undefined as empty", () => {
    expect(diffWords(null, undefined)).toEqual([]);
    expect(after(diffWords(null, "added"))).toBe("added");
  });

  it("marks an identical string entirely unchanged (single merged run)", () => {
    expect(diffWords("same text", "same text")).toEqual([
      { type: "unchanged", text: "same text" },
    ]);
  });

  it("emits a single added run when inserting into empty", () => {
    expect(diffWords("", "fresh")).toEqual([{ type: "added", text: "fresh" }]);
  });

  it("refines a similar word swap down to character-level ops", () => {
    // "color" -> "colour" shares enough chars to refine: the only added text
    // is the inserted "u", with no removed run.
    const ops = diffWords("color", "colour");
    expect(ops.some((o) => o.type === "removed")).toBe(false);
    expect(ops.find((o) => o.type === "added")?.text).toBe("u");
  });

  it("keeps a dissimilar swap as a whole removed+added pair (no char confetti)", () => {
    const ops = diffWords("cat", "dog");
    expect(ops).toEqual([
      { type: "removed", text: "cat" },
      { type: "added", text: "dog" },
    ]);
  });

  it("preserves whitespace tokens so spacing round-trips", () => {
    const ops = diffWords("a  b", "a  b");
    expect(ops).toEqual([{ type: "unchanged", text: "a  b" }]);
  });
});

describe("diffLines", () => {
  it("returns no ops for empty input", () => {
    expect(diffLines("", "")).toEqual([]);
    expect(diffLines(null, undefined)).toEqual([]);
  });

  it("classifies changed lines without merging adjacent ops", () => {
    const ops = diffLines("a\nb", "a\nc");
    expect(ops).toContainEqual({ type: "unchanged", text: "a" });
    expect(ops).toContainEqual({ type: "removed", text: "b" });
    expect(ops).toContainEqual({ type: "added", text: "c" });
  });

  it("marks identical multiline content all unchanged", () => {
    const ops = diffLines("line1\nline2", "line1\nline2");
    expect(ops.every((o) => o.type === "unchanged")).toBe(true);
    expect(ops.map((o) => o.text)).toEqual(["line1", "line2"]);
  });
});

describe("stripHtml", () => {
  it("returns empty string for falsy input", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
  });

  it("removes a simple tag wrapper", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
  });

  it("turns block-closing tags into newlines", () => {
    expect(stripHtml("<p>One</p><p>Two</p>")).toBe("One\nTwo");
  });

  it("decodes the entities the editor produces", () => {
    expect(stripHtml("a &amp; b")).toBe("a & b");
    expect(stripHtml("&lt;tag&gt; &quot;x&quot; &#39;y&#39;")).toBe("<tag> \"x\" 'y'");
  });

  it("collapses 3+ newlines down to a blank line", () => {
    expect(stripHtml("<p>a</p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });
});