"use client";

/**
 * @file `<CollectionRegion>` - render-prop primitive for a whole collection
 * (e.g. all Teams, all News). The CMS is read-only here; writes happen in
 * the collection's own admin surface.
 *
 * Discovery picks the JSX up via the AST scanner and emits a Collection
 * block into the manifest so the AdminDrawer can show "this page reads
 * from collection X". Runtime ignores the blockPath - it fetches by
 * `collection` directly through `useCollection`.
 *
 *   <CollectionRegion blockPath="news.list" collection="News">
 *     {(items, { isLoading, error }) => (
 *       isLoading ? <Skeleton /> :
 *       error    ? <ErrorBanner message={error.message} /> :
 *                  items.map(i => <NewsCard key={i.id} {...i.data} />)
 *     )}
 *   </CollectionRegion>
 */

import { useCollection } from "../hooks/use-collection.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/api-client.js"
 */

/**
 * @typedef {Object} CollectionRegionMeta
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @typedef {Object} CollectionRegionProps
 * @property {string} blockPath
 *   Discovery-time identifier. Lets the AdminDrawer disambiguate when the
 *   same collection is referenced from multiple slots on a page. Runtime
 *   no-op.
 * @property {string} collection
 *   Backend collection key (e.g. "Teams", "News"). Case-insensitive at the
 *   API level. Must be a static literal for discovery.
 * @property {"global"} [scope]
 *   Discovery-only. Set when the region lives in shared UI (header/footer)
 *   so the manifest tracks it under the global slug.
 * @property {(items: CollectionItemResponse[], meta: CollectionRegionMeta) => React.ReactNode} children
 */

/**
 * @param {CollectionRegionProps} props
 */
// eslint-disable-next-line no-unused-vars
export function CollectionRegion({ blockPath: _bp, collection, scope: _scope, children }) {
  const { items, isLoading, error, refetch } = useCollection(collection);
  return /** @type {*} */ (children(items, { isLoading, error, refetch }));
}
