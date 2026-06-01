/**
 * @file Visual tokens, style objects, and the inline CSS string for the
 * admin drawer. Refined direction:
 *
 *   - 4px spacing grid, Inter Tight headings + JetBrains Mono
 *   - explicit type ramp (textHi / text / textMid / textMuted / textFaint)
 *   - inset box-shadow as "borders" so the drawer can layer panes
 *     without hard 1px edges
 *   - block-type glyph badges replace the dekoratif grip
 *   - one status lane at the bottom absorbs the old save bar + header pill
 *   - draft accent (sage) on dirty, collection accent (pink-purple) on
 *     Collection lanes
 *
 * Old token names (BORDER_SOFT, TEXT_MUTED, etc.) are kept as aliases
 * so the editor/field surfaces that consume them stay valid while the
 * card-level visuals migrate.
 */

// ---------------------------------------------------------------------------
// Geometry + motion
// ---------------------------------------------------------------------------

export const PANEL_WIDTH = 460;
export const HANDLE_WIDTH = 22;
export const HANDLE_OVERLAP = 4;

export const PANEL_TRANSITION = {
  type: "tween",
  duration: 0.35,
  ease: [0.32, 0.72, 0.18, 1],
};

export const BODY_TRANSITION = {
  duration: 0.24,
  ease: [0.32, 0.72, 0.18, 1],
};

export const RADIUS = 10;
export const RADIUS_SM = 7;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

// Surfaces
export const BG          = "#1c1815";
export const BG_RAISED   = "#221d18";
export const BG_SUNKEN   = "#171410";
export const SURFACE_1   = "rgba(255,255,255,0.025)";
export const SURFACE_2   = "rgba(255,255,255,0.05)";
export const SURFACE_3   = "rgba(255,255,255,0.08)";
export const HAIRLINE    = "rgba(255,255,255,0.06)";
export const BORDER      = "rgba(255,255,255,0.10)";
export const BORDER_HI   = "rgba(255,255,255,0.18)";
export const BORDER_FOCUS= "rgba(255,255,255,0.30)";

// Text ramp
export const TEXT_HI       = "rgba(255,255,255,0.96)";
export const TEXT          = "rgba(255,255,255,0.82)";
export const TEXT_MID      = "rgba(255,255,255,0.58)";
export const TEXT_MUTED    = "rgba(255,255,255,0.38)";
export const TEXT_FAINT    = "rgba(255,255,255,0.22)";

// Accents
export const ACCENT        = "#c9b896";
export const ACCENT_SOFT   = "rgba(201,184,150,0.14)";
export const ACCENT_LINE   = "rgba(201,184,150,0.30)";

export const COLLECTION_ACCENT = "rgb(220, 195, 225)";
export const COLLECTION_SOFT   = "rgba(220,195,225,0.10)";
export const COLLECTION_LINE   = "rgba(220,195,225,0.30)";

// Status
export const STATUS_OK     = "rgb(150, 210, 160)";
export const STATUS_WARN   = "rgb(232, 192, 130)";
export const STATUS_DANGER = "rgb(232, 132, 152)";
export const STATUS_SAVED  = STATUS_OK;
export const STATUS_FAILED = STATUS_DANGER;

// Typography
export const FONT_SANS = '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

// ---------------------------------------------------------------------------
// Legacy aliases — consumed by editors/CollectionFieldsForm and other
// surfaces that didn't migrate to the new tokens.
// ---------------------------------------------------------------------------

export const PRIMARY_700   = BG_SUNKEN;
export const PRIMARY_600   = BG_RAISED;
export const PRIMARY_500   = BG;
export const BORDER_SOFT   = HAIRLINE;
export const BORDER_STRONG = BORDER_HI;
export const TEXT_PRIMARY  = TEXT_HI;
export const TEXT_SECONDARY= TEXT;

// ---------------------------------------------------------------------------
// Block-type metadata — glyph + accent. Drives the TypeIcon badge on
// every block card, and the small type label on the right of the header.
// ---------------------------------------------------------------------------

/** @type {Record<string, { glyph: string, color: string, label: string }>} */
export const TYPE_META = {
  Text:       { glyph: "Aa", color: "rgb(186, 204, 230)", label: "Text" },
  RichText:   { glyph: "¶", color: "rgb(208, 192, 230)", label: "Rich" },
  Image:      { glyph: "▢", color: "rgb(174, 218, 184)", label: "Image" },
  Link:       { glyph: "↗", color: "rgb(228, 204, 164)", label: "Link" },
  Date:       { glyph: "◷", color: "rgb(184, 222, 214)", label: "Date" },
  List:       { glyph: "≡", color: "rgb(222, 204, 174)", label: "List" },
  Collection: { glyph: "◫", color: COLLECTION_ACCENT, label: "Coll." },
};

// Legacy alias: TYPE_STYLES had { color, bg, ring, label } per type.
// Derived from TYPE_META so the two stay in lock-step.
/** @type {Record<string, { color: string, bg: string, ring: string, label: string }>} */
export const TYPE_STYLES = Object.fromEntries(
  Object.entries(TYPE_META).map(([k, m]) => [
    k,
    {
      color: m.color,
      bg: tintFromColor(m.color, 0.1),
      ring: tintFromColor(m.color, 0.22),
      label: m.label,
    },
  ]),
);

/**
 * Helper: turn a CSS rgb(...) colour into an `rgba(..., a)` tint. Used to
 * derive bg / ring values from a single token without hand-coding alpha
 * forms for every type.
 *
 * @param {string} color
 * @param {number} alpha
 */
function tintFromColor(color, alpha) {
  const match = /^rgb\(([^)]+)\)$/i.exec(color);
  if (!match) return color;
  return `rgba(${match[1]}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Layout — panel shell
// ---------------------------------------------------------------------------

export const panelStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: PANEL_WIDTH,
  background: BG,
  color: TEXT_HI,
  zIndex: 9998,
  font: `13px/1.55 ${FONT_SANS}`,
  letterSpacing: "-0.005em",
  fontFeatureSettings: '"ss01", "cv11"',
  boxShadow: "0 0 40px rgba(0,0,0,0.35)",
};

export const paneContainerStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export const paneStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export const headerStyle = {
  padding: "18px 20px 14px",
  borderBottom: `1px solid ${HAIRLINE}`,
};

export const breadcrumbStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 4,
  font: `11px/1 ${FONT_MONO}`,
  color: TEXT_FAINT,
  marginBottom: 10,
  letterSpacing: "0.01em",
};

export const breadcrumbHomeStyle = {
  color: TEXT_MUTED,
};

export const breadcrumbSepStyle = {
  color: TEXT_FAINT,
};

export const breadcrumbCurrentStyle = {
  color: TEXT,
  fontWeight: 500,
};

export const breadcrumbInactiveStyle = {
  color: TEXT_MUTED,
};

export const breadcrumbItemWrapStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

export const titleBarStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
};

export const pageTitleStyle = {
  margin: 0,
  flex: 1,
  fontSize: 20,
  lineHeight: 1.15,
  letterSpacing: "-0.022em",
  fontWeight: 600,
  color: TEXT_HI,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// Mini "İZLENİYOR / DÜZENLENİYOR" mode chip. Replaces the loud status
// pill from the original.
export const modeChipStyle = {
  font: `9.5px/1 ${FONT_MONO}`,
  letterSpacing: "0.12em",
  color: TEXT_FAINT,
  padding: "4px 7px",
  borderRadius: 4,
  background: SURFACE_1,
  boxShadow: `inset 0 0 0 1px ${HAIRLINE}`,
  flexShrink: 0,
};

export const modeChipDirtyStyle = {
  color: ACCENT,
  background: ACCENT_SOFT,
  boxShadow: `inset 0 0 0 1px ${ACCENT_LINE}`,
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const tabBarStyle = {
  display: "flex",
  alignItems: "stretch",
  gap: 2,
  padding: "0 16px",
  borderBottom: `1px solid ${HAIRLINE}`,
  position: "relative",
};

export const tabBarScrollStyle = {
  display: "flex",
  gap: 2,
  flex: 1,
  overflowX: "auto",
  scrollBehavior: "smooth",
};

export const tabBarChevronStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  marginBottom: -1,
  background: "transparent",
  border: 0,
  color: TEXT_MUTED,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
  flexShrink: 0,
};

export const tabButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 10px",
  marginBottom: -1,
  background: "transparent",
  border: 0,
  borderBottom: "2px solid transparent",
  color: TEXT_MUTED,
  font: `500 12px/1 ${FONT_SANS}`,
  cursor: "pointer",
  transition: "color 140ms ease, border-color 140ms ease",
  fontFamily: "inherit",
  letterSpacing: 0,
};

export const tabButtonActiveStyle = {
  color: TEXT_HI,
};

export const tabLabelStyle = {
  letterSpacing: "-0.005em",
};

export const tabCountBadgeStyle = {
  font: `500 10px/1 ${FONT_MONO}`,
  padding: "3px 6px",
  borderRadius: 99,
  background: SURFACE_2,
  color: TEXT_FAINT,
};

export const tabCountBadgeActiveStyle = {
  color: TEXT_MID,
  background: SURFACE_3,
};

export const tabDirtyDotStyle = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: ACCENT,
  boxShadow: `0 0 6px ${ACCENT}80`,
  marginLeft: -2,
};

// ---------------------------------------------------------------------------
// Toolbar (search)
// ---------------------------------------------------------------------------

export const toolbarStyle = {
  padding: "10px 16px 6px",
};

// Base background + box-shadow set in CSS (`.inscribed-search`) so the
// `:focus-within` rule can swap them.
export const searchWrapStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  height: 30,
  borderRadius: 7,
};

export const searchInputStyle = {
  flex: 1,
  background: "transparent",
  border: 0,
  outline: 0,
  font: `12.5px/1 ${FONT_SANS}`,
  color: TEXT_HI,
  padding: 0,
  fontFamily: "inherit",
};

// Base color + background live on `.inscribed-search-clear` so the
// hover rule can swap them.
export const searchClearStyle = {
  border: 0,
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 2px",
};

// ---------------------------------------------------------------------------
// Group card — flatter, less border
// ---------------------------------------------------------------------------

export const groupCardStyle = {
  background: "transparent",
  overflow: "hidden",
};

export const groupHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 4px 6px 6px",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: TEXT,
  textAlign: "left",
};

export const groupNameStyle = {
  flex: 1,
  font: `600 10.5px/1 ${FONT_MONO}`,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: TEXT_MID,
};

export const groupCountStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  font: `500 10px/1 ${FONT_MONO}`,
  padding: "2px 6px",
  borderRadius: 99,
  background: SURFACE_2,
  color: TEXT_FAINT,
  fontWeight: 500,
};

export const groupDirtyDotStyle = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: ACCENT,
  boxShadow: `0 0 5px ${ACCENT}80`,
};

export const groupBodyStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  paddingTop: 4,
  paddingBottom: 4,
};

// ---------------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------------

export const sectionLabelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px 6px",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: TEXT_FAINT,
  fontWeight: 600,
};

export const sectionLabelCountStyle = {
  fontFamily: FONT_MONO,
  letterSpacing: 0,
  textTransform: "none",
  fontSize: 10,
  color: TEXT_FAINT,
  background: SURFACE_2,
  padding: "1px 6px",
  borderRadius: 99,
  fontWeight: 500,
};

export const listStyle = {
  flex: 1,
  margin: 0,
  padding: "6px 16px 16px",
  listStyle: "none",
  overflowY: "auto",
  scrollbarWidth: "none",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

// ---------------------------------------------------------------------------
// Block card
// ---------------------------------------------------------------------------

// Base structural styles only. The card's surface fill, border ring,
// hover state, dirty rail, and active accents all live on the
// `.inscribed-block-card` CSS class (see `panelCss`) so the variant
// classes (`.is-dirty`, `.inscribed-block-card-active`,
// `.inscribed-block-card-collection-active`) can override them —
// inline styles would otherwise win over CSS.
export const blockCardStyle = {
  borderRadius: RADIUS,
  overflow: "hidden",
};

// `border: 0` is mandatory — this style is spread onto a <button> in
// the card header. Without an explicit override the browser draws its
// default button border (a 2px outset on most engines) which paints
// dark left/right/bottom lines around every card.
export const blockHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  background: "transparent",
  border: 0,
};

export const blockPathStyle = {
  flex: 1,
  font: `500 12px/1.2 ${FONT_MONO}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
};

export const blockTypeLabelStyle = {
  font: `600 9.5px/1 ${FONT_MONO}`,
  color: TEXT_FAINT,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  paddingLeft: 2,
};

export const blockBodyStyle = {
  padding: "12px 12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  borderTop: `1px solid ${HAIRLINE}`,
};

export const blockHintStyle = {
  margin: 0,
  fontSize: 11.5,
  color: TEXT_MUTED,
  lineHeight: 1.45,
};

export const dirtyDotStyle = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: ACCENT,
  boxShadow: `0 0 5px ${ACCENT}80`,
  flexShrink: 0,
};

// Base color + background live on `.inscribed-icon-button` so the
// hover rule can swap them.
export const blockResetStyle = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  border: 0,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

// Type icon badge — replaces the dekoratif grip. Coloured per block type
// via TYPE_META.
export const typeIconStyle = {
  flexShrink: 0,
  width: 24,
  height: 24,
  borderRadius: 6,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  font: `600 12px/1 ${FONT_MONO}`,
};

// Legacy typeChipStyle kept for any caller that still imports it.
export const typeChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  height: 18,
  padding: "0 7px",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  borderRadius: 4,
  textTransform: "uppercase",
  flexShrink: 0,
  background: ACCENT_SOFT,
  color: ACCENT,
  boxShadow: `inset 0 0 0 1px ${ACCENT_LINE}`,
};

// Legacy grip styles kept to avoid breaking older imports. No longer used
// by BlockCard but harmless to expose.
export const gripStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 3px)",
  gridAutoRows: "3px",
  gap: 2,
  flexShrink: 0,
  alignSelf: "center",
};
export const gripDotStyle = {
  width: 3,
  height: 3,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.15)",
  display: "block",
};

export const emptyStateStyle = {
  margin: "8px 16px",
  padding: 16,
  color: TEXT_FAINT,
  fontSize: 12,
  lineHeight: 1.55,
  border: `1px dashed ${BORDER}`,
  borderRadius: RADIUS,
  textAlign: "center",
};

// ---------------------------------------------------------------------------
// Status bar — absorbs the old save-bar + footer status pill
// ---------------------------------------------------------------------------

export const statusBarStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  borderTop: `1px solid ${HAIRLINE}`,
  background: BG_RAISED,
};

export const statusSignalStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: 1,
  minWidth: 0,
};

export const statusDotStyle = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: TEXT_FAINT,
  flexShrink: 0,
  transition: "background 200ms",
  display: "inline-block",
};

export const statusMsgStyle = {
  fontSize: 12,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const statusMsgCleanStyle = {
  color: TEXT_MID,
};

export const statusMsgEmphasisStyle = {
  color: TEXT_HI,
  fontWeight: 600,
};

export const statusTsStyle = {
  font: `11px/1 ${FONT_MONO}`,
  color: TEXT_FAINT,
  marginLeft: 6,
};

export const statusLabelStyle = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: 1,
};

export const statusActionsStyle = {
  display: "flex",
  gap: 4,
  flexShrink: 0,
};

// Buttons inside the status bar (ghost + primary). Background / color /
// box-shadow live on the CSS classes so :hover can swap them — inline
// styles would otherwise win.
export const btnPrimaryStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 7,
  font: `500 12px/1 ${FONT_SANS}`,
  cursor: "pointer",
  border: 0,
  fontFamily: "inherit",
};

export const btnGhostStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 7,
  font: `500 12px/1 ${FONT_SANS}`,
  cursor: "pointer",
  border: 0,
  fontFamily: "inherit",
};

// ---------------------------------------------------------------------------
// Legacy save-bar exports — old code paths import these. Map them to
// the new status-bar visuals so anything still using them looks right
// while the components migrate.
// ---------------------------------------------------------------------------

export const panelFooterStyle = statusBarStyle;
export const dirtyInlineStyle = statusSignalStyle;
export const footerActionsStyle = statusActionsStyle;
export const iconActionStyle = {
  ...btnGhostStyle,
  padding: "7px 10px",
};
export const iconActionPrimaryStyle = btnPrimaryStyle;

// ---------------------------------------------------------------------------
// User footer
// ---------------------------------------------------------------------------

export const footerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px 12px",
  borderTop: `1px solid ${HAIRLINE}`,
  background: BG_SUNKEN,
};

export const avatarStyle = {
  width: 26,
  height: 26,
  borderRadius: 6,
  overflow: "hidden",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: `linear-gradient(135deg, ${ACCENT}, #8a7a55)`,
  color: BG,
};

export const avatarImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

export const avatarInitialsStyle = {
  font: `700 10.5px/1 ${FONT_SANS}`,
  letterSpacing: "0.02em",
};

export const userMetaStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

export const userNameStyle = {
  font: `500 12px/1.2 ${FONT_SANS}`,
  color: TEXT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const userEmailStyle = {
  font: `10px/1.2 ${FONT_MONO}`,
  color: TEXT_FAINT,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// Base color + background live on `.inscribed-logout` so the hover
// rule can swap them.
export const signOutButtonStyle = {
  width: 26,
  height: 26,
  border: 0,
  borderRadius: 6,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  padding: 0,
};

// ---------------------------------------------------------------------------
// Error / conflict messages
// ---------------------------------------------------------------------------

export const errorStyle = {
  margin: "0 16px 8px",
  padding: "10px 12px",
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.28)",
  color: "rgb(254,202,202)",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.5,
};

export const conflictStyle = {
  ...errorStyle,
  background: "rgba(245,158,11,0.10)",
  border: "1px solid rgba(245,158,11,0.28)",
  color: "rgb(254,243,199)",
};

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export const handleButtonStyle = {
  position: "absolute",
  top: 0,
  right: 0,
  transform: `translateX(calc(100% - ${HANDLE_OVERLAP}px))`,
  width: HANDLE_WIDTH,
  height: "100%",
  background: BG_RAISED,
  border: 0,
  borderTop: `1px solid ${HAIRLINE}`,
  borderRight: `1px solid ${HAIRLINE}`,
  borderBottom: `1px solid ${HAIRLINE}`,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

export const handleIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

// ---------------------------------------------------------------------------
// Inline CSS — hover/focus states, scrollbar styling, status pulse,
// dirty/active card variants, animation interpolation for height: auto.
// ---------------------------------------------------------------------------

export const panelCss = `
  /* Modern height-auto interpolation for body collapse animations. */
  @supports (interpolate-size: allow-keywords) {
    :root { interpolate-size: allow-keywords; }
  }

  .inscribed-tabbar-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .inscribed-tabbar-scroll::-webkit-scrollbar { display: none; }

  .inscribed-tabbar-chevron {
    transition: color 120ms ease;
  }
  .inscribed-tabbar-chevron:hover:not(:disabled) { color: ${ACCENT}; }
  .inscribed-tabbar-chevron:disabled { opacity: 0; pointer-events: none; }

  .inscribed-tab:hover { color: ${TEXT}; }

  .inscribed-search {
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${HAIRLINE};
    transition: box-shadow 140ms ease, background 140ms ease;
  }
  .inscribed-search:focus-within {
    background: ${SURFACE_2};
    box-shadow: inset 0 0 0 1px ${BORDER_FOCUS};
  }
  .inscribed-search input::placeholder { color: ${TEXT_FAINT}; }
  .inscribed-search input[type="search"]::-webkit-search-cancel-button,
  .inscribed-search input[type="search"]::-webkit-search-decoration { display: none; }
  .inscribed-search-clear {
    background: transparent;
    color: ${TEXT_FAINT};
    transition: color 140ms ease;
  }
  .inscribed-search-clear:hover { color: ${TEXT}; }

  /* Block card — inset shadow as border. Base surface + ring set here
     so the dirty / active CSS variants can override them (inline styles
     would otherwise win). */
  .inscribed-block-card {
    background: ${SURFACE_1};
    box-shadow: inset 0 0 0 1px ${HAIRLINE};
    transition: box-shadow 160ms ease, background 160ms ease;
  }
  .inscribed-block-card:hover { box-shadow: inset 0 0 0 1px ${BORDER}; }
  /* Collection lane cards (Page-tab Collection blocks + Region-tab item
     cards) keep a faint pink-purple ring in their idle state so the
     whole Collection lane reads as one visual family even before the
     user opens anything. Hover stays on the shared base rule so dirty
     and active state rules below can still win on source order — a
     collection-specific :hover would beat them via specificity. */
  .inscribed-block-card.inscribed-block-card-collection {
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE};
  }
  .inscribed-block-card.is-dirty {
    box-shadow: inset 0 0 0 1px ${ACCENT_LINE}, inset 2px 0 0 ${ACCENT};
  }
  .inscribed-block-card.inscribed-block-card-collection.is-dirty {
    box-shadow: inset 0 0 0 1px ${COLLECTION_LINE}, inset 2px 0 0 ${COLLECTION_ACCENT};
  }
  /* Active rules use a compound selector so they match the (0,2,0)
     specificity of \`.inscribed-block-card.is-dirty\` — and come after
     it in source order so an open + dirty card lands on the active
     accent (sage for regular blocks, pink-purple for Collection lanes)
     instead of the dirty rail. */
  .inscribed-block-card.inscribed-block-card-active {
    box-shadow: inset 0 0 0 1px ${BORDER_HI}, inset 3px 0 0 ${ACCENT};
    background: ${SURFACE_2};
  }
  .inscribed-block-card.inscribed-block-card-collection-active {
    box-shadow: inset 0 0 0 1px ${BORDER_HI}, inset 3px 0 0 ${COLLECTION_ACCENT};
    background: ${SURFACE_2};
  }

  /* Body collapse — height:0 ↔ height:auto via interpolate-size. */
  .inscribed-collapse {
    height: 0;
    overflow: hidden;
    transition: height 240ms cubic-bezier(0.32, 0.72, 0.18, 1);
  }
  .inscribed-collapse.is-open { height: auto; }

  /* Reset (Undo) icon-buttons */
  .inscribed-icon-button {
    background: transparent;
    color: ${TEXT_MUTED};
    transition: color 140ms ease, background-color 140ms ease, filter 140ms ease;
  }
  .inscribed-icon-button:hover:not(:disabled) {
    color: ${ACCENT};
    background-color: ${ACCENT_SOFT};
  }
  .inscribed-icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Status bar buttons */
  .inscribed-btn-primary {
    background: ${TEXT_HI};
    color: ${BG};
    transition: background 140ms ease, color 140ms ease;
  }
  .inscribed-btn-primary:hover:not(:disabled) { background: ${ACCENT}; }
  .inscribed-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .inscribed-btn-ghost {
    background: transparent;
    color: ${TEXT_MID};
    box-shadow: inset 0 0 0 1px ${HAIRLINE};
    transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  .inscribed-btn-ghost:hover:not(:disabled) {
    color: ${TEXT_HI};
    box-shadow: inset 0 0 0 1px ${BORDER};
    background: ${SURFACE_1};
  }
  .inscribed-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Handle */
  .inscribed-handle {
    color: ${TEXT_MUTED};
    transition: color 200ms ease;
  }
  .inscribed-handle:focus-visible { outline: none; }
  .inscribed-handle:hover, .inscribed-handle:focus-visible { color: ${TEXT_HI}; }
  .inscribed-handle-slide {
    transition: transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1), filter 200ms ease;
    will-change: transform, filter;
  }
  .inscribed-handle:hover .inscribed-handle-slide,
  .inscribed-handle:focus-visible .inscribed-handle-slide {
    transform: translateX(var(--slide-x, 3px));
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.55));
  }

  /* Sign-out */
  .inscribed-logout {
    background: transparent;
    color: ${TEXT_MUTED};
    transition: color 140ms ease, background-color 140ms ease;
  }
  .inscribed-logout:hover:not(:disabled) {
    color: ${STATUS_DANGER};
    background-color: rgba(232,132,152,0.10);
  }
  .inscribed-logout:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Form inputs (used by editors + CollectionFieldsForm) */
  input.inscribed-field, textarea.inscribed-field, select.inscribed-field {
    transition: box-shadow 140ms ease, background-color 140ms ease;
  }
  input.inscribed-field:focus, textarea.inscribed-field:focus, select.inscribed-field:focus {
    background-color: ${SURFACE_2};
    box-shadow: inset 0 0 0 1px ${BORDER_FOCUS};
  }
  input.inscribed-field::placeholder, textarea.inscribed-field::placeholder {
    color: ${TEXT_FAINT};
  }

  ul[data-cms-list]::-webkit-scrollbar { display: none; }

  /* Status dot pulse for the saving state */
  @keyframes inscribed-status-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.45; }
  }
  .inscribed-status-pulse { animation: inscribed-status-pulse 1100ms ease-in-out infinite; }

  /* Load more / Create form / Region cards reuse these patterns. */
  .inscribed-load-more { transition: color 140ms ease, border-color 140ms ease, background 140ms ease; }
  .inscribed-load-more:hover:not(:disabled) {
    color: ${TEXT};
    border-color: ${BORDER_HI};
    background: ${SURFACE_1};
  }
  .inscribed-load-more:disabled { opacity: 0.5; cursor: progress; }

  .inscribed-text-button { transition: color 140ms ease, background-color 140ms ease; }
  .inscribed-text-button:hover:not(:disabled) {
    color: ${TEXT_HI};
    background-color: ${SURFACE_1};
  }
  .inscribed-text-button:disabled { opacity: 0.4; cursor: not-allowed; }

  .inscribed-create-card { transition: background 140ms ease, box-shadow 140ms ease; }
`;