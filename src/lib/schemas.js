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
 *   - Group / DataSource: consumed by code; no inline rendering.
 *
 * @typedef {"Text" | "RichText" | "Image" | "Link" | "Date" | "Group" | "DataSource"} BlockType
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