"use client";

/**
 * @file Date block editor. Value shape: ISO 8601 string, e.g. "2026-08-15T18:00:00.000Z".
 */

import { fieldStyle, labelStyle, labelTextStyle } from "./styles.js";

const TEXT_MUTED = "rgba(255,255,255,0.30)";
const ACCENT = "#c9b896";

/**
 * @param {Object} props
 * @param {string|null|undefined} props.value  ISO 8601 string
 * @param {(value: string) => void} props.onChange
 */
export function DateEditor({ value, onChange }) {
  const localValue = isoToLocal(value);
  const remaining = value ? calcRemaining(value) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Tarih ve Saat</span>
        <input
          type="datetime-local"
          value={localValue}
          onChange={(e) => onChange(localToIso(e.target.value))}
          className="skylab-cms-field"
          style={{ ...fieldStyle, colorScheme: "dark" }}
        />
      </label>

      {remaining !== null && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 10px",
          background: "rgba(201,184,150,0.05)",
          border: "1px solid rgba(201,184,150,0.10)",
          borderRadius: 8,
        }}>
          {remaining.past ? (
            <span style={{ fontSize: 11, color: TEXT_MUTED }}>Bu tarih geçmiş.</span>
          ) : (
            <>
              {[
                { v: remaining.days,    l: "gün" },
                { v: remaining.hours,   l: "saat" },
                { v: remaining.minutes, l: "dk" },
              ].map(({ v, l }) => (
                <div key={l} style={{ textAlign: "center", minWidth: 32 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: ACCENT, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  <div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 2, letterSpacing: "0.04em" }}>{l}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** @param {string|null|undefined} iso */
function isoToLocal(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** @param {string} local */
function localToIso(local) {
  if (!local) return "";
  try {
    return new Date(local).toISOString();
  } catch {
    return "";
  }
}

/** @param {string} iso */
function calcRemaining(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { past: true };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    past: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
  };
}
