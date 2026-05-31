/**
 * @file Server-side content fetchers and sync helpers for Next.js App Router.
 *
 * SERVER ONLY - published under the `@skylab/cms/server` subpath.
 * Pull it from React Server Components (`app/**\/page.jsx`, layouts,
 * route handlers, build scripts); never import it from a client component.
 *
 * Read helpers attach a service token from `config.getServiceToken` when one
 * is provided; otherwise they fall back to `noServiceToken` (no token) and
 * reads go out unauthenticated. Inject a real provider via
 * `createCmsPage({ getServiceToken })` when your backend requires auth for
 * reads - vendor-specific providers (e.g. Keycloak) live on the consumer side.
 */

import { createRestTransport } from "../defaults/transport.js";
import { noServiceToken } from "../defaults/service-token.js";

export { discoverManifests } from "./discover.js";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { ServiceTokenProvider } from "../lib/service-token.js"
 * @import { BlockResponse, ContentResponse, SyncManifestRequest, SyncResultResponse } from "../lib/schemas.js"
 */

/**
 * @param {string} slug
 * @returns {string}
 */
export function cmsCacheTag(slug) {
  return `cms-${slug}`;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GetCmsContentOptions
 * @property {number | false} [revalidate]   ISR window in seconds, or `false` for tag-only invalidation.
 * @property {string[]} [tags]               Extra cache tags.
 * @property {string} [accessToken]          Explicit token; wins over `config.getServiceToken`.
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
  const getServiceToken = config.getServiceToken ?? noServiceToken;
  const accessToken = options?.accessToken ?? (await getServiceToken());
  const transport = config.transport ?? createRestTransport(config);
  return transport.getContent(slug, {
    accessToken,
    cache: {
      revalidate: options?.revalidate ?? false,
      tags: [cmsCacheTag(slug), ...(options?.tags ?? [])],
    },
  });
}

/**
 * Server-side helper for the common page render: fetch the page's static
 * blocks (ISR-cached under `cmsCacheTag(slug)`, invalidated on admin save)
 * and the global slug (`config.globalSlug`, header/footer/site settings) in
 * parallel, then stamp each block with its source slug so the save layer
 * later PUTs each one back to the right place.
 *
 * Use from `app/page.jsx` Server Components. Collection-typed blocks are
 * declarations only at this layer; consumer-side `<CollectionRegion>` /
 * `<CollectionItem>` fetch their items at render time so the
 * `cms-collection-{key}` cache tag lives independently of the page slug.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {{ contentOptions?: GetCmsContentOptions }} [options]
 * @returns {Promise<BlockResponse[]>}
 */
export async function getCmsPageBlocks(config, slug, options) {
  const getServiceToken = config.getServiceToken ?? noServiceToken;
  const accessToken =
    options?.contentOptions?.accessToken ?? (await getServiceToken());

  const globalSlug =
    config.globalSlug && config.globalSlug !== slug ? config.globalSlug : null;

  const [content, globalContent] = await Promise.all([
    getCmsContent(config, slug, { ...options?.contentOptions, accessToken }),
    globalSlug
      ? getCmsContent(config, globalSlug, { ...options?.contentOptions, accessToken })
          .catch(() => ({ slug: globalSlug, blocks: [] }))
      : Promise.resolve({ slug: "", blocks: [] }),
  ]);

  const pageBlocks = content.blocks.map((b) => ({ ...b, _slug: slug }));

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
  const transport = config.transport ?? createRestTransport(config);
  return transport.syncManifest(request, { accessToken });
}

/**
 * Sync all manifests in a single call - for build/deploy pipelines.
 *
 * Obtains a service token once via `getServiceToken` (default: none) and
 * calls `POST /cms/sync` for every manifest. Logs results to console.
 * Throws if any manifest fails.
 *
 * @param {SyncManifestRequest[]} manifests
 * @param {{ baseUrl?: string, getServiceToken?: ServiceTokenProvider }} [options]
 * @returns {Promise<void>}
 */
export async function syncAll(manifests, options) {
  const config = {
    baseUrl: options?.baseUrl ?? process.env.CMS_URL ?? "http://localhost:5000",
  };
  const transport = createRestTransport(config);
  const getServiceToken = options?.getServiceToken ?? noServiceToken;

  let accessToken = "";
  try {
    accessToken = await getServiceToken();
  } catch (err) {
    throw new Error(
      `[cms-sync] Failed to obtain service token: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let failed = 0;
  for (const manifest of manifests) {
    try {
      const result = await transport.syncManifest(manifest, { accessToken: accessToken || undefined });
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

