/**
 * @file SDK configuration factory.
 *
 * Both server-side helpers and client-side hooks read this shape; keep it
 * free of browser-only types so it can be created in either environment.
 */

/**
 * @typedef {Object} CmsConfig
 * @property {string} baseUrl                  Backend root, no trailing slash.
 * @property {string|null} cdnUrl              CDN root for image uploads. When null, uploads fall back to `${baseUrl}/cms/media`.
 * @property {string|null} clientId            X-CMS-Client-Id header value.
 * @property {string|null} clientSecret        X-CMS-Client-Secret header value.
 * @property {string} globalSlug
 *   Slug under which `scope="global"` blocks are stored. Fetched in
 *   parallel with the page slug on every render and merged into the same
 *   blocks map, so a header/footer/site-wide block edited on any page
 *   reflects everywhere. Default: "__global".
 */

/**
 * Normalize and freeze a config object.
 *
 * @param {Object} opts
 * @param {string} opts.baseUrl
 * @param {string} [opts.cdnUrl]   Image upload root. Omit to upload through the API at `${baseUrl}/cms/media`.
 * @param {string} [opts.clientId]
 * @param {string} [opts.clientSecret]
 * @param {string} [opts.globalSlug]   Override the default "__global" slug for cross-page blocks.
 * @returns {CmsConfig}
 */

export function createCmsConfig({ baseUrl, cdnUrl, clientId, clientSecret, globalSlug }) {
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("createCmsConfig: baseUrl is required");
  }
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return Object.freeze({
    baseUrl: normalizedBase,
    cdnUrl: cdnUrl ? cdnUrl.replace(/\/+$/, "") : null,
    clientId: clientId ?? null,
    clientSecret: clientSecret ?? null,
    globalSlug: globalSlug ?? "__global",
  });
}