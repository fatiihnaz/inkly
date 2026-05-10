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
 *   - DataSource      : Consumed by code; no inline rendering.
 *
 * @typedef {"Text" | "RichText" | "Image" | "Link" | "Date" | "List" | "DataSource"} BlockType
 */

/**
 * Per-field metadata for a List's item shape. Each entry pairs a leaf block
 * type (Text, Image, ...) with the seed value used when a new list item is
 * inserted. Nested lists (a field whose `blockType` is "List") aren't
 * supported in this iteration.
 *
 * @typedef {Object} ItemSchemaField
 * @property {Exclude<BlockType, "List" | "DataSource">} blockType
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
 * @property {*} value           Arbitrary JSON; shape depends on blockType.
 * @property {number} sortOrder
 * @property {number} version    Used for optimistic concurrency.
 * @property {*|null} data       Resolved DataSource payload, else null.
 * @property {string} [_slug]
 *   Client-side hint stamped by the SDK after fetch so the save layer
 *   knows which slug to PUT each block back to. Not part of the wire
 *   payload - the backend doesn't return or expect it.
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