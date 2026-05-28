"use client";

/**
 * @file `CollectionFieldsForm` - schema-driven form renderer for
 * collection items.
 *
 * Takes a list of `CollectionFieldDescriptor`s (from
 * `/cms/collections/{key}/schema` or the `/me` envelope) and a values map,
 * renders one input per field. ReadOnly fields are disabled. Bool/Number/
 * Date/Url/StringArray/RichText/Text are supported; an `options` array on
 * a field switches it to a select regardless of `type`.
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
          className="skylab-cms-field"
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
            className="skylab-cms-field"
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
            className="skylab-cms-field"
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
            className="skylab-cms-field"
            style={inputStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
      );

      case "StringArray":
        return (
          <label style={labelStyle}>
            {labelNode}
          <textarea
            value={(Array.isArray(value) ? value : []).join("\n")}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            disabled={disabled}
            rows={3}
            placeholder="Her satır bir öğe"
            className="skylab-cms-field"
            style={textareaStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
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
            className="skylab-cms-field"
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
            className="skylab-cms-field"
            style={inputStyle}
          />
          {field.help ? <span style={helpStyle}>{field.help}</span> : null}
        </label>
      );
  }
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
    default:            return "";
  }
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
    if (!field.required || field.readOnly) continue;
    const value = values[field.name];

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
