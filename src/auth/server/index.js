/**
 * @file Public surface of `@skylab/cms/auth/server`.
 *
 * Importing this from a Client Component throws at build time via
 * `server-only`. Use `@skylab/cms/auth/client` for browser-side wiring.
 */

import "server-only";

export { createCmsAuthOptions, isCmsAdmin, readCmsAuthMeta, withCmsAuth } from "./options.js";
export { createSignInRoute } from "./signin.js";
