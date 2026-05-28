"use client";

/**
 * @file Internal CMS React context.
 *
 * The `CmsProvider` component (in `components/CmsProvider.jsx`) wires this
 * up; hooks under `src/hooks/` consume it via `useCmsContext`. Kept in
 * `lib/` so both the provider and the hooks can import it without a
 * circular dependency through the components barrel.
 */

import { createContext, useContext } from "react";

/**
 * @import { CmsConfig } from "./config.js"
 * @import { BlockResponse, ItemSchema, MyCollectionResponse, CollectionItemResponse } from "./schemas.js"
 */

/**
 * @typedef {Object} CollectionItemCacheEntry
 * @property {CollectionItemResponse | null} item
 * @property {boolean} isLoading
 * @property {Error | null} error
 */

/**
 * Single page of `useCollection` data. Each (collection, params) tuple
 * has its own entry so the same collection viewed through different
 * filter / pagination windows doesn't share state.
 *
 * @typedef {Object} CollectionListCacheEntry
 * @property {CollectionItemResponse[]} items
 * @property {number} total
 * @property {number} offset
 * @property {number} limit
 * @property {boolean} isLoading
 * @property {Error | null} error
 */

/**
 * Shape of the value held in `CmsContext`.
 *
 * @typedef {Object} CmsContextValue
 * @property {CmsConfig} config
 * @property {boolean} isAdmin
 * @property {string|null} userSub
 * @property {Map<string, BlockResponse>} blocks
 * @property {(updater: (prev: Map<string, BlockResponse>) => Map<string, BlockResponse>) => void} setBlocks
 * @property {Map<string, *>} drafts                 Per-blockPath unsaved edits; EditableRegion reads these for live preview while admins type.
 * @property {(blockPath: string, value: *) => void} setDraft
 * @property {(blockPath: string) => void} clearDraft
 * @property {() => void} clearDrafts
 * @property {string|null} activeBlock
 * @property {(blockPath: string|null) => void} setActiveBlock
 * @property {number} refetchToken      Bumped to force `useCmsContent` to refetch.
 * @property {() => void} triggerRefetch
 * @property {Map<string, ItemSchema>} itemSchemas
 *   Registry populated by `<EditableList>` instances at mount time. The
 *   AdminDrawer reads it to know how to render List editors (per-field
 *   atomic editors). Unregistered on unmount; key is the list's blockPath.
 * @property {(blockPath: string, schema: ItemSchema) => void} registerItemSchema
 * @property {(blockPath: string) => void} unregisterItemSchema
 * @property {Map<string, { collection: string, slug?: string, filter?: Record<string, *>, limit?: number, offset?: number }>} collectionBindings
 *   Runtime registry populated by `<CollectionItem>` and `<CollectionRegion>`
 *   when they mount. Collections don't live in the CMS block namespace
 *   (no manifest sync, no `/cms/content` payload), so this is how the
 *   AdminDrawer learns about the bindings rendered on the current page.
 *   Key is the binding's full blockPath (with any `<CmsGroup>` prefix
 *   applied); slug is set for `<CollectionItem>` and omitted for
 *   `<CollectionRegion>` (list bindings). Region bindings additionally
 *   carry the filter / limit / offset the page is using so the drawer
 *   can mirror its data (filter parity).
 * @property {(blockPath: string, binding: { collection: string, slug?: string, filter?: Record<string, *>, limit?: number, offset?: number }) => void} registerCollectionBinding
 * @property {(blockPath: string) => void} unregisterCollectionBinding
 * @property {MyCollectionResponse[]} myCollections
 *   Response of `GET /cms/collections/me`, fetched once per session by
 *   the provider when `isAdmin === true` (empty array for public
 *   visitors). All admin drawer surfaces (Collection block cards,
 *   future per-collection tabs) read schemas from here so we don't
 *   re-fetch /me per card.
 * @property {boolean} myCollectionsLoading
 * @property {Error|null} myCollectionsError
 * @property {() => void} refetchMyCollections   Bump-token style; the provider re-runs the /me effect.
 * @property {Map<string, CollectionItemCacheEntry>} collectionItemCache
 *   Shared cache for `useCollectionItem`. Key is `"{key}:{slug}"`. Both
 *   the page-side `<CollectionItem>` and the drawer-side
 *   `AdminCollectionEditor` read from this map, so a save in the drawer
 *   propagates to the page without a second fetch (and two surfaces
 *   mounted at once for the same item only fire one request).
 * @property {(key: string, slug: string, force?: boolean) => Promise<void>} requestCollectionItem
 *   Ensure the cache holds a fresh entry for `(key, slug)`. Cache hit ->
 *   no-op (unless `force === true`). Concurrent calls for the same pair
 *   are deduped via an in-flight promise table.
 * @property {(key: string, slug: string, item: CollectionItemResponse) => void} updateCollectionItem
 *   Write a freshly-saved item straight into the cache, bypassing a
 *   refetch. Called by the drawer's save handler so the page-side
 *   `<CollectionItem>` re-renders with the new version instantly.
 * @property {(key: string, slug: string) => void} invalidateCollectionItem
 *   Drop the cache entry; the next consumer mount triggers a fresh fetch.
 * @property {Map<string, *>} collectionDrafts
 *   Per-(collection, slug) in-progress local edits from open drawer
 *   editors. Key is `"{key}:{slug}"`, value is the full payload the
 *   editor would publish right now. Mirrors the `drafts` map for
 *   content blocks: `useCollectionItem` / `useCollection` overlay it
 *   onto `item.data` so page-side `<CollectionItem>` / `<CollectionRegion>`
 *   consumers see admin edits live while they're being typed - before
 *   the debounced server-side draft autosave even fires. Cleared on
 *   successful publish, on user-initiated "undo", and on pathname
 *   change (so soft-nav doesn't leak stale overlays).
 * @property {(key: string, slug: string, payload: *) => void} setCollectionDraft
 * @property {(key: string, slug: string) => void} clearCollectionDraft
 * @property {() => void} clearCollectionDrafts
 * @property {Map<string, CollectionListCacheEntry>} collectionListCache
 *   Shared cache for `useCollection(key, params?)`. Keyed by
 *   `"{key}|{stableStringify(params ?? {})}"` so different filter /
 *   offset / limit windows of the same collection live as separate
 *   entries. A save on any row in the collection invalidates every
 *   entry for that key (filtered views may include or exclude the
 *   changed row in ways we can't reliably patch in-place, so a
 *   refetch is the safe move).
 * @property {(key: string, params?: import("./schemas.js").CollectionListParams, force?: boolean) => Promise<void>} requestCollectionList
 * @property {(key: string, params?: import("./schemas.js").CollectionListParams) => void} invalidateCollectionList
 *   With `params`: drop only that cache entry. Without `params`: drop
 *   every entry for the given collection (used after item save).
 * @property {((slug: string) => void | Promise<void>) | null} onAfterSave  Called after a successful save (typically a Server Action that calls `revalidateTag(cmsCacheTag(slug))`).
 * @property {(() => Promise<string>) | null} getAccessToken  Returns the current user's JWT access token; added as `Authorization: Bearer {token}` on write requests. Null in public/demo mode.
 * @property {"idle"|"saving"|"saved"|"failed"} draftSyncStatus
 *   Background `PUT /cms/draft` autosave state. `saved`/`failed` are
 *   transient pulse signals - they clear back to `idle` after the panel's
 *   status dot finishes its flash animation.
 * @property {boolean} isDrawerOpen      Admin-only: whether the editor drawer is expanded.
 * @property {(open: boolean) => void} setDrawerOpen  Admin-only: toggle the drawer.
 * @property {{ name: string|null, email: string|null, image: string|null } | null} userInfo  Admin-only: identity to display in the panel footer. Null when no session.
 * @property {(() => void) | null} onSignOut  Admin-only: invoked by the panel's logout button. Null when no auth wiring.
 */

/** @type {React.Context<CmsContextValue|null>} */
export const CmsContext = createContext(null);

/**
 * Read the current CMS context. Throws if used outside `<CmsProvider>`.
 *
 * @returns {CmsContextValue}
 */
export function useCmsContext() {
  const ctx = useContext(CmsContext);
  if (!ctx) {
    throw new Error(
      "CMS hooks/components must be used inside <CmsProvider>",
    );
  }
  return ctx;
}