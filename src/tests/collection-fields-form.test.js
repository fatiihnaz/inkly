import { describe, it, expect } from "vitest";
import {
  seedValues,
  buildPayload,
  requiredMissing,
  humanizeCollectionError,
  singularize,
  itemSummary,
} from "../components/editors/CollectionFieldsForm.jsx";

/**
 * @file Pure-helper coverage for the schema-driven collection form. Focus
 * is the `ObjectArray` recursion (seed / payload / validation) and the
 * backend path → label mapping, since those carry the non-trivial logic.
 */

/** A `works` ObjectArray with the spec's four inner fields. */
const works = {
  name: "works",
  type: "ObjectArray",
  label: "Çalışmalar",
  required: false,
  readOnly: false,
  filterable: false,
  options: null,
  help: null,
  itemFields: [
    { name: "title", type: "Text", label: "Başlık", required: true, readOnly: false, filterable: false, options: null, help: null, itemFields: null },
    { name: "image", type: "Url", label: "Görsel", required: false, readOnly: false, filterable: false, options: null, help: null, itemFields: null },
    { name: "tags", type: "StringArray", label: "Etiketler", required: false, readOnly: false, filterable: false, options: null, help: null, itemFields: null },
    { name: "internal", type: "Text", label: "İç", required: false, readOnly: true, filterable: false, options: null, help: null, itemFields: null },
  ],
};

const scalarTitle = {
  name: "name", type: "Text", label: "Ad", required: true,
  readOnly: false, filterable: false, options: null, help: null, itemFields: null,
};

describe("seedValues - ObjectArray", () => {
  it("defaults a missing ObjectArray to an empty array", () => {
    expect(seedValues([works], {})).toEqual({ works: [] });
  });

  it("fills per-type defaults for missing inner keys of existing items", () => {
    const seeded = seedValues([works], { works: [{ title: "A" }] });
    expect(seeded.works).toEqual([
      { title: "A", image: "", tags: [], internal: "" },
    ]);
  });

  it("ignores itemFields on scalar fields (treated like options: null)", () => {
    expect(seedValues([scalarTitle], {})).toEqual({ name: "" });
  });
});

describe("buildPayload - ObjectArray", () => {
  it("shapes each element through itemFields and strips inner readOnly keys", () => {
    const values = {
      works: [{ title: "A", image: "", tags: ["x"], internal: "secret" }],
    };
    expect(buildPayload([works], values)).toEqual({
      works: [{ title: "A", image: "", tags: ["x"] }],
    });
  });

  it("coerces a non-array value to an empty array", () => {
    expect(buildPayload([works], { works: null })).toEqual({ works: [] });
  });
});

describe("requiredMissing - ObjectArray", () => {
  it("passes when all inner required fields are present", () => {
    const values = { works: [{ title: "A", image: "", tags: [] }] };
    expect(requiredMissing([works], values)).toBeNull();
  });

  it("reports the first missing inner required field with an index path", () => {
    const values = { works: [{ title: "A" }, { title: "" }] };
    expect(requiredMissing([works], values)).toBe("Çalışmalar #2 → Başlık");
  });

  it("does not enforce inner required fields when the array is empty and optional", () => {
    expect(requiredMissing([works], { works: [] })).toBeNull();
  });

  it("flags a required-but-empty ObjectArray by its own label", () => {
    const required = { ...works, required: true };
    expect(requiredMissing([required], { works: [] })).toBe("Çalışmalar");
  });
});

describe("humanizeCollectionError", () => {
  it("returns null when there's no detail", () => {
    expect(humanizeCollectionError("", [works])).toBeNull();
    expect(humanizeCollectionError(null, [works])).toBeNull();
  });

  it("maps a required-field path to a label chain", () => {
    const detail = "Field 'works[0].title' is required.";
    expect(humanizeCollectionError(detail, [works])).toBe(
      "Zorunlu alan eksik: Çalışmalar #1 → Başlık",
    );
  });

  it("maps an unknown-field path, falling back to the raw inner name", () => {
    const detail = "Unknown field 'works[1].foo'";
    expect(humanizeCollectionError(detail, [works])).toBe(
      "Bilinmeyen alan: Çalışmalar #2 → foo",
    );
  });

  it("rewrites quoted paths inside unrecognised messages", () => {
    const detail = "Value for 'works[0].title' was rejected";
    expect(humanizeCollectionError(detail, [works])).toBe(
      "Geçersiz veri: Value for 'Çalışmalar #1 → Başlık' was rejected",
    );
  });

  it("leaves unresolved quoted tokens untouched", () => {
    const detail = "Something about 'nope' happened";
    expect(humanizeCollectionError(detail, [works])).toBe(
      "Geçersiz veri: Something about 'nope' happened",
    );
  });
});

describe("singularize", () => {
  it("strips the Turkish plural suffix for the add-button label", () => {
    expect(singularize("Çalışmalar")).toBe("Çalışma");
    expect(singularize("Etiketler")).toBe("Etiket");
    expect(singularize("Görseller")).toBe("Görsel");
  });

  it("leaves singular labels untouched", () => {
    expect(singularize("Başlık")).toBe("Başlık");
    expect(singularize("Ad")).toBe("Ad");
  });

  it("keeps short words whose stem would be too small", () => {
    expect(singularize("Sular")).toBe("Sular");
  });

  it("trims surrounding whitespace", () => {
    expect(singularize("  Çalışmalar  ")).toBe("Çalışma");
  });
});

describe("itemSummary", () => {
  const fields = works.itemFields;

  it("returns the first non-empty text-ish field value", () => {
    expect(itemSummary(fields, { title: "Portfolyo", image: "" })).toBe("Portfolyo");
  });

  it("skips empty/whitespace strings and falls through to the next field", () => {
    // title is "" → image (Url) is the first usable string
    expect(itemSummary(fields, { title: "   ", image: "https://x" })).toBe("https://x");
  });

  it("strips tags from a RichText value", () => {
    const rich = [{ name: "body", type: "RichText", label: "Gövde", itemFields: null }];
    expect(itemSummary(rich, { body: "<p>Merhaba <b>dünya</b></p>" })).toBe("Merhaba  dünya");
  });

  it("ignores non-string values (arrays, numbers, bools)", () => {
    expect(itemSummary(fields, { tags: ["x"], title: "", image: "" })).toBeNull();
  });

  it("returns null for an empty or missing item", () => {
    expect(itemSummary(fields, {})).toBeNull();
    expect(itemSummary(fields, undefined)).toBeNull();
  });
});
