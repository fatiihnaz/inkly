/**
 * @file The auth seam (CONTRACT ONLY).
 *
 * `createCmsPage` is auth-agnostic: it consumes a `CmsAuthAdapter` - three
 * server-side callbacks - and never imports an auth library. The neutral
 * default (`defaults/auth.js`, `publicAuth`) treats every visitor as an
 * anonymous public user, so the CMS works read-only out of the box with no
 * auth dependency at all.
 *
 * To enable editing, supply your own adapter. The auth library (next-auth,
 * Auth.js, Clerk, Lucia, ...) and identity provider (Keycloak, ...) are the
 * consumer's choice - the core depends on none of them. For NextAuth,
 * `withCmsAuth(authOptions)` from `@skylab/cms/auth/server` builds an adapter
 * for you.
 */

/**
 * @callback GetSession
 * @returns {Promise<*|null>} The server session, or null for an anonymous request.
 */

/**
 * @typedef {Object} CmsAuthAdapter
 * @property {GetSession} getSession
 *   Resolve the server session for the current request (null = public/anonymous).
 * @property {(session: *) => boolean} deriveAdmin
 *   Decide whether the session may edit (drives admin gating).
 * @property {(session: *) => string | null} deriveUserSub
 *   Extract a stable user id from the session (used for attribution).
 */

export {};
