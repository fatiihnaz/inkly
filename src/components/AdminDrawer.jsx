"use client";

/**
 * @file Slide-in admin panel for inline editing.
 *
 * Mounted only when `isAdmin` is true (gated by `CmsProvider`). The panel
 * always lives in the DOM but is translated off-screen left when closed; a
 * chevron handle attached to its right edge stays visible at x=0 so admins
 * can re-open it. The handle slides with the panel — it's part of the same
 * `motion.aside`, not a separate fixed element.
 *
 * Layout (top to bottom):
 *   - Header:  mono breadcrumb + page title + tiny "İZLENİYOR / DÜZENLENİYOR"
 *              mode chip. No more loud status pill — draft sync feedback now
 *              lives in the bottom status bar.
 *   - TabBar:  Sayfa / Genel + one per Collection region binding. Each tab
 *              carries a count badge and (when its lane has dirty blocks)
 *              a small sage dirty dot.
 *   - Toolbar: search input above the block list — filters by blockPath
 *              or blockType. Only rendered for Page/Global tabs.
 *   - Body:    block list per tab (cards collapse/expand with smooth
 *              height-auto animations), or `<AdminCollectionRegionPanel>`
 *              for Collection tabs.
 *   - StatusBar: single bottom lane absorbing the old dirty banner +
 *              save bar + footer status pill. Idle ("Kayıtlı · HH:MM"),
 *              saving (pulse), dirty (count + Geri al / Kaydet actions).
 *   - Footer:  user info + sign-out.
 *
 * Visual tokens, style objects, and the panel CSS string live in
 * `admin-drawer-styles.js`. Anything cosmetic should land there — this file
 * is layout + state only.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft, ChevronDown, ChevronLeft, ChevronRight,
  Check, Undo2, LogOut, Search, Eye, Pencil,
} from "lucide-react";

import { useCmsContext } from "../lib/context.js";
import { useCmsSave } from "../hooks/use-cms-save.js";
import { useMyCollections } from "../hooks/use-my-collections.js";
import { CmsApiError } from "../lib/api-client.js";
import { stableStringify } from "../lib/stable-stringify.js";

import { BlockCard, resetBlock } from "./AdminBlockCard.jsx";
import { AdminCollectionRegionPanel } from "./AdminCollectionRegionPanel.jsx";
import { AdminChangesPanel } from "./AdminChangesPanel.jsx";

import {
  PANEL_WIDTH,
  PANEL_TRANSITION,
  ACCENT,
  COLLECTION_ACCENT,
  TEXT,
  TEXT_MID,
  TEXT_MUTED,
  TEXT_FAINT,
  HAIRLINE,
  SURFACE_2,
  FONT_SANS,
  FONT_MONO,
  STATUS_OK,
  STATUS_WARN,
  STATUS_DANGER,
  panelStyle,
  paneContainerStyle,
  paneStyle,
  headerStyle,
  breadcrumbStyle,
  breadcrumbHomeStyle,
  breadcrumbItemWrapStyle,
  breadcrumbSepStyle,
  breadcrumbCurrentStyle,
  breadcrumbInactiveStyle,
  titleBarStyle,
  pageTitleStyle,
  modeChipStyle,
  modeChipDirtyStyle,
  tabBarStyle,
  tabBarScrollStyle,
  tabBarChevronStyle,
  tabButtonStyle,
  tabButtonActiveStyle,
  tabLabelStyle,
  tabCountBadgeStyle,
  tabCountBadgeActiveStyle,
  tabDirtyDotStyle,
  toolbarStyle,
  searchWrapStyle,
  searchInputStyle,
  searchClearStyle,
  groupCardStyle,
  groupHeaderStyle,
  groupNameStyle,
  groupCountStyle,
  groupDirtyDotStyle,
  groupBodyStyle,
  listStyle,
  emptyStateStyle,
  statusBarStyle,
  statusSignalStyle,
  statusDotStyle,
  statusMsgStyle,
  statusMsgCleanStyle,
  statusMsgEmphasisStyle,
  statusTsStyle,
  statusActionsStyle,
  btnPrimaryStyle,
  btnGhostStyle,
  handleButtonStyle,
  handleIconStyle,
  footerStyle,
  avatarStyle,
  avatarImgStyle,
  avatarInitialsStyle,
  userMetaStyle,
  userNameStyle,
  userEmailStyle,
  signOutButtonStyle,
  errorStyle,
  conflictStyle,
  panelCss,
} from "./admin-drawer-styles.js";

/**
 * @import { BlockResponse } from "../lib/schemas.js"
 */

export function AdminDrawer() {
  const {
    activeBlock,
    setActiveBlock,
    blocks,
    drafts,
    setDraft,
    clearDraft,
    isDrawerOpen,
    setDrawerOpen,
    itemSchemas,
    collectionBindings,
    collectionListCache,
    collectionDrafts,
    userInfo,
    onSignOut,
    draftSyncStatus,
  } = useCmsContext();
  const myCollections = useMyCollections().collections;
  const {
    dirtyCount, isSaving, error,
    save: onSaveAll, discard: onDiscardAll,
  } = useCmsSave();
  const pathname = usePathname() ?? "/";

  // Search filter (block path + block type). Only applied on Page / Global
  // tabs; Collection lanes have their own filtering UI inside the panel.
  const [search, setSearch] = useState("");

  // Split blocks into page-scoped / global-scoped lists and compute a
  // per-block dirty flag at the drawer level so the tab bar can show a
  // dirty dot without each card re-deriving it. CollectionItem bindings
  // are synthesised into the page list as virtual Collection blocks.
  const { pageBlockList, globalBlockList, dirtyByPath } = useMemo(() => {
    /** @type {BlockResponse[]} */
    const pages = [];
    /** @type {BlockResponse[]} */
    const globals = [];
    /** @type {Map<string, boolean>} */
    const dirty = new Map();

    for (const block of blocks.values()) {
      const slug = block._slug ?? pathname;
      (slug === pathname ? pages : globals).push(block);

      const local = drafts.get(block.blockPath);
      const isDirty = local !== undefined
        ? stableStringify(local) !== stableStringify(block.value)
        : block.draftValue != null;
      dirty.set(block.blockPath, isDirty);
    }
    pages.sort((a, b) => a.sortOrder - b.sortOrder);
    globals.sort((a, b) => a.sortOrder - b.sortOrder);

    let nextSort = pages.length > 0 ? pages[pages.length - 1].sortOrder + 1 : 1;
    for (const [blockPath, binding] of collectionBindings) {
      if (!binding.slug) continue;
      pages.push(/** @type {BlockResponse} */ ({
        blockPath,
        blockType: "Collection",
        value: binding,
        version: 0,
        sortOrder: nextSort++,
        _slug: pathname,
      }));
    }

    return { pageBlockList: pages, globalBlockList: globals, dirtyByPath: dirty };
  }, [blocks, pathname, collectionBindings, drafts]);

  // Tab list. Always: "page", "global". Plus: one tab per collection
  // with a `<CollectionRegion>` binding on the current page that the
  // user has access to (per /me).
  const regionTabs = useMemo(() => {
    /** @type {Set<string>} */
    const pageRegions = new Set();
    for (const [, binding] of collectionBindings) {
      if (binding.slug) continue;
      pageRegions.add(binding.collection);
    }
    /** @type {{ id: string, label: string, count: number, key: string }[]} */
    const out = [];
    for (const my of myCollections) {
      if (!pageRegions.has(my.collectionKey)) continue;
      const cached = collectionListCache.get(my.collectionKey);
      out.push({
        id: `collection:${my.collectionKey}`,
        label: my.collectionKey,
        count: cached?.items.length ?? 0,
        key: my.collectionKey,
      });
    }
    return out;
  }, [collectionBindings, myCollections, collectionListCache]);

  // Per-collection-key dirty flag: any entry in `collectionDrafts` whose
  // composite key (`"{key}:{slug}"`) starts with this collection's key
  // counts as dirty. Covers the live local overlay; server-side drafts
  // (item.draftData) are surfaced per-card by `useCollectionEditor` but
  // not aggregated here — keeping the tab dot driven by visible state.
  const collectionDirtyByKey = useMemo(() => {
    /** @type {Set<string>} */
    const set = new Set();
    for (const draftKey of collectionDrafts.keys()) {
      const i = draftKey.indexOf(":");
      if (i > 0) set.add(draftKey.slice(0, i));
    }
    return set;
  }, [collectionDrafts]);

  const pageDirty = pageBlockList.some((b) => dirtyByPath.get(b.blockPath));
  const globalDirty = globalBlockList.some((b) => dirtyByPath.get(b.blockPath));

  // Diff-able dirty count for the StatusBar's "Önizle" toggle: page +
  // global, excluding Collection synth blocks (their dirty state is
  // per-item and surfaces inside the collection's own region tab, not
  // through the block-level preview).
  const previewableCount = useMemo(() => {
    let n = 0;
    for (const b of pageBlockList) {
      if (b.blockType === "Collection") continue;
      if (dirtyByPath.get(b.blockPath)) n++;
    }
    for (const b of globalBlockList) {
      if (dirtyByPath.get(b.blockPath)) n++;
    }
    return n;
  }, [pageBlockList, globalBlockList, dirtyByPath]);

  const allTabs = useMemo(
    () => [
      { id: "page", label: "Sayfa", count: pageBlockList.length, dirty: pageDirty },
      { id: "global", label: "Genel", count: globalBlockList.length, dirty: globalDirty },
      ...regionTabs.map((t) => ({
        ...t,
        dirty: collectionDirtyByKey.has(t.key),
      })),
    ],
    [pageBlockList.length, globalBlockList.length, regionTabs, pageDirty, globalDirty, collectionDirtyByKey],
  );

  const [activeTab, setActiveTabState] = useState(/** @type {string} */ ("page"));
  // Preview overlay: when on, the body slot renders `AdminChangesPanel`
  // instead of the active tab's content. Toggled by the StatusBar's
  // Önizle / Düzenle button. Auto-closes when there's nothing left to
  // preview (dirty drains to 0) or when the user clicks a different tab.
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (isPreviewOpen && previewableCount === 0) setPreviewOpen(false);
  }, [isPreviewOpen, previewableCount]);
  /** @param {string} tab */
  const setActiveTab = (tab) => {
    if (isPreviewOpen) setPreviewOpen(false);
    setActiveTabState(tab);
  };

  // If the active tab disappears (e.g. navigating away from a page that
  // had a Region binding), fall back to "page" so the user isn't stuck
  // staring at a blank pane. Use the raw setter so an open preview isn't
  // collateral-damaged by a routing event the user didn't initiate.
  useEffect(() => {
    if (allTabs.some((t) => t.id === activeTab)) return;
    setActiveTabState("page");
  }, [allTabs, activeTab]);

  // Per-group collapse state. Storing the *closed* set (not open) means new
  // groups arriving via discovery default to expanded — which is what users
  // want on first sync.
  const [closedGroups, setClosedGroups] = useState(/** @type {Set<string>} */ (new Set()));

  const toggleGroup = (group) => {
    const closing = !closedGroups.has(group);
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
    if (closing && activeBlock && blockPathPrefix(activeBlock) === group) {
      setActiveBlock(null);
    }
  };

  // Auto-open the panel when an EditableRegion in the page is clicked, and
  // switch to the tab that holds it so the matching block card scrolls into
  // view instead of staying hidden behind the wrong tab.
  useEffect(() => {
    if (!activeBlock) return;
    if (!isDrawerOpen) setDrawerOpen(true);
    const block = blocks.get(activeBlock);
    if (!block) return;
    const slug = block._slug ?? pathname;
    const tab = slug === pathname ? "page" : "global";
    setActiveTab(tab);
    const prefix = blockPathPrefix(block.blockPath);
    if (prefix == null) return;
    setClosedGroups((prev) => {
      if (!prev.has(prefix)) return prev;
      const next = new Set(prev);
      next.delete(prefix);
      return next;
    });
  }, [activeBlock, blocks, pathname, isDrawerOpen, setDrawerOpen]);

  // Track the wall-clock time of the most recent successful save so the
  // status bar can show "Kayıtlı · HH:MM" once dirty drains.
  const [lastSavedAt, setLastSavedAt] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    if (draftSyncStatus === "saved") {
      const now = new Date();
      setLastSavedAt(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      );
    }
  }, [draftSyncStatus]);

  const isConflict = error instanceof CmsApiError && error.isConflict;
  const isForbidden = error instanceof CmsApiError && error.isForbidden;
  const breadcrumbs = pathnameToBreadcrumbs(pathname);

  // Search filter used by the visible block lists. Empty search lets
  // everything through.
  const matchSearch = (block) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return block.blockPath.toLowerCase().includes(q)
        || block.blockType.toLowerCase().includes(q);
  };

  const filteredPage = useMemo(
    () => pageBlockList.filter(matchSearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageBlockList, search],
  );
  const filteredGlobal = useMemo(
    () => globalBlockList.filter(matchSearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalBlockList, search],
  );

  return (
    <>
      <style>{panelCss}</style>
      <motion.aside
        initial={false}
        animate={{ x: isDrawerOpen ? 0 : -PANEL_WIDTH }}
        transition={PANEL_TRANSITION}
        style={panelStyle}
        aria-hidden={!isDrawerOpen}
      >
        <div style={paneContainerStyle}>
          <PanelHeader breadcrumbs={breadcrumbs} dirty={dirtyCount > 0} />

          {isPreviewOpen ? (
            <PreviewHeader
              count={previewableCount}
              onBack={() => setPreviewOpen(false)}
            />
          ) : (
            <TabBar
              tabs={allTabs}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          )}

          {isPreviewOpen ? (
            <AdminChangesPanel
              blockList={[...pageBlockList, ...globalBlockList]}
              drafts={drafts}
              dirtyByPath={dirtyByPath}
              itemSchemas={itemSchemas}
              onGoToBlock={(block) => {
                setPreviewOpen(false);
                const scope = (block._slug ?? pathname) === pathname ? "page" : "global";
                setActiveTabState(scope);
                setActiveBlock(block.blockPath);
              }}
            />
          ) : (activeTab === "page" || activeTab === "global") ? (
            <>
              <Toolbar value={search} onChange={setSearch} />
              <GroupedBlockList
                blockList={activeTab === "page" ? filteredPage : filteredGlobal}
                drafts={drafts}
                setDraft={setDraft}
                clearDraft={clearDraft}
                activeBlockPath={activeBlock}
                onFocus={setActiveBlock}
                itemSchemas={itemSchemas}
                closedGroups={closedGroups}
                onToggleGroup={toggleGroup}
                dirtyByPath={dirtyByPath}
                emptyHint={
                  search
                    ? `"${search}" araması için sonuç yok.`
                    : activeTab === "page"
                      ? "Bu sayfada düzenlenebilir blok yok. Yeni bloklar eklemek için manifest sync'ini çalıştır."
                      : "Henüz scope=\"global\" işaretli blok yok."
                }
              />
            </>
          ) : activeTab.startsWith("collection:") ? (
            <AdminCollectionRegionPanel
              collectionKey={activeTab.slice("collection:".length)}
            />
          ) : null}

          {error ? (
            <div style={isConflict ? conflictStyle : errorStyle}>
              {isConflict
                ? "Bir blok başka biri tarafından güncellendi. En son sürüm yüklendi — kontrol edip tekrar dene."
                : isForbidden
                  ? "Yetkiniz yok. Bu içeriği düzenleme izniniz bulunmuyor."
                  : (error.message ?? "Kaydedilemedi")}
            </div>
          ) : null}

          <StatusBar
            dirtyCount={dirtyCount}
            isSaving={isSaving}
            draftSyncStatus={draftSyncStatus}
            lastSavedAt={lastSavedAt}
            onDiscardAll={onDiscardAll}
            onSaveAll={onSaveAll}
            previewableCount={previewableCount}
            isPreviewOpen={isPreviewOpen}
            onTogglePreview={() => setPreviewOpen((v) => !v)}
          />

          {userInfo ? (
            <PanelFooter userInfo={userInfo} onSignOut={onSignOut} />
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(!isDrawerOpen)}
          className="skylab-cms-handle"
          style={handleButtonStyle}
          aria-label={isDrawerOpen ? "Paneli kapat" : "Paneli aç"}
          aria-expanded={isDrawerOpen}
          title={isDrawerOpen ? "Paneli kapat" : "Paneli aç"}
        >
          <span
            className="skylab-cms-handle-slide"
            style={{
              ...handleIconStyle,
              "--slide-x": isDrawerOpen ? "-3px" : "3px",
            }}
          >
            <motion.span
              initial={false}
              animate={{ rotate: isDrawerOpen ? 0 : 180 }}
              transition={{ duration: 0.25, ease: PANEL_TRANSITION.ease }}
              style={handleIconStyle}
            >
              <ChevronsLeft size={14} />
            </motion.span>
          </span>
        </button>
      </motion.aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * @param {{ breadcrumbs: { label: string }[], dirty: boolean }} props
 */
function PanelHeader({ breadcrumbs, dirty }) {
  const pageLabel = breadcrumbs[breadcrumbs.length - 1]?.label ?? "";

  return (
    <header style={headerStyle}>
      <nav style={breadcrumbStyle} aria-label="Breadcrumb">
        <span style={breadcrumbHomeStyle}>~</span>
        {breadcrumbs.slice(1).map((crumb, i, arr) => (
          <span key={i} style={breadcrumbItemWrapStyle}>
            <span style={breadcrumbSepStyle}>/</span>
            <span
              style={i === arr.length - 1 ? breadcrumbCurrentStyle : breadcrumbInactiveStyle}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <div style={titleBarStyle}>
        <h2 style={pageTitleStyle}>{pageLabel}</h2>
        <span
          style={dirty ? { ...modeChipStyle, ...modeChipDirtyStyle } : modeChipStyle}
          title={dirty ? "Kaydedilmemiş değişiklikler var" : "Sayfa izleniyor"}
        >
          {dirty ? "DÜZENLENİYOR" : "İZLENİYOR"}
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   tabs: { id: string, label: string, count: number, dirty?: boolean }[],
 *   activeTab: string,
 *   onChange: (tab: string) => void,
 * }} props
 */
function TabBar({ tabs, activeTab, onChange }) {
  const scrollRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const [indicator, setIndicator] = useState(/** @type {{ left: number, width: number, color: string } | null} */ (null));

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflow({
      left: el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs, measure]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-tab-id="${CSS.escape(activeTab)}"]`);
    if (btn instanceof HTMLElement) {
      btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      setIndicator({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
        color: activeTab.startsWith("collection:") ? COLLECTION_ACCENT : ACCENT,
      });
    }
    requestAnimationFrame(measure);
  }, [activeTab, tabs, measure]);

  const nudge = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div style={tabBarStyle}>
      {overflow.left ? (
        <button
          type="button"
          onClick={() => nudge(-1)}
          className="skylab-cms-tabbar-chevron"
          style={tabBarChevronStyle}
          aria-label="Önceki sekmeler"
        >
          <ChevronLeft size={14} />
        </button>
      ) : null}
      <div
        ref={scrollRef}
        role="tablist"
        className="skylab-cms-tabbar-scroll"
        style={{ ...tabBarScrollStyle, position: "relative" }}
        onScroll={measure}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            count={tab.count}
            dirty={Boolean(tab.dirty)}
            active={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
          />
        ))}
        {indicator ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: -1,
              left: indicator.left,
              width: indicator.width,
              height: 2,
              background: indicator.color,
              borderRadius: 1,
              transition: "left 200ms cubic-bezier(0.32, 0.72, 0.18, 1), width 200ms cubic-bezier(0.32, 0.72, 0.18, 1), background-color 180ms ease",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
      {overflow.right ? (
        <button
          type="button"
          onClick={() => nudge(1)}
          className="skylab-cms-tabbar-chevron"
          style={tabBarChevronStyle}
          aria-label="Sonraki sekmeler"
        >
          <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   id: string, label: string, count: number,
 *   active: boolean, dirty: boolean, onClick: () => void,
 * }} props
 */
function TabButton({ id, label, count, active, dirty, onClick }) {
  const isCollection = id.startsWith("collection:");
  const activeStyle = active
    ? {
        ...tabButtonStyle,
        ...tabButtonActiveStyle,
        ...(isCollection ? { color: COLLECTION_ACCENT } : null),
      }
    : tabButtonStyle;
  return (
    <button
      type="button"
      role="tab"
      data-tab-id={id}
      aria-selected={active}
      onClick={onClick}
      className="skylab-cms-tab"
      style={activeStyle}
    >
      <span style={tabLabelStyle}>{label}</span>
      <span
        style={active ? { ...tabCountBadgeStyle, ...tabCountBadgeActiveStyle } : tabCountBadgeStyle}
      >
        {count}
      </span>
      {dirty ? <span style={tabDirtyDotStyle} aria-label="kaydedilmemiş değişiklik var" /> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toolbar (search)
// ---------------------------------------------------------------------------

/**
 * @param {{ value: string, onChange: (v: string) => void }} props
 */
function Toolbar({ value, onChange }) {
  return (
    <div style={toolbarStyle}>
      <div className="skylab-cms-search" style={searchWrapStyle}>
        <Search size={13} color={TEXT_FAINT} />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Blok ara (yol veya tip)"
          aria-label="Blok ara"
          style={searchInputStyle}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="skylab-cms-search-clear"
            style={searchClearStyle}
            aria-label="Temizle"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   blockList: BlockResponse[],
 *   drafts: Map<string, *>,
 *   setDraft: (blockPath: string, value: *) => void,
 *   clearDraft: (blockPath: string) => void,
 *   activeBlockPath: string | null,
 *   onFocus: (blockPath: string | null) => void,
 *   itemSchemas: Map<string, import("../lib/schemas.js").ItemSchema>,
 *   closedGroups: Set<string>,
 *   onToggleGroup: (group: string) => void,
 *   dirtyByPath: Map<string, boolean>,
 *   emptyHint: string,
 * }} props
 */
function GroupedBlockList({
  blockList, drafts, setDraft, clearDraft, activeBlockPath, onFocus,
  itemSchemas, closedGroups, onToggleGroup, dirtyByPath, emptyHint,
}) {
  const chunks = useMemo(() => chunkBlocksByPrefix(blockList), [blockList]);

  return (
    <section style={paneStyle}>
      {blockList.length === 0 ? (
        <div style={emptyStateStyle}>{emptyHint}</div>
      ) : (
        <ul style={listStyle} data-cms-list>
          {chunks.map((chunk) =>
            chunk.type === "single" ? (
              <li key={`s:${chunk.block.blockPath}`} style={{ listStyle: "none" }}>
                <BlockCard
                  block={chunk.block}
                  draft={drafts.get(chunk.block.blockPath)}
                  hasDraft={drafts.has(chunk.block.blockPath)}
                  isActive={activeBlockPath === chunk.block.blockPath}
                  onChange={(v) => setDraft(chunk.block.blockPath, v)}
                  onReset={() => resetBlock(chunk.block, setDraft, clearDraft)}
                  onFocus={() => onFocus(chunk.block.blockPath)}
                  itemSchema={itemSchemas.get(chunk.block.blockPath) ?? null}
                />
              </li>
            ) : (
              <li key={`g:${chunk.name}`} style={{ listStyle: "none" }}>
                <GroupCard
                  groupName={chunk.name}
                  blocks={chunk.blocks}
                  drafts={drafts}
                  setDraft={setDraft}
                  clearDraft={clearDraft}
                  activeBlockPath={activeBlockPath}
                  onFocus={onFocus}
                  itemSchemas={itemSchemas}
                  dirty={chunk.blocks.some((b) => dirtyByPath.get(b.blockPath))}
                  isOpen={!closedGroups.has(chunk.name)}
                  onToggle={() => onToggleGroup(chunk.name)}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * @param {{
 *   groupName: string,
 *   blocks: BlockResponse[],
 *   drafts: Map<string, *>,
 *   setDraft: (blockPath: string, value: *) => void,
 *   clearDraft: (blockPath: string) => void,
 *   activeBlockPath: string | null,
 *   onFocus: (blockPath: string | null) => void,
 *   itemSchemas: Map<string, import("../lib/schemas.js").ItemSchema>,
 *   dirty: boolean,
 *   isOpen: boolean,
 *   onToggle: () => void,
 * }} props
 */
function GroupCard({
  groupName, blocks, drafts, setDraft, clearDraft, activeBlockPath, onFocus,
  itemSchemas, dirty, isOpen, onToggle,
}) {
  return (
    <div style={groupCardStyle}>
      <button type="button" style={groupHeaderStyle} onClick={onToggle} aria-expanded={isOpen}>
        <span style={groupNameStyle}>{groupName}</span>
        <span style={groupCountStyle}>
          {blocks.length}
          {dirty ? <span style={groupDirtyDotStyle} aria-label="kaydedilmemiş değişiklik var" /> : null}
        </span>
        <motion.span
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "inline-flex", color: TEXT_MUTED }}
        >
          <ChevronDown size={13} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0.18, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={groupBodyStyle}>
              {blocks.map((block) => (
                <BlockCard
                  key={block.blockPath}
                  block={block}
                  draft={drafts.get(block.blockPath)}
                  hasDraft={drafts.has(block.blockPath)}
                  isActive={activeBlockPath === block.blockPath}
                  onChange={(v) => setDraft(block.blockPath, v)}
                  onReset={() => resetBlock(block, setDraft, clearDraft)}
                  onFocus={() => onFocus(block.blockPath)}
                  itemSchema={itemSchemas.get(block.blockPath) ?? null}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Group prefix is the slice before the first dot. Paths without a dot
 * have no group — returning null tells the caller to render them flat
 * (no group card) instead of inventing a single-item group named after
 * the path itself.
 *
 * @param {string} blockPath
 * @returns {string | null}
 */
function blockPathPrefix(blockPath) {
  const dot = blockPath.indexOf(".");
  return dot === -1 ? null : blockPath.slice(0, dot);
}

/**
 * @typedef {{ type: "single", block: BlockResponse }
 *         | { type: "group", name: string, blocks: BlockResponse[] }} BlockChunk
 */

/**
 * @param {BlockResponse[]} blocks
 * @returns {BlockChunk[]}
 */
function chunkBlocksByPrefix(blocks) {
  /** @type {BlockChunk[]} */
  const chunks = [];
  /** @type {Map<string, number>} */
  const groupChunkIndex = new Map();

  for (const block of blocks) {
    const prefix = blockPathPrefix(block.blockPath);
    if (prefix == null) {
      chunks.push({ type: "single", block });
      continue;
    }
    const existing = groupChunkIndex.get(prefix);
    if (existing != null) {
      const chunk = chunks[existing];
      if (chunk.type === "group") chunk.blocks.push(block);
      continue;
    }
    groupChunkIndex.set(prefix, chunks.length);
    chunks.push({ type: "group", name: prefix, blocks: [block] });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Status bar — absorbs the old dirty banner + save bar + footer pill
// ---------------------------------------------------------------------------

/**
 * Replaces the tab bar while the preview overlay is open. Mirrors the
 * tab bar's height + border so the body content doesn't reflow on the
 * swap; left chip is the "go back" affordance, right chip is a passive
 * label + count badge confirming what the body is showing.
 *
 * @param {{ count: number, onBack: () => void }} props
 */
function PreviewHeader({ count, onBack }) {
  return (
    <div style={previewHeaderStyle}>
      <button
        type="button"
        onClick={onBack}
        className="skylab-cms-preview-back"
        style={previewBackStyle}
        aria-label="Düzenlemeye dön"
      >
        <ChevronLeft size={12} />
        <span>Düzenle</span>
      </button>
      <div style={previewTitleStyle}>
        <span>Değişiklikler</span>
        <span style={previewCountStyle}>{count}</span>
      </div>
    </div>
  );
}

// Match TabBar's child rhythm exactly: the bar has no vertical padding,
// and the back button + title each carry the same 10px top/bottom
// padding tab buttons use (`tabButtonStyle` in `admin-drawer-styles.js`).
// Net height = 10 + 12px text/icon + 10 + 1px border ≈ 33px on both
// surfaces, so swapping between them doesn't reflow the body slot.
const previewHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "stretch",
  justifyContent: "space-between",
  padding: "0 16px",
  borderBottom: `1px solid ${HAIRLINE}`,
});

const previewBackStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "transparent",
  border: 0,
  padding: "10px 8px",
  marginLeft: -8,
  color: TEXT,
  font: `500 12px/1 ${FONT_SANS}`,
  cursor: "pointer",
  fontFamily: "inherit",
});

const previewTitleStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: TEXT_MUTED,
  font: `500 10px/1 ${FONT_MONO}`,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
});

const previewCountStyle = /** @type {React.CSSProperties} */ ({
  font: `500 10px/1 ${FONT_MONO}`,
  padding: "3px 6px",
  borderRadius: 99,
  background: SURFACE_2,
  color: TEXT_MID,
});

/**
 * @param {{
 *   dirtyCount: number,
 *   isSaving: boolean,
 *   draftSyncStatus: "idle"|"saving"|"saved"|"failed",
 *   lastSavedAt: string | null,
 *   onDiscardAll: () => void,
 *   onSaveAll: () => void,
 *   previewableCount: number,
 *   isPreviewOpen: boolean,
 *   onTogglePreview: () => void,
 * }} props
 */
function StatusBar({
  dirtyCount, isSaving, draftSyncStatus, lastSavedAt,
  onDiscardAll, onSaveAll,
  previewableCount, isPreviewOpen, onTogglePreview,
}) {
  const isDirty = dirtyCount > 0;
  const isSyncing = draftSyncStatus === "saving" || isSaving;
  const isFailed  = draftSyncStatus === "failed";

  let dotColor = TEXT_FAINT;
  let dotPulse = false;
  if (isDirty) dotColor = ACCENT;
  else if (isSyncing) { dotColor = STATUS_WARN; dotPulse = true; }
  else if (isFailed) dotColor = STATUS_DANGER;
  else if (lastSavedAt) dotColor = STATUS_OK;

  /** @type {React.ReactNode} */
  let msg;
  if (isSyncing) {
    msg = <span style={statusMsgStyle}>Taslak kaydediliyor…</span>;
  } else if (isDirty) {
    msg = (
      <span style={statusMsgStyle}>
        <span style={statusMsgEmphasisStyle}>{dirtyCount}</span> kaydedilmemiş değişiklik
      </span>
    );
  } else if (isFailed) {
    msg = <span style={statusMsgStyle}>Taslak kaydedilemedi</span>;
  } else if (lastSavedAt) {
    msg = (
      <span style={{ ...statusMsgStyle, ...statusMsgCleanStyle }}>
        Kayıtlı <span style={statusTsStyle}>{lastSavedAt}</span>
      </span>
    );
  } else {
    msg = <span style={{ ...statusMsgStyle, ...statusMsgCleanStyle }}>Hazır</span>;
  }

  return (
    <div style={statusBarStyle}>
      <div style={statusSignalStyle}>
        <span
          className={dotPulse ? "skylab-cms-status-pulse" : undefined}
          style={{
            ...statusDotStyle,
            background: dotColor,
            boxShadow:
              dotColor === ACCENT      ? `0 0 8px ${ACCENT}80`
            : dotColor === STATUS_OK   ? `0 0 6px ${STATUS_OK}66`
            : dotColor === STATUS_WARN ? `0 0 6px ${STATUS_WARN}66`
            : "none",
          }}
        />
        {msg}
      </div>
      {isDirty ? (
        <div style={statusActionsStyle}>
          {previewableCount > 0 ? (
            <button
              type="button"
              onClick={onTogglePreview}
              className="skylab-cms-btn-ghost"
              style={btnGhostStyle}
              aria-label={isPreviewOpen ? "Düzenlemeye dön" : "Değişiklikleri önizle"}
              title={isPreviewOpen ? "Düzenlemeye dön" : "Değişiklikleri önizle"}
              aria-pressed={isPreviewOpen}
            >
              {isPreviewOpen ? <Pencil size={13} /> : <Eye size={13} />}
              <span>{isPreviewOpen ? "Düzenle" : "Önizle"}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDiscardAll}
            disabled={isSaving}
            className="skylab-cms-btn-ghost"
            style={btnGhostStyle}
            aria-label="Tüm değişiklikleri iptal et"
            title="Tüm değişiklikleri iptal et"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            onClick={onSaveAll}
            disabled={isSaving}
            className="skylab-cms-btn-primary"
            style={btnPrimaryStyle}
            aria-label="Tümünü kaydet"
            title="Tümünü kaydet"
          >
            <Check size={13} />
            <span>Kaydet</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer (user info + sign out)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   userInfo: { name: string|null, email: string|null, image: string|null },
 *   onSignOut: (() => void) | null,
 * }} props
 */
function PanelFooter({ userInfo, onSignOut }) {
  const initials = (userInfo.name ?? userInfo.email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <footer style={footerStyle}>
      <div style={avatarStyle} aria-hidden="true">
        {userInfo.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userInfo.image} alt="" style={avatarImgStyle} />
        ) : (
          <span style={avatarInitialsStyle}>{initials}</span>
        )}
      </div>
      <div style={userMetaStyle}>
        <div style={userNameStyle}>{userInfo.name ?? "Anonim"}</div>
        {userInfo.email ? (
          <div style={userEmailStyle} title={userInfo.email}>
            {userInfo.email}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSignOut ?? undefined}
        disabled={!onSignOut}
        className="skylab-cms-logout"
        style={signOutButtonStyle}
        aria-label="Çıkış yap"
        title="Çıkış yap"
      >
        <LogOut size={14} />
      </button>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `/about/team` → `[{label:"Anasayfa"}, {label:"about"}, {label:"team"}]`.
 * `/` → `[{label:"Anasayfa"}]`. Slug segments stay lowercase mono so the
 * mono breadcrumb reads like a filesystem path.
 *
 * @param {string} pathname
 */
function pathnameToBreadcrumbs(pathname) {
  if (pathname === "/") return [{ label: "Anasayfa" }];
  const segments = pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
  const crumbs = [{ label: "Anasayfa" }];
  for (const seg of segments) crumbs.push({ label: seg });
  return crumbs;
}