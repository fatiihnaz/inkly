"use client";

/**
 * @file `ListEditor` - drawer-side editor for `List`-typed blocks.
 *
 * Mirrors the inline page UI (`<EditableList>`): per-item controls
 * (move up/down, delete) plus an "+ Add" button. Each item is rendered
 * as a sub-card whose body is the per-field editor stack
 * (Text/Image/Link/etc.) keyed by the registered itemSchema.
 *
 * `itemSchema` arrives via the AdminDrawer's CmsContext registry - it's
 * populated when an `<EditableList>` mounts on the page. Without it we
 * render a hint instead of editors so the admin sees why and the data
 * isn't lost.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

import { addItem, moveItem, removeItem } from "../../lib/list-ops.js";
import { ACCENT, TEXT_MUTED, emptyStateStyle } from "../admin-drawer-styles.js";

import { FieldEditor } from "./FieldEditor.jsx";

/**
 * @import { ItemSchema } from "../../lib/schemas.js"
 */

/**
 * @param {{
 *   value: *,
 *   onChange: (value: *) => void,
 *   itemSchema: ItemSchema | null,
 * }} props
 */
export function ListEditor({ value, onChange, itemSchema }) {
  /** @type {Record<string, *>[]} */
  const items = Array.isArray(value) ? value : [];

  if (!itemSchema) {
    return (
      <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
        Bu liste için <code>itemSchema</code> bulunamadı. Sayfada{" "}
        <code>&lt;EditableList&gt;</code> render ediliyor mu?
      </div>
    );
  }

  /** @param {Record<string, *>[]} next */
  const setItems = (next) => onChange(next);

  const onAdd = () => setItems(addItem(items, itemSchema));

  /** @param {number} i */
  const onRemove = (i) => setItems(removeItem(items, i));

  /** @param {number} i @param {-1|1} dir */
  const onMove = (i, dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    setItems(next);
  };

  /** @param {number} i @param {string} fieldKey @param {*} fieldValue */
  const onFieldChange = (i, fieldKey, fieldValue) => {
    const next = items.slice();
    next[i] = { ...next[i], [fieldKey]: fieldValue };
    setItems(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.length === 0 ? (
        <div style={emptyStateStyle}>
          Liste boş. "+ Öğe ekle" butonuyla başlayabilirsin.
        </div>
      ) : null}

      {items.map((item, i) => (
        <ListItemCard
          key={i}
          index={i}
          total={items.length}
          item={item}
          itemSchema={itemSchema}
          onFieldChange={(k, v) => onFieldChange(i, k, v)}
          onRemove={() => onRemove(i)}
          onMoveUp={i > 0 ? () => onMove(i, -1) : null}
          onMoveDown={i < items.length - 1 ? () => onMove(i, 1) : null}
        />
      ))}

      <button
        type="button"
        onClick={onAdd}
        style={listAddButtonStyle}
        className="inscribed-icon-action"
      >
        <Plus size={13} />
        <span>Öğe ekle</span>
      </button>
    </div>
  );
}

/**
 * @param {{
 *   index: number,
 *   total: number,
 *   item: Record<string, *>,
 *   itemSchema: ItemSchema,
 *   onFieldChange: (fieldKey: string, value: *) => void,
 *   onRemove: () => void,
 *   onMoveUp: (() => void) | null,
 *   onMoveDown: (() => void) | null,
 * }} props
 */
function ListItemCard({ index, total, item, itemSchema, onFieldChange, onRemove, onMoveUp, onMoveDown }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={listItemCardStyle}>
      <div
        style={{ ...listItemHeaderStyle, cursor: "pointer", userSelect: "none" }}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span style={listItemIndexStyle}>#{index + 1} / {total}</span>

        <div style={{ display: "inline-flex", gap: 2, marginLeft: "auto" }}>
          {onMoveUp ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              style={listItemIconStyle}
              title="Yukarı taşı"
              aria-label="Yukarı taşı"
            >
              <ChevronUp size={12} />
            </button>
          ) : null}
          {onMoveDown ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              style={listItemIconStyle}
              title="Aşağı taşı"
              aria-label="Aşağı taşı"
            >
              <ChevronDown size={12} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={listItemDangerStyle}
            title="Sil"
            aria-label="Sil"
          >
            <Trash2 size={12} />
          </button>
        </div>

        <motion.span
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "inline-flex", color: TEXT_MUTED, marginLeft: 4 }}
        >
          <ChevronDown size={13} />
        </motion.span>
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={listItemBodyStyle}>
              {Object.entries(itemSchema).map(([key, field]) => {
                const editor = FieldEditor({
                  blockType: field.blockType,
                  value: item[key],
                  onChange: (v) => onFieldChange(key, v),
                });
                return (
                  <div key={key} style={listFieldStyle}>
                    <div style={listFieldLabelStyle}>{key}</div>
                    {editor ?? (
                      <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
                        <code>{field.blockType}</code> tipi list itemschema'sında desteklenmiyor.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---- Styles ---------------------------------------------------------------

const listItemCardStyle = /** @type {React.CSSProperties} */ ({
  border: "1px solid rgba(201,184,150,0.12)",
  borderRadius: 6,
  background: "rgba(201,184,150,0.03)",
});

const listItemHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  fontSize: 12,
  color: TEXT_MUTED,
});

const listItemIndexStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  fontSize: 11,
  color: ACCENT,
  letterSpacing: "0.04em",
});

const listItemIconStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  background: "transparent",
  color: TEXT_MUTED,
  borderRadius: 4,
  cursor: "pointer",
  padding: 0,
});

const listItemDangerStyle = /** @type {React.CSSProperties} */ ({
  ...listItemIconStyle,
  color: "#e26464",
});

const listItemBodyStyle = /** @type {React.CSSProperties} */ ({
  padding: "8px 10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  borderTop: "1px solid rgba(201,184,150,0.08)",
});

const listFieldStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

const listFieldLabelStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 10,
  fontWeight: 600,
  color: TEXT_MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
});

const listAddButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 12px",
  background: "transparent",
  border: "1px dashed rgba(201,184,150,0.35)",
  borderRadius: 6,
  color: ACCENT,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  letterSpacing: "0.02em",
});