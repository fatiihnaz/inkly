"use client";

/**
 * @file Public client-side API for `@skylab/cms`.
 *
 * Server-only helpers live at `@skylab/cms/server` (see `src/server/`).
 * Anything re-exported here ends up in the client bundle of the consuming
 * Next.js app, so keep server-only code out.
 *
 * The `"use client"` directive above is load-bearing: tsup/esbuild bundles
 * every transitive `.jsx` file into `dist/index.js` and drops inner-file
 * directives during bundling. Only the entry file's top-level directive is
 * preserved, so it must live here for Next.js to treat the bundle as a
 * Client Component (needed for the React hooks and `next/dynamic({ ssr:false })`
 * used internally by `CmsProvider`).
 */

export { CmsProvider } from "./components/CmsProvider.jsx";
export { EditableRegion } from "./components/EditableRegion.jsx";

export { useCmsContent } from "./hooks/use-cms-content.js";
export { useCmsAdmin } from "./hooks/use-cms-admin.js";
export { useCmsBlock } from "./hooks/use-cms-block.js";
export { useCountdown } from "./hooks/use-countdown.js";

export { createCmsConfig } from "./lib/config.js";
export { CmsApiError } from "./lib/api-client.js";
export { getBlock, getBlockValue, groupBlocksByPrefix, indexBlocksByPath } from "./lib/blocks.js";