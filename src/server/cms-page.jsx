/**
 * @file `createCmsPage` factory - centralise per-page CMS boilerplate.
 *
 * SERVER ONLY - published under `@skylab/cms/page`.
 *
 * Define one factory call (typically `app/lib/cms.jsx`) with your config,
 * session strategy, and revalidation; afterwards every page reduces to:
 *
 *   import { CmsPage } from "../lib/cms.jsx";
 *   import { EditableRegion } from "@skylab/cms";
 *
 *   export default function Page() {
 *     return (
 *       <CmsPage slug="/foo">
 *         <main>
 *           <EditableRegion blockPath="hero.title" as="h1" />
 *         </main>
 *       </CmsPage>
 *     );
 *   }
 *
 * The `slug` prop is optional. When omitted, the helper reads the active
 * pathname from the `x-pathname` request header - this lets you wrap the
 * root layout once and let every static page inherit it. The header is not
 * standard; the consumer must populate it via a tiny middleware:
 *
 *   // middleware.js
 *   import { NextResponse } from "next/server";
 *   export function middleware(req) {
 *     const headers = new Headers(req.headers);
 *     headers.set("x-pathname", req.nextUrl.pathname);
 *     return NextResponse.next({ request: { headers } });
 *   }
 *
 * Dynamic routes (`/news/[id]`) still need explicit `<CmsPage slug="/news/[id]">`
 * because the header carries the concrete path, not the manifest template.
 *
 * `Provider` is passed in by the caller (rather than imported here) so the
 * `"use client"` boundary in `@skylab/cms/nextauth` (or a custom provider
 * module) stays intact - tsup does not preserve `"use client"` across entry
 * boundaries when bundling, but consumer-side imports do.
 */

import { headers } from "next/headers";
import { getServerSession } from "next-auth";

import { getCmsPageBlocks } from "./get-content.js";
import { createCmsConfig } from "../lib/config.js";
import { isCmsAdmin, readCmsAuthMeta } from "../auth/server/options.js";

const PATHNAME_HEADER = "x-pathname";

/**
 * @import { CmsConfig } from "../lib/config.js"
 */

/**
 * @typedef {Object} CreateCmsPageOptions
 * @property {CmsConfig | { baseUrl: string }} config
 * @property {import("../lib/service-token.js").ServiceTokenProvider} [getServiceToken]
 *   Server-only provider for the service token used by the SSR content fetch
 *   (so public visitors get rendered content without a user session). Default:
 *   no token. Inject e.g. a Keycloak client-credentials provider here. It is
 *   used server-side only and never passed to the client `Provider`.
 * @property {*} Provider
 *   The CMS provider component - typically `NextAuthCmsProvider` from
 *   `@skylab/cms/nextauth`, or your own wrapper. The provider receives
 *   `config`, `isAdmin`, `userSub`, `initialBlocks`, `onAfterSave`, and
 *   `session` props.
 * @property {import("next-auth").AuthOptions} [authOptions]
 *   When set, `getSession` and `deriveAdmin` are wired automatically:
 *   `getSession` calls `getServerSession(authOptions)` and admin gating
 *   uses the metadata stamped by `createCmsAuthOptions` (or falls back to
 *   `session != null`). Pass `getSession`/`deriveAdmin` to override.
 * @property {() => Promise<*|null>} [getSession]
 *   Manual session resolver. Wins over `authOptions`. Omit for public-only
 *   setups - every visitor is treated as non-admin.
 * @property {(session: *) => boolean} [deriveAdmin]
 *   Manual admin check. Wins over `authOptions` metadata. Default depends
 *   on `authOptions`: if it carries CMS metadata, that drives the check;
 *   otherwise `session != null`.
 * @property {(session: *) => string | null} [deriveUserSub]
 *   Default: `session?.user?.id ?? null`.
 * @property {(slug: string) => void | Promise<void>} [onAfterSave]
 *   Server Action invoked after a successful admin save. Typically
 *   `revalidateCmsSlug` from `@skylab/cms/actions` - import it on the
 *   consumer side and pass it explicitly. The "use server" directive
 *   only survives across package entry boundaries, so importing the
 *   action inside this file (and using it as a default) would strip its
 *   Server Action status during bundling and Next.js would refuse to
 *   pass it to the client provider.
 */

/**
 * @param {CreateCmsPageOptions} options
 * @returns {(props: { slug?: string, children: React.ReactNode }) => Promise<React.ReactElement>}
 */
export function createCmsPage(options) {
  const {
    Provider,
    config,
    getServiceToken,
    authOptions,
    getSession,
    deriveAdmin,
    deriveUserSub = (session) => session?.user?.id ?? null,
    onAfterSave,
  } = options;

  if (!Provider) {
    throw new Error("createCmsPage: `Provider` option is required");
  }
  if (!config) {
    throw new Error("createCmsPage: `config` option is required");
  }

  // Normalize the raw config exactly once at factory build time. Without
  // this, callers passing a plain `{ baseUrl, cdnUrl }` literal end up
  // missing the defaulted fields (notably `globalSlug`), which makes the
  // server-side `getCmsPageBlocks` skip the __global fetch - public
  // visitors then render header/footer placeholders because the client
  // refetch in `useCmsContent` is admin-gated and never runs for them.
  const normalizedConfig = "baseUrl" in config && Object.isFrozen(config)
    ? /** @type {import("../lib/config.js").CmsConfig} */ (config)
    : createCmsConfig(config);

  // Server-only view of the config: the service token may hold secrets and
  // must never reach the client, so it rides on a separate object used only
  // for the SSR fetch below. The `normalizedConfig` passed to <Provider>
  // stays serializable (no functions, no secrets).
  const serverConfig = getServiceToken
    ? { ...normalizedConfig, getServiceToken }
    : normalizedConfig;

  const authMeta = authOptions ? readCmsAuthMeta(authOptions) : null;
  const resolvedGetSession =
    getSession ?? (authOptions ? () => getServerSession(authOptions) : null);
  const resolvedDeriveAdmin =
    deriveAdmin ??
    (authMeta
      ? (session) => isCmsAdmin(session, authMeta)
      : (session) => session != null);

  return async function CmsPage({ slug, children }) {
    const resolvedSlug = slug ?? (await resolveSlugFromHeaders());
    const session = resolvedGetSession ? await resolvedGetSession() : null;

    let initialBlocks = [];
    try {
      initialBlocks = await getCmsPageBlocks(serverConfig, resolvedSlug);
    } catch {
      // Backend offline or page not yet synced - render with empty blocks.
    }

    return (
      <Provider config={normalizedConfig} isAdmin={resolvedDeriveAdmin(session)} userSub={deriveUserSub(session)}
        initialBlocks={initialBlocks} onAfterSave={onAfterSave} session={session}
      >
        {children}
      </Provider>
    );
  };
}

/**
 * Read the request pathname out of the `x-pathname` header that the
 * consumer's middleware populates. `await` covers both Next 14 (sync
 * `headers()`) and Next 15 (async `headers()`).
 *
 * In development, surface a clear warning when the header is missing so
 * the consumer doesn't spend hours wondering why every page resolves to
 * `/`. In production, fall back silently to `/`.
 *
 * @returns {Promise<string>}
 */
async function resolveSlugFromHeaders() {
  const h = await headers();
  const pathname = h.get(PATHNAME_HEADER);
  if (pathname) return pathname;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[skylab-cms] <CmsPage> rendered without a slug prop and no "${PATHNAME_HEADER}" ` +
        "request header was found. Add middleware that copies the pathname into the " +
        "request headers, or pass slug={...} explicitly. Falling back to \"/\".",
    );
  }
  return "/";
}