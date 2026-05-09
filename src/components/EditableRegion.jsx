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

import { cloneElement, useState } from "react";

import { useCmsContext } from "../lib/context.js";

/**
 * @import { BlockType } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} EditableRegionProps
 * @property {string} blockPath
 * @property {string} [as]   Wrapper tag for Text / RichText (default: "span" / "div"). Ignored for Image and Link when the block has a value.
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
export function EditableRegion({ blockPath, as, ...rest }) {
  const { isAdmin, blocks, drafts, activeBlock, setActiveBlock } = useCmsContext();
  const [isHovered, setIsHovered] = useState(false);

  const block = blocks.get(blockPath);
  const blockType = block ? block.blockType : null;
  // Live preview: prefer the unsaved draft when the admin is mid-edit.
  // `drafts.has` (not `??`) so an explicit empty/null draft still wins.
  const value = drafts.has(blockPath)
    ? drafts.get(blockPath)
    : block
      ? block.value
      : undefined;
  const empty = isValueEmpty(blockType, value);

  const rendered = empty
    ? renderPlaceholder(as, rest)
    : renderBlock(blockType, value, { as, ...rest });

  if (!isAdmin) return rendered;

  const isActive = activeBlock === blockPath;
  /** @param {React.MouseEvent} e */
  const handleClick = (e) => {
    e.stopPropagation();
    setActiveBlock(blockPath);
  };

  const childProps = rendered.props ?? {};
  const mergedOnClick = childProps.onClick
    ? /** @param {React.MouseEvent} e */ (e) => {
        childProps.onClick(e);
        if (!e.defaultPrevented) handleClick(e);
      }
    : handleClick;

  const cloned = cloneElement(rendered, {
    "data-block": blockPath,
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
            right: 0,
            transform: "translateY(-100%)",
            background: "rgba(14,11,8,0.90)",
            border: "1px solid rgba(201,184,150,0.18)",
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
          {blockPath}{blockType ? ` · ${blockType}` : ""}
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
      // RichText values are HTML strings produced by the rich-text editor.
      return <Tag {...rest} dangerouslySetInnerHTML={{ __html: value }} />;
    }
    case "Image":
      return <img {...rest} src={value.src} alt={value.alt ?? ""} />;
    case "Link":
      return (
        <a {...rest} href={value.href}>
          {value.label ?? value.href}
        </a>
      );
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

