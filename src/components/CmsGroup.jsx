"use client";

/**
 * @file `<CmsGroup name>` - declarative section wrapper.
 *
 * Two effects, one wrapper:
 *
 *   1. Automatic blockPath prefix. Every `<EditableRegion blockPath="x">`
 *      and `<EditableList blockPath="x">` rendered as a descendant of a
 *      `<CmsGroup name="hero">` reads/writes "hero.x" instead of just
 *      "x". Nested groups concat with dots: a CmsGroup named "actions"
 *      inside one named "hero" turns "primary" into "hero.actions.primary".
 *      The discovery script applies the exact same prefix on the
 *      manifest side, so the consumer writes
 *
 *        <CmsGroup name="footer">
 *          <EditableRegion blockPath="copyright" blockType="Text"
 *                          defaultValue="© SKY LAB" />
 *        </CmsGroup>
 *
 *      and the backend stores `footer.copyright`. No need to repeat the
 *      group name in every blockPath.
 *
 *   2. In-page admin highlight. In admin mode the wrapper draws a dashed
 *      accent ring + a small label tag around its children on hover, so
 *      the editor can see "this is the hero section" at a glance.
 *      Public mode is a transparent passthrough: zero DOM, zero JS.
 *
 * The wrapper does not touch the manifest field directly. The
 * AdminDrawer groups blocks by blockPath prefix on its own; CmsGroup
 * just makes sure the consumer doesn't have to type the prefix twice.
 */

import { useContext, useState } from "react";

import { CmsGroupContext, CmsGroupVisibilityContext, strongerVisibility } from "../lib/group-context.js";
import { useCmsContext } from "../lib/context.js";

/**
 * @typedef {Object} CmsGroupProps
 * @property {string} name        Section name. Joined with parent CmsGroups via dots.
 * @property {React.ReactNode} children
 * @property {React.CSSProperties} [style]   Forwarded to the wrapper div in admin mode.
 * @property {boolean} [editable]
 *   Section-level lock. When `false`, every descendant `<EditableRegion>` /
 *   `<EditableList>` renders read-only (page + drawer card disabled), as if
 *   each carried `editable={false}`. Children may tighten further (a child
 *   `visible={false}` still hides), but cannot loosen past the group.
 * @property {boolean} [visible]
 *   Section-level hide. When `false`, every descendant is removed from the
 *   admin drawer and renders read-only on the page. Takes precedence over
 *   `editable`. Inherited by nested groups (most restrictive wins).
 */

const RING_COLOR_HOVER = "rgba(201,184,150,0.50)";
const RING_COLOR_OFF   = "rgba(201,184,150,0)";
const LABEL_BG         = "#221d18";
const LABEL_BORDER     = "1px solid rgba(255,255,255,0.10)";
const LABEL_COLOR      = "rgba(201,184,150,0.85)";

/**
 * @param {CmsGroupProps} props
 */
export function CmsGroup({ name, children, style, editable, visible }) {
  const { isAdmin } = useCmsContext();
  const parentPrefix = useContext(CmsGroupContext);
  const parentVisibility = useContext(CmsGroupVisibilityContext);
  const [hovered, setHovered] = useState(false);

  // Nested CmsGroups concat: <CmsGroup name="hero"><CmsGroup name="cta">
  // ...</CmsGroup></CmsGroup> sees a child blockPath "primary" as
  // "hero.cta.primary". Top-level wrapper has no parent so the prefix is
  // just `name`.
  const prefix = parentPrefix ? `${parentPrefix}.${name}` : name;

  // Fold this group's own visibility prop together with any inherited from
  // an enclosing group — most restrictive wins, so a `readonly` group
  // nested in a `hidden` one stays hidden. The resolved mode flows down to
  // descendants (regions, lists, deeper groups).
  const ownMode = visible === false ? "hidden" : editable === false ? "readonly" : null;
  const visibility = strongerVisibility(parentVisibility, ownMode);

  if (!isAdmin) {
    return (
      <CmsGroupContext.Provider value={prefix}>
        <CmsGroupVisibilityContext.Provider value={visibility}>
          {children}
        </CmsGroupVisibilityContext.Provider>
      </CmsGroupContext.Provider>
    );
  }

  // Surface the section's mode in the hover label so an admin understands
  // why its fields are locked/absent (e.g. "hero · readonly").
  const label = visibility ? `${prefix} · ${visibility}` : prefix;

  return (
    <CmsGroupContext.Provider value={prefix}>
      <CmsGroupVisibilityContext.Provider value={visibility}>
        <div
          data-cms-group={prefix}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "relative",
            outline: `1.5px dashed ${hovered ? RING_COLOR_HOVER : RING_COLOR_OFF}`,
            outlineOffset: 6,
            borderRadius: 4,
            transition: "outline-color 0.18s ease",
            ...style,
          }}
        >
          {children}
          {hovered ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: "translate(-6px, -100%)",
                background: LABEL_BG,
                border: LABEL_BORDER,
                borderBottom: "none",
                borderRadius: "4px 4px 0 0",
                padding: "1px 6px",
                fontSize: 9,
                fontWeight: 500,
                color: LABEL_COLOR,
                letterSpacing: "0.05em",
                lineHeight: "16px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                fontFamily: "ui-monospace, 'SF Mono', monospace",
                zIndex: 9999,
              }}
            >
              {label}
            </span>
          ) : null}
        </div>
      </CmsGroupVisibilityContext.Provider>
    </CmsGroupContext.Provider>
  );
}
