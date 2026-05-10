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
