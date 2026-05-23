/**
 * @file Backend API request/response shape documentation.
 *
 * No runtime exports - these are JSDoc typedefs only. Imported via
 * `@import` references or referenced by name in other files' JSDoc blocks.
 */

/**
 * Allowed values for `BlockResponse.blockType`.
 *
 * Value shapes per type:
 *   - Text / RichText : string
 *   - Image           : { src: string, alt: string }
 *   - Link            : { href: string, label: string }
 *   - Date            : ISO 8601 string, e.g. "2026-08-15T18:00:00.000Z". Empty string when unset.
 *   - List            : Array of plain objects shaped by the manifest's `itemSchema`
 *                       (each object's keys map to leaf block types). The whole
 *                       list shares one `version` - all reorder/add/remove/edit
 *                       operations save atomically.
 *   - Collection      : Read-only binding to the backend's `/cms/collections/{key}` API.
 *                       `value` carries `{ collection: string, slug?: string }`;
 *                       resolved items are fetched separately by the SDK and
 *                       handed to consumer render-props (`<CollectionRegion>` /
 *                       `<CollectionItem>`). No inline editing - writes happen
 *                       in the collection's own admin surface (e.g. team leader
 *                       portal). CMS just surfaces the data here.
 *
 * @typedef {"Text" | "RichText" | "Image" | "Link" | "Date" | "List" | "Collection"} BlockType
 */

/**
 * Per-field metadata for a List's item shape. Each entry pairs a leaf block
 * type (Text, Image, ...) with the seed value used when a new list item is
 * inserted. Nested lists (a field whose `blockType` is "List") aren't
 * supported in this iteration.
 *
 * @typedef {Object} ItemSchemaField
 * @property {Exclude<BlockType, "List" | "Collection">} blockType
 * @property {*} defaultValue
 */

/**
 * @typedef {Object<string, ItemSchemaField>} ItemSchema
 */

/**
 * Single block returned by `GET /cms/content`.
 *
 * @typedef {Object} BlockResponse
 * @property {string} blockPath  Dot-notation path, e.g. "hero.title".
 * @property {BlockType} blockType
 * @property {*} value
 *   Arbitrary JSON; shape depends on blockType. For Collection blocks
 *   this carries `{ collection: string, slug?: string }` - the binding
 *   the SDK uses to resolve items from `/cms/collections/{key}`. The
 *   resolved items themselves are NOT stored here; consumer-side
 *   `<CollectionRegion>`/`<CollectionItem>` fetch them at render time
 *   so the cache tag (`cms-collection-{key}`) lives independently of
 *   the page slug.
 * @property {number} sortOrder
 * @property {number} version    Used for optimistic concurrency.
 * @property {*|null} [draftValue]
 *   Admin-only overlay. Non-null when the backend's Redis layer holds a
 *   pending draft for this block; in that case `value` carries the
 *   published version and `draftValue` carries the draft. Backend
 *   auto-cleans (sends `null`) when the two would otherwise be equal,
 *   so any non-null `draftValue` is guaranteed to differ from `value`.
 *   Public payloads omit / null this field.
 * @property {string} [_slug]
 *   Client-side hint stamped by the SDK after fetch so the save layer
 *   knows which slug to PUT each block back to. Not part of the wire
 *   payload - the backend doesn't return or expect it.
 */

/**
 * Binding stored as a Collection block's `value`. Discovery emits this
 * from `<CollectionRegion collection="..." />` / `<CollectionItem
 * collection="..." slug="..." />`. Backend stores it verbatim; the SDK
 * uses it at render time to resolve items.
 *
 * @typedef {Object} CollectionBinding
 * @property {string} collection   Backend collection key (e.g. "Teams", "News"). Case-insensitive at the API level but discovery normalises to PascalCase.
 * @property {string} [slug]       When set, the block resolves a single item via `GET /cms/collections/{key}/{slug}`. Omit for list bindings (`GET /cms/collections/{key}`).
 */

/**
 * One row returned by `GET /cms/collections/{key}` (list) or
 * `GET /cms/collections/{key}/{slug}` (single). Backend-owned shape;
 * `data` is the per-collection payload (Team/News/...). Filtering
 * (status / publishedAt / category) will land at the API level via
 * query params; not yet implemented.
 *
 * @typedef {Object} CollectionItemResponse
 * @property {string} id
 * @property {string} collectionKey
 * @property {string} slug
 * @property {*} data
 * @property {number} version
 * @property {boolean} canEdit
 *   Whether the requesting user can write to this row through the
 *   collection's own admin surface (e.g. team leader portal). The CMS
 *   itself never writes - this flag is forwarded to render-props so
 *   consumers can show "edit elsewhere" links.
 */

/**
 * Full response of `GET /cms/content` and `GET /cms/data`.
 *
 * @typedef {Object} ContentResponse
 * @property {string} slug
 * @property {BlockResponse[]} blocks  Empty array if page not yet synced.
 */

/**
 * Single block in a `PUT /cms/content` request body.
 *
 * @typedef {Object} UpdateBlockItem
 * @property {string} blockPath
 * @property {*} value
 * @property {number} version  Last known version; mismatches return 409.
 */

/**
 * Full body of `PUT /cms/content`.
 *
 * @typedef {Object} UpdatePageRequest
 * @property {string} slug
 * @property {UpdateBlockItem[]} blocks
 */

/**
 * Response of `PUT /cms/content`.
 *
 * @typedef {Object} UpdatePageResponse
 * @property {number} updated
 * @property {number} unchanged
 */

/**
 * Single block in a `POST /cms/sync` manifest.
 *
 * @typedef {Object} ManifestBlockItem
 * @property {string} blockPath
 * @property {BlockType} blockType
 * @property {*} defaultValue
 * @property {number} sortOrder
 * @property {ItemSchema} [itemSchema]   List blocks only - shape of one item.
 */

/**
 * Full body of `POST /cms/sync`.
 *
 * @typedef {Object} SyncManifestRequest
 * @property {string} slug
 * @property {ManifestBlockItem[]} blocks
 */

/**
 * Response of `POST /cms/sync`.
 *
 * @typedef {Object} SyncResultResponse
 * @property {number} created
 * @property {number} deleted
 * @property {number} unchanged
 */

/**
 * RFC 7807 error payload returned by the backend on non-2xx responses.
 *
 * @typedef {Object} ProblemDetails
 * @property {string|null} type
 * @property {string} title
 * @property {number} status
 * @property {string} detail
 * @property {string} instance
 */

export {};