"use client";

import { useState } from "react";

import { moveItem, removeItem } from "../../lib/list-ops.js";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "../icons.jsx";

/**
 * @file `CollectionFieldsForm` - schema-driven form renderer for
 * collection items.
 *
 * Takes a list of `CollectionFieldDescriptor`s (from
 * `/cms/collections/{key}/schema` or the `/me` envelope) and a values map,
 * renders one input per field. ReadOnly fields are disabled. Bool/Number/
 * Date/Url/StringArray/RichText/Text are supported; an `options` array on
 * a field switches it to a select regardless of `type`. `ObjectArray`
 * fields render a repeatable sub-form as an accordion — one collapsible
 * card per element, its collapsed header showing a content-derived
 * summary, each card drawing the descriptor's `itemFields` through this
 * same renderer, so nested scalar types (and further ObjectArray nesting)
 * come for free.
 *
 * Pure rendering - the parent owns state. The companion helpers
 * (`seedValues`, `buildPayload`, `requiredMissing`) handle initial
 * population, request shaping, and required-field validation so callers
 * don't have to re-implement them per form.
 *
 * Used by:
 *   - the admin drawer (Collection block cards under the Page tab, and
 *     per-Collection drawer tabs)
 *   - the example `/admin/collections` page
 *
 * Styling is intentionally neutral (inherits color, plain borders) so it
 * sits comfortably both in the drawer's dark surface and in light admin
 * pages without theming infrastructure.
 */

/**
 * @import { CollectionFieldDescriptor } from "../../lib/schemas.js"
 */

/**
 * @param {{
 *   fields: CollectionFieldDescriptor[],
 *   values: Record<string, *>,
 *   onChange: (next: Record<string, *>) => void,
 *   disabled?: boolean,
 * }} props
 */
export function CollectionFieldsForm({ fields, values, onChange, disabled }) {
  if (!fields || fields.length === 0) {
    return <div style={emptyHintStyle}>Schema boş.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(v) => onChange({ ...values, [field.name]: v })}
          disabled={Boolean(disabled) || field.readOnly}
        />
      ))}
    </div>
  );
}

/**
 * @param {{
 *   field: CollectionFieldDescriptor,
 *   value: *,
 *   onChange: (next: *) => void,
 *   disabled: boolean,
 * }} props
 */
function FieldInput({ field, value, onChange, disabled }) {
  const labelNode = (
    <span style={labelRowStyle}>
      <span style={labelTextStyle}>{field.label || field.name}</span>
      {field.required ? <span style={requiredMarkStyle} aria-label="zorunlu">*</span> : null}
      {field.readOnly ? <span style={readonlyTagStyle}>readonly</span> : null}
    </span>
  );

  // `options` wins over `type` - any field with a known enumeration gets
  // a select even if its underlying type would otherwise be text.
  if (field.options && field.options.length > 0) {
    return (
      <label style={labelStyle}>
        {labelNode}
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="inscribed-field"
          style={inputStyle}
        >
          <option value="">— seç —</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {field.help ? <span style={helpStyle}>{field.help}</span> : null}
      </label>
    );
  }

  switch (field.type) {
    case "Bool":
      return (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            style={checkboxStyle}
          />
          {labelNode}
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
      );

      case "Number":
        return (
          <label style={labelStyle}>
            {labelNode}
          <input
            type="number"
            value={value ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            disabled={disabled}
            className="inscribed-field"
            style={inputStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
      );

      case "Date":
        return (
          <label style={labelStyle}>
            {labelNode}
          <input
            type="datetime-local"
            value={toDatetimeLocal(value)}
            onChange={(e) => onChange(fromDatetimeLocal(e.target.value))}
            disabled={disabled}
            className="inscribed-field"
            style={inputStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
      );

      case "Url":
        return (
          <label style={labelStyle}>
            {labelNode}
          <input
            type="url"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="https://…"
            className="inscribed-field"
            style={inputStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
      );

      case "StringArray":
        return (
          <div style={labelStyle}>
            {labelNode}
            <StringArrayEditor field={field} value={value} onChange={onChange} disabled={disabled} />
            {field.help ? <span style={helpStyle}>{field.help}</span> : null}
          </div>
        );

      case "ObjectArray":
        return (
          <div style={labelStyle}>
            {labelNode}
            <ObjectArrayEditor field={field} value={value} onChange={onChange} disabled={disabled} />
            {field.help ? <span style={helpStyle}>{field.help}</span> : null}
          </div>
        );

      case "RichText":
        return (
          <label style={labelStyle}>
            {labelNode}
          <textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={6}
            className="inscribed-field"
            style={textareaStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help} (HTML kabul edilir)</span> : null}
        </label>
      );

      case "Text":
      default:
        return (
          <label style={labelStyle}>
            {labelNode}
          <input
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="inscribed-field"
            style={inputStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
      );
  }
}

// ---- StringArrayEditor -----------------------------------------------------

/**
 * @param {{
 *   field?: import("../../lib/schemas.js").CollectionFieldDescriptor,
 *   value: string[] | undefined,
 *   onChange: (next: string[]) => void,
 *   disabled: boolean,
 * }} props
 */
function StringArrayEditor({ field, value, onChange, disabled }) {
  const [draft, setDraft] = useState("");
  const items = Array.isArray(value) ? value : [];
  const itemLabel = singularize(field?.label || field?.name || "öğe");

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setDraft("");
  };

  return (
    <div style={stringArrayShellStyle}>
      {items.length === 0 ? (
        <div style={listEmptyStyle}>Henüz öğe yok.</div>
      ) : (
        <div style={stringArrayListStyle}>
          {items.map((item, i) => (
            <span key={i} style={stringArrayChipStyle}>
              {item}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  style={stringArrayRemoveStyle}
                  aria-label={`"${item}" öğesini kaldır`}
                  title="Kaldır"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div style={stringArrayAddRowStyle}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
            placeholder={`${itemLabel} ekle…`}
            className="inscribed-field"
            style={stringArrayInputStyle}
          />
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            style={stringArrayAddBtnStyle}
          >
            <Plus size={13} />
            Ekle
          </button>
        </div>
      )}
    </div>
  );
}

// ---- ObjectArrayEditor -----------------------------------------------------

/**
 * Repeatable sub-form for an `ObjectArray` field, rendered as an
 * accordion: each element is a collapsible card whose collapsed header
 * shows a 1-based badge + a content-derived summary (the first non-empty
 * text-ish inner field, via `itemSummary`) so a long list reads as a
 * scannable index rather than a wall of forms. Expanding a card reveals
 * its `itemFields` through the same `CollectionFieldsForm`, so nested
 * scalar types — and any further `ObjectArray` nesting — come for free.
 *
 * Per-item open state is tracked by index in a `Set` and remapped on
 * every structural op (`shiftOpenAfterRemove` / `swapOpen`) so the right
 * cards stay open through reorder/remove. Newly added items auto-expand.
 * Add / remove / reorder route through the shared `list-ops` helpers so
 * the array semantics match the page-side `<EditableList>`. New items are
 * seeded with per-type defaults via `seedValues` so required fields start
 * present-but-empty rather than undefined.
 *
 * Styling stays neutral (grays + currentColor, no theme tokens) so the
 * accordion reads correctly both on the drawer's dark surface and on a
 * light admin page — the rest of this file's contract. Collapse is a
 * plain conditional render (not the drawer-only `inscribed-collapse`
 * class, which isn't present on standalone admin pages).
 *
 * @param {{
 *   field: import("../../lib/schemas.js").CollectionFieldDescriptor,
 *   value: Record<string, *>[] | undefined,
 *   onChange: (next: Record<string, *>[]) => void,
 *   disabled: boolean,
 * }} props
 */
function ObjectArrayEditor({ field, value, onChange, disabled }) {
  const itemFields = field.itemFields ?? [];
  const items = Array.isArray(value) ? value : [];
  const addLabel = singularize(field.label || field.name);

  const [open, setOpen] = useState(/** @type {Set<number>} */ (() => new Set()));
  const [hovered, setHovered] = useState(/** @type {number | null} */ (null));

  const toggle = (i) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const updateItem = (i, nextItem) =>
    onChange(items.map((it, j) => (j === i ? nextItem : it)));
  const addNew = () => {
    onChange([...items, seedValues(itemFields, {})]);
    setOpen((prev) => new Set(prev).add(items.length)); // auto-expand the new tail item
  };
  const remove = (i) => {
    onChange(removeItem(items, i));
    setOpen((prev) => shiftOpenAfterRemove(prev, i));
  };
  const move = (i, dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    onChange(next);
    setOpen((prev) => swapOpen(prev, i, i + dir));
  };

  return (
    <div style={objectArrayShellStyle}>
      {items.length === 0 ? (
        <div style={listEmptyStyle}>Henüz öğe yok.</div>
      ) : (
        <div style={objectArrayListStyle}>
          {items.map((item, i) => {
            const isOpen = open.has(i);
            const summary = itemSummary(itemFields, item);
            return (
              <div
                key={i}
                style={{
                  ...objectArrayItemStyle,
                  ...(hovered === i ? objectArrayItemHoverStyle : null),
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  style={objectArrayHeaderStyle}
                >
                  <span style={objectArrayIndexStyle}>{i + 1}</span>
                  <span style={summary ? objectArraySummaryStyle : objectArraySummaryEmptyStyle}>
                    {summary || "Boş öğe"}
                  </span>
                  {!disabled && (
                    <span style={objectArrayControlsStyle}>
                      <RowControl
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        label="Yukarı taşı"
                      >
                        <ChevronUp size={14} />
                      </RowControl>
                      <RowControl
                        onClick={() => move(i, 1)}
                        disabled={i === items.length - 1}
                        label="Aşağı taşı"
                      >
                        <ChevronDown size={14} />
                      </RowControl>
                      <RowControl
                        onClick={() => remove(i)}
                        label={`#${i + 1} öğesini sil`}
                      >
                        <Trash2 size={13} />
                      </RowControl>
                    </span>
                  )}
                  <span
                    style={{
                      ...objectArrayChevronStyle,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <ChevronDown size={14} />
                  </span>
                </button>
                {/* grid-rows 0fr↔1fr animates height with no fixed
                    measurement and no drawer-only CSS, so the collapse is
                    smooth on both the dark drawer and a standalone admin
                    page. The body stays mounted (clipped) when closed,
                    matching the drawer's keep-alive collapse. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: isOpen ? "1fr" : "0fr",
                    transition: "grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0.18, 1)",
                  }}
                >
                  <div style={objectArrayBodyClipStyle} aria-hidden={!isOpen}>
                    <div style={objectArrayBodyStyle}>
                      <CollectionFieldsForm
                        fields={itemFields}
                        values={item ?? {}}
                        onChange={(next) => updateItem(i, next)}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!disabled && (
        <button type="button" onClick={addNew} style={objectArrayAddBtnStyle}>
          <Plus size={14} />
          {addLabel} ekle
        </button>
      )}
    </div>
  );
}

/**
 * Small icon affordance for an accordion row header. Rendered as a
 * `role="button"` span (not a `<button>`) because it lives inside the
 * header `<button>` — nesting real buttons is invalid — and stops click /
 * key propagation so activating it doesn't also toggle the row.
 *
 * @param {{
 *   onClick: () => void,
 *   disabled?: boolean,
 *   label: string,
 *   children: React.ReactNode,
 * }} props
 */
function RowControl({ onClick, disabled, label, children }) {
  const act = (e) => {
    e.stopPropagation();
    if (!disabled) onClick();
  };
  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={label}
      onClick={act}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(e); }
      }}
      style={{ ...rowControlStyle, ...(disabled ? rowControlDisabledStyle : null) }}
    >
      {children}
    </span>
  );
}

// ---- Helpers ---------------------------------------------------------------

/**
 * Build the initial values map for a form, falling back to per-type
 * defaults for fields missing from `data`. Use on mount to seed form
 * state from an existing item, or with `data = {}` for a fresh "create"
 * form.
 *
 * @param {CollectionFieldDescriptor[]} fields
 * @param {Record<string, *>} data
 * @returns {Record<string, *>}
 */
export function seedValues(fields, data) {
  /** @type {Record<string, *>} */
  const out = {};
  for (const field of fields) {
    // ObjectArray: seed each existing element through its own itemFields
    // so partially-filled items still gain per-type defaults for any
    // missing inner key. New (empty) arrays stay empty.
    if (field.type === "ObjectArray") {
      const arr = Array.isArray(data[field.name]) ? data[field.name] : [];
      out[field.name] = arr.map((item) => seedValues(field.itemFields ?? [], item ?? {}));
      continue;
    }
    if (field.name in data) {
      out[field.name] = data[field.name];
      continue;
    }
    out[field.name] = defaultFor(field.type);
  }
  return out;
}

/** @param {import("../../lib/schemas.js").CollectionFieldType} type */
function defaultFor(type) {
  switch (type) {
    case "Bool":        return false;
    case "Number":      return null;
    case "StringArray": return [];
    case "ObjectArray": return [];
    default:            return "";
  }
}

/**
 * Derive a one-line summary for a collapsed ObjectArray card: the first
 * inner field that holds a non-empty string, so the header reads like the
 * item ("Portfolyo Sitesi") instead of a bare index. RichText is stripped
 * of tags first; everything non-string (Bool/Number/arrays) is skipped
 * since it makes a poor title. Returns `null` when nothing usable is
 * present, letting the caller fall back to a placeholder.
 *
 * @param {CollectionFieldDescriptor[]} itemFields
 * @param {Record<string, *> | undefined} item
 * @returns {string | null}
 */
export function itemSummary(itemFields, item) {
  if (!item) return null;
  for (const f of itemFields) {
    const raw = item[f.name];
    if (typeof raw !== "string") continue;
    const text = (f.type === "RichText" ? raw.replace(/<[^>]*>/g, " ") : raw).trim();
    if (text) return text;
  }
  return null;
}

/**
 * Strip a Turkish plural suffix so an add button reads "Çalışma ekle"
 * rather than "Çalışmalar ekle". Turkish marks the plural only with
 * `-lar` / `-ler`, so trimming a trailing one recovers the singular for
 * the overwhelming majority of field labels. Guarded by a stem-length
 * floor so short words that merely end in those letters (e.g. "Sular")
 * are left intact, and otherwise returns the label untouched.
 *
 * @param {string} label
 * @returns {string}
 */
export function singularize(label) {
  const trimmed = String(label).trim();
  const m = /^(.+)(lar|ler)$/i.exec(trimmed);
  return m && m[1].length >= 3 ? m[1] : trimmed;
}

/**
 * Remap an open-index set after element `removed` is dropped: forget that
 * index and slide every higher index down by one so the surviving cards
 * keep their open/closed state.
 *
 * @param {Set<number>} set
 * @param {number} removed
 * @returns {Set<number>}
 */
function shiftOpenAfterRemove(set, removed) {
  /** @type {Set<number>} */
  const next = new Set();
  for (const idx of set) {
    if (idx === removed) continue;
    next.add(idx > removed ? idx - 1 : idx);
  }
  return next;
}

/**
 * Swap the open/closed membership of two indices after a reorder, so a
 * moved card carries its expanded state to its new position.
 *
 * @param {Set<number>} set
 * @param {number} a
 * @param {number} b
 * @returns {Set<number>}
 */
function swapOpen(set, a, b) {
  const hasA = set.has(a);
  const hasB = set.has(b);
  const next = new Set(set);
  next.delete(a);
  next.delete(b);
  if (hasB) next.add(a);
  if (hasA) next.add(b);
  return next;
}

/**
 * Shape a form's `values` into the request body's `data` payload.
 * Strips readOnly fields - the backend would strip them anyway but
 * keeping the wire payload clean helps debugging.
 *
 * @param {CollectionFieldDescriptor[]} fields
 * @param {Record<string, *>} values
 * @returns {Record<string, *>}
 */
export function buildPayload(fields, values) {
  /** @type {Record<string, *>} */
  const out = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    // ObjectArray: shape each element through its itemFields so inner
    // readOnly keys are stripped per item, mirroring the top-level pass.
    if (field.type === "ObjectArray") {
      const items = Array.isArray(values[field.name]) ? values[field.name] : [];
      out[field.name] = items.map((item) => buildPayload(field.itemFields ?? [], item ?? {}));
      continue;
    }
    out[field.name] = values[field.name];
  }
  return out;
}

/**
 * Returns the label/name of the first required field that's missing a
 * value, or `null` if everything required is present. Lets the caller
 * surface a precise message without re-walking the schema.
 *
 * @param {CollectionFieldDescriptor[]} fields
 * @param {Record<string, *>} values
 * @returns {string | null}
 */
export function requiredMissing(fields, values) {
  for (const field of fields) {
    if (field.readOnly) continue;

    const value = values[field.name];

    // ObjectArray validates inner required fields for every existing item
    // even when the array itself is optional; a *required* array must
    // additionally be non-empty. The returned path mirrors the backend's
    // index notation as a readable chain (e.g. "Çalışmalar #1 → Başlık").
    // Draft autosave never calls this, so inner required fields are only
    // enforced on final save — matching the existing draft leniency.
    if (field.type === "ObjectArray") {
      const items = Array.isArray(value) ? value : [];
      if (field.required && items.length === 0) return field.label || field.name;
      for (let i = 0; i < items.length; i++) {
        const innerMissing = requiredMissing(field.itemFields ?? [], items[i] ?? {});
        if (innerMissing) return `${field.label || field.name} #${i + 1} → ${innerMissing}`;
      }
      continue;
    }

    if (!field.required) continue;

    if (field.type === "StringArray") {
      if (!Array.isArray(value) || value.length === 0) return field.label || field.name;
    } else if (field.type === "Bool") {
      // `required` is semantically odd for booleans; `false` is a valid value.
      continue;
    } else if (field.type === "Number") {
      if (value === null || value === undefined || Number.isNaN(value)) return field.label || field.name;
    } else if (value === null || value === undefined || String(value).trim() === "") {
      return field.label || field.name;
    }
  }
  return null;
}

/**
 * Turn a backend validation `detail` into a Turkish, label-aware banner
 * message. The API reports field paths in dot/index notation
 * (`works[0].title`); we resolve each segment against the schema so the
 * admin reads "Çalışmalar #1 → Başlık" instead of the raw wire path.
 * Recognises the two shapes the backend emits — required + unknown field
 * — and otherwise falls back to swapping any quoted path token for its
 * label chain, so future message wordings still surface readable fields.
 * Returns `null` only when there's no detail to humanize, so callers can
 * fall back to a generic message.
 *
 * @param {string | null | undefined} detail
 * @param {CollectionFieldDescriptor[]} fields
 * @returns {string | null}
 */
export function humanizeCollectionError(detail, fields) {
  if (!detail) return null;

  const required = detail.match(/Field '([^']+)' is required/i);
  if (required) return `Zorunlu alan eksik: ${resolveFieldPath(required[1], fields)}`;

  const unknown = detail.match(/Unknown field '([^']+)'/i);
  if (unknown) return `Bilinmeyen alan: ${resolveFieldPath(unknown[1], fields)}`;

  // Generic fallback: rewrite any quoted path that resolves to a known
  // field, leaving everything else (including unresolved tokens) intact.
  const rewritten = detail.replace(/'([^']+)'/g, (whole, path) => {
    const label = resolveFieldPath(path, fields);
    return label === path ? whole : `'${label}'`;
  });
  return `Geçersiz veri: ${rewritten}`;
}

/**
 * Resolve a backend field path (`works[0].title`) to a readable label
 * chain (`Çalışmalar #1 → Başlık`) by walking the schema's `itemFields`.
 * Unknown segments fall back to their raw name; array indices render
 * 1-based to match the editor's per-item headers.
 *
 * @param {string} path
 * @param {CollectionFieldDescriptor[]} fields
 * @returns {string}
 */
function resolveFieldPath(path, fields) {
  /** @type {CollectionFieldDescriptor[] | null} */
  let current = fields;
  const labels = [];
  for (const segment of path.split(".")) {
    const m = segment.match(/^([^[]+)(?:\[(\d+)\])?$/);
    if (!m) { labels.push(segment); current = null; continue; }
    const [, name, index] = m;
    const field = current?.find((f) => f.name === name) ?? null;
    let label = field?.label || name;
    if (index != null) label += ` #${Number(index) + 1}`;
    labels.push(label);
    current = field?.itemFields ?? null;
  }
  return labels.join(" → ");
}

/** @param {*} iso */
function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** @param {string} local */
function fromDatetimeLocal(local) {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

// ---- Styles ---------------------------------------------------------------

const labelStyle = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "inherit" };
const labelRowStyle = { display: "inline-flex", alignItems: "baseline", gap: 6 };
const labelTextStyle = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.01em",
  textTransform: "uppercase",
  opacity: 0.65,
};
const requiredMarkStyle = {
  color: "rgb(220, 195, 225)",
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
};
const readonlyTagStyle = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  padding: "1px 6px",
  borderRadius: 3,
  background: "rgba(127,127,127,0.10)",
  opacity: 0.6,
};
const helpStyle = { color: "currentColor", opacity: 0.5, fontSize: 11, lineHeight: 1.45 };
const inputStyle = {
  padding: "8px 10px",
  border: "1px solid rgba(127,127,127,0.22)",
  borderRadius: 6,
  fontSize: 13,
  lineHeight: 1.4,
  fontFamily: "inherit",
  background: "rgba(127,127,127,0.04)",
  color: "inherit",
  outline: "none",
};
const textareaStyle = {
  ...inputStyle,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  fontSize: 12,
  lineHeight: 1.5,
  resize: "vertical",
  minHeight: 72,
};
const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "inherit",
  padding: "2px 0",
};
const checkboxStyle = {
  width: 14,
  height: 14,
  margin: 0,
  accentColor: "rgb(220, 195, 225)",
  cursor: "pointer",
};
const emptyHintStyle = { color: "currentColor", opacity: 0.6, fontSize: 13 };

const stringArrayShellStyle = { display: "flex", flexDirection: "column", gap: 8 };
const stringArrayListStyle = { display: "flex", flexWrap: "wrap", gap: 6 };
const stringArrayChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 10px",
  borderRadius: 99,
  border: "1px solid rgba(127,127,127,0.25)",
  background: "rgba(127,127,127,0.08)",
  fontSize: 12,
  lineHeight: 1.4,
};
const stringArrayRemoveStyle = {
  background: "none",
  border: "none",
  padding: "0 1px",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  color: "inherit",
  opacity: 0.5,
  fontFamily: "inherit",
};
const stringArrayAddRowStyle = { display: "flex", gap: 6 };
const stringArrayInputStyle = { ...inputStyle, flex: 1, fontSize: 12 };
const stringArrayAddBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 12px",
  border: "1px solid rgba(127,127,127,0.25)",
  borderRadius: 6,
  background: "rgba(127,127,127,0.08)",
  color: "inherit",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const listEmptyStyle = {
  fontSize: 12,
  opacity: 0.5,
  padding: "9px 10px",
  border: "1px dashed rgba(127,127,127,0.25)",
  borderRadius: 7,
  textAlign: "center",
};

const objectArrayShellStyle = { display: "flex", flexDirection: "column", gap: 8 };
const objectArrayListStyle = { display: "flex", flexDirection: "column", gap: 6 };

const objectArrayItemStyle = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(127,127,127,0.32)",
  borderRadius: 8,
  background: "rgba(127,127,127,0.03)",
  overflow: "hidden",
  transition: "background-color 140ms ease, border-color 140ms ease",
};
const objectArrayItemHoverStyle = {
  background: "rgba(127,127,127,0.06)",
  borderColor: "rgba(127,127,127,0.5)",
};
const objectArrayHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "7px 8px 7px 10px",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};
const objectArrayIndexStyle = {
  flexShrink: 0,
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  background: "rgba(127,127,127,0.12)",
  opacity: 0.85,
};
const objectArraySummaryStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const objectArraySummaryEmptyStyle = {
  ...objectArraySummaryStyle,
  opacity: 0.4,
  fontWeight: 400,
  fontStyle: "italic",
};
const objectArrayControlsStyle = { display: "inline-flex", alignItems: "center", gap: 1, flexShrink: 0 };
const rowControlStyle = {
  width: 26,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "inherit",
  opacity: 0.55,
  cursor: "pointer",
  transition: "opacity 140ms ease",
};
const rowControlDisabledStyle = { opacity: 0.2, cursor: "not-allowed" };
const objectArrayChevronStyle = {
  flexShrink: 0,
  display: "inline-flex",
  opacity: 0.5,
  marginLeft: 2,
  transition: "transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1)",
};

const objectArrayBodyClipStyle = { overflow: "hidden", minHeight: 0 };
const objectArrayBodyStyle = {
  padding: "10px 12px 12px",
  borderTop: "1px solid rgba(127,127,127,0.18)",
};
const objectArrayAddBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  width: "100%",
  padding: "9px 12px",
  border: "1px dashed rgba(127,127,127,0.4)",
  borderRadius: 7,
  background: "transparent",
  color: "inherit",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};