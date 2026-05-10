"use client";

/**
 * @file `useCmsContent()` - fetch the current page's blocks.
 *
 * Slug is resolved automatically from `usePathname()`; consumers don't pass
 * it. Result is also pushed into the shared `CmsContext` blocks map so
 * `useCmsBlock` and `EditableRegion` can read derived values without their
 * own fetches. Re-runs when `refetchToken` changes (bumped by saves).
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { fetchContent, CmsApiError } from "../lib/api-client.js";
import { indexBlocksByPath } from "../lib/blocks.js";

/**
 * @import { BlockResponse } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} UseCmsContentResult
 * @property {BlockResponse[]} blocks       Current page's blocks (array form).
 * @property {boolean} isLoading
 * @property {CmsApiError|Error|null} error
 * @property {() => void} refetch
 * @property {string} slug
 */

/**
 * @returns {UseCmsContentResult}
 */

export function useCmsContent() {
  const { config, blocks: seedBlocks, setBlocks, refetchToken, triggerRefetch, getAccessToken } = useCmsContext();
  const slug = usePathname() ?? "/";

  // Seed from the provider's blocks map (populated by `initialBlocks` on the
  // server) so the first render exposes the SSR-fetched content rather than
  // an empty array while the (admin-only) refetch is in flight.
  const [state, setState] = useState(
    /** @returns {{ blocks: BlockResponse[], isLoading: boolean, error: Error|null }} */
    () => ({ blocks: Array.from(seedBlocks.values()), isLoading: false, error: null }),
  );

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    (async () => {
      try {
        const token = await getAccessToken();
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;

        // Refetch the page slug + the global slug in parallel so a
        // header/footer save reflects on every page after triggerRefetch
        // bumps. Each block is stamped with its source slug so the save
        // layer can PUT it back to the right place.
        const globalSlug = config.globalSlug && config.globalSlug !== slug
          ? config.globalSlug
          : null;

        const [pageResponse, globalResponse] = await Promise.all([
          fetchContent(config, slug, init),
          globalSlug
            ? fetchContent(config, globalSlug, init).catch(() => ({ slug: globalSlug, blocks: [] }))
            : Promise.resolve({ slug: "", blocks: [] }),
        ]);
        if (cancelled) return;

        const pageBlocks = pageResponse.blocks.map((b) => ({ ...b, _slug: slug }));
        const pagePaths = new Set(pageBlocks.map((b) => b.blockPath));
        const globalBlocks = globalSlug
          ? globalResponse.blocks
              .filter((b) => !pagePaths.has(b.blockPath))
              .map((b) => ({ ...b, _slug: globalSlug }))
          : [];

        const merged = [...pageBlocks, ...globalBlocks];
        const indexed = indexBlocksByPath(merged);
        setBlocks(() => indexed);
        setState({ blocks: merged, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[skylab-cms] fetchContent failed:", err);
        setState({ blocks: [], isLoading: false, error: /** @type {Error} */ (err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config, slug, refetchToken, setBlocks, getAccessToken]);

  return {
    blocks: state.blocks,
    isLoading: state.isLoading,
    error: state.error,
    refetch: triggerRefetch,
    slug,
  };
}