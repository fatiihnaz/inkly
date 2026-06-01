"use client";

/**
 * @file Link block editor. Value shape: `{ href: string, label: string }`.
 */

import { fieldStyle, labelStyle, labelTextStyle } from "./styles.js";

/**
 * @typedef {Object} LinkValue
 * @property {string} href
 * @property {string} label
 */

/**
 * @param {Object} props
 * @param {LinkValue|null|undefined} props.value
 * @param {(value: LinkValue) => void} props.onChange
 */
export function LinkEditor({ value, onChange }) {
  const href = value?.href ?? "";
  const label = value?.label ?? "";

  /** @param {Partial<LinkValue>} patch */
  const patch = (p) => onChange({ href, label, ...p });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Etiket</span>
        <input
          type="text"
          value={label}
          onChange={(e) => patch({ label: e.target.value })}
          className="inscribed-field"
          style={fieldStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>URL</span>
        <input
          type="url"
          value={href}
          onChange={(e) => patch({ href: e.target.value })}
          placeholder="https://..."
          className="inscribed-field"
          style={fieldStyle}
        />
      </label>
    </div>
  );
}
