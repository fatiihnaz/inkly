/**
 * @file Visual tokens, style objects, and the panel CSS string for
 * `AdminDrawer.jsx`. Extracted from the drawer component so the JSX file
 * stays focused on layout + state and isn't dwarfed by token definitions.
 *
 * Palette mirrors the warm-neutral primary ramp + sage secondary accent
 * from the v3 design (CMS Section Editor v3.html).
 */

// ---------------------------------------------------------------------------
// Animation / sizing constants
// ---------------------------------------------------------------------------

export const PANEL_WIDTH = 440;
export const HANDLE_WIDTH = 22;
// How far the handle's left edge sits inside the panel (i.e. the "negative
// left margin"). Same surface colour on both sides hides the seam.
export const HANDLE_OVERLAP = 4;

// Tween (no overshoot) keyed to the same cubic-bezier the page-content
// CSS transition uses in CmsProvider.
export const PANEL_TRANSITION = {
  type: "tween",
  duration: 0.35,
  ease: [0.32, 0.72, 0.18, 1],
};

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const PRIMARY_700 = "#15110d";
export const PRIMARY_600 = "#1a1612";          // Footer surface
export const PRIMARY_500 = "#221d18";          // Panel base
export const SURFACE_2   = "rgba(255,255,255,0.05)"; // Hover / active surface
export const SURFACE_3   = "rgba(255,255,255,0.03)"; // Card body
export const BORDER         = "rgba(255,255,255,0.10)";
export const BORDER_SOFT    = "rgba(255,255,255,0.05)";
export const BORDER_STRONG  = "rgba(255,255,255,0.20)";
export const BORDER_FOCUS   = "rgba(255,255,255,0.30)";
export const TEXT_PRIMARY   = "rgba(255,255,255,0.96)";
export const TEXT_SECONDARY = "rgba(255,255,255,0.80)";
export const TEXT_MUTED     = "rgba(255,255,255,0.40)";
export const TEXT_FAINT     = "rgba(255,255,255,0.30)";
export const ACCENT         = "#c9b896"; // secondary-400 — sage accent

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const panelStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: PANEL_WIDTH,
  background: PRIMARY_500,
  color: TEXT_PRIMARY,
  zIndex: 9998,
  font: "13px/1.5 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  letterSpacing: "-0.005em",
  fontFeatureSettings: '"ss01", "cv11"',
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
  borderBottom: `1px solid ${BORDER}`,
  borderImage: `linear-gradient(to right, transparent 4%, ${BORDER} 15%, ${BORDER} 85%, transparent 96%) 1`,
  paddingBottom: 14,
};

export const breadcrumbStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  fontSize: 11,
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  padding: "10px 16px 6px",
  color: TEXT_FAINT,
  minHeight: 14,
};

export const breadcrumbItemWrapStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export const breadcrumbCurrentStyle = {
  color: TEXT_SECONDARY,
  fontWeight: 500,
};

export const breadcrumbInactiveStyle = {
  color: TEXT_MUTED,
};

export const breadcrumbSepStyle = {
  color: "rgba(255,255,255,0.15)",
};

export const titleBarStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "4px 16px 0",
};

export const pageTitleStyle = {
  margin: 0,
  flex: 1,
  fontSize: 15,
  fontWeight: 600,
  color: TEXT_PRIMARY,
  letterSpacing: "-0.015em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const statusPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  padding: "5px",
  borderRadius: 99,
  background: SURFACE_2,
  color: "rgba(255,255,255,0.6)",
  border: `1px solid ${BORDER}`,
  fontWeight: 500,
  flexShrink: 0,
};

export const statusDotStyle = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: TEXT_FAINT,
  flexShrink: 0,
  display: "inline-block",
};

// ---------------------------------------------------------------------------
// Block list / card
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
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
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
  padding: "4px 14px 14px",
  listStyle: "none",
  overflowY: "auto",
  scrollbarWidth: "none",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export const blockCardStyle = {
  background: SURFACE_3,
  border: `1px solid ${BORDER_SOFT}`,
  borderRadius: 10,
  overflow: "hidden",
};

export const blockHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderBottom: `1px solid ${BORDER_SOFT}`,
  background: SURFACE_3,
};

// Decorative 2x3 grip — actual drag reordering isn't wired up.
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

export const blockPathStyle = {
  flex: 1,
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  fontSize: 11.5,
  color: TEXT_SECONDARY,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const blockBodyStyle = {
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

export const dirtyChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 10,
  padding: "2px 7px",
  borderRadius: 4,
  background: "rgba(201, 184, 150, 0.10)",
  color: ACCENT,
  border: "1px solid rgba(201, 184, 150, 0.25)",
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  flexShrink: 0,
};

export const blockResetStyle = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: 0,
  borderRadius: 5,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

export const emptyStateStyle = {
  padding: "16px",
  margin: "8px 14px",
  color: TEXT_FAINT,
  fontSize: 12,
  lineHeight: 1.55,
  border: `1px dashed ${BORDER}`,
  borderRadius: 10,
  textAlign: "center",
};

// ---------------------------------------------------------------------------
// Save bar
// ---------------------------------------------------------------------------

export const panelFooterStyle = {
  borderTop: `1px solid ${BORDER}`,
  borderImage: `linear-gradient(to right, transparent 4%, ${BORDER} 15%, ${BORDER} 85%, transparent 96%) 1`,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  justifyContent: "space-between",
};

export const dirtyInlineStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  color: "rgba(255,255,255,0.6)",
  flex: 1,
  minWidth: 0,
};

export const footerActionsStyle = {
  display: "flex",
  gap: 6,
  flexShrink: 0,
};

export const iconActionStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 10px",
  borderRadius: 7,
  background: "transparent",
  border: 0,
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
};

export const iconActionPrimaryStyle = {
  ...iconActionStyle,
  background: "#ffffff",
  color: PRIMARY_700,
  borderColor: "#ffffff",
};

// ---------------------------------------------------------------------------
// Type chip
// ---------------------------------------------------------------------------

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
  background: "rgba(201, 184, 150, 0.10)",
  color: ACCENT, 
  boxShadow: "inset 0 0 0 1px rgba(201, 184, 150, 0.25)",
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
  background: PRIMARY_600,
  border: 0,
  borderTop: `1px solid ${BORDER}`,
  borderRight: `1px solid ${BORDER}`,
  borderBottom: `1px solid ${BORDER}`,
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
// User footer
// ---------------------------------------------------------------------------

export const footerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  background: "transparent",
  borderTop: `1px solid ${BORDER}`,
  borderImage: `linear-gradient(to right, transparent 4%, ${BORDER} 15%, ${BORDER} 85%, transparent 96%) 1`,
};

export const avatarStyle = {
  width: 28,
  height: 28,
  borderRadius: 6,
  overflow: "hidden",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #c9b896, #8a7a55)",
  color: PRIMARY_700,
};

export const avatarImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

export const avatarInitialsStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.02em",
};

export const userMetaStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export const userNameStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: "rgba(255,255,255,0.9)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  lineHeight: 1.2,
};

export const userEmailStyle = {
  fontSize: 10,
  color: TEXT_FAINT,
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const signOutButtonStyle = {
  width: 28,
  height: 28,
  background: "transparent",
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
// Status messages
// ---------------------------------------------------------------------------

export const errorStyle = {
  margin: "0 14px 8px",
  padding: "10px 12px",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.28)",
  color: "rgb(254,202,202)",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.5,
};

export const conflictStyle = {
  ...errorStyle,
  background: "rgba(245,158,11,0.1)",
  border: "1px solid rgba(245,158,11,0.28)",
  color: "rgb(254,243,199)",
};

// ---------------------------------------------------------------------------
// Type chip palette (used by the TypeChip component in AdminDrawer.jsx)
// ---------------------------------------------------------------------------

/** @type {Record<string, { color: string, bg: string, ring: string, label: string }>} */
export const TYPE_STYLES = {
  Text:       { color: "rgb(180, 200, 230)", bg: "rgba(120, 150, 200, 0.10)", ring: "rgba(120, 150, 200, 0.22)", label: "Text" },
  RichText:   { color: "rgb(210, 195, 230)", bg: "rgba(150, 130, 200, 0.10)", ring: "rgba(150, 130, 200, 0.22)", label: "Rich" },
  Image:      { color: "rgb(170, 215, 180)", bg: "rgba(110, 180, 130, 0.10)", ring: "rgba(110, 180, 130, 0.22)", label: "Image" },
  Link:       { color: "rgb(225, 200, 160)", bg: "rgba(200, 160, 100, 0.10)", ring: "rgba(200, 160, 100, 0.22)", label: "Link" },
  Date:       { color: "rgb(180, 220, 210)", bg: "rgba(100, 180, 160, 0.10)", ring: "rgba(100, 180, 160, 0.22)", label: "Date" },
  Group:      { color: "rgb(210, 215, 220)", bg: "rgba(255, 255, 255, 0.05)", ring: "rgba(255, 255, 255, 0.10)", label: "Group" },
  DataSource: { color: "rgb(230, 190, 210)", bg: "rgba(220, 140, 180, 0.10)", ring: "rgba(220, 140, 180, 0.22)", label: "Data" },
};

// ---------------------------------------------------------------------------
// Inline CSS — hover/focus/active states + scrollbar styling.
//
// Hover behaviour on the handle:
//   - icon turns pure white and gets a soft glow (filter: drop-shadow)
//   - icon slides via a CSS variable (--slide-x) that the JSX sets based on
//     panel state: positive when closed (chevron points right → slide right),
//     negative when open (chevron points left → slide left). The icon nudges
//     in the direction it points, previewing the click action.
// ---------------------------------------------------------------------------

export const panelCss = `
  .skylab-cms-block-card {
    transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
  }
  .skylab-cms-block-card:hover {
    border-color: ${BORDER_STRONG};
  }
  .skylab-cms-block-card-active {
    border-color: ${BORDER_STRONG};
    box-shadow: inset 2px 0 0 0 ${ACCENT};
  }
  .skylab-cms-icon-button {
    color: ${TEXT_MUTED};
    transition: color 140ms ease, filter 140ms ease;
  }
  .skylab-cms-icon-button:hover:not(:disabled) {
    color: ${ACCENT};
    filter: drop-shadow(0 0 5px rgba(201, 184, 150, 0.45));
  }
  .skylab-cms-icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .skylab-cms-icon-action {
    color: ${TEXT_MUTED};
    transition: color 120ms ease, filter 120ms ease;
  }
  .skylab-cms-icon-action:hover:not(:disabled) {
    color: ${ACCENT};
    filter: drop-shadow(0 0 5px rgba(201, 184, 150, 0.45));
  }
  .skylab-cms-icon-action-primary {
    background: #ffffff !important;
    color: ${PRIMARY_700} !important;
    border-color: #ffffff !important;
  }
  .skylab-cms-icon-action-primary:hover:not(:disabled) {
    background: ${ACCENT} !important;
  }
  .skylab-cms-icon-action:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .skylab-cms-handle {
    color: rgba(255,255,255,0.4);
    transition: color 200ms ease;
  }
  .skylab-cms-handle:focus-visible { outline: none; }
  .skylab-cms-handle:hover, .skylab-cms-handle:focus-visible {
    color: #ffffff;
  }
  .skylab-cms-handle-slide {
    transition: transform 220ms cubic-bezier(0.32, 0.72, 0.18, 1),
                filter 200ms ease;
    will-change: transform, filter;
  }
  .skylab-cms-handle:hover .skylab-cms-handle-slide,
  .skylab-cms-handle:focus-visible .skylab-cms-handle-slide {
    transform: translateX(var(--slide-x, 3px));
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.55));
  }
  .skylab-cms-logout {
    color: ${TEXT_MUTED};
    transition: color 120ms ease, filter 120ms ease;
  }
  .skylab-cms-logout:hover:not(:disabled) {
    color: ${ACCENT};
    filter: drop-shadow(0 0 5px rgba(201, 184, 150, 0.45));
  }
  .skylab-cms-logout:disabled { opacity: 0.4; cursor: not-allowed; }
  input.skylab-cms-field, textarea.skylab-cms-field {
    transition: border-color 140ms ease, background-color 140ms ease;
  }
  input.skylab-cms-field:focus, textarea.skylab-cms-field:focus {
    border-color: ${BORDER_FOCUS};
    background-color: rgba(255,255,255,0.10);
  }
  input.skylab-cms-field::placeholder, textarea.skylab-cms-field::placeholder {
    color: rgba(255,255,255,0.18);
  }
  ul[data-cms-list]::-webkit-scrollbar { display: none; }
`;