"use client";

/**
 * @file `<EditableRegion>` declarative primitive for editable content.
 *
 * Server-component-safe: takes only serializable props (no render-prop
 * function), so a server `app/page.jsx` can drop one in next to a
 * `getCmsContent()` call. The element to render is chosen from the block's
 * `blockType`; consumers customise the wrapper element via `as` and forward
 * any additional HTML props (className, style, target, etc.).
 *
 * Empty / missing blocks render a single placeholder character ("-") inside
 * the chosen element so layout doesn't collapse and admins still have a
 * visible click target. There's deliberately no `fallback` prop - keeping
 * the empty state uniform across the app makes "this region has no content
 * yet" instantly recognisable.
 *
 * Public mode is a transparent passthrough - the rendered element is what
 * ships to the DOM. Admin mode adds a `data-block` attribute, click handler,
 * and hover/active outline so editors can find the region.
 *
 * Power users who need full control over rendering (conditional layouts,
 * derived values, etc.) should reach for `useCmsBlock(blockPath)` from a
 * client component instead - that hook still exposes the raw value.
 */

import { cloneElement, useContext, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

import { useCmsContext } from "../lib/context.js";
import { useStoreSelector } from "../lib/store.js";
import { CmsGroupContext } from "../lib/group-context.js";

/**
 * @import { BlockType } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} EditableRegionProps
 * @property {string} blockPath
 * @property {string} [as]   Wrapper tag for Text / RichText (default: "span" / "div"). Ignored for Image and Link when the block has a value.
 * @property {import("../lib/schemas.js").BlockType} [blockType]
 *   Discovery-time metadata. Read by the manifest discovery script (AST scan
 *   of `<EditableRegion>` JSX), not by the runtime. The script needs both
 *   `blockType` and `defaultValue` to produce a `ManifestBlockItem`. Omit and
 *   the discovery script will skip this region with a warning - which means
 *   no DB row, which means the region renders the empty placeholder forever.
 * @property {*} [defaultValue]
 *   Discovery-time metadata. The `defaultValue` written to the DB on first
 *   sync. Same caveat as `blockType` - omit and the region won't be synced.
 *   Must be a static literal in the JSX (the AST scanner can't evaluate
 *   expressions or imported values).
 * @property {"global"} [scope]
 *   Discovery-time marker. Set to `"global"` for region declared inside
 *   shared UI (header, footer, site-wide settings). The discovery script
 *   writes such regions to the `globalSlug` manifest entry instead of
 *   any page slug, so the same block backs every page. Runtime ignores
 *   this prop - the merged blocks map already contains both page and
 *   global blocks under the same keys.
 * @property {boolean} [editable]
 *   Override the context-level `isAdmin` gate for this region. When
 *   `false`, the region renders read-only even for admins. Omit (or
 *   `true`) to fall back to the default `isAdmin` behaviour.
 * @property {boolean} [visible]
 *   When `false`, forces non-editable regardless of `editable` or
 *   `isAdmin`. Intended for drawer-level visibility control; content
 *   still renders to the page, edit affordance is suppressed.
 */

const RING_HOVER   = "0 0 0 1.5px rgba(201,184,150,0.30)";
const RING_ACTIVE  = "0 0 0 2px rgba(201,184,150,0.80)";
const BG_OFF    = "rgba(201,184,150,0)";
const BG_HOVER  = "rgba(201,184,150,0.05)";
const BG_ACTIVE = "rgba(201,184,150,0.08)";
const EMPTY_PLACEHOLDER = "-";

const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "aside", "header", "footer", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6", "p",
  "ul", "ol", "li", "dl", "dt", "dd",
  "figure", "figcaption", "blockquote", "pre",
  "form", "fieldset", "table", "thead", "tbody", "tr", "td", "th",
]);

/**
 * @param {EditableRegionProps & Record<string, *>} props
 */
// `blockType` / `defaultValue` / `scope` are discovery-only metadata read
// by the AST scanner, not by the runtime. They're destructured under
// aliases so (a) they don't leak into ...rest (which would dump them onto
// DOM nodes) and (b) they don't shadow the local `blockType` const
// computed below.
// eslint-disable-next-line no-unused-vars
export function EditableRegion({ blockPath, as, editable, visible, blockType: _bt, defaultValue: _dv, scope: _scope, ...rest }) {
  const { isAdmin, blocks, contentDraftsStore, activeBlock, setActiveBlock } = useCmsContext();
  const groupPrefix = useContext(CmsGroupContext);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-prefix the blockPath when wrapped in a `<CmsGroup>`. Discovery
  // applies the same rule statically so the manifest entry's path is the
  // already-prefixed string (e.g. "footer.copyright") - the runtime
  // lookup must match. Top-level (no enclosing group) is a no-op.
  const fullPath = groupPrefix ? `${groupPrefix}.${blockPath}` : blockPath;

  // Subscribe to just this block's draft. A keystroke in another region
  // leaves both selectors' outputs unchanged, so `useStoreSelector` bails
  // and this region doesn't re-render. Two selectors (presence + value) so
  // an explicit empty/null local draft is distinguishable from "no draft".
  const hasLocalDraft = useStoreSelector(contentDraftsStore, (m) => m.has(fullPath));
  const localDraft = useStoreSelector(contentDraftsStore, (m) => m.get(fullPath));

  const block = blocks.get(fullPath);
  const blockType = block ? block.blockType : null;
  // Live preview: prefer the unsaved local draft when the admin is mid-edit,
  // then the backend-side draft overlay (`block.draftValue`), then the
  // published `block.value`. `has` (not `??`) so an explicit empty/null
  // local draft still wins.
  const value = hasLocalDraft
    ? localDraft
    : block
      ? (block.draftValue ?? block.value)
      : undefined;
  const empty = isValueEmpty(blockType, value);

  const rendered = empty
    ? renderPlaceholder(as, rest)
    : renderBlock(blockType, value, { as, ...rest });

  if (!isAdmin || editable === false || visible === false) return rendered;

  const isActive = activeBlock === fullPath;
  /** @param {React.MouseEvent} e */
  const handleClick = (e) => {
    e.stopPropagation();
    setActiveBlock(fullPath);
  };

  const childProps = rendered.props ?? {};
  const mergedOnClick = childProps.onClick
    ? /** @param {React.MouseEvent} e */ (e) => {
        childProps.onClick(e);
        if (!e.defaultPrevented) handleClick(e);
      }
    : handleClick;

  const cloned = cloneElement(rendered, {
    "data-block": fullPath,
    "data-cms-active": isActive || undefined,
    onClick: mergedOnClick,
    style: {
      ...(childProps.style ?? {}),
      boxShadow: isActive ? RING_ACTIVE : isHovered ? RING_HOVER : undefined,
      transition: "box-shadow 0.15s ease",
      cursor: "pointer",
    },
  });

  const innerTag = typeof rendered.type === "string" ? rendered.type : "span";
  const wrapperDisplay = BLOCK_TAGS.has(innerTag) ? "block" : "inline-block";

  return (
    <span
      style={{
        position: "relative",
        display: wrapperDisplay,
        backgroundColor: isActive ? BG_ACTIVE : isHovered ? BG_HOVER : BG_OFF,
        transition: "background-color 0.2s ease",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {cloned}
      {(isHovered || isActive) && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            // Pull the chip out by the hover/active ring's outer thickness
            // (1.5px on hover, 2px on active) so its right edge lines up
            // with the ring instead of leaving a sliver of hover-tint
            // background showing past the chip.
            right: isActive ? -2 : -1.5,
            transform: "translateY(-100%)",
            background: "#221d18",
            border: "1px solid rgba(255,255,255,0.10)",
            borderBottom: "none",
            borderRadius: "4px 4px 0 0",
            padding: "1px 6px",
            fontSize: 9,
            fontWeight: 500,
            color: "rgba(201,184,150,0.65)",
            letterSpacing: "0.05em",
            lineHeight: "16px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            zIndex: 9999,
          }}
        >
          {fullPath}{blockType ? ` · ${blockType}` : ""}
        </span>
      )}
    </span>
  );
}

/**
 * @param {BlockType|null} blockType
 * @param {*} value
 * @returns {boolean}
 */
function isValueEmpty(blockType, value) {
  if (value == null) return true;
  switch (blockType) {
    case "Text":
    case "RichText":
      return value === "";
    case "Image":
      return !value.src;
    case "Link":
      return !value.href;
    case "Date":
      return value === "";
    default:
      return false;
  }
}

/**
 * Render the block's value as the appropriate HTML element. `as` only
 * applies to Text / RichText - Image and Link have a fixed shape because
 * the editor side (AdminDrawer) saves a `{src,alt}` / `{href,label}`
 * payload that maps cleanly onto `<img>` / `<a>`.
 *
 * @param {BlockType|null} blockType
 * @param {*} value
 * @param {Record<string, *>} props
 */
function renderBlock(blockType, value, props) {
  const { as, ...rest } = props;
  switch (blockType) {
    case "Text": {
      const Tag = as ?? "span";
      return <Tag {...rest}>{value}</Tag>;
    }
    case "RichText": {
      const Tag = as ?? "div";
      // RichText values are HTML strings produced by Tiptap. Sanitise on
      // every render (SSR + client) so an admin pasting hostile markup
      // can only XSS themselves while in the editor - public visitors
      // never see <script>, event handlers, or javascript: URLs.
      // `isomorphic-dompurify` swaps in jsdom on the Node side
      // automatically; on the client it's a thin wrapper around the
      // standard DOMPurify build.
      return (
        <Tag
          {...rest}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
        />
      );
    }
    case "Image":
      return <img {...rest} src={value.src} alt={value.alt ?? ""} />;
    case "Link": {
      const href = safeHref(value.href);
      return (
        <a {...rest} href={href}>
          {value.label ?? value.href}
        </a>
      );
    }
    default: {
      // Group / DataSource have no inline rendering - those payloads are
      // consumed by code, not laid out here.
      const Tag = as ?? "span";
      return <Tag {...rest}>{typeof value === "string" ? value : null}</Tag>;
    }
  }
}

/**
 * Single placeholder shape for every empty / missing block. Always uses
 * `as` (or `<span>` if not provided) so img/anchor src-less rendering
 * is avoided - those would produce broken DOM nodes.
 *
 * @param {string|undefined} as
 * @param {Record<string, *>} rest
 */
function renderPlaceholder(as, rest) {
  const Tag = as ?? "span";
  return <Tag {...rest}>{EMPTY_PLACEHOLDER}</Tag>;
}

// Block `javascript:`, `data:`, `vbscript:` etc. on Link blocks: an admin
// pasting a hostile URL would otherwise execute it for every public visitor
// who clicks the link. Whitelist common schemes + relative/anchor forms;
// anything else falls back to "" so the anchor renders inert.
const HREF_ALLOWED = /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i;

/** @param {*} href */
function safeHref(href) {
  if (typeof href !== "string") return "";
  const trimmed = href.trim();
  return HREF_ALLOWED.test(trimmed) ? trimmed : "";
}

