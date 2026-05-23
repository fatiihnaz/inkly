"use client";

/**
 * @file `<CollectionItem>` - render-prop primitive for a single collection
 * row (e.g. one team, one news article). Read-only; writes happen in the
 * collection's own admin surface.
 *
 * 404s come through `meta.error` with `error.isNotFound === true` so the
 * consumer can branch on the same try-catch surface that handles other
 * errors. The render-prop receives `item: null` while loading and on
 * error - branch on `meta.isLoading` / `meta.error` before reading
 * `item.data`.
 *
 *   <CollectionItem blockPath="news.hero" collection="News" slug="q1-release-notes">
 *     {(item, { isLoading, error }) => (
 *       isLoading            ? <Skeleton /> :
 *       error?.isNotFound    ? <NotFound /> :
 *       error                ? <ErrorBanner message={error.message} /> :
 *                              <Article {...item.data} />
 *     )}
 *   </CollectionItem>
 */

import { useCollectionItem } from "../hooks/use-collection.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/api-client.js"
 */

/**
 * @typedef {Object} CollectionItemMeta
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @typedef {Object} CollectionItemProps
 * @property {string} blockPath
 *   Discovery-time identifier. Runtime no-op; the hook fetches by
 *   `collection` + `slug`.
 * @property {string} collection   Backend collection key.
 * @property {string} slug         Item slug (lowercased server-side).
 * @property {"global"} [scope]    Discovery-only marker for shared UI.
 * @property {(item: CollectionItemResponse | null, meta: CollectionItemMeta) => React.ReactNode} children
 */

/**
 * @param {CollectionItemProps} props
 */
// eslint-disable-next-line no-unused-vars
export function CollectionItem({ blockPath: _bp, collection, slug, scope: _scope, children }) {
  const { item, isLoading, error, refetch } = useCollectionItem(collection, slug);
  return /** @type {*} */ (children(item, { isLoading, error, refetch }));
}
