"use client";

/**
 * @file Tiptap-based rich-text editor for the admin drawer.
 *
 * StarterKit (paragraph, headings, lists, blockquote, bold/italic/strike,
 * inline code, history) + Link extension. H1 is disabled - page-level
 * heading lives in a separate Text block, body content tops out at H2/H3.
 *
 * Editor is uncontrolled-ish: content is seeded once from `value` and
 * propagated back via `onUpdate`. External replacements (per-block reset,
 * server refetch) flow in through the sync effect that diffs the editor's
 * HTML against the incoming value and calls `setContent` only when they
 * actually differ - typing into the editor mustn't trigger setContent or
 * the cursor jumps to the end of the document on every keystroke.
 *
 * `immediatelyRender: false` keeps Tiptap from instantiating ProseMirror
 * during SSR; the drawer is already lazy-loaded with `ssr: false` from
 * CmsProvider, but the flag is cheap defence-in-depth against future
 * server-rendered admin contexts.
 *
 * Output is HTML. EditableRegion sanitises it with DOMPurify on every
 * render path (SSR + client), so an admin pasting hostile markup can
 * only XSS themselves - public visitors see scrubbed output.
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold, Italic, Strikethrough, Heading2, Heading3,
  List as ListIcon, ListOrdered, Quote, Code, Link as LinkIcon,
  Undo2, Redo2,
} from "../icons.jsx";

import { labelStyle, labelTextStyle } from "./styles.js";

const ACCENT       = "#c9b896";
const BORDER       = "rgba(255,255,255,0.10)";
const BORDER_FOCUS = "rgba(255,255,255,0.30)";
const TEXT_MUTED   = "rgba(255,255,255,0.40)";
const TEXT_PRIMARY = "rgba(255,255,255,0.96)";
const SURFACE      = "rgba(255,255,255,0.05)";
const SURFACE_HOVER = "rgba(255,255,255,0.10)";
const ACTIVE_BG    = "rgba(201,184,150,0.15)";

// Tiptap returns "<p></p>" for an empty doc. Normalise that to "" so the
// dirty/clean diff in CmsProvider (JSON.stringify equality vs block.value)
// matches a freshly-seeded empty block instead of marking it permanently
// dirty.
const EMPTY_DOC_HTML = "<p></p>";

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export function RichTextEditor({ value, onChange, disabled }) {
  const suppressUpdateRef = useRef(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "inscribed-rte-content",
      },
    },
    onUpdate: ({ editor }) => {
      if (suppressUpdateRef.current) return;
      const html = editor.getHTML();
      onChange(html === EMPTY_DOC_HTML ? "" : html);
    },
  });

  // Release the suppression once the editor instance is ready so that real
  // user edits are forwarded normally.
  useEffect(() => {
    if (!editor) return;
    suppressUpdateRef.current = false;
    return () => { suppressUpdateRef.current = true; };
  }, [editor]);

  // External value replacements (reset, refetch, discard) need to mirror
  // onto the editor. Skipping when the values match avoids the per-keystroke
  // setContent that would otherwise nuke the cursor position.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (incoming === current) return;
    if (incoming === "" && current === EMPTY_DOC_HTML) return;
    suppressUpdateRef.current = true;
    editor.commands.setContent(incoming || "", false);
    suppressUpdateRef.current = false;
  }, [editor, value]);

  // `editable` is only read at init, so toggle it imperatively when the
  // read-only state changes — this strips the contenteditable affordance
  // off the ProseMirror surface so the value shows but can't be typed into.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>Zengin Metin</span>
      <style>{rteCss}</style>
      <div className="inscribed-rte-shell" style={shellStyle}>
        <Toolbar editor={editor} disabled={disabled} />
        <div style={contentWrapStyle}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </label>
  );
}

/**
 * @param {{ editor: import("@tiptap/react").Editor | null, disabled?: boolean }} props
 */
function Toolbar({ editor, disabled }) {
  if (!editor) {
    return <div style={{ ...toolbarStyle, minHeight: 34 }} />;
  }

  // Read-only: keep the toolbar in the layout for visual continuity but
  // make it inert — no clicks reach the (now non-editable) document.
  if (disabled) {
    return (
      <div
        style={{ ...toolbarStyle, minHeight: 34, opacity: 0.4, pointerEvents: "none" }}
        aria-disabled="true"
      />
    );
  }

  const handleLink = () => {
    const prev = editor.getAttributes("link").href ?? "";
    // eslint-disable-next-line no-alert
    const url = window.prompt("Link URL", prev);
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  // mousedown.preventDefault keeps the editor selection alive across
  // toolbar clicks - without it, clicking Bold blurs the editor, the
  // selection collapses, and the toggle runs against an empty range.
  return (
    <div style={toolbarStyle} onMouseDown={(e) => e.preventDefault()}>
      <Btn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Kalın (Ctrl+B)"
        ariaLabel="Kalın"
      >
        <Bold size={13} />
      </Btn>
      <Btn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="İtalik (Ctrl+I)"
        ariaLabel="İtalik"
      >
        <Italic size={13} />
      </Btn>
      <Btn
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Üstü çizili"
        ariaLabel="Üstü çizili"
      >
        <Strikethrough size={13} />
      </Btn>
      <Btn
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline kod"
        ariaLabel="Inline kod"
      >
        <Code size={13} />
      </Btn>

      <Sep />

      <Btn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Başlık 2"
        ariaLabel="Başlık 2"
      >
        <Heading2 size={13} />
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Başlık 3"
        ariaLabel="Başlık 3"
      >
        <Heading3 size={13} />
      </Btn>

      <Sep />

      <Btn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Madde listesi"
        ariaLabel="Madde listesi"
      >
        <ListIcon size={13} />
      </Btn>
      <Btn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numaralı liste"
        ariaLabel="Numaralı liste"
      >
        <ListOrdered size={13} />
      </Btn>
      <Btn
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Alıntı"
        ariaLabel="Alıntı"
      >
        <Quote size={13} />
      </Btn>

      <Sep />

      <Btn
        active={editor.isActive("link")}
        onClick={handleLink}
        title="Link"
        ariaLabel="Link"
      >
        <LinkIcon size={13} />
      </Btn>

      <Sep />

      <Btn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Geri al (Ctrl+Z)"
        ariaLabel="Geri al"
      >
        <Undo2 size={13} />
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="İleri al (Ctrl+Shift+Z)"
        ariaLabel="İleri al"
      >
        <Redo2 size={13} />
      </Btn>
    </div>
  );
}

/**
 * @param {{
 *   active?: boolean,
 *   disabled?: boolean,
 *   onClick: () => void,
 *   title: string,
 *   ariaLabel: string,
 *   children: React.ReactNode,
 * }} props
 */
function Btn({ active, disabled, onClick, title, ariaLabel, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      className={active ? "inscribed-rte-btn inscribed-rte-btn-active" : "inscribed-rte-btn"}
      style={btnStyle}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden="true" style={sepStyle} />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const shellStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  background: SURFACE,
  overflow: "hidden",
});

const toolbarStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1.5,
  padding: 4,
  borderBottom: `1px solid ${BORDER}`,
  background: "rgba(255,255,255,0.02)",
});

const btnStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  padding: 0,
  border: 0,
  borderRadius: 5,
  background: "transparent",
  color: TEXT_MUTED,
  cursor: "pointer",
  transition: "background-color 120ms ease, color 120ms ease",
});

const sepStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-block",
  width: 1,
  height: 16,
  margin: "0 4px",
  background: BORDER,
});

const contentWrapStyle = /** @type {React.CSSProperties} */ ({
  padding: "10px 12px",
  minHeight: 120,
  fontSize: 13,
  lineHeight: 1.6,
  color: TEXT_PRIMARY,
});

// Tiptap renders into a contenteditable div; ProseMirror does not accept
// inline styles on the editable surface, so we style it via a class. Also
// covers focus state on the shell (no native :focus-within in inline styles)
// and the typographic baseline for headings/lists/blockquotes/code.
const rteCss = `
  .inscribed-rte-btn:hover:not(:disabled) {
    background: ${SURFACE_HOVER};
    color: ${TEXT_PRIMARY};
  }
  .inscribed-rte-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .inscribed-rte-btn-active {
    background: ${ACTIVE_BG} !important;
    color: ${ACCENT} !important;
  }
  .inscribed-rte-content {
    outline: none;
    min-height: 100px;
  }
  .inscribed-rte-content p {
    margin: 0 0 0.6em;
  }
  .inscribed-rte-content p:last-child {
    margin-bottom: 0;
  }
  .inscribed-rte-content h2 {
    margin: 0.4em 0 0.4em;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${TEXT_PRIMARY};
  }
  .inscribed-rte-content h3 {
    margin: 0.4em 0 0.3em;
    font-size: 14px;
    font-weight: 600;
    color: ${TEXT_PRIMARY};
  }
  .inscribed-rte-content ul,
  .inscribed-rte-content ol {
    margin: 0 0 0.6em;
    padding-left: 1.4em;
  }
  .inscribed-rte-content li {
    margin: 0.15em 0;
  }
  .inscribed-rte-content blockquote {
    margin: 0 0 0.6em;
    padding: 4px 10px;
    border-left: 2px solid ${ACCENT};
    color: rgba(255,255,255,0.75);
    font-style: italic;
  }
  .inscribed-rte-content code {
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255,255,255,0.08);
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
    font-size: 0.9em;
  }
  .inscribed-rte-content a {
    color: ${ACCENT};
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .inscribed-rte-content:focus {
    outline: none;
  }
  .ProseMirror-focused {
    outline: none;
  }
  /* Focus ring on the shell when the editor inside has focus. Inline
     border-color on the shell div forces !important to override. */
  .inscribed-rte-shell:focus-within {
    border-color: ${BORDER_FOCUS} !important;
  }
`;