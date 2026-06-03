"use client";

/**
 * @file Internal React context that carries the active `<CmsGroup>` prefix
 * down to descendant `<EditableRegion>` and `<EditableList>` components,
 * so they can prepend it to their `blockPath`.
 *
 * Lives in `lib/` (not `components/`) so it can be imported by both the
 * wrapper that publishes to it (CmsGroup) and the consumers that read it
 * (EditableRegion, EditableList) without forming a barrel cycle through
 * the components folder.
 */

import { createContext } from "react";

/**
 * Null value means "no enclosing CmsGroup; use blockPath as-is".
 *
 * @type {React.Context<string | null>}
 */
export const CmsGroupContext = createContext(/** @type {string | null} */ (null));

/**
 * Carries the enclosing `<CmsGroup>`'s editor-visibility mode down to
 * descendant `<EditableRegion>` / `<EditableList>` components, so a
 * section-level `visible` / `editable` prop cascades to every block inside
 * it. Kept separate from `CmsGroupContext` (the prefix) so the prefix
 * contract stays a bare string and existing consumers don't break.
 *
 * Null means "no inherited override". `"readonly"` locks descendants;
 * `"hidden"` removes them from the drawer entirely (see EditableRegion).
 *
 * @type {React.Context<"hidden" | "readonly" | null>}
 */
export const CmsGroupVisibilityContext = createContext(
  /** @type {"hidden" | "readonly" | null} */ (null),
);

const VISIBILITY_RANK = /** @type {const} */ ({ readonly: 1, hidden: 2 });

/**
 * Resolve two visibility modes to the more restrictive one
 * (`hidden` > `readonly` > none). Used to fold a child's own
 * `visible`/`editable` prop together with the inherited group mode, and to
 * combine nested groups. Returns `null` when both are absent.
 *
 * @param {"hidden"|"readonly"|null} a
 * @param {"hidden"|"readonly"|null} b
 * @returns {"hidden"|"readonly"|null}
 */
export function strongerVisibility(a, b) {
  const ra = a ? VISIBILITY_RANK[a] : 0;
  const rb = b ? VISIBILITY_RANK[b] : 0;
  return rb > ra ? b : a;
}
