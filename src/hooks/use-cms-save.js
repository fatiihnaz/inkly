"use client";

/**
 * @file `useCmsSave()` - drawer-side save orchestration on top of
 * `useCmsAdmin()`.
 *
 * Computes the dirty-update set from the current `drafts` Map plus any
 * server-side `block.draftValue` overlays, exposes a `save()` that PUTs
 * them and clears the matching local drafts on success, and a `discard()`
 * that wipes both local and backend drafts in one shot.
 *
 * Lives outside `AdminDrawer.jsx` so the drawer renders pure layout and
 * the save flow stays unit-testable in isolation.
 */

import { useCallback, useMemo } from "react";

import { useCmsContext } from "../lib/context.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { useCmsAdmin } from "./use-cms-admin.js";

/**
 * @import { UpdateBlockItem } from "../lib/schemas.js"
 */

/**
 * @typedef {Object} UseCmsSaveResult
 * @property {UpdateBlockItem[]} dirtyUpdates
 * @property {number} dirtyCount
 * @property {boolean} isSaving
 * @property {Error|null} error
 * @property {() => Promise<void>} save     PUT all dirty updates, then clear matching local drafts.
 * @property {() => void} discard           Wipe local edits + silently clean any server-side draft slots (no autosave pulse).
 */

/**
 * @returns {UseCmsSaveResult}
 */
export function useCmsSave() {
  const {
    blocks, drafts, clearDraft, clearDrafts, discardServerDrafts, setActiveBlock,
  } = useCmsContext();
  const { savePage, isSaving, error } = useCmsAdmin();

  // A block is "dirty" if its effective value (local draft, else server-side
  // `draftValue`) differs from the published `block.value`. Local edits
  // always win over server-side drafts - if the admin opened the page with
  // a backend draft and then typed something, only their typed value is
  // publish-worthy. The `seen` set dedupes when both layers exist for the
  // same block.
  /** @type {UpdateBlockItem[]} */
  const dirtyUpdates = useMemo(() => {
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {UpdateBlockItem[]} */
    const out = [];
    for (const [blockPath, value] of drafts) {
      const block = blocks.get(blockPath);
      if (!block) continue;
      if (stableStringify(value) === stableStringify(block.value)) continue;
      out.push({ blockPath, value, version: block.version });
      seen.add(blockPath);
    }
    for (const block of blocks.values()) {
      if (block.draftValue == null) continue;
      if (seen.has(block.blockPath)) continue;
      // Backend's auto-clean already filters draft===published, but be
      // defensive in case a stale optimistic update reaches us first.
      if (stableStringify(block.draftValue) === stableStringify(block.value)) continue;
      out.push({
        blockPath: block.blockPath,
        value: block.draftValue,
        version: block.version,
      });
    }
    return out;
  }, [drafts, blocks]);

  const save = useCallback(async () => {
    if (dirtyUpdates.length === 0) return;
    try {
      await savePage(dirtyUpdates);
      for (const u of dirtyUpdates) clearDraft(u.blockPath);
      setActiveBlock(null);
    } catch {
      // Error surfaced via useCmsAdmin().error - keep drafts intact so the
      // user can retry / inspect.
    }
  }, [dirtyUpdates, savePage, clearDraft, setActiveBlock]);

  const discard = useCallback(() => {
    // Local edits first — `clearDrafts` empties the map, which also
    // cancels any pending autosave debounce (the effect's deps include
    // `drafts`).
    clearDrafts();
    // Server-side cleanup goes through the provider's silent path: it
    // nulls `draftValue` optimistically (so dirty count + UI surfaces
    // update immediately) and fires the PUTs without flashing the
    // autosave status. Otherwise the pill would briefly say "Taslak
    // kayıtlı HH:MM" for a request that just deleted that draft.
    /** @type {string[]} */
    const pathsWithServerDraft = [];
    for (const block of blocks.values()) {
      if (block.draftValue != null) pathsWithServerDraft.push(block.blockPath);
    }
    discardServerDrafts(pathsWithServerDraft);
  }, [blocks, clearDrafts, discardServerDrafts]);

  return {
    dirtyUpdates,
    dirtyCount: dirtyUpdates.length,
    isSaving,
    error,
    save,
    discard,
  };
}