"use client";

/**
 * @file Slide-in admin panel for inline editing.
 *
 * Mounted only when `isAdmin` is true (gated by `CmsProvider`). The panel
 * always lives in the DOM but is translated off-screen left when closed; a
 * chevron handle attached to its right edge stays visible at x=0 so admins
 * can re-open it. The handle slides with the panel - it's part of the same
 * `motion.aside`, not a separate fixed element.
 *
 * Layout (top to bottom):
 *   - Header:  small mono breadcrumb + page title + draft/published status pill
 *   - Body:    every block on the page rendered as an inline-editable card -
 *              header (block path + type chip) + the type-specific editor
 *              wired directly to a per-path draft. EditableRegion clicks just
 *              scroll/highlight the matching card; there is no separate
 *              editor view.
 *   - Footer:  global dirty banner with discard-all / save-all (single
 *              atomic `savePage` call), then user info + sign-out.
 *
 * Visual tokens, style objects, and the panel CSS string live in
 * `admin-drawer-styles.js`. Anything cosmetic should land there - this file
 * is layout + state only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronDown, Check, Undo2, LogOut } from "lucide-react";

import { useCmsContext } from "../lib/context.js";
import { useCmsAdmin } from "../hooks/use-cms-admin.js";
import { CmsApiError } from "../lib/api-client.js";

import { TextEditor } from "./editors/TextEditor.jsx";
import { RichTextEditor } from "./editors/RichTextEditor.jsx";
import { ImageEditor } from "./editors/ImageEditor.jsx";
import { LinkEditor } from "./editors/LinkEditor.jsx";
import { DateEditor } from "./editors/DateEditor.jsx";

import {
  PANEL_WIDTH,
  PANEL_TRANSITION,
  ACCENT,
  TEXT_MUTED,
  TYPE_STYLES,
  panelStyle,
  paneContainerStyle,
  paneStyle,
  headerStyle,
  breadcrumbStyle,
  breadcrumbItemWrapStyle,
  breadcrumbCurrentStyle,
  breadcrumbInactiveStyle,
  breadcrumbSepStyle,
  titleBarStyle,
  pageTitleStyle,
  statusPillStyle,
  statusDotStyle,
  sectionLabelStyle,
  sectionLabelCountStyle,
  listStyle,
  blockCardStyle,
  blockHeaderStyle,
  gripStyle,
  gripDotStyle,
  blockPathStyle,
  blockBodyStyle,
  dirtyChipStyle,
  blockResetStyle,
  emptyStateStyle,
  panelFooterStyle,
  dirtyInlineStyle,
  footerActionsStyle,
  iconActionStyle,
  iconActionPrimaryStyle,
  typeChipStyle,
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
 * @import { BlockResponse, BlockType, UpdateBlockItem } from "../lib/schemas.js"
 */

export function AdminDrawer() {
  const {
    activeBlock,
    setActiveBlock,
    blocks,
    drafts,
    setDraft,
    clearDraft,
    clearDrafts,
    isDrawerOpen,
    setDrawerOpen,
    userInfo,
    onSignOut,
  } = useCmsContext();
  const { savePage, isSaving, error } = useCmsAdmin();
  const pathname = usePathname() ?? "/";

  const blockList = useMemo(
    () => Array.from(blocks.values()).sort((a, b) => a.sortOrder - b.sortOrder),
    [blocks],
  );

  // Auto-open the panel when an EditableRegion in the page is clicked.
  useEffect(() => {
    if (activeBlock && !isDrawerOpen) setDrawerOpen(true);
  }, [activeBlock, isDrawerOpen, setDrawerOpen]);

  // Build the list of dirty updates. A draft is "dirty" if its serialised
  // form differs from the saved value - JSON.stringify works for both
  // primitives and our small `{src, alt}` / `{href, label}` shapes.
  /** @type {UpdateBlockItem[]} */
  const dirtyUpdates = useMemo(() => {
    /** @type {UpdateBlockItem[]} */
    const out = [];
    for (const [blockPath, value] of drafts) {
      const block = blocks.get(blockPath);
      if (!block) continue;
      if (JSON.stringify(value) !== JSON.stringify(block.value)) {
        out.push({ blockPath, value, version: block.version });
      }
    }
    return out;
  }, [drafts, blocks]);

  const dirtyCount = dirtyUpdates.length;

  const onSaveAll = async () => {
    if (dirtyCount === 0) return;
    try {
      await savePage(dirtyUpdates);
      for (const u of dirtyUpdates) clearDraft(u.blockPath);
      setActiveBlock(null);
    } catch {
      // Error surfaced via useCmsAdmin().error - keep drafts intact so the
      // user can retry / inspect.
    }
  };

  const onDiscardAll = () => {
    clearDrafts();
  };

  const isConflict = error instanceof CmsApiError && error.isConflict;
  const isForbidden = error instanceof CmsApiError && error.isForbidden;
  const breadcrumbs = pathnameToBreadcrumbs(pathname);

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

          <BlockList
            blockList={blockList}
            drafts={drafts}
            setDraft={setDraft}
            clearDraft={clearDraft}
            activeBlockPath={activeBlock}
            onFocus={setActiveBlock}
          />

          {error ? (
            <div style={isConflict ? conflictStyle : errorStyle}>
              {isConflict
                ? "Bir blok başka biri tarafından güncellendi. En son sürüm yüklendi - kontrol edip tekrar dene."
                : isForbidden
                  ? "Yetkiniz yok. Bu içeriği düzenleme izniniz bulunmuyor."
                  : (error.message ?? "Kaydedilemedi")}
            </div>
          ) : null}

          {dirtyCount > 0 || isSaving ? (
            <SaveBar
              dirtyCount={dirtyCount}
              isSaving={isSaving}
              onDiscard={onDiscardAll}
              onSave={onSaveAll}
            />
          ) : null}

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
              // CSS variable consumed by `.skylab-cms-handle:hover .slide`.
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
 * @param {{
 *   breadcrumbs: { label: string }[],
 *   dirty: boolean,
 * }} props
 */
function PanelHeader({ breadcrumbs, dirty }) {
  const pageLabel = breadcrumbs[breadcrumbs.length - 1]?.label ?? "";

  return (
    <header style={headerStyle}>
      <nav style={breadcrumbStyle} aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} style={breadcrumbItemWrapStyle}>
            {i > 0 ? <span style={breadcrumbSepStyle}>›</span> : null}
            <span
              style={
                i === breadcrumbs.length - 1
                  ? breadcrumbCurrentStyle
                  : breadcrumbInactiveStyle
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <div style={titleBarStyle}>
        <h2 style={pageTitleStyle}>{pageLabel}</h2>
        <span
          style={statusPillStyle}
          title={dirty ? "Kaydedilmemiş değişiklik var" : "Tüm değişiklikler kaydedildi"}
        >
          <span
            style={{
              ...statusDotStyle,
              background: dirty ? ACCENT : "rgba(255,255,255,0.3)",
            }}
          />
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Block list (inline-editable cards)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   blockList: BlockResponse[],
 *   drafts: Map<string, *>,
 *   setDraft: (blockPath: string, value: *) => void,
 *   clearDraft: (blockPath: string) => void,
 *   activeBlockPath: string | null,
 *   onFocus: (blockPath: string | null) => void,
 * }} props
 */
function BlockList({ blockList, drafts, setDraft, clearDraft, activeBlockPath, onFocus }) {
  return (
    <section style={paneStyle}>
      <div style={sectionLabelStyle}>
        <span>Bloklar</span>
        <span style={sectionLabelCountStyle}>{blockList.length}</span>
      </div>

      {blockList.length === 0 ? (
        <div style={emptyStateStyle}>
          Bu sayfada düzenlenebilir blok yok. Yeni bloklar eklemek için
          manifest sync'ini çalıştır.
        </div>
      ) : (
        <ul style={listStyle} data-cms-list>
          {blockList.map((block, i) => (
            <motion.li
              key={block.blockPath}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.2 }}
              style={{ listStyle: "none" }}
            >
              <BlockCard
                block={block}
                draft={drafts.get(block.blockPath)}
                hasDraft={drafts.has(block.blockPath)}
                isActive={activeBlockPath === block.blockPath}
                onChange={(v) => setDraft(block.blockPath, v)}
                onReset={() => clearDraft(block.blockPath)}
                onFocus={() => onFocus(block.blockPath)}
              />
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Block card
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   block: BlockResponse,
 *   draft: *,
 *   hasDraft: boolean,
 *   isActive: boolean,
 *   onChange: (value: *) => void,
 *   onReset: () => void,
 *   onFocus: () => void,
 * }} props
 */
function BlockCard({ block, draft, hasDraft, isActive, onChange, onReset, onFocus }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const value = hasDraft ? draft : block.value;
  const isDirty =
    hasDraft && JSON.stringify(draft) !== JSON.stringify(block.value);

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsOpen(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const handleHeaderClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      onFocus();
    }
  };

  return (
    <div
      ref={ref}
      className={isActive ? "skylab-cms-block-card skylab-cms-block-card-active" : "skylab-cms-block-card"}
      style={blockCardStyle}
    >
      <div 
        style={{ ...blockHeaderStyle, cursor: "pointer", userSelect: "none" }}
        onClick={handleHeaderClick}
      >
        <span style={gripStyle} aria-hidden="true">
          <span style={gripDotStyle} /><span style={gripDotStyle} />
          <span style={gripDotStyle} /><span style={gripDotStyle} />
          <span style={gripDotStyle} /><span style={gripDotStyle} />
        </span>
        <span style={blockPathStyle} title={block.blockPath}>
          {block.blockPath}
        </span>
        
        {isDirty ? (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            className="skylab-cms-icon-button"
            style={blockResetStyle}
            aria-label="Bu bloğun değişikliklerini geri al"
            title="Geri al"
          >
            <Undo2 size={13} />
          </button>
        ) : null}

        <motion.span
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "inline-flex", color: TEXT_MUTED }}
        >
          <ChevronDown size={14} />
        </motion.span>
        <TypeChip type={block.blockType} />
      </div>
      
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0.18, 1] }}
            style={{ overflow: "hidden" }}
            onMouseDown={onFocus}
          >
            <div style={blockBodyStyle}>
              {renderEditor(block, value, onChange)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save bar (global dirty banner + actions)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   dirtyCount: number,
 *   isSaving: boolean,
 *   onDiscard: () => void,
 *   onSave: () => void,
 * }} props
 */
function SaveBar({ dirtyCount, isSaving, onDiscard, onSave }) {
  return (
    <div style={panelFooterStyle}>
      <div style={dirtyInlineStyle}>
        <span style={{ ...statusDotStyle, background: ACCENT }} />
        <span>
          {isSaving
            ? "Kaydediliyor…"
            : `${dirtyCount} kaydedilmemiş değişiklik`}
        </span>
      </div>
      <div style={footerActionsStyle}>
        <button type="button"
          onClick={onDiscard}
          className="skylab-cms-icon-action"
          style={iconActionStyle}
          aria-label="Tüm değişiklikleri iptal et"
          title="Tüm değişiklikleri iptal et"
          disabled={isSaving}
        >
          <Undo2 size={14} />
        </button>
        <button type="button"
          onClick={onSave}
          className="skylab-cms-icon-action skylab-cms-icon-action-primary"
          style={iconActionPrimaryStyle}
          aria-label="Tümünü kaydet"
          title="Tümünü kaydet"
          disabled={isSaving || dirtyCount === 0}
        >
          <Check size={14} />
          <span>Kaydet</span>
        </button>
      </div>
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
// Type chip
// ---------------------------------------------------------------------------

/** @param {{ type: BlockType }} props */
function TypeChip({ type }) {
  const styles = TYPE_STYLES[type] ?? TYPE_STYLES.Group;
  
  return (
    <span style={typeChipStyle}>
      {styles.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `/about/team` → `[{label:"Anasayfa"}, {label:"About"}, {label:"Team"}]`.
 * `/` → `[{label:"Anasayfa"}]`.
 *
 * @param {string} pathname
 */
function pathnameToBreadcrumbs(pathname) {
  if (pathname === "/") return [{ label: "Anasayfa" }];
  const segments = pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
  const crumbs = [{ label: "Anasayfa" }];
  for (const seg of segments) {
    const label = seg
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toLocaleUpperCase("tr-TR"));
    crumbs.push({ label });
  }
  return crumbs;
}

/**
 * @param {BlockResponse} block
 * @param {*} value
 * @param {(value: *) => void} onChange
 */
function renderEditor(block, value, onChange) {
  switch (/** @type {BlockType} */ (block.blockType)) {
    case "Text":
      return <TextEditor value={value ?? ""} onChange={onChange} />;
    case "RichText":
      return <RichTextEditor value={value ?? ""} onChange={onChange} />;
    case "Image":
      return <ImageEditor value={value} onChange={onChange} />;
    case "Link":
      return <LinkEditor value={value} onChange={onChange} />;
    case "Date":
      return <DateEditor value={value} onChange={onChange} />;
    case "Group":
    case "DataSource":
    default:
      return (
        <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
          <code>{block.blockType}</code> tipi için inline editör henüz yok.
        </div>
      );
  }
}

