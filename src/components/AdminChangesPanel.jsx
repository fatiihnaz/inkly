"use client";

/**
 * @file `AdminChangesPanel` — drawer preview overlay. Toggled by the
 * status-bar "Önizle" button when there are unsaved content-block edits;
 * occupies the tab body slot, replacing whatever tab is active so the
 * admin can review every dirty block in one place before committing.
 *
 * Read-only: per-block edit/undo lives on the Sayfa / Genel tabs. The
 * StatusBar's "Düzenle" toggle returns the user to the tab they were on.
 *
 * Diff format: inline word-level red/green via `diffWords`. RichText
 * values are stripped of tags before diffing — markup churn would
 * otherwise drown out the visible content change. List diff is
 * positional (no stable item ids on the wire), so a reorder shows as
 * "removed at N + added at M".
 *
 * Collection blocks are excluded — collection drafts are per-item, not
 * per-block, and surface inside the collection's own region tab.
 */

import { useMemo } from "react";
import { Pencil } from "lucide-react";

import { stableStringify } from "../lib/stable-stringify.js";
import { diffWords, diffLines, stripHtml } from "../lib/word-diff.js";

import {
  TEXT_MUTED,
  TEXT_FAINT,
  TEXT,
  HAIRLINE,
  BORDER,
  SURFACE_1,
  RADIUS_SM,
  FONT_MONO,
  COLLECTION_ACCENT,
  COLLECTION_LINE,
  STATUS_OK,
  STATUS_DANGER,
  STATUS_WARN,
  TYPE_META,
  paneStyle,
  listStyle,
  emptyStateStyle,
  blockCardStyle,
  blockHeaderStyle,
  blockPathStyle,
  blockBodyStyle,
  blockTypeLabelStyle,
  typeIconStyle,
} from "./admin-drawer-styles.js";

/**
 * @import { BlockResponse, BlockType, ItemSchema } from "../lib/schemas.js"
 * @import { DiffOp } from "../lib/word-diff.js"
 */

const DIFF_ADDED = STATUS_OK;
const DIFF_REMOVED = STATUS_DANGER;
const DIFF_CHANGED = STATUS_WARN;

/**
 * @param {{
 *   blockList: BlockResponse[],
 *   drafts: Map<string, *>,
 *   dirtyByPath: Map<string, boolean>,
 *   itemSchemas: Map<string, ItemSchema>,
 *   collectionDirtyCounts: Map<string, Set<string>>,
 *   onGoToBlock: (block: BlockResponse) => void,
 *   onGoToCollection: (collectionKey: string) => void,
 * }} props
 */
export function AdminChangesPanel({
  blockList, drafts, dirtyByPath, itemSchemas,
  collectionDirtyCounts, onGoToBlock, onGoToCollection,
}) {
  const dirty = useMemo(
    () => blockList.filter(
      (b) => b.blockType !== "Collection" && dirtyByPath.get(b.blockPath),
    ),
    [blockList, dirtyByPath],
  );
  const collectionEntries = useMemo(
    () => [...collectionDirtyCounts.entries()]
      .map(([key, set]) => ({ key, count: set.size }))
      .filter((e) => e.count > 0)
      .sort((a, b) => a.key.localeCompare(b.key)),
    [collectionDirtyCounts],
  );

  const isEmpty = dirty.length === 0 && collectionEntries.length === 0;

  return (
    <section style={paneStyle}>
      <div style={scrollStyle}>
        {isEmpty ? (
          <div style={emptyStateStyle}>
            Henüz değişiklik yok.
          </div>
        ) : (
          <ul style={listStyle} data-cms-list>
            {collectionEntries.map((entry) => (
              <li key={`coll:${entry.key}`} style={{ listStyle: "none" }}>
                <CollectionDraftCard
                  collectionKey={entry.key}
                  count={entry.count}
                  onGoToCollection={onGoToCollection}
                />
              </li>
            ))}
            {dirty.map((block) => (
              <li key={block.blockPath} style={{ listStyle: "none" }}>
                <BlockDiffCard
                  block={block}
                  draft={drafts.get(block.blockPath)}
                  itemSchema={itemSchemas.get(block.blockPath) ?? null}
                  onGoToBlock={onGoToBlock}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Header-only card representing a collection with pending item drafts.
 * Same visual scaffolding as `BlockDiffCard` — inset rail, type icon,
 * Düzenle button — so it slots naturally into the same list. No body
 * because we don't surface per-item diffs here; the count is a
 * pointer, the Düzenle button is the way in.
 *
 * @param {{
 *   collectionKey: string,
 *   count: number,
 *   onGoToCollection: (key: string) => void,
 * }} props
 */
function CollectionDraftCard({ collectionKey, count, onGoToCollection }) {
  const meta = TYPE_META.Collection;
  const cardStyle = {
    ...blockCardStyle,
    boxShadow: `inset 0 0 0 1px ${HAIRLINE}, inset 2px 0 0 ${meta.color}`,
  };
  return (
    <div className="inscribed-block-card" style={cardStyle}>
      <div style={blockHeaderStyle}>
        <span
          aria-hidden="true"
          style={{ ...typeIconStyle, color: meta.color }}
        >
          {meta.glyph}
        </span>
        <span style={blockPathStyle} title={collectionKey}>
          {collectionKey}
        </span>
        <span style={collectionDraftCountStyle}>
          {count} taslak
        </span>
        <span style={blockTypeLabelStyle}>{meta.label}</span>
        <button
          type="button"
          onClick={() => onGoToCollection(collectionKey)}
          className="inscribed-icon-button"
          style={goToButtonStyle}
          aria-label={`${collectionKey} koleksiyonunu aç`}
          title="Koleksiyonu aç"
        >
          <Pencil size={11} />
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   block: BlockResponse,
 *   draft: *,
 *   itemSchema: ItemSchema | null,
 *   onGoToBlock: (block: BlockResponse) => void,
 * }} props
 */
function BlockDiffCard({ block, draft, itemSchema, onGoToBlock }) {
  const meta = TYPE_META[block.blockType] ?? TYPE_META.Text;
  // Local in-progress draft takes precedence over the server-side
  // draftValue overlay; falls back to the latter when the user closed
  // the drawer without resetting an autosaved edit.
  const next = draft !== undefined ? draft : block.draftValue;
  const prev = block.value;

  // Text-like blocks share their line-level ops between LineDiff and
  // (previously) the change-count badge. The badge was dropped per UX
  // simplification but the single-compute path is still worth keeping
  // so future surfaces (e.g. an inline preview tooltip) can reuse it
  // without a second LCS pass.
  const ops = useMemo(() => {
    if (block.blockType === "Text" || block.blockType === "RichText") {
      const a = block.blockType === "RichText" ? stripHtml(prev) : String(prev ?? "");
      const b = block.blockType === "RichText" ? stripHtml(next) : String(next ?? "");
      return diffLines(a, b);
    }
    return null;
  }, [block.blockType, prev, next]);

  // Inset rail in the block type's accent colour. Mirrors the
  // `.is-dirty` pattern in `panelCss` so the layout doesn't reflow on
  // tone change — inline style wins over the class' base shadow.
  const cardStyle = {
    ...blockCardStyle,
    boxShadow: `inset 0 0 0 1px ${HAIRLINE}, inset 2px 0 0 ${meta.color}`,
  };
  return (
    <div className="inscribed-block-card" style={cardStyle}>
      <div style={blockHeaderStyle}>
        <span
          aria-hidden="true"
          style={{ ...typeIconStyle, color: meta.color }}
        >
          {meta.glyph}
        </span>
        <span style={blockPathStyle} title={block.blockPath}>
          {block.blockPath}
        </span>
        <span style={blockTypeLabelStyle}>{meta.label}</span>
        <button
          type="button"
          onClick={() => onGoToBlock(block)}
          className="inscribed-icon-button"
          style={goToButtonStyle}
          aria-label={`${block.blockPath} bloğunu düzenle`}
          title="Bu bloğu düzenle"
        >
          <Pencil size={11} />
        </button>
      </div>
      <div style={blockBodyStyle}>
        <DiffContent
          blockType={block.blockType}
          prev={prev}
          next={next}
          itemSchema={itemSchema}
          sharedOps={ops}
        />
      </div>
    </div>
  );
}

/**
 * Type-dispatched diff renderer. Pulled out so the same code path drives
 * both top-level block diffs and the per-field list-item diffs. Atomic
 * primitive diffs are wrapped in a `DiffBox` for visual consistency
 * with the labelled field rows used inside Link / Image / List items.
 *
 * @param {{
 *   blockType: BlockType | string,
 *   prev: *,
 *   next: *,
 *   itemSchema?: ItemSchema | null,
 *   sharedOps?: DiffOp[] | null,
 * }} props
 */
function DiffContent({ blockType, prev, next, itemSchema, sharedOps }) {
  switch (blockType) {
    case "Text":
      return (
        <LineDiff
          prev={String(prev ?? "")}
          next={String(next ?? "")}
          ops={sharedOps ?? undefined}
        />
      );
    case "RichText":
      return (
        <LineDiff
          prev={stripHtml(prev)}
          next={stripHtml(next)}
          ops={sharedOps ?? undefined}
        />
      );
    case "Link":
      return <LinkDiff prev={prev} next={next} />;
    case "Date":
      return <ArrowDiff prev={prev} next={next} />;
    case "Image":
      return <ImageDiff prev={prev} next={next} />;
    case "List":
      return (
        <ListDiff
          oldItems={Array.isArray(prev) ? prev : []}
          newItems={Array.isArray(next) ? next : []}
          itemSchema={itemSchema ?? null}
        />
      );
    default:
      return (
        <InlineWordDiff
          prev={typeof prev === "string" ? prev : stableStringify(prev)}
          next={typeof next === "string" ? next : stableStringify(next)}
        />
      );
  }
}

/**
 * @param {{ prev: string, next: string, ops?: DiffOp[] }} props
 */
function InlineWordDiff({ prev, next, ops: providedOps }) {
  const ops = useMemo(
    () => collapseUnchanged(providedOps ?? diffWords(prev, next)),
    [providedOps, prev, next],
  );
  if (ops.length === 0) {
    return <div style={diffBoxStyle}><span style={emptyValueStyle}>—</span></div>;
  }
  return (
    <div style={{ ...diffBoxStyle, ...inlineDiffStyle }}>
      {ops.map((op, i) => (
        <DiffSpan key={i} op={op} />
      ))}
    </div>
  );
}

const COLLAPSE_THRESHOLD_WORDS = 14;
const COLLAPSE_KEEP_PER_SIDE = 3;

/**
 * Replace long unchanged context with a compact pill so the diff body
 * stays focused on what actually changed. Keeps a few words of context
 * on each side of the elision (or just one side when the run sits at
 * the start / end of the diff) so the surrounding edit still reads in
 * place. Short unchanged runs pass through untouched.
 *
 * @param {DiffOp[]} ops
 * @returns {(DiffOp | { type: "collapsed", count: number })[]}
 */
function collapseUnchanged(ops) {
  /** @type {(DiffOp | { type: "collapsed", count: number })[]} */
  const out = [];
  ops.forEach((op, idx) => {
    if (op.type !== "unchanged") {
      out.push(op);
      return;
    }
    const tokens = op.text.match(/\s+|[^\s]+/g) ?? [];
    const wordCount = tokens.filter((t) => /\S/.test(t)).length;
    if (wordCount <= COLLAPSE_THRESHOLD_WORDS) {
      out.push(op);
      return;
    }
    const isFirst = idx === 0;
    const isLast = idx === ops.length - 1;
    const keepLead = isFirst ? 0 : COLLAPSE_KEEP_PER_SIDE;
    const keepTail = isLast ? 0 : COLLAPSE_KEEP_PER_SIDE;
    const leadEnd = boundaryByWords(tokens, keepLead, "forward");
    const tailStart = boundaryByWords(tokens, keepTail, "backward");
    const head = tokens.slice(0, leadEnd).join("");
    const tail = tokens.slice(tailStart).join("");
    const collapsed = wordCount - keepLead - keepTail;
    if (head) out.push({ type: "unchanged", text: head });
    out.push({ type: "collapsed", count: collapsed });
    if (tail) out.push({ type: "unchanged", text: tail });
  });
  return out;
}

/**
 * Walk a tokenised whitespace/word stream until `wordsKept` actual word
 * tokens have been counted, returning the slice boundary right after
 * (forward) or right before (backward) that boundary. Whitespace is
 * carried along so the rejoined string preserves spacing.
 *
 * @param {string[]} tokens
 * @param {number} wordsKept
 * @param {"forward" | "backward"} dir
 * @returns {number}
 */
function boundaryByWords(tokens, wordsKept, dir) {
  if (wordsKept === 0) return dir === "forward" ? 0 : tokens.length;
  let seen = 0;
  if (dir === "forward") {
    for (let i = 0; i < tokens.length; i++) {
      if (/\S/.test(tokens[i])) {
        seen++;
        if (seen === wordsKept) return i + 1;
      }
    }
    return tokens.length;
  }
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/\S/.test(tokens[i])) {
      seen++;
      if (seen === wordsKept) return i;
    }
  }
  return 0;
}

/**
 * @param {{ op: DiffOp | { type: "collapsed", count: number } }} props
 */
function DiffSpan({ op }) {
  if (op.type === "unchanged") {
    return <span style={unchangedSpanStyle}>{op.text}</span>;
  }
  if (op.type === "removed") {
    return <span style={removedSpanStyle}>{op.text}</span>;
  }
  if (op.type === "added") {
    return <span style={addedSpanStyle}>{op.text}</span>;
  }
  return (
    <span style={collapsedSpanStyle} aria-label={`${op.count} kelime gizlendi`}>
      … {op.count} kelime …
    </span>
  );
}

// ---- LineDiff (GitHub-style unified) -------------------------------------

const HUNK_THRESHOLD_LINES = 6;
const HUNK_KEEP_PER_SIDE = 2;
const PAIR_MIN_SIMILARITY = 0.4;

/**
 * GitHub-style unified line diff for RichText (and any other newline-
 * carrying value). Each op from `diffLines` becomes one row; adjacent
 * removed/added pairs that look like a single-line edit (high
 * character-LCS similarity) render as a paired row with intra-line
 * word highlights, otherwise they stack as two rows. Long runs of
 * unchanged lines collapse to a "@@ … N satır @@" hunk separator with
 * two-column line numbers (old / new).
 *
 * @param {{ prev: string, next: string, ops?: DiffOp[] }} props
 */
function LineDiff({ prev, next, ops: providedOps }) {
  const rows = useMemo(() => {
    const ops = providedOps ?? diffLines(prev, next);
    return applyHunks(buildLineRows(ops));
  }, [providedOps, prev, next]);

  if (rows.length === 0) {
    return <div style={diffBoxStyle}><span style={emptyValueStyle}>—</span></div>;
  }

  return (
    <div style={lineDiffWrapStyle}>
      {rows.map((row, i) => (
        <LineRow key={i} row={row} />
      ))}
    </div>
  );
}

/**
 * Walk the line-level ops and (a) attach old/new line numbers, (b) pair
 * adjacent removed+added ops into a single "changed" row when they
 * resemble an edit rather than an unrelated removal + insertion.
 *
 * @param {DiffOp[]} ops
 * @returns {LineRow[]}
 */
function buildLineRows(ops) {
  /** @type {LineRow[]} */
  const rows = [];
  let oldLine = 1;
  let newLine = 1;
  for (let i = 0; i < ops.length; i++) {
    const cur = ops[i];
    const nxt = ops[i + 1];
    if (
      cur.type === "removed" && nxt && nxt.type === "added"
      && lineSimilarity(cur.text, nxt.text) >= PAIR_MIN_SIMILARITY
    ) {
      rows.push({
        kind: "changed",
        oldLine, newLine,
        oldText: cur.text,
        newText: nxt.text,
      });
      oldLine++;
      newLine++;
      i++; // consume the paired added op
      continue;
    }
    if (cur.type === "unchanged") {
      rows.push({ kind: "unchanged", oldLine, newLine, text: cur.text });
      oldLine++;
      newLine++;
      continue;
    }
    if (cur.type === "removed") {
      rows.push({ kind: "removed", oldLine, newLine: null, text: cur.text });
      oldLine++;
      continue;
    }
    rows.push({ kind: "added", oldLine: null, newLine, text: cur.text });
    newLine++;
  }
  return rows;
}

/**
 * Replace long runs of unchanged rows with a hunk-separator row, keeping
 * `HUNK_KEEP_PER_SIDE` lines of context at each boundary (or zero on the
 * very first / last run). Mirrors git diff's `@@` headers.
 *
 * @param {LineRow[]} rows
 * @returns {LineRow[]}
 */
function applyHunks(rows) {
  /** @type {LineRow[]} */
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "unchanged") {
      out.push(rows[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind === "unchanged") j++;
    const run = j - i;
    if (run <= HUNK_THRESHOLD_LINES) {
      for (let k = i; k < j; k++) out.push(rows[k]);
    } else {
      const isStart = i === 0;
      const isEnd = j === rows.length;
      const keepLead = isStart ? 0 : HUNK_KEEP_PER_SIDE;
      const keepTail = isEnd ? 0 : HUNK_KEEP_PER_SIDE;
      for (let k = i; k < i + keepLead; k++) out.push(rows[k]);
      out.push({ kind: "hunk", count: run - keepLead - keepTail });
      for (let k = j - keepTail; k < j; k++) out.push(rows[k]);
    }
    i = j;
  }
  return out;
}

/**
 * Cheap line-similarity ratio for the row-pairing gate. Same shape as
 * `similarityRatio` in `word-diff.js` but local so the LineDiff stays
 * self-contained.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function lineSimilarity(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  if (n > 200 || m > 200) {
    // Skip the O(N·M) walk on long lines — pair them anyway if either
    // is non-empty and they share at least a common prefix or suffix.
    let commonPrefix = 0;
    const max = Math.min(n, m);
    while (commonPrefix < max && a[commonPrefix] === b[commonPrefix]) commonPrefix++;
    return commonPrefix / Math.max(n, m);
  }
  /** @type {Uint16Array[]} */
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      dp[i + 1][j + 1] = a[i] === b[j]
        ? dp[i][j] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp[n][m] / Math.max(n, m);
}

/**
 * @typedef {(
 *   | { kind: "unchanged", oldLine: number, newLine: number, text: string }
 *   | { kind: "removed", oldLine: number, newLine: null, text: string }
 *   | { kind: "added", oldLine: null, newLine: number, text: string }
 *   | { kind: "changed", oldLine: number, newLine: number, oldText: string, newText: string }
 *   | { kind: "hunk", count: number }
 * )} LineRow
 */

/**
 * @param {{ row: LineRow }} props
 */
function LineRow({ row }) {
  if (row.kind === "hunk") {
    return (
      <div style={lineHunkStyle}>@@ … {row.count} satır …  @@</div>
    );
  }
  if (row.kind === "changed") {
    return <ChangedLinePair row={row} />;
  }
  const tone =
    row.kind === "added" ? lineAddedStyle
    : row.kind === "removed" ? lineRemovedStyle
    : lineUnchangedStyle;
  const glyph = row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " ";
  return (
    <div style={{ ...lineRowBase, ...tone }}>
      <span style={lineNoStyle}>{row.oldLine ?? ""}</span>
      <span style={lineNoStyle}>{row.newLine ?? ""}</span>
      <span style={lineGutterStyle}>{glyph}</span>
      <span style={lineTextStyle}>{renderLineText(row.text)}</span>
    </div>
  );
}

const LONG_TEXT_THRESHOLD = 400;
const LONG_TEXT_KEEP_PER_SIDE = 80;

/**
 * Standalone added/removed/unchanged rows render their full text. For
 * very long content (e.g. a 500-char paragraph wholly removed) the row
 * visually balloons into many wrapped lines that add no extra signal
 * beyond "this whole thing changed". Keep the head + tail, drop the
 * middle behind a character-count pill so the diff stays scannable.
 *
 * @param {string} text
 * @returns {React.ReactNode}
 */
function renderLineText(text) {
  if (!text) return " ";
  if (text.length <= LONG_TEXT_THRESHOLD) return text;
  const head = text.slice(0, LONG_TEXT_KEEP_PER_SIDE);
  const tail = text.slice(-LONG_TEXT_KEEP_PER_SIDE);
  const omitted = text.length - 2 * LONG_TEXT_KEEP_PER_SIDE;
  return (
    <>
      <span>{head}</span>
      <span style={collapsedInlineStyle} aria-label={`${omitted} karakter gizlendi`}>
        … {omitted} karakter …
      </span>
      <span>{tail}</span>
    </>
  );
}

/**
 * Render both sides of a "changed" line pair from a single intra-line
 * word diff, so the O(N·M) word LCS only runs once per changed row.
 *
 * @param {{ row: { kind: "changed", oldLine: number, newLine: number, oldText: string, newText: string } }} props
 */
function ChangedLinePair({ row }) {
  const ops = useMemo(
    () => diffWords(row.oldText, row.newText),
    [row.oldText, row.newText],
  );
  return (
    <>
      <PairedLine kind="removed" oldLine={row.oldLine} newLine={null} ops={ops} side="prev" />
      <PairedLine kind="added" oldLine={null} newLine={row.newLine} ops={ops} side="next" />
    </>
  );
}

/**
 * One side of a paired "changed" line. Filters the shared intra-line
 * ops to keep just the segments visible on this side (unchanged +
 * removed for prev, unchanged + added for next), so the rendered
 * sequence reconstructs the original line with the differing runs
 * highlighted.
 *
 * @param {{
 *   kind: "added" | "removed",
 *   oldLine: number | null,
 *   newLine: number | null,
 *   ops: DiffOp[],
 *   side: "prev" | "next",
 * }} props
 */
function PairedLine({ kind, oldLine, newLine, ops, side }) {
  // Filter to this side then collapse long unchanged context — when the
  // edit is a small change inside a long paragraph the middle stretches
  // wouldn't add information, just walls of muted text.
  const sideOps = useMemo(
    () => collapseUnchanged(
      ops.filter((op) => op.type === "unchanged"
        || (side === "prev" ? op.type === "removed" : op.type === "added")),
    ),
    [ops, side],
  );
  const tone = kind === "added" ? lineAddedStyle : lineRemovedStyle;
  const glyph = kind === "added" ? "+" : "-";
  return (
    <div style={{ ...lineRowBase, ...tone }}>
      <span style={lineNoStyle}>{oldLine ?? ""}</span>
      <span style={lineNoStyle}>{newLine ?? ""}</span>
      <span style={lineGutterStyle}>{glyph}</span>
      <span style={lineTextStyle}>
        {sideOps.length === 0 ? " " : sideOps.map((op, i) => {
          if (op.type === "unchanged") return <span key={i}>{op.text}</span>;
          if (op.type === "removed") return <span key={i} style={pairedRemovedSpanStyle}>{op.text}</span>;
          if (op.type === "added") return <span key={i} style={pairedAddedSpanStyle}>{op.text}</span>;
          return (
            <span key={i} style={collapsedInlineStyle} aria-label={`${op.count} kelime gizlendi`}>
              … {op.count} kelime …
            </span>
          );
        })}
      </span>
    </div>
  );
}

/**
 * @param {{ prev: *, next: * }} props
 */
function LinkDiff({ prev, next }) {
  const prevLabel = prev?.label ?? "";
  const nextLabel = next?.label ?? "";
  const prevHref = prev?.href ?? "";
  const nextHref = next?.href ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabeled label="label">
        <InlineWordDiff prev={prevLabel} next={nextLabel} />
      </FieldLabeled>
      <FieldLabeled label="href">
        <InlineWordDiff prev={prevHref} next={nextHref} />
      </FieldLabeled>
    </div>
  );
}

/**
 * @param {{ prev: *, next: * }} props
 */
function ArrowDiff({ prev, next }) {
  const a = prev == null || prev === "" ? "—" : String(prev);
  const b = next == null || next === "" ? "—" : String(next);
  return (
    <div style={{ ...diffBoxStyle, ...arrowDiffStyle }}>
      <span style={removedSpanStyle}>{a}</span>
      <span style={arrowStyle}>→</span>
      <span style={addedSpanStyle}>{b}</span>
    </div>
  );
}

/**
 * @param {{ prev: *, next: * }} props
 */
function ImageDiff({ prev, next }) {
  const prevSrc = prev?.src ?? null;
  const nextSrc = next?.src ?? null;
  const prevAlt = prev?.alt ?? "";
  const nextAlt = next?.alt ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={imageRowStyle}>
        <ImageSide tone={DIFF_REMOVED} label="Yayında" src={prevSrc} alt={prevAlt} />
        <ImageSide tone={DIFF_ADDED} label="Taslak" src={nextSrc} alt={nextAlt} />
      </div>
      {prevAlt !== nextAlt ? (
        <FieldLabeled label="alt">
          <InlineWordDiff prev={prevAlt} next={nextAlt} />
        </FieldLabeled>
      ) : null}
    </div>
  );
}

/**
 * @param {{ tone: string, label: string, src: string | null, alt: string }} props
 */
function ImageSide({ tone, label, src, alt }) {
  return (
    <div style={imageSideStyle(tone)}>
      <div style={imageLabelStyle(tone)}>{label}</div>
      {src ? (
        <img src={src} alt={alt} style={imageThumbStyle} />
      ) : (
        <div style={emptyValueStyle}>—</div>
      )}
    </div>
  );
}

/**
 * Positional list diff. For each index, classifies the pair as added,
 * removed, or changed; "changed" recurses into per-field inline diff
 * using the registered itemSchema. Unchanged items are skipped — the
 * panel exists to highlight what's changing.
 *
 * @param {{
 *   oldItems: Record<string, *>[],
 *   newItems: Record<string, *>[],
 *   itemSchema: ItemSchema | null,
 * }} props
 */
function ListDiff({ oldItems, newItems, itemSchema }) {
  const rows = useMemo(() => {
    const max = Math.max(oldItems.length, newItems.length);
    /** @type {{ kind: "added"|"removed"|"changed", index: number, prev: *, next: * }[]} */
    const out = [];
    for (let i = 0; i < max; i++) {
      const a = oldItems[i];
      const b = newItems[i];
      if (a === undefined) {
        out.push({ kind: "added", index: i, prev: null, next: b });
      } else if (b === undefined) {
        out.push({ kind: "removed", index: i, prev: a, next: null });
      } else if (stableStringify(a) === stableStringify(b)) {
        continue;
      } else {
        out.push({ kind: "changed", index: i, prev: a, next: b });
      }
    }
    return out;
  }, [oldItems, newItems]);

  if (rows.length === 0) {
    return <div style={{ color: TEXT_MUTED, fontSize: 12 }}>Görünür bir değişiklik yok.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row) => (
        <div key={row.index} style={listItemRowStyle(row.kind)}>
          <div style={listItemHeaderStyle}>
            <span style={listItemGlyphStyle(row.kind)} aria-hidden="true">
              {row.kind === "added" ? "+" : row.kind === "removed" ? "−" : "~"}
            </span>
            <span style={listItemIndexStyle}>#{row.index + 1}</span>
            <span style={listItemBadgeStyle(toneForKind(row.kind))}>
              {labelForKind(row.kind)}
            </span>
          </div>
          {row.kind === "added" || row.kind === "removed" ? (
            <ItemFields
              item={row.kind === "added" ? row.next : row.prev}
              itemSchema={itemSchema}
              tone={toneForKind(row.kind)}
            />
          ) : (
            <ItemFieldDiff prev={row.prev} next={row.next} itemSchema={itemSchema} />
          )}
        </div>
      ))}
    </div>
  );
}

/** @param {"added"|"removed"|"changed"} kind */
function toneForKind(kind) {
  if (kind === "added") return DIFF_ADDED;
  if (kind === "removed") return DIFF_REMOVED;
  return DIFF_CHANGED;
}

/** @param {"added"|"removed"|"changed"} kind */
function labelForKind(kind) {
  if (kind === "added") return "eklendi";
  if (kind === "removed") return "silindi";
  return "değişti";
}

/**
 * Render an added- or removed-in-full item's fields with a tone tint, so
 * the user reads it as "the whole thing is new/gone" rather than a per-
 * field diff.
 *
 * @param {{
 *   item: Record<string, *>,
 *   itemSchema: ItemSchema | null,
 *   tone: string,
 * }} props
 */
function ItemFields({ item, itemSchema, tone }) {
  if (!itemSchema) {
    return (
      <pre style={fallbackJsonStyle(tone)}>
        {stableStringify(item)}
      </pre>
    );
  }
  return (
    <div style={fieldStackStyle}>
      {Object.entries(itemSchema).map(([fieldKey, field]) => {
        const value = item[fieldKey];
        if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
          return null;
        }
        return (
          <FieldLabeled key={fieldKey} label={fieldKey}>
            <SoloValue blockType={field.blockType} value={value} tone={tone} />
          </FieldLabeled>
        );
      })}
    </div>
  );
}

/**
 * Per-field inline diff for a changed list item. Skips fields that match
 * across versions; renders the rest through `DiffContent`.
 *
 * @param {{ prev: Record<string, *>, next: Record<string, *>, itemSchema: ItemSchema | null }} props
 */
function ItemFieldDiff({ prev, next, itemSchema }) {
  if (!itemSchema) {
    return (
      <InlineWordDiff
        prev={stableStringify(prev)}
        next={stableStringify(next)}
      />
    );
  }
  const changedKeys = Object.keys(itemSchema).filter(
    (k) => stableStringify(prev[k]) !== stableStringify(next[k]),
  );
  if (changedKeys.length === 0) return null;
  return (
    <div style={fieldStackStyle}>
      {changedKeys.map((fieldKey) => {
        const field = itemSchema[fieldKey];
        return (
          <FieldLabeled key={fieldKey} label={fieldKey}>
            <DiffContent
              blockType={field.blockType}
              prev={prev[fieldKey]}
              next={next[fieldKey]}
            />
          </FieldLabeled>
        );
      })}
    </div>
  );
}

/**
 * Render a single value (no diff) tinted in `tone` — used inside fully-
 * added or fully-removed list items where there's no "other side" to
 * compare against.
 *
 * @param {{ blockType: BlockType | string, value: *, tone: string }} props
 */
function SoloValue({ blockType, value, tone }) {
  const wrap = tone === DIFF_REMOVED ? removedSpanStyle : addedSpanStyle;
  if (value == null || value === "") {
    return <span style={emptyValueStyle}>—</span>;
  }
  switch (blockType) {
    case "Text":
    case "Date":
      return <span style={wrap}>{String(value)}</span>;
    case "RichText":
      return <span style={wrap}>{stripHtml(value)}</span>;
    case "Link": {
      const label = value?.label ?? "";
      const href = value?.href ?? "";
      return <span style={wrap}>{label || href}{label && href ? ` (${href})` : ""}</span>;
    }
    case "Image": {
      const src = value?.src;
      if (!src) return <span style={emptyValueStyle}>—</span>;
      return <img src={src} alt={value?.alt ?? ""} style={imageThumbStyle} />;
    }
    default:
      return <span style={{ ...wrap, fontFamily: FONT_MONO, fontSize: 11 }}>{stableStringify(value)}</span>;
  }
}

/**
 * @param {{ label: string, children: React.ReactNode }} props
 */
function FieldLabeled({ label, children }) {
  return (
    <div style={fieldRowStyle}>
      <div style={fieldLabelStyle}>{label}</div>
      {children}
    </div>
  );
}

// ---- Styles --------------------------------------------------------------

const scrollStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarWidth: "none",
});

const collectionDraftCountStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 10,
  letterSpacing: "0.04em",
  color: COLLECTION_ACCENT,
  padding: "1px 6px",
  border: `1px solid ${COLLECTION_LINE}`,
  borderRadius: 3,
  opacity: 0.85,
});

const diffBoxStyle = /** @type {React.CSSProperties} */ ({
  background: SURFACE_1,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: RADIUS_SM,
  padding: "8px 10px",
});

// LineDiff (GitHub-style unified) styles
const lineDiffWrapStyle = /** @type {React.CSSProperties} */ ({
  border: `1px solid ${HAIRLINE}`,
  borderRadius: RADIUS_SM,
  background: SURFACE_1,
  overflow: "hidden",
  fontFamily: FONT_MONO,
  fontSize: 11.5,
  lineHeight: 1.6,
});

const lineRowBase = /** @type {React.CSSProperties} */ ({
  display: "grid",
  gridTemplateColumns: "28px 28px 16px 1fr",
  alignItems: "baseline",
  paddingRight: 8,
});

const lineUnchangedStyle = /** @type {React.CSSProperties} */ ({
  background: "transparent",
  color: TEXT_MUTED,
});

const lineAddedStyle = /** @type {React.CSSProperties} */ ({
  background: "rgba(150, 210, 160, 0.10)",
  color: TEXT,
});

const lineRemovedStyle = /** @type {React.CSSProperties} */ ({
  background: "rgba(232, 132, 152, 0.10)",
  color: TEXT,
});

const lineNoStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_FAINT,
  textAlign: "right",
  paddingRight: 6,
  userSelect: "none",
  fontSize: 10,
});

const lineGutterStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  textAlign: "center",
  userSelect: "none",
});

const lineTextStyle = /** @type {React.CSSProperties} */ ({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const lineHunkStyle = /** @type {React.CSSProperties} */ ({
  padding: "3px 12px",
  background: "rgba(255,255,255,0.03)",
  borderTop: `1px solid ${HAIRLINE}`,
  borderBottom: `1px solid ${HAIRLINE}`,
  color: TEXT_FAINT,
  fontSize: 10,
  letterSpacing: "0.04em",
  textAlign: "center",
});

const pairedRemovedSpanStyle = /** @type {React.CSSProperties} */ ({
  background: "rgba(232, 132, 152, 0.30)",
  color: DIFF_REMOVED,
  borderRadius: 2,
});

const pairedAddedSpanStyle = /** @type {React.CSSProperties} */ ({
  background: "rgba(150, 210, 160, 0.30)",
  color: DIFF_ADDED,
  borderRadius: 2,
});

const inlineDiffStyle = /** @type {React.CSSProperties} */ ({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: TEXT,
  fontSize: 12,
  lineHeight: 1.55,
});

const collapsedSpanStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-block",
  margin: "0 2px",
  padding: "0 6px",
  borderRadius: 3,
  background: "rgba(255,255,255,0.04)",
  color: TEXT_FAINT,
  fontFamily: FONT_MONO,
  fontSize: 10,
  letterSpacing: "0.04em",
  verticalAlign: "middle",
});

// Same elision pill used inside LineDiff rows (both per-side word
// collapses and standalone long-line char truncation). Visually
// matches `collapsedSpanStyle` but separated so future tweaks to one
// surface don't drag the other.
const collapsedInlineStyle = collapsedSpanStyle;

const goToButtonStyle = /** @type {React.CSSProperties} */ ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  background: "transparent",
  border: 0,
  borderRadius: 4,
  color: TEXT_MUTED,
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
});

const unchangedSpanStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
});

const removedSpanStyle = /** @type {React.CSSProperties} */ ({
  color: DIFF_REMOVED,
  background: "rgba(232, 132, 152, 0.14)",
  textDecoration: "line-through",
  textDecorationColor: "rgba(232, 132, 152, 0.50)",
  padding: "0 2px",
  borderRadius: 2,
});

const addedSpanStyle = /** @type {React.CSSProperties} */ ({
  color: DIFF_ADDED,
  background: "rgba(150, 210, 160, 0.14)",
  padding: "0 2px",
  borderRadius: 2,
});

const arrowDiffStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  flexWrap: "wrap",
});

const arrowStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  fontFamily: FONT_MONO,
});

const imageRowStyle = /** @type {React.CSSProperties} */ ({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
});

/** @param {string} tone */
function imageSideStyle(tone) {
  return /** @type {React.CSSProperties} */ ({
    border: `1px solid ${HAIRLINE}`,
    borderLeft: `2px solid ${tone}`,
    borderRadius: RADIUS_SM,
    background: SURFACE_1,
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    alignItems: "center",
  });
}

/** @param {string} tone */
function imageLabelStyle(tone) {
  return /** @type {React.CSSProperties} */ ({
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: tone,
    alignSelf: "flex-start",
  });
}

const imageThumbStyle = /** @type {React.CSSProperties} */ ({
  maxWidth: "100%",
  maxHeight: 120,
  objectFit: "contain",
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_SM,
  background: "#000",
});

const emptyValueStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_FAINT,
  fontSize: 12,
  fontStyle: "italic",
});

/** @param {"added"|"removed"|"changed"} kind */
function listItemRowStyle(kind) {
  /** @type {React.CSSProperties} */
  const base = {
    border: `1px solid ${HAIRLINE}`,
    borderRadius: RADIUS_SM,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };
  if (kind === "added") return { ...base, background: "rgba(150, 210, 160, 0.10)" };
  if (kind === "removed") return { ...base, background: "rgba(232, 132, 152, 0.10)" };
  return { ...base, background: SURFACE_1 };
}

const listItemHeaderStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "center",
  gap: 8,
});

const listItemIndexStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: TEXT_MUTED,
});

/** @param {"added"|"removed"|"changed"} kind */
function listItemGlyphStyle(kind) {
  const tone = kind === "added" ? DIFF_ADDED : kind === "removed" ? DIFF_REMOVED : DIFF_CHANGED;
  return /** @type {React.CSSProperties} */ ({
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: 600,
    color: tone,
    width: 14,
    textAlign: "center",
    display: "inline-block",
  });
}

/** @param {string} tone */
function listItemBadgeStyle(tone) {
  return /** @type {React.CSSProperties} */ ({
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: tone,
    opacity: 0.75,
  });
}

const fieldStackStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const fieldRowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

const fieldLabelStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  fontSize: 10,
  letterSpacing: "0.04em",
  color: TEXT_MUTED,
});

/** @param {string} tone */
function fallbackJsonStyle(tone) {
  return /** @type {React.CSSProperties} */ ({
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: tone,
    background: tone === DIFF_REMOVED ? "rgba(232,132,152,0.10)" : "rgba(150,210,160,0.10)",
    padding: "6px 8px",
    borderRadius: RADIUS_SM,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  });
}
