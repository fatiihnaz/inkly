"use client";

/**
 * @file `AdminCollectionEditor` - schema-driven form + direct-PUT save for
 * a single collection row. Shared between two drawer surfaces:
 *
 *   - Page-tab Collection cards (one per `<CollectionItem>` binding
 *     rendered on the page; the card wrapper lives in `AdminBlockCard`)
 *   - Region-tab item cards (one per row returned by
 *     `useCollection(key)`; rendered inside `AdminCollectionRegionPanel`)
 *
 * State lives in the `useCollectionEditor(collection, slug)` hook so the
 * surrounding card wrapper can render the per-card "Geri al" button up in
 * the card header (next to the chevron) alongside its `hasDraft` /
 * `undoDraft` exposure. The component itself is presentational: it
 * accepts the hook's return value via `editor` and renders the meta row
 * + form + save button.
 *
 * The hook lookup is identical for both surfaces: schema from the
 * provider's /me cache, item value from the shared item cache. Save
 * goes through `upsertCollectionItem` and the response is pushed back
 * into the cache via `updateCollectionItem` so the page-side preview
 * and any other open surfaces re-render with the new version.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsContext } from "../lib/context.js";
import { useCollectionItem } from "../hooks/use-collection.js";
import { useMyCollections } from "../hooks/use-my-collections.js";
import { CmsApiError } from "../lib/errors.js";
import { stableStringify } from "../lib/stable-stringify.js";

import {
  CollectionFieldsForm,
  seedValues,
  buildPayload,
  requiredMissing,
} from "./editors/CollectionFieldsForm.jsx";
import {
  TEXT_MUTED,
  TEXT_FAINT,
  FONT_MONO,
  STATUS_OK,
  STATUS_WARN,
  STATUS_DANGER,
  COLLECTION_ACCENT,
} from "./admin-drawer-styles.js";

const DRAFT_DEBOUNCE_MS = 1000;

/**
 * @typedef {Object} CollectionEditorState
 * @property {import("../lib/schemas.js").CollectionSchema | null} schema
 * @property {string | null} slugSource
 * @property {import("../lib/schemas.js").CollectionItemResponse | null} item
 * @property {Record<string, *> | null} values
 * @property {(next: Record<string, *>) => void} setValues
 * @property {() => void} save
 * @property {() => void} undoDraft
 * @property {boolean} hasDraft
 * @property {boolean} canEdit
 * @property {boolean} isVirtual
 * @property {boolean} isPending
 * @property {string | null} error
 * @property {"idle"|"saving"|"failed"} draftStatus
 * @property {string | null} lastDraftSavedAt
 * @property {boolean} publishedFlash  Transient signal: true for ~2.4s
 *   after a successful `save()` so the indicator can echo "Veri kaydedildi"
 *   before settling back to its idle dot. Cleared early if the user
 *   resumes editing (next autosave start).
 * @property {boolean} meLoading
 * @property {Error | null} meError
 * @property {boolean} itemLoading
 * @property {Error | null} itemError
 * @property {() => Promise<void>} refetch
 * @property {string} collection
 * @property {string} slug
 */

/**
 * State + handlers for a single collection row editor. Lifted out of the
 * component so the surrounding card can render header-level controls
 * (e.g. the "Geri al" reset button) that drive the same state as the
 * inline form below.
 *
 * @param {string} collection
 * @param {string} slug
 * @returns {CollectionEditorState}
 */
export function useCollectionEditor(collection, slug) {
  const {
    config,
    getAccessToken,
    updateCollectionItem,
    patchCollectionItem,
    setCollectionDraft,
    clearCollectionDraft,
  } = useCmsContext();
  const { collections: my, isLoading: meLoading, error: meError } = useMyCollections();
  // Read raw server-side item: the editor must not consume its own
  // live-edit overlay, otherwise the seeding effect would re-fire on
  // every keystroke and the autosave debounce would never settle.
  const { item, isLoading: itemLoading, error: itemError, refetch } = useCollectionItem(
    collection,
    slug,
    { overlayDrafts: false },
  );

  const meta = my.find((c) => c.collectionKey === collection) ?? null;
  const schema = meta?.schema ?? null;
  const slugSource = meta?.slugSource ?? null;

  const [values, setValues] = useState(/** @type {Record<string, *> | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isPending, startTransition] = useTransition();
  const [draftStatus, setDraftStatus] = useState(
    /** @type {"idle"|"saving"|"failed"} */ ("idle"),
  );
  // Wall-clock HH:MM of the most recent successful autosave this
  // session. Persists in the indicator instead of flashing away after
  // 900ms (the old behaviour) so the admin can glance at the card and
  // see exactly when the draft last hit the server. Cleared when the
  // server-side draft itself disappears (publish, undo).
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState(
    /** @type {string | null} */ (null),
  );
  // Post-publish pulse. Driven by `save()`; the indicator surfaces it as
  // a green "Veri kaydedildi" chip for a couple of seconds before falling
  // back to its idle dot. Distinct from `lastDraftSavedAt` (draft autosave
  // timestamp) — that one always refers to a draft slot the backend still
  // holds; this one fires the instant the row was actually published.
  const [publishedFlash, setPublishedFlash] = useState(false);
  useEffect(() => {
    if (!publishedFlash) return undefined;
    const t = setTimeout(() => setPublishedFlash(false), 2400);
    return () => clearTimeout(t);
  }, [publishedFlash]);

  // Last payload either returned by the server (data or draftData) or
  // successfully PUT'd as a draft. Used to avoid resending the same
  // payload twice (initial mount, cache refresh round-trips) and to
  // detect when a local edit produces nothing actually changed.
  const lastSyncedRef = useRef(/** @type {string | null} */ (null));
  const failedResetRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );

  // Seed local form state when both schema + item have arrived. Prefer
  // the in-progress draft so the admin sees their last in-flight edits
  // across reloads; fall back to the published data otherwise. Re-seed
  // on refetch / cache update so the form reflects the latest server
  // state (e.g. after a successful save clears the draft).
  //
  // Skip the reseed when the baseline already matches `lastSyncedRef`:
  // that means the cache change is the one our own autosave just made,
  // and reseeding would clobber any keystrokes the user typed after the
  // PUT fired.
  useEffect(() => {
    if (!schema) return;
    const baseline = item?.draftData ?? item?.data ?? {};
    const serialized = stableStringify(baseline);
    if (serialized === lastSyncedRef.current) return;
    setValues(seedValues(schema.fields, baseline));
    lastSyncedRef.current = serialized;
  }, [schema, item]);

  useEffect(() => () => {
    if (failedResetRef.current) clearTimeout(failedResetRef.current);
  }, []);

  // Clear the autosave timestamp when the server-side draft slot goes
  // away — publish / undo both drop `draftData`, and a stale "Kayıtlı
  // 14:32" referring to a no-longer-existing draft would just confuse.
  useEffect(() => {
    if (item?.draftData == null) setLastDraftSavedAt(null);
  }, [item?.draftData]);

  // Debounced draft autosave. Every change to `values` resets a 1s
  // timer; when it fires we PUT the current payload to the matching
  // draft endpoint (item draft for published rows, new-item draft for
  // virtual / version=0 rows). The backend Redis store has a 7-day TTL
  // and a successful publish auto-clears the item-draft slot, so this
  // effect is purely write-side: no GET coordination needed. The
  // seeding effect above resyncs `lastSyncedRef` after the cache picks
  // up a publish, preventing an autosave loop against the just-saved
  // value.
  useEffect(() => {
    if (!schema || !values) return undefined;
    if (!item?.canEdit) return undefined;
    if (isPending) return undefined;

    const payload = buildPayload(schema.fields, values);
    const serialized = stableStringify(payload);

    // Live-preview overlay for page-side consumers. Push happens
    // synchronously on every change so `<CollectionItem>` /
    // `<CollectionRegion>` re-render in lockstep with the form. When
    // the user types back to the server's view, drop the overlay so
    // they fall back to `draftData ?? data` (no spurious diff).
    if (serialized === lastSyncedRef.current) {
      clearCollectionDraft(collection, slug);
      return undefined;
    }
    setCollectionDraft(collection, slug, payload);

    const isVirtualNow = !item || item.version === 0;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        setDraftStatus("saving");
        // User resumed editing — the just-published indicator no longer
        // matches the data, so retire the flash early.
        setPublishedFlash(false);
        if (isVirtualNow) {
          // AutoGenerated: backend derives slug on publish; don't send one.
          // RoleDerived / UserDefined: backend requires the slug to know
          // which virtual entry this draft belongs to.
          const body = slugSource === "AutoGenerated"
            ? { data: payload }
            : { slug, data: payload };
          await config.transport.saveCollectionNewDraft(collection, body, { accessToken: token });
        } else {
          await config.transport.saveCollectionItemDraft(collection, slug, { data: payload }, { accessToken: token });
        }
        if (cancelled) return;
        lastSyncedRef.current = serialized;
        // Reflect the just-saved draft in the cache so `hasDraft` flips
        // on immediately (badge + dirty rail) without waiting for an F5.
        // In-place patch so list windows don't refetch and overwrite
        // this with the server's pre-cleanup state on virtual rows.
        if (!isVirtualNow && item) {
          patchCollectionItem(collection, slug, { ...item, draftData: payload });
        }
        setDraftStatus("idle");
        setLastDraftSavedAt(formatClock(new Date()));
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection draft autosave failed:", err);
        setDraftStatus("failed");
        // Surface the failed state for a few seconds, then fall back to
        // idle — the user's next keystroke retries automatically via the
        // debounce, so we don't want a stuck red dot if the network
        // recovers on its own.
        if (failedResetRef.current) clearTimeout(failedResetRef.current);
        failedResetRef.current = setTimeout(() => {
          setDraftStatus("idle");
          failedResetRef.current = null;
        }, 4000);
      }
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, item, schema, slugSource, slug, collection, isPending]);

  const isVirtual = !item || item.version === 0;
  const canEdit = item?.canEdit ?? false;
  const hasDraft = item?.draftData != null;

  const save = () => {
    setError(null);
    if (!schema || !values) return;
    const missing = requiredMissing(schema.fields, values);
    if (missing) {
      setError(`Zorunlu alan eksik: ${missing}`);
      return;
    }
    startTransition(async () => {
      try {
        const token = await getAccessToken();
        const saved = await config.transport.upsertCollectionItem(
          collection,
          slug,
          {
            data: buildPayload(schema.fields, values),
            version: isVirtual ? null : item.version,
          },
          { accessToken: token },
        );
        // Push freshly-saved item into the provider cache: all
        // subscribers (this editor, the page-side <CollectionItem>,
        // any open Region tab) re-render without an extra GET. Force
        // `draftData: null` since the backend cleared the draft and the
        // upsert response may omit the field entirely.
        updateCollectionItem(collection, slug, { ...saved, draftData: null });
        // Drop the live-preview overlay so consumers fall back to the
        // freshly-published `item.data` immediately.
        clearCollectionDraft(collection, slug);
        // Indicator flashes "Veri kaydedildi" for a beat before the row
        // settles into its idle dot.
        setPublishedFlash(true);
      } catch (err) {
        if (err instanceof CmsApiError && err.isConflict) {
          setError("Versiyon çakışması — liste yenilendi, kontrol edip tekrar dene.");
          await refetch();
        } else if (err instanceof CmsApiError && err.isForbidden) {
          setError("Bu kaydı düzenleme yetkin yok.");
        } else if (err instanceof CmsApiError && err.status === 400) {
          setError(`Geçersiz veri: ${err.detail || err.message}`);
        } else {
          setError(/** @type {Error} */ (err).message);
        }
      }
    });
  };

  // Revert local edits to the published baseline. Optimistically clears
  // `draftData` on the cached item so `hasDraft` flips off (badge + dirty
  // icon disappear) the moment the user clicks Geri al. The seeding
  // effect then reseeds `values` + `lastSyncedRef` from `item.data`, so
  // the autosave effect's next pass is a no-op (no re-overlay, no PUT).
  // Backend cleanup is a fire-and-forget PUT of the published payload:
  // there's no draft DELETE endpoint, but the backend auto-clears its
  // Redis slot when draft === published.
  const undoDraft = () => {
    clearCollectionDraft(collection, slug);
    if (!schema || !item || item.draftData == null) return;
    setError(null);
    const publishedData = item.data;
    // In-place patch (not `updateCollectionItem`) so list windows don't
    // refetch and re-seed the item cache from the server's still-dirty
    // state before the cleanup PUT below lands.
    patchCollectionItem(collection, slug, { ...item, draftData: null });
    if (item.version === 0) return;
    (async () => {
      try {
        const token = await getAccessToken();
        await config.transport.saveCollectionItemDraft(
          collection, slug, { data: publishedData }, { accessToken: token },
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection undo draft cleanup failed:", err);
      }
    })();
  };

  return {
    schema,
    slugSource,
    item,
    values,
    setValues,
    save,
    undoDraft,
    hasDraft,
    canEdit,
    isVirtual,
    isPending,
    error,
    draftStatus,
    lastDraftSavedAt,
    publishedFlash,
    meLoading,
    meError: /** @type {Error | null} */ (meError ?? null),
    itemLoading,
    itemError: /** @type {Error | null} */ (itemError ?? null),
    refetch,
    collection,
    slug,
  };
}

/**
 * Presentational editor body. The `editor` prop carries all state +
 * handlers from `useCollectionEditor`; the parent card wrapper drives
 * the hook so it can also render header-level controls (the per-card
 * "Geri al" button next to the chevron) against the same state.
 *
 * @param {{
 *   editor: CollectionEditorState,
 *   showMetaRow?: boolean,
 * }} props
 */
export function AdminCollectionEditor({ editor, showMetaRow = true }) {
  const {
    collection, slug,
    schema, item, values, setValues,
    save, hasDraft, canEdit, isVirtual,
    isPending, error, draftStatus, lastDraftSavedAt, publishedFlash,
    meLoading, meError, itemLoading, itemError,
  } = editor;

  if (meLoading || itemLoading) {
    return <div style={hintStyle}>Yükleniyor…</div>;
  }
  if (meError) {
    return <div style={errorStyle}>Erişim listesi alınamadı: {meError.message}</div>;
  }
  if (itemError && !(itemError instanceof CmsApiError && itemError.isNotFound)) {
    return <div style={errorStyle}>{collection}/{slug} alınamadı: {itemError.message}</div>;
  }
  if (!schema) {
    return (
      <div style={hintStyle}>
        <code>{collection}</code> collection'ına bu oturumda erişimin yok — düzenleyemezsin.
      </div>
    );
  }
  if (!values) {
    return null;
  }

  const disabled = isPending || !canEdit;

  return (
    <div style={containerStyle}>
      {showMetaRow ? (
        <div style={metaRowStyle}>
          <span style={metaLabelStyle}>{collection}</span>
          <span style={metaSlugStyle}>{slug}</span>
          {hasDraft ? <span style={draftBadgeStyle}>taslak</span> : null}
          <span style={metaVersionStyle}>
            {isVirtual ? "yeni" : `v${item.version}`}
          </span>
          {!canEdit ? <span style={metaReadonlyStyle}>readonly</span> : null}
        </div>
      ) : null}

      {isVirtual && canEdit ? (
        <div style={virtualHintStyle}>
          Bu kayıt henüz yok — ilk Kaydet'te oluşturulur.
        </div>
      ) : null}

      <CollectionFieldsForm
        fields={schema.fields}
        values={values}
        onChange={setValues}
        disabled={disabled}
      />

      {error ? <div style={errorStyle}>{error}</div> : null}

      {canEdit ? (
        <div style={actionsRowStyle}>
          <DraftIndicator
            status={draftStatus}
            lastSavedAt={lastDraftSavedAt}
            hasServerDraft={item?.draftData != null}
            publishedFlash={publishedFlash}
          />
          <button
            type="button"
            onClick={save}
            disabled={disabled}
            style={saveButtonStyle}
          >
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Per-card autosave indicator. Mirrors the panel's `HeaderStatusPill` —
 * same pill chrome, same dot tones, same layout/AnimatePresence
 * choreography — so the drawer reads as one design language across the
 * header, the StatusBar, and each collection card. Stays mounted as a
 * dot-only anchor when the card is clean (idle gray dot, no label) so
 * the row's horizontal rhythm doesn't jump when state arrives.
 *
 * @param {{
 *   status: "idle" | "saving" | "failed",
 *   lastSavedAt: string | null,
 *   hasServerDraft: boolean,
 *   publishedFlash: boolean,
 * }} props
 */
function DraftIndicator({ status, lastSavedAt, hasServerDraft, publishedFlash }) {
  /** @type {{ state: string, bg: string, glow: string, pulse: boolean, label: React.ReactNode }} */
  let view;

  if (status === "saving") {
    view = {
      state: "saving",
      bg: STATUS_WARN,
      glow: `0 0 5px ${STATUS_WARN}66`,
      pulse: true,
      label: "Kaydediliyor…",
    };
  } else if (status === "failed") {
    view = {
      state: "failed",
      bg: STATUS_DANGER,
      glow: "none",
      pulse: false,
      label: "Kaydedilemedi",
    };
  } else if (publishedFlash) {
    view = {
      state: "published",
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: "Veri kaydedildi",
    };
  } else if (lastSavedAt) {
    view = {
      state: `saved:${lastSavedAt}`,
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: (
        <>
          Taslak kayıtlı
          <span style={indicatorTimeStyle}>{lastSavedAt}</span>
        </>
      ),
    };
  } else if (hasServerDraft) {
    // Server-side draftData but no autosave fired in this session yet —
    // e.g. the admin reopened a card with a previously-stashed draft.
    view = {
      state: "stashed",
      bg: STATUS_OK,
      glow: `0 0 5px ${STATUS_OK}66`,
      pulse: false,
      label: "Taslak kayıtlı",
    };
  } else {
    view = {
      state: "idle",
      bg: TEXT_FAINT,
      glow: "none",
      pulse: false,
      label: null,
    };
  }

  return (
    <motion.div
      layout
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
      style={{ ...indicatorPillStyle, transformOrigin: "center", overflow: "hidden" }}
    >
      <span
        className={view.pulse ? "inscribed-status-pulse" : undefined}
        style={{ ...indicatorDotStyle, background: view.bg, boxShadow: view.glow }}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {view.label != null ? (
          <motion.span
            key={view.state}
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0.18, 1] }}
            style={indicatorLabelStyle}
          >
            {view.label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Zero-padded HH:MM wall-clock string. Pulled out so the autosave
 * success path doesn't inline string-template math at a hot site.
 *
 * @param {Date} d
 * @returns {string}
 */
function formatClock(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---- Styles --------------------------------------------------------------

const containerStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 10,
});

const metaRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  letterSpacing: "0.04em",
});

const metaLabelStyle = /** @type {React.CSSProperties} */ ({
  color: COLLECTION_ACCENT,
  textTransform: "uppercase",
});

const metaSlugStyle = /** @type {React.CSSProperties} */ ({
  color: "rgba(255,255,255,0.65)",
});

const metaVersionStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  marginLeft: "auto",
});

const metaReadonlyStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  textTransform: "uppercase",
  fontSize: 10,
  padding: "1px 6px",
  background: "rgba(255,255,255,0.05)",
  borderRadius: 3,
});

const virtualHintStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 12,
  color: TEXT_MUTED,
  padding: "6px 10px",
  background: "rgba(201,184,150,0.06)",
  border: "1px solid rgba(201,184,150,0.15)",
  borderRadius: 3,
});

const hintStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  fontSize: 12,
});

const errorStyle = /** @type {React.CSSProperties} */ ({
  color: "#ff8b8b",
  fontSize: 12,
  padding: "6px 10px",
  background: "rgba(226,100,100,0.10)",
  border: "1px solid rgba(226,100,100,0.30)",
  borderRadius: 3,
});

const saveButtonStyle = /** @type {React.CSSProperties} */ ({
  marginLeft: "auto",
  padding: "7px 14px",
  background: COLLECTION_ACCENT,
  color: "#221d18",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
});

const actionsRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
});

const draftBadgeStyle = /** @type {React.CSSProperties} */ ({
  textTransform: "uppercase",
  fontSize: 9,
  letterSpacing: "0.06em",
  padding: "1px 6px",
  color: COLLECTION_ACCENT,
  background: "rgba(220, 195, 225, 0.10)",
  border: "1px solid rgba(220, 195, 225, 0.30)",
  borderRadius: 4,
});

// Pill chrome cloned from the panel's `HeaderStatusPill` so the two
// surfaces feel like one component family. `minHeight` locks the
// vertical axis: the empty (dot-only) anchor and the label state share
// the same height so only horizontal width animates as labels swap.
const indicatorPillStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 22,
  padding: "0 10px",
  borderRadius: 99,
  background: "rgba(255,255,255,0.025)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
  flexShrink: 0,
});

const indicatorDotStyle = /** @type {React.CSSProperties} */ ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  flexShrink: 0,
  display: "inline-block",
  transition: "background 220ms ease, box-shadow 220ms ease",
});

const indicatorLabelStyle = /** @type {React.CSSProperties} */ ({
  fontSize: 12,
  color: TEXT_MUTED,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
});

const indicatorTimeStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: TEXT_FAINT,
});