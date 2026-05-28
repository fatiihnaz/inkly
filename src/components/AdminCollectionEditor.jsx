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

import { useCmsContext } from "../lib/context.js";
import { useCollectionItem } from "../hooks/use-collection.js";
import { useMyCollections } from "../hooks/use-my-collections.js";
import {
  upsertCollectionItem,
  saveCollectionItemDraft,
  saveCollectionNewDraft,
  CmsApiError,
} from "../lib/api-client.js";
import { stableStringify } from "../lib/stable-stringify.js";

import {
  CollectionFieldsForm,
  seedValues,
  buildPayload,
  requiredMissing,
} from "./editors/CollectionFieldsForm.jsx";
import { TEXT_MUTED, COLLECTION_ACCENT } from "./admin-drawer-styles.js";

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
 * @property {"idle"|"saving"|"saved"|"failed"} draftStatus
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
    /** @type {"idle"|"saving"|"saved"|"failed"} */ ("idle"),
  );

  // Last payload either returned by the server (data or draftData) or
  // successfully PUT'd as a draft. Used to avoid resending the same
  // payload twice (initial mount, cache refresh round-trips) and to
  // detect when a local edit produces nothing actually changed.
  const lastSyncedRef = useRef(/** @type {string | null} */ (null));
  const draftStatusResetRef = useRef(
    /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  );

  // Seed local form state when both schema + item have arrived. Prefer
  // the in-progress draft so the admin sees their last in-flight edits
  // across reloads; fall back to the published data otherwise. Re-seed
  // on refetch / cache update so the form reflects the latest server
  // state (e.g. after a successful save clears the draft).
  useEffect(() => {
    if (!schema) return;
    const baseline = item?.draftData ?? item?.data ?? {};
    setValues(seedValues(schema.fields, baseline));
    lastSyncedRef.current = stableStringify(baseline);
  }, [schema, item]);

  useEffect(() => () => {
    if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
  }, []);

  /** @param {"saved"|"failed"} kind */
  const flashDraftStatus = (kind) => {
    setDraftStatus(kind);
    if (draftStatusResetRef.current) clearTimeout(draftStatusResetRef.current);
    draftStatusResetRef.current = setTimeout(() => {
      setDraftStatus("idle");
      draftStatusResetRef.current = null;
    }, 900);
  };

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
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
        setDraftStatus("saving");
        if (isVirtualNow) {
          // AutoGenerated: backend derives slug on publish; don't send one.
          // RoleDerived / UserDefined: backend requires the slug to know
          // which virtual entry this draft belongs to.
          const body = slugSource === "AutoGenerated"
            ? { data: payload }
            : { slug, data: payload };
          await saveCollectionNewDraft(config, collection, body, init);
        } else {
          await saveCollectionItemDraft(config, collection, slug, { data: payload }, init);
        }
        if (cancelled) return;
        lastSyncedRef.current = serialized;
        flashDraftStatus("saved");
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[skylab-cms] collection draft autosave failed:", err);
        flashDraftStatus("failed");
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
        const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
        const saved = await upsertCollectionItem(
          config,
          collection,
          slug,
          {
            data: buildPayload(schema.fields, values),
            version: isVirtual ? null : item.version,
          },
          init,
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

  // Revert local edits to the published baseline. We don't call the
  // draft DELETE endpoint - resetting the form to `item.data` makes the
  // autosave effect PUT the published payload back, and the backend
  // auto-clears the draft slot when draft === published (mirrors the
  // content-block discard flow). Clearing the live overlay
  // synchronously means page-side consumers snap back to the published
  // view before the autosave round-trip even fires.
  const undoDraft = () => {
    if (!schema) return;
    setError(null);
    setValues(seedValues(schema.fields, item?.data ?? {}));
    clearCollectionDraft(collection, slug);
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
    isPending, error, draftStatus,
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
          <button
            type="button"
            onClick={save}
            disabled={disabled}
            style={saveButtonStyle}
          >
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <span style={draftStatusStyle(draftStatus)}>{draftStatusLabel(draftStatus)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** @param {"idle"|"saving"|"saved"|"failed"} status */
function draftStatusLabel(status) {
  if (status === "saving") return "Taslak kaydediliyor…";
  if (status === "saved") return "Taslak kaydedildi";
  if (status === "failed") return "Taslak kaydedilemedi";
  return "";
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
  alignSelf: "flex-start",
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

/** @param {"idle"|"saving"|"saved"|"failed"} status */
function draftStatusStyle(status) {
  /** @type {React.CSSProperties} */
  const base = {
    marginLeft: "auto",
    fontSize: 11,
    fontFamily: "ui-monospace, 'SF Mono', monospace",
    color: TEXT_MUTED,
    minHeight: 14,
  };
  if (status === "saved") return { ...base, color: "rgb(150, 210, 160)" };
  if (status === "failed") return { ...base, color: "#ff8b8b" };
  return base;
}