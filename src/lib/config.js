/**
 * @file SDK configuration factory.
 *
 * Both server-side helpers and client-side hooks read this shape; keep it
 * free of browser-only types so it can be created in either environment.
 *
 * Note: `createCmsConfig` returns ONLY serializable data so the result can be
 * passed as a prop across the React Server -> Client boundary (e.g. by
 * `createCmsPage`). The `transport` (which holds functions) is NOT stored
 * here - it would break RSC serialization. It is resolved at the use site
 * instead: the client `CmsProvider` builds/augments it into the context
 * config, and server helpers fall back to `createRestTransport(config)`.
 */

/**
 * @import { CmsTransport } from "./transport.js"
 * @import { ServiceTokenProvider } from "./service-token.js"
 */

/**
 * @typedef {Object} CmsConfig
 * @property {string} baseUrl                  Backend root, no trailing slash.
 * @property {string|null} cdnUrl              CDN root for image uploads. When null, uploads fall back to `${baseUrl}/cms/media`.
 * @property {string|null} clientId            X-CMS-Client-Id header value.
 * @property {string} globalSlug
 *   Slug under which `scope="global"` blocks are stored. Fetched in
 *   parallel with the page slug on every render and merged into the same
 *   blocks map, so a header/footer/site-wide block edited on any page
 *   reflects everywhere. Default: "__global".
 * @property {CmsTransport} [transport]
 *   The data-access seam (see `transport.js`). Not set by `createCmsConfig`
 *   (it isn't serializable); the client provider augments it in and server
 *   helpers default it to the REST adapter. Present on the config the core
 *   actually reads at runtime.
 * @property {ServiceTokenProvider} [getServiceToken]
 *   Server-only seam (see `service-token.js`). Not set by `createCmsConfig`;
 *   `createCmsPage` augments it onto the server-fetch config and server read
 *   helpers default it to `noServiceToken` (no token). Never crosses to the
 *   client - it may hold secrets.
 */

/**
 * Normalize and freeze a serializable config object.
 *
 * @param {Object} opts
 * @param {string} opts.baseUrl
 * @param {string} [opts.cdnUrl]   Image upload root. Omit to upload through the API at `${baseUrl}/cms/media`.
 * @param {string} [opts.clientId]
 * @param {string} [opts.globalSlug]   Override the default "__global" slug for cross-page blocks.
 * @returns {CmsConfig}
 */

export function createCmsConfig({ baseUrl, cdnUrl, clientId, globalSlug }) {
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("createCmsConfig: baseUrl is required");
  }
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return Object.freeze({
    baseUrl: normalizedBase,
    cdnUrl: cdnUrl ? cdnUrl.replace(/\/+$/, "") : null,
    clientId: clientId ?? null,
    globalSlug: globalSlug ?? "__global",
  });
}