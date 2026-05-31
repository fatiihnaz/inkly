/**
 * @file Default auth adapter: anonymous / public.
 *
 * No session resolver, so every visitor is a non-admin public user - correct
 * for sites without an admin login, and the reason the CMS needs zero auth
 * dependency to render. To enable editing, pass your own adapter into
 * `createCmsPage` (e.g. spread `withCmsAuth(authOptions)` for NextAuth).
 *
 * `deriveAdmin` / `deriveUserSub` are the sensible fallbacks for the case
 * where a consumer overrides only `getSession`: any present session counts as
 * admin and its `user.id` is the subject. See `lib/auth.js` for the contract.
 */

/**
 * @type {import("../lib/auth.js").CmsAuthAdapter}
 */
export const publicAuth = {
  getSession: async () => null,
  deriveAdmin: (session) => session != null,
  deriveUserSub: (session) => session?.user?.id ?? null,
};
