# inscribed

[![npm version](https://img.shields.io/npm/v/inscribed.svg)](https://www.npmjs.com/package/inscribed)
[![license](https://img.shields.io/npm/l/inscribed.svg)](./LICENSE)

**Inline-editing CMS SDK for Next.js App Router.**

inscribed lets you mark up regions of your existing React tree as editable, then edit
them in place from an admin drawer allowing no separate CMS dashboard and no content
modelling ceremony. The content you author in JSX _is_ the schema. A discovery
step walks your `app/` directory, registers every editable region with your
backend, and the same components render live content for visitors and an
inline editor for admins.

The core is **backend-agnostic**. Everything that talks to a server goes through
a small `CmsTransport` contract; a REST adapter ships as the default, but you can
point inscribed at any backend (your own API, Strapi, Sanity, a database, a mock) by
implementing that interface. See [Bring your own backend](#bring-your-own-backend).

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
  - [Authoring & discovery](#authoring--discovery)
  - [Blocks & block types](#blocks--block-types)
  - [Groups](#groups)
  - [Lists](#lists)
  - [Collections](#collections)
  - [Editing & drafts](#editing--drafts)
  - [Access control](#access-control)
  - [Caching & revalidation](#caching--revalidation)
- [Architecture: the seams](#architecture-the-seams)
- [Bring your own backend](#bring-your-own-backend)
- [Package entry points](#package-entry-points)
- [CLI: `cms-sync`](#cli-cms-sync)
- [TypeScript](#typescript)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Inline editing.** Visitors see content; admins see the same page with a
  click-to-edit overlay and a side drawer. No context switch to a dashboard.
- **JSX-first content model.** Declare editable regions with `<EditableRegion>`,
  `<EditableList>`, `<CmsGroup>`. The structure of your components is the
  content schema.
- **Static discovery.** A CLI (`cms-sync`) AST-scans your `app/` directory and
  registers a manifest of every region with your backend. It is idempotent, fits in a
  `predev` / `prebuild` hook.
- **Rich content types.** Text, RichText (Tiptap), Image, Link, Date, repeatable
  Lists, and read-only Collection bindings.
- **App Router native.** Server Components fetch content (ISR-cacheable),
  Client Components edit it, Server Actions revalidate it. SSR-seeded, no
  layout-shift flicker.
- **Draft autosave.** Edits debounce to a draft endpoint as you type; publish is
  an explicit save.
- **Backend-agnostic core.** A single `CmsTransport` seam isolates all data
  access. A REST adapter is the default; swap it for any backend.
- **Auth-agnostic core.** Session, admin detection, and access tokens are
  injected callbacks. The core ships a public read-only default and depends on no
  auth library.

## Requirements

inscribed is a peer of your app's framework runtime:

| Peer dependency | Supported range  |
| --------------- | ---------------- |
| `next`          | `^14.0 \|\| ^15.0` |
| `react`         | `^18.0 \|\| ^19.0` |
| `react-dom`     | `^18.0 \|\| ^19.0` |

Node 18+ for the `cms-sync` CLI. The package is ESM-only.

## Installation

```bash
npm install inscribed
```

## Quick start

The minimal path is a **public, read-only** site: content renders for everyone,
editing is wired separately once auth is in place (see
[Editing & drafts](#editing--drafts)).

### 1. Create a config

`createCmsConfig` returns a plain, serializable object and it is safe to pass across
the Server → Client boundary.

```js
// app/lib/cms-config.js
import { createCmsConfig } from "inscribed";

export const cmsConfig = createCmsConfig({
  baseUrl: process.env.CMS_URL,        // backend root, no trailing slash
  cdnUrl: process.env.CMS_CDN_URL,     // optional: image-upload root
  clientId: process.env.CMS_CLIENT_ID, // optional: X-CMS-Client-Id header
  // globalSlug: "__global",           // optional: slug for site-wide blocks
});
```

### 2. Add the pathname middleware

`createCmsPage` resolves the current page slug from an `x-pathname` request
header so you can wrap your root layout once and let every static page inherit
it. Populate the header with a tiny middleware:

```js
// middleware.js
import { NextResponse } from "next/server";

export function middleware(req) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
```

### 3. Build a page factory

`createCmsPage` centralises the per-page boilerplate: it fetches the page's
blocks server-side, resolves the session, and renders your provider.

```jsx
// app/lib/cms.jsx
import { createCmsPage } from "inscribed/page";
import { CmsProvider } from "inscribed";

import { cmsConfig } from "./cms-config.js";

export const CmsPage = createCmsPage({
  config: cmsConfig,
  Provider: CmsProvider,
  // Public read-only by default. Add getSession / deriveAdmin / onAfterSave
  // and a getServiceToken provider to enable editing - see "Editing & drafts".
});
```

### 4. Wrap the layout and author content

```jsx
// app/page.jsx  (a Server Component)
import { CmsPage } from "./lib/cms.jsx";
import { EditableRegion } from "inscribed";

export default function Home() {
  return (
    <CmsPage slug="/">
      <main>
        <EditableRegion
          blockPath="hero.title"
          as="h1"
          blockType="Text"
          defaultValue="Welcome"
        />
        <EditableRegion
          blockPath="hero.body"
          as="p"
          blockType="RichText"
          defaultValue="<p>Edit me.</p>"
        />
      </main>
    </CmsPage>
  );
}
```

`blockType` and `defaultValue` are **discovery-time metadata** read by the sync
CLI, ignored at runtime. They tell inscribed what kind of editor to show and what to
seed the database row with.

### 5. Register the manifest

Run the discovery + sync once so the backend knows about your regions. Wire it
into your scripts so it stays in sync with the code:

```jsonc
// package.json
{
  "scripts": {
    "predev": "cms-sync",
    "prebuild": "cms-sync"
  }
}
```

That's the full read path: visitors get server-rendered, ISR-cacheable content.
Editing is the same components plus an auth adapter covered next.

---

## Core concepts

### Authoring & discovery

inscribed has no schema file. You declare editable regions inline in your JSX and a
static discovery step turns those declarations into a backend manifest.

- **Declare** regions with `<EditableRegion>` / `<EditableList>` (and read-only
  bindings with `<CollectionRegion>` / `<CollectionItem>`). Each carries
  `blockType` + `defaultValue` literals.
- **Discover** by running `cms-sync`. It AST-scans `app/`, applies `<CmsGroup>`
  prefixes, collects `scope="global"` regions under the global slug, and builds
  one manifest per page slug.
- **Sync** pushes each manifest to the backend (idempotent). New regions get a
  row seeded from `defaultValue`; removed regions are pruned.

Because discovery reads the JSX statically, `blockType` and `defaultValue` must
be **plain literals**, the scanner can't evaluate variables or imports.

You can also register a read-only block that has no `<EditableRegion>` on the
page by passing discovery metadata to `useCmsBlock(path, { blockType, defaultValue })`.

### Blocks & block types

A **block** is a single editable value addressed by a dot-notation `blockPath`
(e.g. `hero.title`). The value shape depends on its `blockType`:

| `blockType` | Value shape | Editor |
| ----------- | ----------- | ------ |
| `Text`      | `string` | plain text |
| `RichText`  | HTML `string` (sanitised) | Tiptap |
| `Image`     | `{ src, alt }` | upload + alt |
| `Link`      | `{ href, label }` | URL + label |
| `Date`      | ISO 8601 `string` | date picker / countdown |
| `List`      | array of objects shaped by `itemSchema` | repeatable items |
| `Collection`| `{ collection, slug? }` binding (read-only) | n/a (see [Collections](#collections)) |

For full control over rendering, read a block directly from a Client Component
with `useCmsBlock(blockPath)`, it returns the raw `value`, `version`, and an
`update()` callback.

### Groups

`<CmsGroup name="hero">` prefixes the `blockPath` of every descendant region.
A `<EditableRegion blockPath="title">` inside it reads/writes `hero.title`.
Groups nest (dot-joined), and discovery applies the exact same prefix so you
never repeat the group name in each path. In admin mode the group also draws a
labelled outline so editors can see section boundaries.

`<CmsGroup>` also accepts `visible` / `editable` to lock or hide a whole section
in one place; the mode cascades to every descendant. See
[Access control](#access-control).

### Lists

`<EditableList>` renders a `List`-typed block as repeatable items via a
render-prop. You provide an `itemSchema` describing each item's fields; admins
get add / remove / reorder controls and the whole list saves atomically as one
version. It accepts the same `visible` / `editable` gates as `<EditableRegion>`
(see [Access control](#access-control)) read-only drops the add/move/delete
affordances and locks the drawer card.

```jsx
"use client";
import { EditableList } from "inscribed";

export function Team() {
  return (
    <EditableList
      blockPath="team.members"
      itemSchema={{
        name:  { blockType: "Text",  defaultValue: "" },
        photo: { blockType: "Image", defaultValue: { src: "", alt: "" } },
      }}
    >
      {(item, i) => (
        <article key={i}>
          <img src={item.photo.src} alt={item.photo.alt} />
          <h3>{item.name}</h3>
        </article>
      )}
    </EditableList>
  );
}
```

> `<EditableList>` (and the Collection components below) use a render-prop,
> a function child, so they must live in a `"use client"` component. Wrap the
> usage and import that wrapper into your server page.

### Collections

Collections are a separate, read-only namespace for structured data that lives
outside the page (e.g. all News articles, all Teams). The page **binds** to a
collection and renders its items; editing happens in that collection's own admin
surface, not inline.

- `<CollectionRegion collection="News" filter={...} limit={...}>` to render a list.
- `<CollectionItem collection="News" slug="q1-notes">` to render one item.

Both take a render-prop receiving the resolved items plus `{ isLoading, error,
refetch, ... }`. Items are fetched at render time and cached under
`cms-collection-{key}`, independent of the page slug. The hooks `useCollection`
and `useCollectionItem` expose the same data directly.

### Editing & drafts

Editing turns on when the provider knows the visitor is an admin and how to get
their access token. Two pieces:

1. **Server side:** give `createCmsPage` an auth adapter so it can resolve the
   session and decide `isAdmin`:

   ```jsx
   export const CmsPage = createCmsPage({
     config: cmsConfig,
     Provider: AdminCmsProvider,            // your wrapper, see below
     getServiceToken,                        // server-only read token (optional)
     getSession: () => auth(),               // your session resolver
     deriveAdmin: (session) => Boolean(session?.user?.isAdmin),
     onAfterSave: revalidateCmsSlug,         // from "inscribed/actions"
   });
   ```

2. **Client side:** `CmsProvider` needs `getAccessToken` to attach a Bearer
   token to write requests. Since that's a client concern, wrap `CmsProvider` in
   a thin `"use client"` component that supplies it from your session:

   ```jsx
   "use client";
   import { CmsProvider } from "inscribed";
   import { useSession } from "your-auth-lib/react";

   export function AdminCmsProvider(props) {
     const { getToken } = useSession();
     return <CmsProvider {...props} getAccessToken={getToken} />;
   }
   ```

Once enabled, admins get the inline overlay and a side drawer. Edits **autosave
as drafts** (debounced ~1s to the draft endpoint) while a live preview overlays
the page; **publishing** is an explicit save in the drawer. Discarding clears the
server draft. inscribed itself depends on **no auth library**; these are all
injected callbacks, with a public read-only default.

### Access control

By default every `<EditableRegion>` / `<EditableList>` is editable by anyone whose
session satisfies `isAdmin`. Two props let you narrow that per block, without
touching the provider or the auth layer. They gate **both** the inline page
overlay and the block's card in the admin drawer:

| Prop | Type | Default | Behaviour |
| ---- | ---- | ------- | --------- |
| `editable` | `boolean` | `true` | When `false`, the block is **read-only**: no inline overlay on the page, and its drawer card stays visible but locked (every field disabled, with a lock badge). |
| `visible` | `boolean` | `true` | When `false`, the block is **removed from the admin drawer entirely** (no card, no count) and renders read-only on the page. Takes precedence over `editable`. |

These are **runtime-only** gates discovery still syncs the block and seeds its
row, so the content renders normally for every visitor; only the *editing*
surface is affected. `visible={false}` is the stronger of the two: a block the
admin panel can't see is never editable either.

The props carry no role logic themselves. Compute the boolean however your app
resolves roles and pass it in:

```jsx
// Derive canEdit from your auth context / session
const canEdit = userRoles.includes("CONTENT_EDITOR");

<EditableRegion
  blockPath="hero.title"
  blockType="Text"
  defaultValue="Welcome"
  as="h1"
  editable={canEdit}
/>
```

**Section-level gating.** Set the same props on a `<CmsGroup>` to gate every
descendant region and list at once. The mode cascades down (nested groups
included); precedence is **most restrictive wins** (`hidden` > `readonly` >
normal), so a child can *tighten* the section's mode but not loosen it:

```jsx
<CmsGroup name="hero" editable={false}>
  {/* whole section read-only in the drawer */}
  <EditableRegion blockPath="title" blockType="Text" defaultValue="Welcome" as="h1" />
  {/* a child can go further and hide itself, but can't re-enable editing */}
  <EditableRegion blockPath="badge" blockType="Text" defaultValue="New" visible={false} />
</CmsGroup>
```

### Caching & revalidation

Server reads (`getCmsPageBlocks`) are ISR-cacheable and tagged `cms-{slug}`.
After an admin publishes, call `revalidateCmsSlug(slug)` (a Server Action from
`inscribed/actions`); pass it as `onAfterSave` and stale visitor content is dropped
on the next request. The global slug (header/footer/site-wide blocks) is fetched
in parallel and merged into the same blocks map, so a shared block edited on any
page reflects everywhere.

---

## Architecture: the seams

inscribed's core knows nothing about your backend or auth provider. Three injection
seams keep it vendor-neutral; each has a default in `src/defaults/` so the
zero-config path still works.

| Seam | Contract | Default | What it abstracts |
| ---- | -------- | ------- | ----------------- |
| **Transport** | `CmsTransport` | REST adapter (`/cms/*`) | _how_ to talk to the backend |
| **Service token** | `getServiceToken()` | none (unauthenticated reads) | server-side read credentials |
| **Auth adapter** | `getSession` / `deriveAdmin` / `deriveUserSub` | public, read-only | who the visitor is |

A guiding constraint: **functions can't cross the React Server → Client
boundary.** That's why `createCmsConfig` returns only serializable data and the
transport is resolved at the *use site* on each side (the client provider builds
it; server helpers default it). Inject a custom transport separately on the
server (at the call site) and client (the `transport` prop); a single transport
object can't be shared across the boundary.

The token/auth seam is orthogonal to transport: the transport attaches whatever
`accessToken` it is handed to the request header; it never mints tokens itself.

## Bring your own backend

To target a backend other than the reference REST API, implement the
`CmsTransport` contract. The core only ever calls these methods:

```js
/**
 * @typedef {Object} CmsTransport
 * @property {(slug, opts?) => Promise<ContentResponse>}                              getContent
 * @property {(key, params?, opts?) => Promise<PagedListResponse>}                    getCollection
 * @property {(key, slug, opts?) => Promise<CollectionItemResponse>}                  getCollectionItem
 * @property {(opts?) => Promise<MyCollectionResponse[]>}                             getMyCollections
 * @property {(request, opts?) => Promise<UpdatePageResponse>}                        updateContent
 * @property {(request, opts?) => Promise<void>}                                      updateDraft
 * @property {(key, slug, payload, opts?) => Promise<CollectionItemResponse>}         upsertCollectionItem
 * @property {(key, payload, opts?) => Promise<CollectionItemResponse>}               createCollectionItem
 * @property {(key, slug, payload, opts?) => Promise<void>}                           saveCollectionItemDraft
 * @property {(key, payload, opts?) => Promise<void>}                                 saveCollectionNewDraft
 * @property {(file, opts?) => Promise<{ data: { url: string } }>}                    uploadImage
 * @property {(request, opts?) => Promise<SyncResultResponse>}                        syncManifest
 */
```

Every method receives an options object: `{ accessToken?, cache?, signal? }`.
Attach `accessToken` to your request as a Bearer (or however your backend
expects); **don't** generate it. `cache` is an opaque hint (`{ revalidate, tags }`);
the REST default maps it onto Next.js' `fetch(..., { next })` extension.

```js
// my-transport.js
/** @returns {import("inscribed").CmsTransport} */
export function createMyTransport({ baseUrl }) {
  const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

  return {
    async getContent(slug, opts = {}) {
      const res = await fetch(`${baseUrl}/pages?slug=${slug}`, {
        headers: { ...auth(opts.accessToken) },
      });
      if (!res.ok) throw new Error(`getContent ${res.status}`);
      return res.json(); // must match the ContentResponse shape
    },
    // ...the remaining methods
  };
}
```

Inject it on **both** sides:

```jsx
// client: pass to your provider
<CmsProvider config={cmsConfig} transport={createMyTransport({ baseUrl })}>
  {children}
</CmsProvider>
```

```js
// server: pass at the call site (server-only objects can carry functions)
import { getCmsPageBlocks } from "inscribed/server";

const transport = createMyTransport({ baseUrl });
const blocks = await getCmsPageBlocks({ ...cmsConfig, transport }, slug);
```

`createCmsPage` also accepts a `transport` option for its server-side SSR fetch.

> **Note:** the `cms-sync` CLI and `syncAll` currently target the REST
> `POST /cms/sync` shape. A fully custom backend can implement `syncManifest`
> and call `syncCmsManifest(config, manifest)` from its own pipeline.

## Package entry points

inscribed ships several entry points so server-only code never leaks into the client
bundle:

| Import | Side | Highlights |
| ------ | ---- | ---------- |
| `inscribed` | client | `CmsProvider`, `EditableRegion`, `EditableList`, `CmsGroup`, `CollectionRegion`, `CollectionItem`, `useCmsContent`, `useCmsBlock`, `useCmsAdmin`, `useCollection`, `useCollectionItem`, `useCountdown`, `createCmsConfig`, `CmsApiError`, block helpers (`getBlock`, `getBlockValue`, `groupBlocksByPrefix`, `indexBlocksByPath`) |
| `inscribed/server` | server only | `getCmsContent`, `getCmsPageBlocks`, `syncCmsManifest`, `syncAll`, `cmsCacheTag` |
| `inscribed/page` | server only | `createCmsPage` |
| `inscribed/actions` | Server Action | `revalidateCmsSlug` |

Import `inscribed/server` and `inscribed/page` only from Server Components, route
handlers, or build scripts, never from a Client Component.

## CLI: `cms-sync`

Discovers `<EditableRegion>` (and `useCmsBlock` metadata) declarations under
`app/` and pushes the manifest to the backend.

```
cms-sync [options]

Options:
  --app-root <path>     Directory to scan (default: ./app)
  --env <path>          dotenv file to preload (default: ./.env.local)
  --global-slug <name>  Slug for scope="global" blocks (default: __global)
  --dry-run             Print the discovered manifest as JSON without syncing
  --help, -h            Show help

Environment:
  CMS_URL               Backend base URL (default: http://localhost:5000)
```

The service token for `POST /cms/sync` (and optional failure diagnostics) comes
from an optional `cms.config.js` in the project root; the CLI is a plain Node
binary, so it loads that module rather than receiving props:

```js
// cms.config.js
export const getServiceToken = async () => "...";  // default: no token
export const onSyncError = (err) => { /* ... */ };  // optional
```

## TypeScript

inscribed is written in JavaScript with JSDoc and ships generated `.d.ts`
declarations for every entry point, so you get full type information and editor
autocomplete with no extra setup. Public types such as `CmsTransport`,
`CmsConfig`, and `BlockType` are importable:

```ts
import type { CmsTransport } from "inscribed";
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev
setup, build/test workflow, the seam architecture, and commit conventions.

## License

[LGPL-3.0-or-later](./LICENSE) © Fatih Naz
