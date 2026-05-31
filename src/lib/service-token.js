/**
 * @file The service-token seam (CONTRACT ONLY).
 *
 * A "service token" is the credential the SERVER attaches when it reads
 * content on its own behalf - so public visitors get server-rendered content
 * without a user session. It is ORTHOGONAL to the user's auth token, which
 * flows in client-side via `getAccessToken`.
 *
 * This is a server-only seam: it never crosses the React Server -> Client
 * boundary, so (unlike the transport) there is no augment-in-provider dance -
 * it is resolved purely server-side. The default (`defaults/service-token.js`,
 * `noServiceToken`) sends no token; inject a real provider via
 * `createCmsPage({ getServiceToken })` (or pass one to the server read
 * helpers directly) when your backend requires auth for reads. Vendor-specific
 * providers (e.g. Keycloak client-credentials) live on the consumer/plugin
 * side, never in the core.
 */

/**
 * @callback ServiceTokenProvider
 * @returns {Promise<string>} A bearer token, or "" for an unauthenticated read.
 */

export {};
