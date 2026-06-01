# Contributing to inkly

Thanks for your interest in contributing. This guide covers the development
setup, the build and test workflow, the architecture you'll be working within,
and the conventions we follow. Please read it before opening a pull request.

## Table of contents

- [Philosophy](#philosophy)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Project layout](#project-layout)
- [Build](#build)
- [Type declarations](#type-declarations)
- [Testing](#testing)
- [Code style & conventions](#code-style--conventions)
- [Working with the seams](#working-with-the-seams)
- [Common tasks](#common-tasks)
- [Commit conventions](#commit-conventions)
- [Pull requests](#pull-requests)
- [Releasing](#releasing)
- [License of contributions](#license-of-contributions)

## Philosophy

A few principles shape almost every decision in this codebase. Keep them in mind
and most "where should this go?" questions answer themselves.

- **Vendor-neutral core.** The core depends on no backend and no auth library.
  Anything backend- or auth-specific goes behind an injection seam with a default
  in `src/defaults/`. If you find yourself importing a vendor SDK into `src/lib/`
  or `src/components/`, stop — it belongs behind a seam.
- **The RSC boundary is sacred.** Functions can't be serialized across the React
  Server → Client boundary. Config objects that cross it (props) must stay
  serializable; anything holding functions (transport, service token) is resolved
  at the use site on each side. Breaking this throws
  _"Functions cannot be passed directly to Client Components"_ at runtime.
- **Server-only vs client-only is explicit.** Client code lives behind the
  `inkly` entry's `"use client"` boundary; server code lives under
  `inkly/server` and `inkly/page`. Never import server modules from client code.
- **JavaScript + JSDoc, not TypeScript source.** We author `.js`/`.jsx` with JSDoc
  type annotations and emit `.d.ts` from them. There is no `.ts` source.

## Prerequisites

- **Node.js 18+**
- **npm** (the repo uses `package-lock.json`)

The package is ESM-only (`"type": "module"`).

## Getting started

```bash
git clone https://github.com/fatiihnaz/inkly.git
cd inkly
npm install
npm run build    # produce dist/
npm test         # run the unit suite
```

To iterate against a real app, use `npm run dev` (tsup in watch mode) and link the
package into a consuming Next.js project (`npm link`, a workspace, or a local
`file:` dependency).

## Project layout

```
src/
  index.js              # `inkly` — client entry ("use client" lives here)
  components/           # React components (EditableRegion, drawer UI, ...)
  hooks/                # client hooks (useCmsContent, useCollection, ...)
  lib/                  # framework-agnostic logic + JSDoc typedefs
    config.js           #   createCmsConfig (serializable config)
    transport.js        #   CmsTransport contract (typedef only)
    service-token.js    #   ServiceTokenProvider contract
    auth.js             #   CmsAuthAdapter contract
    schemas.js          #   backend request/response typedefs
    store.js            #   external store (per-slice subscriptions)
  defaults/             # default seam implementations
    transport.js        #   createRestTransport (the /cms/* REST adapter)
    service-token.js    #   noServiceToken
    auth.js             #   publicAuth (read-only)
  server/               # SERVER ONLY
    get-content.js      #   `inkly/server` entry
    actions.js          #   `inkly/actions` entry ("use server")
    cms-page.jsx        #   `inkly/page` entry (createCmsPage)
    discover.js         #   AST manifest discovery
  cli/
    sync.js             #   `cms-sync` binary
  tests/                # Vitest specs + discovery fixtures & snapshots
```

Tests live under `src/tests/` as `*.test.js` (fixtures in `src/tests/__fixtures__/`).

## Build

The build is [tsup](https://tsup.egoist.dev/) (esbuild). Entry points are defined
in `tsup.config.js` and mirror the `exports` map in `package.json`:

| Entry | Source | Published as |
| ----- | ------ | ------------ |
| `index`    | `src/index.js`            | `inkly` |
| `server`   | `src/server/get-content.js` | `inkly/server` |
| `actions`  | `src/server/actions.js`   | `inkly/actions` |
| `page`     | `src/server/cms-page.jsx` | `inkly/page` |
| `cli-sync` | `src/cli/sync.js`         | `cms-sync` bin |

```bash
npm run build      # one-off build → dist/
npm run dev        # watch mode
```

### Directive caveats (important)

tsup/esbuild **drops inner-file `"use client"` / `"use server"` directives** when
bundling — only the **entry file's top-level directive survives**. Consequences:

- `src/index.js` must keep its top-level `"use client"`. Every transitive `.jsx`
  it bundles becomes part of one Client Component bundle.
- `src/server/actions.js` must keep its top-level `"use server"` so Next.js treats
  each export as a Server Action.
- A directive only survives across a **package entry boundary**. This is why, for
  example, `createCmsPage` takes `Provider` and `onAfterSave` as options instead
  of importing them — importing a `"use client"` provider or `"use server"` action
  into the server entry would strip its directive during bundling.

`react`, `react-dom`, `next`, and the native `oxc-parser` are marked
`external` so they aren't bundled (tsup can't bundle the platform binary; it's
resolved from the consumer's `node_modules` at runtime).

## Type declarations

`.d.ts` files are generated from JSDoc by tsup (`dts: true`), configured via
`tsconfig.json` (`allowJs`, `declaration`, `emitDeclarationOnly`). There is no
hand-written TypeScript.

- Annotate public API with accurate JSDoc — it _is_ the published type surface.
- Use `@typedef`, `@param`, `@returns`, and `@import { X } from "..."` for shared
  shapes. `src/lib/schemas.js` holds the backend request/response typedefs;
  reference them rather than redefining shapes inline.
- `checkJs` is currently off, but write JSDoc as if it were on — incorrect
  annotations ship as incorrect types.

## Testing

Tests run on [Vitest](https://vitest.dev/) in a Node environment (no DOM yet —
the current suite covers pure logic and the transport contract).

```bash
npm test           # run once
npm run test:watch # watch mode
```

- Place tests under `src/tests/` as `*.test.js`.
- Keep tests in the Node environment unless you're testing a component/hook, in
  which case add an `environment: "jsdom"` override for that file.
- Cover new `lib/` logic and any new `CmsTransport` method against the contract.

## Code style & conventions

- **Match the surrounding code.** Mirror existing naming, comment density, and
  idioms in the file you're editing.
- **Comments explain _why_, not _what_.** The codebase favours substantial
  comments on non-obvious decisions (the RSC boundary, cache invalidation, store
  subscriptions). Preserve and extend that style; don't strip context.
- **Server/client hygiene.** Never import `inkly/server`, `inkly/page`, or any
  `src/server/**` module from client code, and vice versa. Keep browser-only
  types out of `src/lib/config.js` (it's read on both sides).
- **No functions across the RSC boundary.** Anything that becomes a prop on a
  Client Component must be serializable. Resolve function-bearing seams at the use
  site.
- **Discovery metadata must be static literals.** `blockType`, `defaultValue`,
  and `itemSchema` are read by the AST scanner — it can't evaluate variables or
  imports.

## Working with the seams

Three injection seams keep the core vendor-neutral. Each is a contract in
`src/lib/` with a default in `src/defaults/`:

| Seam | Contract (`src/lib/`) | Default (`src/defaults/`) |
| ---- | --------------------- | ------------------------- |
| Transport | `transport.js` (`CmsTransport`) | `transport.js` (`createRestTransport`) |
| Service token | `service-token.js` | `service-token.js` (`noServiceToken`) |
| Auth adapter | `auth.js` (`CmsAuthAdapter`) | `auth.js` (`publicAuth`) |

When you add a feature that needs to talk to a backend, route it through the
transport — don't `fetch` directly from a component or hook. The REST adapter in
`defaults/transport.js` is the **only** place that knows concrete endpoint shapes,
headers (`X-CMS-Client-Id`), and `CmsApiError` mapping.

## Common tasks

### Add a `CmsTransport` method

1. Add the method signature to the `CmsTransport` typedef in `src/lib/transport.js`.
2. Implement it in `src/defaults/transport.js` (the REST adapter).
3. Call it from the relevant hook/component/server helper via `config.transport`.
4. Add a contract test in `src/tests/transport.test.js`.

Keep the method's options shape consistent: `(…, opts?)` where `opts` is
`{ accessToken?, cache?, signal? }`.

### Add a block type

1. Extend the `BlockType` union and document its value shape in
   `src/lib/schemas.js`.
2. Teach `<EditableRegion>` (and discovery in `src/server/discover.js`) to render
   and recognise it.
3. Add the editor UI in the admin drawer components.

## Commit conventions

We use **[Conventional Commits](https://www.conventionalcommits.org/)** with small,
atomic commits — one logical change per commit, with a clean message.

```
<type>: <imperative summary>

feat:     a new capability
fix:      a bug fix
refactor: behaviour-preserving change
docs:     documentation only
test:     tests only
chore:    tooling / housekeeping
```

**Breaking changes (pre-1.0):** the project is `0.x` and may break compatibility
between minor versions. When a change is breaking, add a `BREAKING CHANGE:` footer
describing the break and the migration:

```
feat: rename CmsTransport.fetchPage to getContent

BREAKING CHANGE: custom transports must rename `fetchPage` to `getContent`.
```

Prefer several focused commits over one large mixed commit. Don't bundle a refactor
with a feature.

## Pull requests

1. Branch off `main`.
2. Keep the PR focused; split unrelated changes.
3. Ensure `npm run build` and `npm test` both pass.
4. Update JSDoc/types and the README when you change public API.
5. Describe the change and call out any breaking change explicitly.

## Releasing

`prepublishOnly` runs the build, and only `dist`, `LICENSE`, and `COPYING` are
published (see `files` in `package.json`). Releases bump the version per semver
(pre-1.0: breaking changes may land in minor bumps — see commit conventions).

## License of contributions

By contributing, you agree that your contributions are licensed under the
project's [LGPL-3.0-or-later](./LICENSE) license.
