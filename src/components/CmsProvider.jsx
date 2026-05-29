"use client";

/**
 * @file Top-level provider that owns CMS context state.
 *
 * Mount once near the root (e.g. in `app/layout.jsx`). Holds the blocks
 * map, active-block selection, and the refetch token. Admin-only UI
 * (the drawer) is lazy-loaded so public visitors don't pay for it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { CmsContext } from "../lib/context.js";
import { createCmsConfig } from "../lib/config.js";
import { indexBlocksByPath } from "../lib/blocks.js";
import { updateDraft, fetchMyCollections, fetchCollectionItem, fetchCollection } from "../lib/api-client.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { useCmsContent } from "../hooks/use-cms-content.js";

/**
 * @import { CmsConfig } from "../lib/config.js"
 * @import { BlockResponse, ItemSchema } from "../lib/schemas.js"
 */

const AdminDrawer = dynamic(
  () => import("./AdminDrawer.jsx").then((m) => m.AdminDrawer),
  { ssr: false },
);

/**
 * @param {Object} props
 * @param {CmsConfig | { baseUrl: string, clientId?: string }} props.config
 * @param {string|null} [props.userSub]
 * @param {boolean} [props.isAdmin]
 * @param {BlockResponse[]} [props.initialBlocks]   Server-fetched blocks for the active page; eliminates the SSR fallback flicker by seeding the blocks map before first paint.
 * @param {(slug: string) => void | Promise<void>} [props.onAfterSave]   Server Action invoked after a successful save (typically calls `revalidateTag(cmsCacheTag(slug))` to drop stale ISR data).
 * @param {() => Promise<string>} [props.getAccessToken]   Returns the current user's JWT access token; added as `Authorization: Bearer {token}` on write requests. Omit in public/demo mode.
 * @param {{ name: string|null, email: string|null, image: string|null } | null} [props.userInfo]   Identity for the admin panel footer. Null in public/demo mode.
 * @param {() => void} [props.onSignOut]   Invoked by the admin panel's logout button.
 * @param {React.ReactNode} props.children
 */
export function CmsProvider({
  config,
  userSub = null,
  isAdmin = false,
  initialBlocks,
  onAfterSave,
  getAccessToken,
  userInfo = null,
  onSignOut,
  children,
}) {
  // Accept either a raw `{ baseUrl }` shape or a pre-built CmsConfig.
  const normalizedConfig = useMemo(
    () => "baseUrl" in config && Object.isFrozen(config) ? /** @type {CmsConfig} */ (config) : createCmsConfig(config),
    [config],
  );

  // Seed the blocks map from `initialBlocks` so EditableRegion has real
  // values to render during SSR and on first client paint. Subsequent
  // updates flow through `useCmsContent` (refetch on mount) and saves.
  const [blocks, setBlocksState] = useState(
    /** @returns {Map<string, BlockResponse>} */
    () => indexBlocksByPath(initialBlocks ?? []),
  );
  const [activeBlock, setActiveBlock] = useState(
    /** @type {string|null} */ (null),
  );
  // Drawer-side "open this row" signal for collection region tabs. Mirrors
  // `activeBlock` but for `<AdminCollectionRegionPanel>`: when the StatusBar's
  // "Aç" jump targets a specific (key, slug), the RegionItemCard reads this
  // and auto-expands itself on next render. Cleared by the card after it
  // honours the signal so subsequent collection-tab visits don't re-open.
  const [activeCollectionItem, setActiveCollectionItem] = useState(
    /** @type {{ key: string, slug: string } | null} */ (null),
  );
  const [refetchToken, setRefetchToken] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Per-blockPath unsaved edits. Lives here (rather than in AdminDrawer) so
  // EditableRegion can read live draft values for inline preview while the
  // user types. Cleared on save / discard / navigation.
  const [drafts, setDraftsState] = useState(
    /** @returns {Map<string, *>} */ (() => new Map()),
  );

  // Registry of <EditableList> itemSchemas so the AdminDrawer can render
  // List editors. Lives in a ref + a forced rerender counter rather than
  // setState - register/unregister fires inside child useEffects, which
  // would otherwise schedule a parent setState mid-commit and warn.
  const itemSchemasRef = useRef(/** @type {Map<string, ItemSchema>} */ (new Map()));
  const [itemSchemasVersion, setItemSchemasVersion] = useState(0);

  const registerItemSchema = useCallback(
    /** @param {string} blockPath @param {ItemSchema} schema */
    (blockPath, schema) => {
      itemSchemasRef.current.set(blockPath, schema);
      setItemSchemasVersion((n) => n + 1);
    },
    [],
  );

  const unregisterItemSchema = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      if (!itemSchemasRef.current.delete(blockPath)) return;
      setItemSchemasVersion((n) => n + 1);
    },
    [],
  );

  // Registry of `<CollectionItem>` / `<CollectionRegion>` bindings.
  // Collections don't live in the manifest (no CMS block namespace), so
  // the drawer learns about them via this runtime registry. State-based
  // (new Map identity on each change) so consumers' useMemo deps
  // recompute naturally when bindings come or go.
  const [collectionBindings, setCollectionBindings] = useState(
    /** @returns {Map<string, { collection: string, slug?: string }>} */
    () => new Map(),
  );

  const registerCollectionBinding = useCallback(
    /**
     * @param {string} blockPath
     * @param {{ collection: string, slug?: string, filter?: Record<string, *>, limit?: number, offset?: number }} binding
     */
    (blockPath, binding) => {
      setCollectionBindings((prev) => {
        const existing = prev.get(blockPath);
        // Compare via stableStringify so consumers passing inline filter
        // objects (`filter={{ featured: true }}`) don't churn the
        // registry every render. The drawer's tab discovery and panel
        // sub-section grouping both depend on stable identity here.
        if (existing && stableStringify(existing) === stableStringify(binding)) {
          return prev;
        }
        const next = new Map(prev);
        next.set(blockPath, binding);
        return next;
      });
    },
    [],
  );

  const unregisterCollectionBinding = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      setCollectionBindings((prev) => {
        if (!prev.has(blockPath)) return prev;
        const next = new Map(prev);
        next.delete(blockPath);
        return next;
      });
    },
    [],
  );

  // /cms/collections/me state - effect fires further down (after
  // `stableGetAccessToken` is declared) so the drawer's per-Collection
  // cards (and future per-Collection tabs) share a single round-trip
  // instead of each mounting its own fetch.
  const [myCollectionsState, setMyCollectionsState] = useState(
    /** @returns {{ data: import("../lib/schemas.js").MyCollectionResponse[], isLoading: boolean, error: Error|null }} */
    () => ({ data: [], isLoading: false, error: null }),
  );
  const [myCollectionsToken, setMyCollectionsToken] = useState(0);
  const refetchMyCollections = useCallback(() => {
    setMyCollectionsToken((n) => n + 1);
  }, []);

  // Shared collection-item cache. Keyed by `"{collectionKey}:{slug}"`.
  // `useCollectionItem` consumers read entries directly; the request /
  // update / invalidate callbacks below mutate the map (new identity
  // each change so consumer useMemo deps recompute).
  const [collectionItemCache, setCollectionItemCache] = useState(
    /** @returns {Map<string, import("../lib/context.js").CollectionItemCacheEntry>} */
    () => new Map(),
  );
  // Mirror of `collectionItemCache` for `requestCollectionItem`'s dedup
  // check. Keeps the callback's `useCallback` deps free of the cache
  // itself - otherwise every cache mutation (every keystroke's draft
  // autosave, every undo, every publish) would recreate the callback,
  // re-trigger every `useCollectionItem` consumer's effect, and churn
  // their `refetch` identity.
  const collectionItemCacheRef = useRef(collectionItemCache);
  useEffect(() => {
    collectionItemCacheRef.current = collectionItemCache;
  }, [collectionItemCache]);
  // In-flight promises - lives in a ref so concurrent `requestCollectionItem`
  // calls dedupe to a single fetch without going through state updates.
  const inFlightCollectionItems = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  // Live-preview overlay for collection editors. Editor pushes the
  // current form payload here on every keystroke (synchronously, before
  // the debounced server-side autosave); page-side hooks read it back
  // through `useCollectionItem` / `useCollection`. Mirrors the `drafts`
  // map for content blocks - cleared on publish, undo, or pathname
  // change so soft-nav doesn't leak stale overlays.
  const [collectionDrafts, setCollectionDraftsState] = useState(
    /** @returns {Map<string, *>} */ (() => new Map()),
  );

  const setCollectionDraft = useCallback(
    /** @param {string} key @param {string} slug @param {*} payload */
    (key, slug, payload) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionDraftsState((prev) => {
        const existing = prev.get(cacheKey);
        if (existing !== undefined && stableStringify(existing) === stableStringify(payload)) {
          return prev;
        }
        const next = new Map(prev);
        next.set(cacheKey, payload);
        return next;
      });
    },
    [],
  );

  const clearCollectionDraft = useCallback(
    /** @param {string} key @param {string} slug */
    (key, slug) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionDraftsState((prev) => {
        if (!prev.has(cacheKey)) return prev;
        const next = new Map(prev);
        next.delete(cacheKey);
        return next;
      });
    },
    [],
  );

  const clearCollectionDrafts = useCallback(() => {
    setCollectionDraftsState((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  // List cache for `useCollection(key)`. Keyed by collection key.
  const [collectionListCache, setCollectionListCache] = useState(
    /** @returns {Map<string, import("../lib/context.js").CollectionListCacheEntry>} */
    () => new Map(),
  );
  // Same ref-mirror pattern as `collectionItemCacheRef`: keep the cache
  // out of `requestCollectionList`'s `useCallback` deps so list-cache
  // churn (e.g. a publish invalidating windows) doesn't recreate the
  // callback and storm every list consumer.
  const collectionListCacheRef = useRef(collectionListCache);
  useEffect(() => {
    collectionListCacheRef.current = collectionListCache;
  }, [collectionListCache]);
  const inFlightCollectionLists = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  const updateCollectionItem = useCallback(
    /** @param {string} key @param {string} slug @param {import("../lib/schemas.js").CollectionItemResponse} item */
    (key, slug, item) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionItemCache((prev) => {
        const next = new Map(prev);
        next.set(cacheKey, { item, isLoading: false, error: null });
        return next;
      });
      // List cache invalidation across every (filter, offset, limit)
      // window for this collection: a filtered view may have its row
      // set change in ways we can't patch in-place (item entered or
      // left the filter, new total, page boundary shifts). Subscribers
      // re-fetch their specific window on next render.
      const listPrefix = `${key}|`;
      setCollectionListCache((prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const k of prev.keys()) {
          if (k.startsWith(listPrefix)) {
            next.delete(k);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
    },
    [],
  );

  // Optimistic in-place patch: replaces the cached item AND the matching
  // row inside every list-cache window for this collection, without
  // invalidating those windows. Use for draft autosave / undo where the
  // filter membership doesn't change (filters apply to published `data`,
  // not `draftData`), so a refetch storm on every keystroke is wasteful
  // and racy - the list refetch would re-seed the item cache from the
  // server's not-yet-cleaned-up state, fighting our optimistic update.
  const patchCollectionItem = useCallback(
    /** @param {string} key @param {string} slug @param {import("../lib/schemas.js").CollectionItemResponse} item */
    (key, slug, item) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionItemCache((prev) => {
        const next = new Map(prev);
        next.set(cacheKey, { item, isLoading: false, error: null });
        return next;
      });
      const listPrefix = `${key}|`;
      setCollectionListCache((prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const [k, entry] of prev.entries()) {
          if (!k.startsWith(listPrefix)) continue;
          const idx = entry.items.findIndex((r) => r.slug === slug);
          if (idx < 0) continue;
          const items = entry.items.slice();
          items[idx] = item;
          next.set(k, { ...entry, items });
          mutated = true;
        }
        return mutated ? next : prev;
      });
    },
    [],
  );

  const invalidateCollectionItem = useCallback(
    /** @param {string} key @param {string} slug */
    (key, slug) => {
      const cacheKey = `${key}:${slug}`;
      setCollectionItemCache((prev) => {
        if (!prev.has(cacheKey)) return prev;
        const next = new Map(prev);
        next.delete(cacheKey);
        return next;
      });
    },
    [],
  );

  const invalidateCollectionList = useCallback(
    /**
     * @param {string} key
     * @param {import("../lib/schemas.js").CollectionListParams} [params]
     */
    (key, params) => {
      setCollectionListCache((prev) => {
        if (params) {
          const cacheKey = `${key}|${stableStringify(params)}`;
          if (!prev.has(cacheKey)) return prev;
          const next = new Map(prev);
          next.delete(cacheKey);
          return next;
        }
        // No params: drop every window for this collection.
        const prefix = `${key}|`;
        let mutated = false;
        const next = new Map(prev);
        for (const k of prev.keys()) {
          if (k.startsWith(prefix)) {
            next.delete(k);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
    },
    [],
  );

  // Sync the blocks map when `initialBlocks` arrives with new content (e.g.
  // when client-side navigation triggers a server re-render of `<CmsPage>`
  // for a new slug). `useState`'s lazy init only runs once on mount, so
  // without this the panel would show stale blocks after navigation.
  const initialBlocksRef = useRef(initialBlocks);
  useEffect(() => {
    if (initialBlocks === initialBlocksRef.current) return;
    initialBlocksRef.current = initialBlocks;
    setBlocksState(indexBlocksByPath(initialBlocks ?? []));
    setActiveBlock(null);
    setDraftsState(new Map());
  }, [initialBlocks]);

  // Backstop: the root layout's `<CmsPage>` is preserved across client-side
  // navigation, so its `initialBlocks` prop doesn't update on its own when
  // the URL changes. `router.refresh()` forces Next.js to re-render the
  // layout's server components — `getCmsPageBlocks` runs again with the
  // new pathname (via the middleware-set `x-pathname` header), the fresh
  // `initialBlocks` flow back through this provider's prop, and the
  // `initialBlocks` watcher above seeds the blocks map. This works for
  // public visitors too because the server fetch uses the service token,
  // not the user's session — so we don't need a client-side fetch path
  // (which would 401 anonymous traffic).
  const pathname = usePathname();
  const router = useRouter();
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;
    setActiveBlock(null);
    setDraftsState(new Map());
    setCollectionDraftsState(new Map());
    router.refresh();
  }, [pathname, router]);

  // Drop drafts for blocks that no longer exist (e.g. after a manifest sync
  // that removed the block). Pathname-change drafts are already cleared by
  // the effect above; this catches the manifest-sync case.
  useEffect(() => {
    setDraftsState((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map();
      for (const [path, value] of prev) {
        if (blocks.has(path)) {
          next.set(path, value);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [blocks]);

  // Stash callbacks in refs so changes to the props don't bust the
  // memoised context value (server actions are stable references in
  // practice, but refs guarantee no spurious re-renders).
  const onAfterSaveRef = useRef(onAfterSave ?? null);
  onAfterSaveRef.current = onAfterSave ?? null;

  const getAccessTokenRef = useRef(getAccessToken ?? null);
  getAccessTokenRef.current = getAccessToken ?? null;

  const onSignOutRef = useRef(onSignOut ?? null);
  onSignOutRef.current = onSignOut ?? null;

  const triggerRefetch = useCallback(() => {
    setRefetchToken((n) => n + 1);
  }, []);

  const setDraft = useCallback(
    /** @param {string} blockPath @param {*} value */
    (blockPath, value) => {
      setDraftsState((prev) => {
        const next = new Map(prev);
        next.set(blockPath, value);
        return next;
      });
    },
    [],
  );

  const clearDraft = useCallback(
    /** @param {string} blockPath */
    (blockPath) => {
      setDraftsState((prev) => {
        if (!prev.has(blockPath)) return prev;
        const next = new Map(prev);
        next.delete(blockPath);
        return next;
      });
    },
    [],
  );

  const clearDrafts = useCallback(() => {
    setDraftsState((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const setDrawerOpen = useCallback(
    /** @param {boolean} open */
    (open) => {
      setIsDrawerOpen(open);
      // Closing the panel cancels any in-progress edit so the next time it
      // opens the user lands back on the block list, not on stale draft state.
      if (!open) setActiveBlock(null);
    },
    [],
  );

  // Public-mode visitors should not be able to enter edit state at all.
  const setActiveBlockGuarded = useCallback(
    /** @param {string|null} blockPath */
    (blockPath) => {
      if (!isAdmin) return;
      setActiveBlock(blockPath);
    },
    [isAdmin],
  );

  const stableOnAfterSave = useCallback(
    /** @param {string} slug */
    async (slug) => {
      const fn = onAfterSaveRef.current;
      if (!fn) return;
      await fn(slug);
    },
    [],
  );

  const stableGetAccessToken = useCallback(
    /** @returns {Promise<string>} */
    async () => {
      const fn = getAccessTokenRef.current;
      if (!fn) return "";
      return fn();
    },
    [],
  );

  // Cache-aware collection item fetch. Cache hit -> no-op; in-flight
  // request for the same (key, slug) -> piggyback on the existing
  // promise; otherwise fire fetch and write the result into the cache.
  const requestCollectionItem = useCallback(
    /** @param {string} key @param {string} slug @param {boolean} [force] @returns {Promise<void>} */
    async (key, slug, force = false) => {
      const cacheKey = `${key}:${slug}`;
      const cached = collectionItemCacheRef.current.get(cacheKey);
      if (!force && cached && !cached.error) return;

      const existing = inFlightCollectionItems.current.get(cacheKey);
      if (existing && !force) return existing;

      setCollectionItemCache((prev) => {
        const next = new Map(prev);
        const prior = prev.get(cacheKey);
        next.set(cacheKey, {
          item: prior?.item ?? null,
          isLoading: true,
          error: null,
        });
        return next;
      });

      const promise = (async () => {
        try {
          const token = await stableGetAccessToken();
          const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
          const item = await fetchCollectionItem(normalizedConfig, key, slug, init);
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, { item, isLoading: false, error: null });
            return next;
          });
        } catch (err) {
          // 404 is normal control-flow for single-item reads; skip the
          // log noise but surface the error on the entry.
          if (!(err && /** @type {*} */ (err).isNotFound)) {
            // eslint-disable-next-line no-console
            console.error(`[skylab-cms] fetchCollectionItem(${key}/${slug}) failed:`, err);
          }
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, {
              item: null,
              isLoading: false,
              error: /** @type {Error} */ (err),
            });
            return next;
          });
        } finally {
          inFlightCollectionItems.current.delete(cacheKey);
        }
      })();

      inFlightCollectionItems.current.set(cacheKey, promise);
      return promise;
    },
    [normalizedConfig, stableGetAccessToken],
  );

  const requestCollectionList = useCallback(
    /**
     * @param {string} key
     * @param {import("../lib/schemas.js").CollectionListParams} [params]
     * @param {boolean} [force]
     * @returns {Promise<void>}
     */
    async (key, params, force = false) => {
      const paramsKey = stableStringify(params ?? {});
      const cacheKey = `${key}|${paramsKey}`;
      const cached = collectionListCacheRef.current.get(cacheKey);
      if (!force && cached && !cached.error) return;

      const existing = inFlightCollectionLists.current.get(cacheKey);
      if (existing && !force) return existing;

      setCollectionListCache((prev) => {
        const next = new Map(prev);
        const prior = prev.get(cacheKey);
        next.set(cacheKey, {
          items: prior?.items ?? [],
          total: prior?.total ?? 0,
          offset: prior?.offset ?? params?.offset ?? 0,
          limit: prior?.limit ?? params?.limit ?? 0,
          isLoading: true,
          error: null,
        });
        return next;
      });

      const promise = (async () => {
        try {
          const token = await stableGetAccessToken();
          const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
          const response = await fetchCollection(normalizedConfig, key, params, init);
          setCollectionListCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, {
              items: response.items,
              total: response.total,
              offset: response.offset,
              limit: response.limit,
              isLoading: false,
              error: null,
            });
            return next;
          });
          // Seed the item cache from the list payload - the response
          // already carries each row's full `data`, so per-item fetches
          // (`useCollectionItem` mounting for each row in a Region tab)
          // become cache hits and don't issue redundant GETs.
          setCollectionItemCache((prev) => {
            const next = new Map(prev);
            for (const item of response.items) {
              next.set(`${key}:${item.slug}`, { item, isLoading: false, error: null });
            }
            return next;
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[skylab-cms] fetchCollection(${key}) failed:`, err);
          setCollectionListCache((prev) => {
            const next = new Map(prev);
            next.set(cacheKey, {
              items: [],
              total: 0,
              offset: params?.offset ?? 0,
              limit: params?.limit ?? 0,
              isLoading: false,
              error: /** @type {Error} */ (err),
            });
            return next;
          });
        } finally {
          inFlightCollectionLists.current.delete(cacheKey);
        }
      })();

      inFlightCollectionLists.current.set(cacheKey, promise);
      return promise;
    },
    [normalizedConfig, stableGetAccessToken],
  );

  // Provider-level /me fetch (state declared earlier). One request per
  // session per admin; collected re-fetches go through `refetchMyCollections`.
  useEffect(() => {
    if (!isAdmin) {
      setMyCollectionsState({ data: [], isLoading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setMyCollectionsState((s) => ({ ...s, isLoading: true, error: null }));
    (async () => {
      try {
        const token = await stableGetAccessToken();
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
        const data = await fetchMyCollections(normalizedConfig, init);
        if (cancelled) return;
        setMyCollectionsState({ data, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[skylab-cms] fetchMyCollections failed:", err);
        setMyCollectionsState({ data: [], isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();
    return () => { cancelled = true; };
  }, [normalizedConfig, isAdmin, stableGetAccessToken, myCollectionsToken]);

  const stableOnSignOut = useCallback(() => {
    const fn = onSignOutRef.current;
    if (fn) fn();
  }, []);

  // ---- Draft autosave (PUT /cms/draft, 1s after last edit) ---------------
  //
  // Every keystroke updates `drafts`, which retriggers the debounce effect
  // below; after 1s of silence we group the dirty edits by slug and PUT each
  // group. Reads block/version/config/pathname through refs so unrelated
  // re-renders (refetch, theme changes, ...) don't reset the timer - only a
  // genuine `drafts` mutation does. A backend `updateContent` clears the
  // overlay automatically, so there's no explicit cleanup path here.

  const [draftSyncStatus, setDraftSyncStatus] = useState(
    /** @type {"idle"|"saving"|"saved"|"failed"} */ ("idle"),
  );

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const draftPathnameRef = useRef(pathname);
  draftPathnameRef.current = pathname;
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;
  const draftConfigRef = useRef(normalizedConfig);
  draftConfigRef.current = normalizedConfig;

  // Per-slug request chain. A fast typist can leave the previous PUT in
  // flight when the next debounce fires; chaining each slug's request onto
  // its predecessor guarantees the backend sees them in commit order and
  // an older draft can never clobber a newer one. Across slugs we still
  // parallelise (page + global header save independently).
  const inFlightDraftPerSlug = useRef(
    /** @type {Map<string, Promise<void>>} */ (new Map()),
  );

  // Pulse-and-reset for the panel status dot. After a saved/failed signal
  // we drop back to idle ~1.2s later so the green/pink flash is purely
  // transient and the dot returns to its dirty/clean baseline.
  const draftStatusResetRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );
  const flashDraftStatus = useCallback(
    /** @param {"saved"|"failed"} kind */
    (kind) => {
      setDraftSyncStatus(kind);
      if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
      draftStatusResetRef.current = setTimeout(() => {
        setDraftSyncStatus("idle");
        draftStatusResetRef.current = null;
      }, 900);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isAdminRef.current) return;
    if (drafts.size === 0) return;

    const timer = setTimeout(async () => {
      const currentBlocks = blocksRef.current;
      const currentPathname = draftPathnameRef.current ?? "/";
      const currentConfig = draftConfigRef.current;

      // Skip entries that no longer differ from the effective value
      // (`draftValue ?? value`): typing the same characters back to a
      // saved draft, or the block being removed by a refetch. The
      // comparison MUST be against the effective value so an undo
      // (local draft set to published while a server draft exists)
      // still sends a request - that's how the backend draft gets
      // cleared.
      /** @type {Map<string, import("../lib/schemas.js").UpdateBlockItem[]>} */
      const bySlug = new Map();
      for (const [blockPath, value] of drafts) {
        const block = currentBlocks.get(blockPath);
        if (!block) continue;
        const effective = block.draftValue ?? block.value;
        if (stableStringify(value) === stableStringify(effective)) continue;
        const slug = block._slug ?? currentPathname;
        const list = bySlug.get(slug) ?? [];
        list.push({ blockPath, value, version: block.version });
        bySlug.set(slug, list);
      }
      if (bySlug.size === 0) return;

      const accessToken = (await stableGetAccessToken()) || undefined;
      setDraftSyncStatus("saving");

      const slugEntries = [...bySlug.entries()];
      const results = await Promise.allSettled(
        slugEntries.map(([slug, blocksForSlug]) => {
          const previous =
            inFlightDraftPerSlug.current.get(slug) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(() =>
              updateDraft(
                currentConfig,
                { slug, blocks: blocksForSlug },
                accessToken,
              ),
            );
          inFlightDraftPerSlug.current.set(slug, next);
          return next;
        }),
      );

      // Optimistically reflect the backend's post-write state in the
      // local blocks map: each block we just PUT now has draftValue
      // equal to the value we sent, except when that value matches
      // `block.value` (published) - in which case the backend
      // auto-cleans and DraftValue becomes null. Without this update
      // an undo would still see `draftValue` populated until the next
      // refetch, leaving the dirty count and Save All button pointing
      // at the stale draft.
      results.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const [, blocksForSlug] = slugEntries[i];
        setBlocksState((prev) => {
          let mutated = false;
          const nextMap = new Map(prev);
          for (const sent of blocksForSlug) {
            const cur = nextMap.get(sent.blockPath);
            if (!cur) continue;
            const matchesPublished =
              stableStringify(sent.value) === stableStringify(cur.value);
            const newDraftValue = matchesPublished ? null : sent.value;
            if (
              stableStringify(cur.draftValue ?? null) ===
              stableStringify(newDraftValue)
            ) {
              continue;
            }
            nextMap.set(sent.blockPath, { ...cur, draftValue: newDraftValue });
            mutated = true;
          }
          return mutated ? nextMap : prev;
        });
      });

      const anyFailed = results.some((r) => r.status === "rejected");
      if (anyFailed) {
        for (const r of results) {
          if (r.status === "rejected") {
            // eslint-disable-next-line no-console
            console.warn("[skylab-cms] draft autosave failed:", r.reason);
          }
        }
        flashDraftStatus("failed");
      } else {
        flashDraftStatus("saved");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [drafts, stableGetAccessToken, flashDraftStatus]);

  // Silent server-draft cleanup for the discard path. Fires a PUT with
  // each block's published value (the only knob the API gives us for
  // dropping a Redis draft — backend auto-cleans when draft===published)
  // but doesn't go through the autosave debounce or touch
  // `draftSyncStatus`. The pill therefore stays at its idle gray dot
  // instead of flashing "Kaydediliyor… → Taslak kayıtlı HH:MM" for a
  // request that conceptually removes a draft. Per-slug chaining mirrors
  // the autosave path so a discard issued mid-flight can't overtake a
  // still-pending autosave PUT for the same slug.
  const discardServerDrafts = useCallback(
    /** @param {string[]} blockPaths */
    (blockPaths) => {
      if (blockPaths.length === 0) return;
      /** @type {Map<string, import("../lib/schemas.js").UpdateBlockItem[]>} */
      const bySlug = new Map();
      const currentBlocks = blocksRef.current;
      const currentPathname = draftPathnameRef.current ?? "/";
      for (const blockPath of blockPaths) {
        const block = currentBlocks.get(blockPath);
        if (!block || block.draftValue == null) continue;
        const slug = block._slug ?? currentPathname;
        const list = bySlug.get(slug) ?? [];
        list.push({
          blockPath: block.blockPath,
          value: block.value,
          version: block.version,
        });
        bySlug.set(slug, list);
      }
      if (bySlug.size === 0) return;

      // Optimistic: nullify draftValue locally so dirtyCount drops to 0
      // and downstream surfaces (StatusBar, pill, ChangesPanel) update
      // immediately without waiting for the round-trip.
      setBlocksState((prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const [, blocksForSlug] of bySlug) {
          for (const u of blocksForSlug) {
            const cur = next.get(u.blockPath);
            if (!cur || cur.draftValue == null) continue;
            next.set(u.blockPath, { ...cur, draftValue: null });
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });

      // Fire-and-forget cleanup PUTs. Per-slug chaining so concurrent
      // autosaves can't sneak a stale draft in after the cleanup lands.
      const currentConfig = draftConfigRef.current;
      (async () => {
        const accessToken = (await stableGetAccessToken()) || undefined;
        for (const [slug, blocksForSlug] of bySlug) {
          const previous =
            inFlightDraftPerSlug.current.get(slug) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(() =>
              updateDraft(
                currentConfig,
                { slug, blocks: blocksForSlug },
                accessToken,
              ),
            )
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.warn("[skylab-cms] discard cleanup PUT failed:", err);
            });
          inFlightDraftPerSlug.current.set(slug, next);
        }
      })();
    },
    [stableGetAccessToken],
  );

  const value = useMemo(
    () => ({
      config: normalizedConfig,
      isAdmin,
      userSub,
      blocks,
      setBlocks: setBlocksState,
      drafts,
      setDraft,
      clearDraft,
      clearDrafts,
      discardServerDrafts,
      activeBlock,
      setActiveBlock: setActiveBlockGuarded,
      activeCollectionItem,
      setActiveCollectionItem,
      refetchToken,
      triggerRefetch,
      itemSchemas: itemSchemasRef.current,
      registerItemSchema,
      unregisterItemSchema,
      collectionBindings,
      registerCollectionBinding,
      unregisterCollectionBinding,
      myCollections: myCollectionsState.data,
      myCollectionsLoading: myCollectionsState.isLoading,
      myCollectionsError: myCollectionsState.error,
      refetchMyCollections,
      collectionItemCache,
      requestCollectionItem,
      updateCollectionItem,
      patchCollectionItem,
      invalidateCollectionItem,
      collectionListCache,
      requestCollectionList,
      invalidateCollectionList,
      collectionDrafts,
      setCollectionDraft,
      clearCollectionDraft,
      clearCollectionDrafts,
      onAfterSave: stableOnAfterSave,
      getAccessToken: stableGetAccessToken,
      draftSyncStatus,
      isDrawerOpen,
      setDrawerOpen,
      userInfo,
      onSignOut: onSignOut ? stableOnSignOut : null,
    }),
    [
      normalizedConfig,
      isAdmin,
      userSub,
      blocks,
      drafts,
      setDraft,
      clearDraft,
      clearDrafts,
      discardServerDrafts,
      activeBlock,
      setActiveBlockGuarded,
      activeCollectionItem,
      refetchToken,
      triggerRefetch,
      itemSchemasVersion,
      registerItemSchema,
      unregisterItemSchema,
      collectionBindings,
      registerCollectionBinding,
      unregisterCollectionBinding,
      myCollectionsState,
      refetchMyCollections,
      collectionItemCache,
      requestCollectionItem,
      updateCollectionItem,
      patchCollectionItem,
      invalidateCollectionItem,
      collectionListCache,
      requestCollectionList,
      invalidateCollectionList,
      collectionDrafts,
      setCollectionDraft,
      clearCollectionDraft,
      clearCollectionDrafts,
      stableOnAfterSave,
      stableGetAccessToken,
      draftSyncStatus,
      isDrawerOpen,
      setDrawerOpen,
      userInfo,
      onSignOut,
      stableOnSignOut,
    ],
  );

  // Push the page right when the admin drawer is open so the panel doesn't
  // overlap content. The chevron handle on the drawer's right edge sticks
  // out a tiny bit but doesn't add to the offset - panel width is the only
  // thing that pushes. Plain CSS transition - keeps `framer-motion` isolated
  // to the (lazy-loaded) admin chunk so public visitors don't pay for it.
  const contentOffset = isAdmin && isDrawerOpen ? ADMIN_PANEL_WIDTH : 0;

  return (
    <CmsContext.Provider value={value}>
      {/* Admin-only client refetch: `useCmsContent` GETs `/cms/content`
          with the user's Bearer so post-save `triggerRefetch` (and the
          draft autosave roundtrip) can pull fresh versions into the
          editor's view without a navigation. Public visitors don't
          mount this — soft-nav refreshes go through `router.refresh()`
          above, which re-runs the layout server-side with the service
          token. */}
      {isAdmin ? <ContentLoader /> : null}
      <div
        style={{
          marginLeft: contentOffset,
          transition: "margin-left 350ms cubic-bezier(0.32, 0.72, 0.18, 1)",
        }}
      >
        {children}
      </div>
      {isAdmin ? <AdminDrawer /> : null}
    </CmsContext.Provider>
  );
}

// Must match PANEL_WIDTH inside AdminDrawer.jsx. Hardcoded here (rather than
// imported) so the constant stays out of the public bundle - AdminDrawer is
// dynamically imported and only loads for admins.
const ADMIN_PANEL_WIDTH = 460;

// Public visitors render entirely from `initialBlocks` (server-fetched and
// ISR-cached under `cmsCacheTag(slug)`); the cache is dropped on admin save
// via `revalidateCmsSlug`, so there is no reason to re-verify on every page
// view. Admin sessions still mount this so post-save `triggerRefetch` can
// pull fresh versions into the editor's view without a navigation.
function ContentLoader() {
  useCmsContent();
  return null;
}
