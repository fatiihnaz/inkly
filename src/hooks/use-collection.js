"use client";

/**
 * @file `useCollection(key)` / `useCollectionItem(key, slug)` - client-side
 * fetchers for the global Collections API (`/cms/collections/{key}`).
 *
 * The CMS doesn't write to collections (writes live in their own admin
 * surface, e.g. team leader portal); these hooks are pure reads, fired on
 * mount. No SWR-style focus revalidation; consumers can call `refetch()`
 * if they need to (e.g. after publishing from another tab).
 *
 * Auth: pulls the current session's access token from `useCmsContext`
 * and forwards it as `Authorization: Bearer`. The Collections endpoint
 * requires `cms:access`; unauthenticated visitors will see the resulting
 * 401 surface through `error`.
 *
 * No de-duplication: two `<CollectionRegion collection="Teams">` mounted
 * on the same page issue two requests. Atypical to render the same
 * collection twice; if it shows up, lift the fetch into a parent and
 * pass items down.
 */

import { useCallback, useEffect, useState } from "react";

import { useCmsContext } from "../lib/context.js";
import { fetchCollection, fetchCollectionItem } from "../lib/api-client.js";

/**
 * @import { CollectionItemResponse } from "../lib/schemas.js"
 * @import { CmsApiError } from "../lib/api-client.js"
 */

/**
 * @typedef {Object} UseCollectionResult
 * @property {CollectionItemResponse[]} items
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => Promise<void>} refetch
 */

/**
 * @param {string} key  Backend collection key, e.g. "Teams" or "News".
 * @returns {UseCollectionResult}
 */
export function useCollection(key) {
  const { config, getAccessToken } = useCmsContext();
  const [state, setState] = useState(
    /** @returns {{ items: CollectionItemResponse[], isLoading: boolean, error: Error|null }} */
    () => ({ items: [], isLoading: true, error: null }),
  );
  // Bumped by refetch() so the consumer can force a re-run without
  // remounting. Effect deps include it; cancellation handles overlap.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    (async () => {
      try {
        const token = await getAccessToken();
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
        const items = await fetchCollection(config, key, init);
        if (cancelled) return;
        setState({ items, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error(`[skylab-cms] fetchCollection(${key}) failed:`, err);
        setState({ items: [], isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config, key, getAccessToken, reloadToken]);

  const refetch = useCallback(async () => {
    setReloadToken((n) => n + 1);
  }, []);

  return { items: state.items, isLoading: state.isLoading, error: state.error, refetch };
}

/**
 * @typedef {Object} UseCollectionItemResult
 * @property {CollectionItemResponse | null} item
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error  `error.isNotFound === true` on 404.
 * @property {() => Promise<void>} refetch
 */

/**
 * @param {string} key   Backend collection key.
 * @param {string} slug  Item slug (lowercased server-side).
 * @returns {UseCollectionItemResult}
 */
export function useCollectionItem(key, slug) {
  const { config, getAccessToken } = useCmsContext();
  const [state, setState] = useState(
    /** @returns {{ item: CollectionItemResponse | null, isLoading: boolean, error: Error|null }} */
    () => ({ item: null, isLoading: true, error: null }),
  );
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    (async () => {
      try {
        const token = await getAccessToken();
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
        const item = await fetchCollectionItem(config, key, slug, init);
        if (cancelled) return;
        setState({ item, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // 404 is a normal control-flow signal for single-item reads -
        // don't log it. Other errors are surfaced.
        if (!(err && /** @type {*} */ (err).isNotFound)) {
          // eslint-disable-next-line no-console
          console.error(`[skylab-cms] fetchCollectionItem(${key}/${slug}) failed:`, err);
        }
        setState({ item: null, isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config, key, slug, getAccessToken, reloadToken]);

  const refetch = useCallback(async () => {
    setReloadToken((n) => n + 1);
  }, []);

  return { item: state.item, isLoading: state.isLoading, error: state.error, refetch };
}
