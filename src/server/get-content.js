/**
 * @file Server-side content fetchers and sync helpers for Next.js App Router.
 *
 * SERVER ONLY - published under the `@skylab/cms/server` subpath.
 * Pull it from React Server Components (`app/**\/page.jsx`, layouts,
 * route handlers, build scripts); never import it from a client component.
 *
 * All read helpers (getCmsContent, getCmsDataSources, getCmsSource) attach a
 * Keycloak client-credentials token automatically when KEYCLOAK_CLIENT_ID,
 * KEYCLOAK_CLIENT_SECRET, and KEYCLOAK_ISSUER are set in the environment.
 */

import { fetchContent, fetchDataSources, fetchSource, syncManifest } from "../lib/api-client.js";

import { getClientCredentialsToken } from "./service-token.js";

export { discoverManifests } from "./discover.js";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { BlockResponse, ContentResponse, SyncManifestRequest, SyncResultResponse } from "../lib/schemas.js"
 */

/**
 * @param {string} slug
 * @returns {string}
 */
export function cmsCacheTag(slug) {
  return `cms-${slug}`;
}

/**
 * @param {string} sourceName
 * @returns {string}
 */
export function cmsSourceCacheTag(sourceName) {
  return `cms-source-${sourceName}`;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GetCmsContentOptions
 * @property {number | false} [revalidate]   ISR window in seconds, or `false` for tag-only invalidation.
 * @property {string[]} [tags]               Extra cache tags.
 * @property {string} [accessToken]          Override the auto-fetched service token.
 */

/**
 * @typedef {Object} GetCmsDataSourcesOptions
 * @property {number | false} [revalidate]
 * @property {string[]} [tags]
 * @property {string} [accessToken]
 */

/**
 * @typedef {Object} GetCmsSourceOptions
 * @property {number | false} [revalidate]
 * @property {string[]} [tags]
 * @property {string} [accessToken]
 */

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a page's blocks from a Server Component.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {GetCmsContentOptions} [options]
 * @returns {Promise<ContentResponse>}
 */
export async function getCmsContent(config, slug, options) {
  const accessToken = options?.accessToken ?? await getClientCredentialsToken();
  return fetchContent(config, slug, buildCacheInit(slug, options, accessToken));
}

/**
 * Fetch only the DataSource-typed blocks for a page.
 * Defaults to `cache: "no-store"` - each render re-resolves upstream services.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {GetCmsDataSourcesOptions} [options]
 * @returns {Promise<ContentResponse>}
 */
export async function getCmsDataSources(config, slug, options) {
  const accessToken = options?.accessToken ?? await getClientCredentialsToken();
  return fetchDataSources(config, slug, buildDataSourceInit(slug, options, accessToken));
}

/**
 * Server-side helper for the common page render: fetch the page's static
 * blocks (ISR-cached under `cmsCacheTag(slug)`, invalidated on admin save)
 * and its DataSource blocks (`cache: "no-store"`, freshly resolved upstream)
 * in parallel, then merge so each DataSource block carries its current
 * `.data` payload. Also fetches `config.globalSlug` (header/footer/site
 * settings) and stamps each block with its source slug so the save layer
 * later PUTs each one back to the right place.
 *
 * Use from `app/page.jsx` Server Components when the page mixes editable
 * static content with dynamic data sources (news lists, schedules, etc.).
 * Static blocks remain build-cached for SEO; DataSource blocks reflect
 * upstream changes without a CMS-side cache bust.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {{
 *   contentOptions?: GetCmsContentOptions,
 *   dataSourceOptions?: GetCmsDataSourcesOptions,
 * }} [options]
 * @returns {Promise<BlockResponse[]>}
 */
export async function getCmsPageBlocks(config, slug, options) {
  const accessToken =
    options?.contentOptions?.accessToken ??
    options?.dataSourceOptions?.accessToken ??
    (await getClientCredentialsToken());

  const globalSlug = config.globalSlug && config.globalSlug !== slug
    ? config.globalSlug
    : null;

  const [content, dataSources, globalContent] = await Promise.all([
    getCmsContent(config, slug, { ...options?.contentOptions, accessToken }),
    getCmsDataSources(config, slug, { ...options?.dataSourceOptions, accessToken }),
    globalSlug
      ? getCmsContent(config, globalSlug, { ...options?.contentOptions, accessToken }).catch(() => ({ slug: globalSlug, blocks: [] }))
      : Promise.resolve({ slug: "", blocks: [] }),
  ]);

  const pageBlocks = mergeDataSourceBlocks(content.blocks, dataSources.blocks)
    .map((b) => ({ ...b, _slug: slug }));

  if (!globalSlug || globalContent.blocks.length === 0) return pageBlocks;

  // Page wins on a path collision (shouldn't happen when discovery is the
  // source of truth, but be defensive). Otherwise append global blocks at
  // the bottom of the list - the AdminDrawer reads sortOrder per slug,
  // which keeps each group internally ordered.
  /** @type {Set<string>} */
  const pagePaths = new Set(pageBlocks.map((b) => b.blockPath));
  const stampedGlobal = globalContent.blocks
    .filter((b) => !pagePaths.has(b.blockPath))
    .map((b) => ({ ...b, _slug: globalSlug }));

  return [...pageBlocks, ...stampedGlobal];
}

/**
 * Resolve a single named data source from a Server Component.
 * Defaults to `cache: "no-store"`.
 *
 * @template T
 * @param {CmsConfig} config
 * @param {string} sourceName
 * @param {Record<string, *>} [query]
 * @param {GetCmsSourceOptions} [options]
 * @returns {Promise<T>}
 */
export async function getCmsSource(config, sourceName, query, options) {
  const accessToken = options?.accessToken ?? await getClientCredentialsToken();
  return /** @type {Promise<T>} */ (
    fetchSource(config, sourceName, query, buildSourceInit(sourceName, options, accessToken))
  );
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

/**
 * `POST /cms/sync` - register or update the block manifest for a page.
 * Idempotent. Intended for build-time / deploy-time pipelines.
 *
 * @param {CmsConfig} config
 * @param {SyncManifestRequest} request
 * @param {string} [accessToken]
 * @returns {Promise<SyncResultResponse>}
 */
export function syncCmsManifest(config, request, accessToken) {
  return syncManifest(config, request, accessToken);
}

/**
 * Sync all manifests in a single call - for `scripts/sync.mjs`.
 *
 * Fetches a Keycloak client-credentials token once (cached in-process) and
 * calls `POST /cms/sync` for every manifest. Logs results to console.
 * Throws if any manifest fails.
 *
 * @param {SyncManifestRequest[]} manifests
 * @param {{ baseUrl?: string }} [options]
 * @returns {Promise<void>}
 */
export async function syncAll(manifests, options) {
  const config = {
    baseUrl: options?.baseUrl ?? process.env.CMS_URL ?? "http://localhost:5000",
  };

  let accessToken = "";
  try {
    accessToken = await getClientCredentialsToken();
  } catch (err) {
    throw new Error(
      `[cms-sync] Failed to obtain service token: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let failed = 0;
  for (const manifest of manifests) {
    try {
      const result = await syncManifest(config, manifest, accessToken || undefined);
      console.log(
        `[cms-sync] ${manifest.slug}  created=${result.created} deleted=${result.deleted} unchanged=${result.unchanged}`,
      );
    } catch (err) {
      failed += 1;
      const detail =
        err && typeof err === "object" && "detail" in err
          ? /** @type {*} */ (err).detail
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`[cms-sync] ${manifest.slug}  FAILED: ${detail}`);
    }
  }

  if (failed > 0) {
    throw new Error(
      `[cms-sync] ${failed}/${manifests.length} slug(s) failed - backend at ${config.baseUrl} reachable?`,
    );
  }
}

// ---------------------------------------------------------------------------
// Cache init builders
// ---------------------------------------------------------------------------

/**
 * @param {string} slug
 * @param {GetCmsContentOptions | undefined} options
 * @param {string} accessToken
 * @returns {RequestInit}
 */
function buildCacheInit(slug, options, accessToken) {
  const revalidate = options?.revalidate ?? false;
  const tags = [cmsCacheTag(slug), ...(options?.tags ?? [])];
  return /** @type {RequestInit} */ ({
    next: { revalidate, tags },
    ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
  });
}

/**
 * @param {string} slug
 * @param {GetCmsDataSourcesOptions | undefined} options
 * @param {string} accessToken
 * @returns {RequestInit}
 */
function buildDataSourceInit(slug, options, accessToken) {
  /** @type {Record<string, string>} */
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  if (options?.revalidate === undefined) {
    return /** @type {RequestInit} */ ({ cache: "no-store", headers });
  }
  const tags = [cmsCacheTag(slug), ...(options.tags ?? [])];
  return /** @type {RequestInit} */ ({ next: { revalidate: options.revalidate, tags }, headers });
}

/**
 * Overlay freshly-resolved DataSource blocks on top of the cached static
 * block list. DataSource entries replace any same-path entry from the
 * cached payload (their `.data` is what the caller actually wants); paths
 * unique to either side are kept. Output is sorted by `sortOrder` so the
 * page renders in manifest order regardless of which side a block came from.
 *
 * @param {BlockResponse[]} staticBlocks
 * @param {BlockResponse[]} dataSourceBlocks
 * @returns {BlockResponse[]}
 */
function mergeDataSourceBlocks(staticBlocks, dataSourceBlocks) {
  if (dataSourceBlocks.length === 0) return staticBlocks;
  /** @type {Map<string, BlockResponse>} */
  const byPath = new Map();
  for (const block of staticBlocks) byPath.set(block.blockPath, block);
  for (const block of dataSourceBlocks) byPath.set(block.blockPath, block);
  return [...byPath.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * @param {string} sourceName
 * @param {GetCmsSourceOptions | undefined} options
 * @param {string} accessToken
 * @returns {RequestInit}
 */
function buildSourceInit(sourceName, options, accessToken) {
  /** @type {Record<string, string>} */
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  if (options?.revalidate === undefined) {
    return /** @type {RequestInit} */ ({ cache: "no-store", headers });
  }
  const tags = [cmsSourceCacheTag(sourceName), ...(options.tags ?? [])];
  return /** @type {RequestInit} */ ({ next: { revalidate: options.revalidate, tags }, headers });
}