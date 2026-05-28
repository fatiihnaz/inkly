"use client";

/**
 * @file `BlockCard` — one inline-editable block row inside the admin
 * drawer's block list.
 *
 * Header layout (left → right): TypeIcon glyph badge in the block's
 * type colour, mono blockPath, (when dirty) sage dot + Undo icon-button,
 * tiny mono type label, chevron. The grip has been retired — the type
 * icon now carries the same visual hook with real information.
 *
 * Body slides open/closed via `.skylab-cms-collapse` (height 0 ↔ auto
 * via `interpolate-size`). Collection bodies stay mounted across
 * collapse so the inner `useCollectionItem` fetch isn't replayed
 * every time the card is reopened.
 *
 * Collection blocks (`blockType === "Collection"`) take a dedicated
 * lane: `<CollectionBlockCard>` lifts the editor's draft state up so
 * the header can render the "Geri al" reset next to the chevron —
 * same affordance, same place as regular dirty blocks.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Undo2 } from "lucide-react";

import { stableStringify } from "../lib/stable-stringify.js";

import { FieldEditor } from "./editors/FieldEditor.jsx";
import { ListEditor } from "./editors/ListEditor.jsx";
import {
  AdminCollectionEditor,
  useCollectionEditor,
} from "./AdminCollectionEditor.jsx";
import {
  TEXT_MUTED,
  COLLECTION_ACCENT,
  TYPE_META,
  blockCardStyle,
  blockHeaderStyle,
  blockPathStyle,
  blockBodyStyle,
  blockResetStyle,
  blockTypeLabelStyle,
  dirtyDotStyle,
  typeIconStyle,
} from "./admin-drawer-styles.js";

/**
 * @import { BlockResponse, BlockType, ItemSchema } from "../lib/schemas.js"
 */

/**
 * @param {{
 *   block: BlockResponse,
 *   draft: *,
 *   hasDraft: boolean,
 *   isActive: boolean,
 *   onChange: (value: *) => void,
 *   onReset: () => void,
 *   onFocus: () => void,
 *   itemSchema: ItemSchema | null,
 * }} props
 */
export function BlockCard(props) {
  if (props.block.blockType === "Collection") {
    const binding = /** @type {{ collection?: string, slug?: string }} */ (
      props.block.value ?? {}
    );
    if (typeof binding.collection !== "string" || typeof binding.slug !== "string") {
      return <InvalidCollectionCard block={props.block} />;
    }
    return (
      <CollectionBlockCard
        block={props.block}
        collection={binding.collection}
        slug={binding.slug}
        isActive={props.isActive}
        onFocus={props.onFocus}
      />
    );
  }
  return <RegularBlockCard {...props} />;
}

/**
 * Standalone invalid-binding card. Rendered when a Collection block's
 * `value` is missing `{ collection, slug }`. Kept separate from
 * `CollectionBlockCard` so the `useCollectionEditor` hook is only
 * called when there's a valid pair to feed it.
 *
 * @param {{ block: BlockResponse }} props
 */
function InvalidCollectionCard({ block }) {
  return (
    <div className="skylab-cms-block-card" style={blockCardStyle}>
      <div style={blockHeaderStyle}>
        <TypeIcon type={block.blockType} />
        <span style={blockPathStyle} title={block.blockPath}>
          {block.blockPath}
        </span>
        <span style={blockTypeLabelStyle}>
          {(TYPE_META[block.blockType] ?? TYPE_META.Text).label}
        </span>
      </div>
      <div style={blockBodyStyle}>
        <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 12 }}>
          Bu Collection bloğu geçersiz bir bağlamaya sahip — beklenen{" "}
          <code>{`{ collection, slug }`}</code> şeklini taşımıyor.
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   block: BlockResponse,
 *   draft: *,
 *   hasDraft: boolean,
 *   isActive: boolean,
 *   onChange: (value: *) => void,
 *   onReset: () => void,
 *   onFocus: () => void,
 *   itemSchema: ItemSchema | null,
 * }} props
 */
function RegularBlockCard({ block, draft, hasDraft, isActive, onChange, onReset, onFocus, itemSchema }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));

  // Editor reads the local draft if mid-edit, else the server-side
  // overlay (`block.draftValue`), else the published value.
  const effective = block.draftValue ?? block.value;
  const value = hasDraft ? draft : effective;
  const isDirty = hasDraft
    ? stableStringify(draft) !== stableStringify(block.value)
    : block.draftValue != null;

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const handleHeaderClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) onFocus();
  };

  return (
    <div
      ref={ref}
      className={cardClassName({ isActive, isDirty, isCollection: false })}
      style={blockCardStyle}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        onHeaderClick={handleHeaderClick}
        onReset={onReset}
      />
      <div
        className={`skylab-cms-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <div style={blockBodyStyle}>
          {renderEditor(block, value, onChange, itemSchema)}
        </div>
      </div>
    </div>
  );
}

/**
 * Collection block lane — owns the editor's draft state so the header
 * can render the "Geri al" reset button up next to the chevron.
 *
 * @param {{
 *   block: BlockResponse,
 *   collection: string,
 *   slug: string,
 *   isActive: boolean,
 *   onFocus: () => void,
 * }} props
 */
function CollectionBlockCard({ block, collection, slug, isActive, onFocus }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const editor = useCollectionEditor(collection, slug);
  const isDirty = editor.hasDraft && editor.canEdit;

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const handleHeaderClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) onFocus();
  };

  return (
    <div
      ref={ref}
      className={cardClassName({ isActive, isDirty, isCollection: true })}
      style={blockCardStyle}
    >
      <CardHeader
        block={block}
        isOpen={isOpen}
        isDirty={isDirty}
        isCollection
        onHeaderClick={handleHeaderClick}
        onReset={editor.undoDraft}
      />
      <div
        className={`skylab-cms-collapse${isOpen ? " is-open" : ""}`}
        aria-hidden={!isOpen}
        onMouseDown={onFocus}
      >
        <div style={blockBodyStyle}>
          <AdminCollectionEditor editor={editor} />
        </div>
      </div>
    </div>
  );
}

/**
 * Compose the card's class string based on its current state. Active
 * adds the lane-specific accent (sage for regular, pink-purple for
 * Collection). Dirty layers a thinner sage rail on top of the base
 * inset border.
 *
 * @param {{ isActive: boolean, isDirty: boolean, isCollection: boolean }} args
 */
function cardClassName({ isActive, isDirty, isCollection }) {
  const parts = ["skylab-cms-block-card"];
  if (isCollection) parts.push("skylab-cms-block-card-collection");
  if (isDirty) parts.push("is-dirty");
  if (isActive) parts.push(isCollection ? "skylab-cms-block-card-collection-active" : "skylab-cms-block-card-active");
  return parts.join(" ");
}

/**
 * Shared header row used by both block lanes. Header click toggles
 * the body; the per-card reset button (only rendered when `isDirty`)
 * stops propagation so undoing doesn't also expand/collapse the card.
 *
 * @param {{
 *   block: BlockResponse,
 *   isOpen: boolean,
 *   isDirty: boolean,
 *   isCollection?: boolean,
 *   onHeaderClick: () => void,
 *   onReset: () => void,
 * }} props
 */
function CardHeader({ block, isOpen, isDirty, isCollection, onHeaderClick, onReset }) {
  const meta = TYPE_META[block.blockType] ?? TYPE_META.Text;
  return (
    <button
      type="button"
      onClick={onHeaderClick}
      aria-expanded={isOpen}
      style={{
        ...blockHeaderStyle,
        width: "100%",
        cursor: "pointer",
        userSelect: "none",
        textAlign: "left",
        fontFamily: "inherit",
        color: "inherit",
      }}
    >
      <TypeIcon type={block.blockType} />
      <span style={blockPathStyle} title={block.blockPath}>
        {block.blockPath}
      </span>

      {isDirty ? (
        <span
          style={isCollection ? { ...dirtyDotStyle, background: COLLECTION_ACCENT, boxShadow: `0 0 5px ${COLLECTION_ACCENT}80` } : dirtyDotStyle}
          aria-label="Kaydedilmemiş değişiklik"
        />
      ) : null}

      {isDirty ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onReset(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onReset();
            }
          }}
          className="skylab-cms-icon-button"
          style={blockResetStyle}
          aria-label="Bu bloğun değişikliklerini geri al"
          title="Geri al"
        >
          <Undo2 size={13} />
        </span>
      ) : null}

      <span style={blockTypeLabelStyle}>{meta.label}</span>

      <span
        style={{
          display: "inline-flex",
          color: TEXT_MUTED,
          transition: "transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1)",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        }}
      >
        <ChevronDown size={13} />
      </span>
    </button>
  );
}

/**
 * Block-type glyph badge. Uses the type's tone for fg + soft tinted bg
 * and ring. Drives the visual cue admins use to scan the list (Aa for
 * Text, ¶ for Rich, etc.).
 *
 * @param {{ type: BlockType }} props
 */
function TypeIcon({ type }) {
  const meta = TYPE_META[type] ?? TYPE_META.Text;
  return (
    <span
      aria-hidden="true"
      style={{
        ...typeIconStyle,
        color: meta.color,
      }}
    >
      {meta.glyph}
    </span>
  );
}

/**
 * Per-block undo. When a server-side draft exists, clearing the local
 * entry alone wouldn't reach the backend; instead we set the local draft
 * to the published value and let the autosave overwrite the Redis draft
 * (backend then auto-cleans because draft===published). When there's no
 * server-side draft, removing the local entry is enough.
 *
 * @param {BlockResponse} block
 * @param {(blockPath: string, value: *) => void} setDraft
 * @param {(blockPath: string) => void} clearDraft
 */
export function resetBlock(block, setDraft, clearDraft) {
  if (block.draftValue != null) {
    setDraft(block.blockPath, block.value);
  } else {
    clearDraft(block.blockPath);
  }
}

/**
 * @param {BlockResponse} block
 * @param {*} value
 * @param {(value: *) => void} onChange
 * @param {ItemSchema | null} itemSchema
 */
function renderEditor(block, value, onChange, itemSchema) {
  if (block.blockType === "List") {
    return <ListEditor value={value} onChange={onChange} itemSchema={itemSchema} />;
  }
  const primitive = FieldEditor({ blockType: block.blockType, value, onChange });
  if (primitive) return primitive;
  return (
    <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
      <code>{block.blockType}</code> tipi için inline editör henüz yok.
    </div>
  );
}