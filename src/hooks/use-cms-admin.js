"use client";

/**
 * @file `useCmsAdmin()` - write-side hook.
 *
 * Wraps `PUT /cms/content`. Disabled (returns errors) when `isAdmin` is
 * false or `userSub` is null. On a successful save, triggers a refetch so
 * other hooks see the new versions without manual coordination.
 */

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsContext } from "../lib/context.js";
import { updateContent, CmsApiError } from "../lib/api-client.js";

/**
 * @import { UpdateBlockItem, UpdatePageResponse, BlockResponse } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} UseCmsAdminResult
 * @property {(blockPath: string, value: *, version: number) => Promise<UpdatePageResponse>} save
 * @property {(blocks: UpdateBlockItem[]) => Promise<UpdatePageResponse>} savePage
 * @property {boolean} isSaving
 * @property {CmsApiError|Error|null} error
 * @property {UpdatePageResponse|null} lastResult
 * @property {boolean} canSave  False when not admin.
 */

/**
 * @returns {UseCmsAdminResult}
 */
export function useCmsAdmin() {
  const { config, isAdmin, blocks, triggerRefetch, onAfterSave, getAccessToken } =
    useCmsContext();
  const pathname = usePathname() ?? "/";

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(/** @type {Error|null} */ (null));
  const [lastResult, setLastResult] = useState(
    /** @type {UpdatePageResponse|null} */ (null),
  );

  const canSave = isAdmin;

  const savePage = useCallback(
    /**
     * @param {UpdateBlockItem[]} updates
     * @returns {Promise<UpdatePageResponse>}
     */
    async (updates) => {
      if (!canSave) {
        const err = new Error("Cannot save: not in admin mode");
        setError(err);
        throw err;
      }
      setIsSaving(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();

        // Group updates by their source slug. A block may live on the page
        // slug or the global slug (header/footer); each must PUT to the
        // matching slug or the backend won't recognise it. Most pages have
        // a single group; the multi-PUT path only kicks in when an admin
        // edits both a page block and a header/footer in one batch.
        /** @type {Map<string, UpdateBlockItem[]>} */
        const bySlug = new Map();
        for (const update of updates) {
          const block = /** @type {BlockResponse | undefined} */ (blocks.get(update.blockPath));
          const slug = block?._slug ?? pathname;
          const list = bySlug.get(slug) ?? [];
          list.push(update);
          bySlug.set(slug, list);
        }

        const groups = [...bySlug.entries()];
        const responses = await Promise.all(
          groups.map(([slug, slugUpdates]) =>
            updateContent(
              config,
              { slug, blocks: slugUpdates },
              accessToken || undefined,
            ),
          ),
        );

        // Aggregate the per-slug counts so callers see one totals object
        // instead of an array. The shape stays identical to the legacy
        // single-PUT response.
        /** @type {UpdatePageResponse} */
        const result = responses.reduce(
          (acc, r) => ({
            updated: acc.updated + r.updated,
            unchanged: acc.unchanged + r.unchanged,
          }),
          { updated: 0, unchanged: 0 },
        );

        setLastResult(result);
        triggerRefetch();

        // Drop ISR cache for every slug we wrote to. Page slug + global
        // slug are independent cache tags; a header save shouldn't leave
        // stale page renders cached, and vice versa.
        for (const [slug] of groups) {
          try {
            await onAfterSave(slug);
          } catch (revalidateErr) {
            // eslint-disable-next-line no-console
            console.warn("[skylab-cms] onAfterSave failed:", revalidateErr);
          }
        }
        return result;
      } catch (err) {
        setError(/** @type {Error} */ (err));
        if (err instanceof CmsApiError && err.isConflict) {
          triggerRefetch();
        }
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [canSave, isAdmin, config, blocks, pathname, triggerRefetch, onAfterSave, getAccessToken],
  );

  const save = useCallback(
    /**
     * @param {string} blockPath
     * @param {*} value
     * @param {number} version
     * @returns {Promise<UpdatePageResponse>}
     */
    (blockPath, value, version) =>
      savePage([{ blockPath, value, version }]),
    [savePage],
  );

  return { save, savePage, isSaving, error, lastResult, canSave };
}