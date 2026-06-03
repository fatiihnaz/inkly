"use client";

/**
 * @file `<EditableList>` - render-prop component for `List`-typed blocks.
 *
 * IMPORTANT: must be used inside a client component (a file with the
 * `"use client"` directive). The render-prop child is a function and Next.js
 * cannot serialise functions across the Server -> Client boundary, so
 * dropping `<EditableList>` directly into a server `page.jsx` errors with
 * "Functions are not valid as a child of Client Components". Wrap the list
 * usage in your own `"use client"` component (see `team-section.jsx` in the
 * example app for the canonical pattern) and import that into the server
 * page instead.
 *
 * Public mode is a transparent map: each item is passed to the
 * render-prop child, wrapped in a key'd Fragment. Consumers control the
 * markup and styling completely.
 *
 *   <EditableList blockPath="team.members" itemSchema={{
 *     name:  { blockType: "Text",  defaultValue: "" },
 *     photo: { blockType: "Image", defaultValue: { src: "", alt: "" } },
 *   }}>
 *     {(item, i) => (
 *       <article className="member-card">
 *         <img src={item.photo.src} alt={item.photo.alt} />
 *         <h3>{item.name}</h3>
 *       </article>
 *     )}
 *   </EditableList>
 *
 * Admin mode wraps each item in a hover-revealing controls overlay
 * (delete, move up, move down) and renders an "+ Add" button after the
 * list. Mutations all go through `setDraft` so the standard save bar in
 * the AdminDrawer picks them up - one version per list, atomic save.
 *
 * `itemSchema` and `defaultValue` are read by both the manifest discovery
 * script (statically) and the admin-side "+ Add" button (to seed a new
 * item). Both must be plain literals.
 */

import { Fragment, useContext, useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../lib/group-context.js";
import { addItem, makeDefaultItem, moveItem, removeItem } from "../lib/list-ops.js";

/**
 * @import { ItemSchema } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} EditableListProps
 * @property {string} blockPath
 * @property {ItemSchema} itemSchema
 *   Per-field metadata. Required - admin "+ Add" uses it for the seed item,
 *   discovery uses it to build the manifest entry's `itemSchema`.
 * @property {(item: Record<string, *>, index: number) => React.ReactNode} children
 * @property {*[]} [defaultValue]
 *   Discovery-only seed. Default `[]` (empty list). Lists usually start
 *   empty; pass an array if you need pre-seeded items at first sync.
 * @property {"global"} [scope]
 *   Discovery-only. Set to `"global"` to share the list across every
 *   page (header/footer style). Runtime ignores it - the merged blocks
 *   map already contains both page and global blocks.
 * @property {boolean} [editable]
 *   When `false`, the list renders read-only (no inline add/move/delete)
 *   and its drawer card is locked. Mirrors `<EditableRegion editable>`.
 *   An enclosing `<CmsGroup editable={false}>` applies the same effect.
 * @property {boolean} [visible]
 *   When `false`, the list is removed from the admin drawer entirely and
 *   renders read-only on the page (items still ship to the DOM). Takes
 *   precedence over `editable`; inheritable from `<CmsGroup>`.
 */

const ITEM_RING       = "inset 0 0 0 1.5px rgba(201,184,150,0.30)";
const ITEM_BG         = "rgba(201,184,150,0.05)";
const ACCENT          = "#c9b896";
const ACCENT_DIM      = "rgba(201,184,150,0.65)";
const DANGER          = "#e26464";
// Match the AdminDrawer's panel surface (PRIMARY_500 in admin-drawer-styles.js)
// so the per-item controls visually belong to the same admin layer.
const PANEL_BG        = "#221d18";
const PANEL_BORDER    = "1px solid rgba(255,255,255,0.10)";

/**
 * @param {EditableListProps} props
 */
export function EditableList({ blockPath, itemSchema, children, defaultValue, scope, editable, visible }) {
  void defaultValue; void scope; // discovery-only
  const {
    isAdmin, blocks, contentDraftsStore, setDraft,
    registerItemSchema, unregisterItemSchema,
    registerEditorVisibility, unregisterEditorVisibility,
  } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const groupVisibility = useContext(CmsGroupVisibilityContext);

  // Auto-prefix when wrapped in a `<CmsGroup>`. Discovery applies the same
  // rule statically so the manifest entry's path matches the runtime
  // lookup key.
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Resolve own `visible`/`editable` against any inherited group mode —
  // most restrictive wins (see EditableRegion for the same fold).
  const ownMode = visible === false ? "hidden" : editable === false ? "readonly" : null;
  const visibilityMode = strongerVisibility(groupVisibility, ownMode);

  // Hand the schema to the AdminDrawer so it can build the per-field item
  // editor. Re-runs only when fullPath changes; itemSchema reference flips
  // on every render but the registry's value is read on demand by the
  // drawer, so refreshing the same blockPath -> schema mapping is cheap.
  useEffect(() => {
    registerItemSchema(fullPath, itemSchema);
    return () => unregisterItemSchema(fullPath);
  }, [fullPath, itemSchema, registerItemSchema, unregisterItemSchema]);

  // Mirror EditableRegion: surface a hidden/readonly override to the drawer
  // registry so the List card is dropped or locked. Admin-only.
  useEffect(() => {
    if (!isAdmin || !visibilityMode) return undefined;
    registerEditorVisibility(fullPath, visibilityMode);
    return () => unregisterEditorVisibility(fullPath);
  }, [isAdmin, fullPath, visibilityMode, registerEditorVisibility, unregisterEditorVisibility]);

  // Subscribe to just this list's draft slice (see EditableRegion for the
  // two-selector presence/value rationale) so typing in one list doesn't
  // re-render sibling lists.
  const hasLocalDraft = useStoreSelector(contentDraftsStore, (m) => m.has(fullPath));
  const localDraft = useStoreSelector(contentDraftsStore, (m) => m.get(fullPath));

  const block = blocks.get(fullPath);
  // Mirror EditableRegion's precedence: local draft (live typing) > backend
  // draft overlay (own work after navigation/refetch) > published value.
  // Without this, navigating away and back leaves the admin's saved-but-
  // unpublished list rendering as the published value.
  const raw = hasLocalDraft
    ? localDraft
    : block
      ? (block.draftValue ?? block.value)
      : undefined;
  /** @type {Record<string, *>[]} */
  const items = Array.isArray(raw) ? raw : [];

  /** @param {Record<string, *>[]} next */
  const setItems = (next) => setDraft(fullPath, next);

  // Public visitors and read-only/hidden lists (own prop or inherited from
  // a `<CmsGroup>`) get the plain passthrough — items still render, but no
  // inline add/move/delete affordances. The locked drawer card (for
  // "readonly") and its removal (for "hidden") are handled by the registry.
  if (!isAdmin || visibilityMode) {
    return (
      <>
        {items.map((item, i) => (
          <Fragment key={i}>{children(item, i)}</Fragment>
        ))}
      </>
    );
  }

  const defaultItem = makeDefaultItem(itemSchema);
  const onAdd = () => setItems(addItem(items, itemSchema));
  /** @param {number} i */
  const onRemove = (i) => setItems(removeItem(items, i));
  /** @param {number} i @param {-1|1} dir */
  const onMove = (i, dir) => {
    const next = moveItem(items, i, dir);
    if (next === items) return;
    setItems(next);
  };

  return (
    <>
      {items.map((item, i) => (
        <AdminItemWrapper
          key={i}
          onRemove={() => onRemove(i)}
          onMoveUp={i > 0 ? () => onMove(i, -1) : null}
          onMoveDown={i < items.length - 1 ? () => onMove(i, 1) : null}
        >
          {children(item, i)}
        </AdminItemWrapper>
      ))}

      <GhostAddSlot onAdd={onAdd}>
        {children(defaultItem, items.length)}
      </GhostAddSlot>
    </>
  );
}

/**
 * @param {{
 *   children: React.ReactNode,
 *   onRemove: () => void,
 *   onMoveUp: (() => void) | null,
 *   onMoveDown: (() => void) | null,
 * }} props
 */
function AdminItemWrapper({ children, onRemove, onMoveUp, onMoveDown }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      style={{
        position: "relative",
        boxShadow: isHovered ? ITEM_RING : undefined,
        backgroundColor: isHovered ? ITEM_BG : undefined,
        transition: "box-shadow 0.15s ease, background-color 0.2s ease",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {isHovered ? (
        <div style={controlsStyle} onMouseDown={(e) => e.stopPropagation()}>
          {onMoveUp ? (
            <button type="button" onClick={onMoveUp} style={iconButtonStyle} title="Yukarı taşı">
              <ChevronUp size={12} />
            </button>
          ) : null}
          {onMoveDown ? (
            <button type="button" onClick={onMoveDown} style={iconButtonStyle} title="Aşağı taşı">
              <ChevronDown size={12} />
            </button>
          ) : null}
          <button type="button" onClick={onRemove} style={dangerButtonStyle} title="Sil">
            <Trash2 size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders the consumer's card with `visibility: hidden` so it occupies the
 * exact same footprint as a real list item (matters for grid/flex layouts),
 * with a dashed accent overlay sitting over it. Click anywhere on the slot
 * to seed a new item from the schema's defaults. The hidden child is
 * `aria-hidden`; the slot itself is the only thing screen readers see.
 *
 * @param {{ children: React.ReactNode, onAdd: () => void }} props
 */
function GhostAddSlot({ children, onAdd }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const lit = hovered || focused;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Yeni öğe ekle"
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdd();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: "relative",
        cursor: "pointer",
        borderRadius: 8,
        background: lit ? "rgba(201,184,150,0.10)" : "rgba(201,184,150,0.04)",
        border: lit
          ? "1.5px dashed rgba(201,184,150,0.70)"
          : "1.5px dashed rgba(201,184,150,0.30)",
        transition: "background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
        transform: lit ? "translateY(-1px)" : undefined,
        outline: "none",
      }}
    >
      <div style={ghostHiddenStyle} aria-hidden="true">
        {children}
      </div>
      <div
        style={{
          ...ghostOverlayStyle,
          color: lit ? ACCENT : ACCENT_DIM,
        }}
      >
        <Plus size={15} />
        <span>Öğe ekle</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (kept inline; admin overlays only render in admin mode)
// ---------------------------------------------------------------------------

const controlsStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  top: 4,
  right: 4,
  display: "inline-flex",
  gap: 4,
  padding: 3,
  background: PANEL_BG,
  border: PANEL_BORDER,
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  zIndex: 9999,
});

const iconButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  background: "transparent",
  color: ACCENT_DIM,
  borderRadius: 4,
  cursor: "pointer",
  padding: 0,
});

const dangerButtonStyle = /** @type {React.CSSProperties} */ ({
  ...iconButtonStyle,
  color: DANGER,
});

const ghostHiddenStyle = /** @type {React.CSSProperties} */ ({
  visibility: "hidden",
  pointerEvents: "none",
});

const ghostOverlayStyle = /** @type {React.CSSProperties} */ ({
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  // Mirror the AdminDrawer's panel font so this admin-only affordance
  // doesn't pick up the consumer page's body font (which can be anything).
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "0.02em",
  pointerEvents: "none",
  transition: "color 0.18s ease",
});
