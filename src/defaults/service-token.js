/**
 * @file Default service-token provider.
 *
 * The vendor-neutral default is NO token: server-side reads go out
 * unauthenticated, which is correct for public backends. Inject a real
 * provider via `createCmsPage({ getServiceToken })` when your backend
 * requires auth for reads (e.g. a Keycloak client-credentials provider on
 * the consumer/plugin side). See `lib/service-token.js` for the contract.
 */

/**
 * @type {import("../lib/service-token.js").ServiceTokenProvider}
 */
export async function noServiceToken() {
  return "";
}
