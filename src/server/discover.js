/**
 * @file Manifest discovery - AST-walk a Next.js app/ tree and produce a
 * `SyncManifestRequest[]` from `<EditableRegion>` JSX and `useCmsBlock`
 * call sites. Same shape the legacy hand-written `cms.manifest.mjs` had.
 *
 * SERVER ONLY - exposed via `inscribed/server` and used by the
 * `cms-sync` CLI. Not safe to import from a client component (pulls in the
 * native `oxc-parser` at runtime).
 *
 * Discovery rules:
 *
 *   - Every `withCms("/slug", X)` call is the root of one slug. The file
 *     containing the call is the entry point; reachable files are followed
 *     via relative imports (DFS pre-order). Bare specifiers (`inscribed`,
 *     `next/...`) are not followed.
 *
 *   - Within reachable files, every `<EditableRegion blockPath blockType
 *     defaultValue ...>` JSX element contributes one ManifestBlockItem.
 *     `useCmsBlock("path", { blockType, defaultValue })` does the same for
 *     read-only blocks that never render through `<EditableRegion>`.
 *
 *   - `sortOrder` is the DFS order (root file first, then imports in source
 *     order). Duplicate blockPaths within a slug: first occurrence wins.
 *
 *   - Shared component reachable from two slugs contributes its regions
 *     to both - by design (each slug owns its own DB rows).
 *
 *   - Props must be static literals. Anything the analyzer can't evaluate
 *     (variables, function calls, spread) yields a warning and the region
 *     is skipped (no DB row -> renders as empty placeholder forever).
 */

import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parseSync } from "oxc-parser";

/**
 * @import { SyncManifestRequest, ManifestBlockItem, BlockType } from "../lib/schemas.js"
 */

const SOURCE_EXTENSIONS = [".jsx", ".js", ".tsx", ".ts"];
const INDEX_FILES = SOURCE_EXTENSIONS.map((ext) => `index${ext}`);

// oxc infers the dialect from `lang`. `.ts` stays TypeScript-only so
// angle-bracket type assertions parse correctly; every other extension allows
// JSX, matching Next.js where `.js` files routinely contain JSX.
/** @type {Record<string, "jsx" | "tsx" | "ts">} */
const LANG_BY_EXT = {
  ".jsx": "jsx",
  ".js": "jsx",
  ".tsx": "tsx",
  ".ts": "ts",
};

const UNRESOLVED = Symbol("unresolved");

/**
 * @typedef {Object} DiscoveredRegion
 * @property {string} blockPath
 * @property {BlockType} blockType
 * @property {*} defaultValue
 * @property {import("../lib/schemas.js").ItemSchema} [itemSchema]  List blocks only.
 * @property {string} [scope]
 *   Discovery scope marker. When `"global"`, the region is written to the
 *   `globalSlug` manifest entry instead of any page slug, so a header/footer
 *   declared once is shared across every page. Undefined = page-scoped (the
 *   region follows the withCms slug it's reachable from).
 */

/**
 * @typedef {Object} FileAnalysis
 * @property {string} file
 * @property {string[]} imports
 * @property {string[]} withCmsSlugs
 * @property {DiscoveredRegion[]} regions
 */

/**
 * @typedef {Object} DiscoveryWarning
 * @property {string} file
 * @property {{ line: number, column: number } | null} loc
 * @property {string} message
 */

/**
 * @typedef {Object} DiscoveryResult
 * @property {SyncManifestRequest[]} manifests
 * @property {DiscoveryWarning[]} warnings
 */

/**
 * @typedef {Object} DiscoverManifestsOptions
 * @property {string} [appRoot]      Directory to scan. Default: `process.cwd()/app`.
 * @property {string} [globalSlug]   Slug to receive `scope="global"` regions. Default: `"__global"`.
 */

/**
 * @param {DiscoverManifestsOptions} [options]
 * @returns {Promise<DiscoveryResult>}
 */
export async function discoverManifests(options = {}) {
  const appRoot = options.appRoot ?? path.resolve(process.cwd(), "app");
  const globalSlug = options.globalSlug ?? "__global";

  const files = await collectSourceFiles(appRoot);
  /** @type {Map<string, FileAnalysis>} */
  const analyses = new Map();
  /** @type {DiscoveryWarning[]} */
  const warnings = [];

  for (const file of files) {
    const { analysis, warnings: fileWarnings } = await analyzeFile(file);
    analyses.set(file, analysis);
    warnings.push(...fileWarnings);
  }

  /** @type {Map<string, Map<string, ManifestBlockItem>>} */
  const bySlug = new Map();

  // Page-scoped regions: walk every withCms root, follow imports DFS, drop
  // each non-global region under the page's slug. Global regions are
  // skipped here and collected separately below so they don't leak into
  // any page slug (and so a Header/Footer declared on multiple pages
  // doesn't get duplicated as a regular block).
  for (const [rootFile, analysis] of analyses) {
    if (analysis.withCmsSlugs.length === 0) continue;
    for (const slug of analysis.withCmsSlugs) {
      const blockMap = bySlug.get(slug) ?? new Map();
      bySlug.set(slug, blockMap);

      /** @type {DiscoveredRegion[]} */
      const ordered = [];
      collectRegionsDfs(rootFile, analyses, new Set(), ordered);

      let nextSortOrder = blockMap.size + 1;
      for (const region of ordered) {
        if (region.scope === "global") continue;
        if (blockMap.has(region.blockPath)) continue;
        blockMap.set(region.blockPath, regionToEntry(region, nextSortOrder++));
      }
    }
  }

  // Global-scoped regions: across the whole app tree, dedup by blockPath.
  // sortOrder follows file traversal order (collectSourceFiles is a stable
  // recursive directory walk) so the Drawer lists header/footer fields in
  // a stable order regardless of which page is loaded.
  /** @type {Map<string, ManifestBlockItem>} */
  const globalMap = new Map();
  let globalSortOrder = 1;
  for (const analysis of analyses.values()) {
    for (const region of analysis.regions) {
      if (region.scope !== "global") continue;
      if (globalMap.has(region.blockPath)) continue;
      globalMap.set(region.blockPath, regionToEntry(region, globalSortOrder++));
    }
  }

  /** @type {SyncManifestRequest[]} */
  const manifests = [];
  for (const [slug, blockMap] of bySlug) {
    manifests.push({ slug, blocks: [...blockMap.values()] });
  }
  if (globalMap.size > 0) {
    manifests.push({ slug: globalSlug, blocks: [...globalMap.values()] });
  }
  manifests.sort((a, b) => a.slug.localeCompare(b.slug));

  return { manifests, warnings };
}

/**
 * @param {DiscoveredRegion} region
 * @param {number} sortOrder
 * @returns {ManifestBlockItem}
 */
function regionToEntry(region, sortOrder) {
  /** @type {ManifestBlockItem} */
  const entry = {
    blockPath: region.blockPath,
    blockType: region.blockType,
    defaultValue: region.defaultValue,
    sortOrder,
  };
  if (region.itemSchema) entry.itemSchema = region.itemSchema;
  return entry;
}

/**
 * DFS pre-order: emit the current file's regions, then recurse into each
 * relative import in source order. `visited` prevents cycles and double
 * counting when a shared component is imported by both branches of the
 * graph reachable from a single slug.
 *
 * @param {string} file
 * @param {Map<string, FileAnalysis>} analyses
 * @param {Set<string>} visited
 * @param {DiscoveredRegion[]} out
 */
function collectRegionsDfs(file, analyses, visited, out) {
  if (visited.has(file)) return;
  visited.add(file);
  const analysis = analyses.get(file);
  if (!analysis) return;
  for (const region of analysis.regions) out.push(region);
  for (const imp of analysis.imports) collectRegionsDfs(imp, analyses, visited, out);
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectSourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...(await collectSourceFiles(full)));
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} fromFile
 * @param {string} spec
 * @returns {string | null}
 */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);

  if (existsSync(base) && isFile(base)) return base;
  for (const ext of SOURCE_EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (isDirectory(base)) {
    for (const idx of INDEX_FILES) {
      const candidate = path.join(base, idx);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** @param {string} p */
function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

/** @param {string} p */
function isDirectory(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/**
 * @param {string} filePath
 * @returns {Promise<{ analysis: FileAnalysis, warnings: DiscoveryWarning[] }>}
 */
async function analyzeFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const lang = LANG_BY_EXT[path.extname(filePath)] ?? "jsx";

  const { program, errors } = parseSync(filePath, source, { lang });
  if (errors.length > 0) {
    throw new Error(
      `[cms-discover] Failed to parse ${path.relative(process.cwd(), filePath)}: ${errors[0].message}`,
    );
  }

  // oxc spans are character offsets (UTF-16, i.e. JS string indices); the
  // locator turns them into Babel-style { line (1-based), column (0-based) }.
  const locator = makeLocator(source);

  /** @type {FileAnalysis} */
  const analysis = {
    file: filePath,
    imports: [],
    withCmsSlugs: [],
    regions: [],
  };
  /** @type {DiscoveryWarning[]} */
  const warnings = [];

  // Stack of `<CmsGroup name>` prefixes. Pushed on JSXElement enter for any
  // CmsGroup wrapper, popped on exit. JSXOpeningElement visits for child
  // EditableRegion/EditableList read this stack and prepend the joined
  // prefix to the static blockPath - mirroring the runtime behaviour where
  // `<CmsGroup>` provides a React context to descendant components.
  /** @type {string[]} */
  const groupStack = [];
  const currentPrefix = () => groupStack.filter(Boolean).join(".");

  // Single enter/leave pass mirroring the four former Babel visitors.
  // `<CmsGroup>` push/pop straddles JSXElement enter/leave so the prefix is
  // active for every descendant region, just as the runtime context is.
  walk(program, {
    enter(node) {
      switch (node.type) {
        case "ImportDeclaration": {
          const resolved = resolveImport(filePath, node.source.value);
          if (resolved) analysis.imports.push(resolved);
          return;
        }
        case "JSXElement": {
          const opening = node.openingElement;
          if (opening.name.type !== "JSXIdentifier" || opening.name.name !== "CmsGroup") return;
          const props = readJsxProps(opening);
          if (typeof props.name !== "string") {
            warnings.push({
              file: filePath,
              loc: locOf(opening, locator),
              message:
                "<CmsGroup> needs a static string `name` prop. Treating as a transparent wrapper - blockPaths inside won't be prefixed.",
            });
            groupStack.push(""); // placeholder so leave() pops the matching push
            return;
          }
          groupStack.push(props.name);
          return;
        }
        case "CallExpression": {
          const callee = node.callee;
          if (callee.type !== "Identifier") return;

          if (callee.name === "withCms") {
            const slug = literalString(node.arguments[0]);
            if (slug == null) {
              warnings.push({
                file: filePath,
                loc: locOf(node, locator),
                message:
                  "withCms() called with a non-literal slug - skipping. Pass a string literal so the manifest discovery can statically resolve it.",
              });
              return;
            }
            analysis.withCmsSlugs.push(slug);
            return;
          }

          // useCmsBlock("path", { blockType, defaultValue }) - read-only block
          // declaration. The 2nd arg is metadata; without it we can't register
          // the block, so the call is treated as a pure read and ignored.
          if (callee.name === "useCmsBlock") {
            const blockPath = literalString(node.arguments[0]);
            if (blockPath == null) return;
            const metaNode = node.arguments[1];
            if (!metaNode) return;
            const meta = evalLiteral(metaNode);
            if (meta === UNRESOLVED || meta === null || typeof meta !== "object") {
              warnings.push({
                file: filePath,
                loc: locOf(node, locator),
                message: `useCmsBlock("${blockPath}", ...) metadata must be a static object literal. Skipping.`,
              });
              return;
            }
            if (typeof meta.blockType !== "string" || !("defaultValue" in meta)) {
              warnings.push({
                file: filePath,
                loc: locOf(node, locator),
                message: `useCmsBlock("${blockPath}", ...) metadata is missing blockType or defaultValue. Skipping.`,
              });
              return;
            }
            analysis.regions.push({
              blockPath,
              blockType: /** @type {BlockType} */ (meta.blockType),
              defaultValue: meta.defaultValue,
            });
          }
          return;
        }
        case "JSXOpeningElement": {
          const name = node.name;
          if (name.type !== "JSXIdentifier") return;
          if (name.name === "EditableRegion") {
            handleEditableRegion(node, filePath, analysis, warnings, currentPrefix(), locator);
          } else if (name.name === "EditableList") {
            handleEditableList(node, filePath, analysis, warnings, currentPrefix(), locator);
          }
          // `<CollectionRegion>` and `<CollectionItem>` deliberately don't
          // emit manifest blocks - Collection bindings live in a runtime
          // registry (CmsContext.collectionBindings) so they aren't mixed
          // into the CMS block namespace. See CmsProvider.
          return;
        }
      }
    },
    leave(node) {
      if (node.type !== "JSXElement") return;
      const opening = node.openingElement;
      if (opening.name.type === "JSXIdentifier" && opening.name.name === "CmsGroup") {
        groupStack.pop();
      }
    },
  });

  return { analysis, warnings };
}

/**
 * Pull a static `<EditableRegion>` declaration into the file analysis.
 * Required props: blockPath, blockType, defaultValue. Anything missing
 * yields a warning and the region is skipped. `groupPrefix` is the joined
 * stack of enclosing `<CmsGroup>` names; when non-empty it's prepended to
 * the blockPath so the manifest matches what the runtime context lookup
 * produces.
 *
 * @param {*} openingNode
 * @param {string} filePath
 * @param {FileAnalysis} analysis
 * @param {DiscoveryWarning[]} warnings
 * @param {string} groupPrefix
 * @param {Locator} locator
 */
function handleEditableRegion(openingNode, filePath, analysis, warnings, groupPrefix, locator) {
  const props = readJsxProps(openingNode);
  const rawBlockPath = props.blockPath;
  const blockType = props.blockType;
  const hasDefault = Object.prototype.hasOwnProperty.call(props, "defaultValue");

  if (typeof rawBlockPath !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message:
        "<EditableRegion> needs a static blockPath string. Skipping discovery for this region.",
    });
    return;
  }
  const blockPath = groupPrefix ? `${groupPrefix}.${rawBlockPath}` : rawBlockPath;

  if (typeof blockType !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message: `<EditableRegion blockPath="${blockPath}"> is missing a static blockType prop. Skipping.`,
    });
    return;
  }
  if (!hasDefault) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message: `<EditableRegion blockPath="${blockPath}"> is missing a static defaultValue prop. Skipping.`,
    });
    return;
  }

  /** @type {DiscoveredRegion} */
  const region = {
    blockPath,
    blockType: /** @type {BlockType} */ (blockType),
    defaultValue: props.defaultValue,
  };
  const scope = readScopeProp(props, openingNode, blockPath, filePath, warnings, locator);
  if (scope) region.scope = scope;
  analysis.regions.push(region);
}

/**
 * Pull a static `<EditableList>` declaration into the file analysis.
 * Required props: blockPath, itemSchema. `defaultValue` is optional and
 * defaults to `[]` (empty list) - lists usually start empty. `groupPrefix`
 * applies the same `<CmsGroup>` prefix rule used for EditableRegion.
 *
 * The itemSchema must be a plain object literal. Each value is itself a
 * `{ blockType, defaultValue }` literal pair; that's the manifest's
 * `ItemSchema` shape, validated structurally below.
 *
 * @param {*} openingNode
 * @param {string} filePath
 * @param {FileAnalysis} analysis
 * @param {DiscoveryWarning[]} warnings
 * @param {string} groupPrefix
 * @param {Locator} locator
 */
function handleEditableList(openingNode, filePath, analysis, warnings, groupPrefix, locator) {
  const props = readJsxProps(openingNode);
  const rawBlockPath = props.blockPath;
  const itemSchema = props.itemSchema;

  if (typeof rawBlockPath !== "string") {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message:
        "<EditableList> needs a static blockPath string. Skipping discovery for this list.",
    });
    return;
  }
  const blockPath = groupPrefix ? `${groupPrefix}.${rawBlockPath}` : rawBlockPath;
  if (!isValidItemSchema(itemSchema)) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message: `<EditableList blockPath="${blockPath}"> is missing or has a non-static itemSchema. Each field must be a plain object with literal blockType + defaultValue.`,
    });
    return;
  }

  const defaultValue = Object.prototype.hasOwnProperty.call(props, "defaultValue")
    ? props.defaultValue
    : [];

  if (!Array.isArray(defaultValue)) {
    warnings.push({
      file: filePath,
      loc: locOf(openingNode, locator),
      message: `<EditableList blockPath="${blockPath}"> defaultValue must be an array. Skipping.`,
    });
    return;
  }

  /** @type {DiscoveredRegion} */
  const region = {
    blockPath,
    blockType: /** @type {BlockType} */ ("List"),
    defaultValue,
    itemSchema,
  };
  const scope = readScopeProp(props, openingNode, blockPath, filePath, warnings, locator);
  if (scope) region.scope = scope;
  analysis.regions.push(region);
}

/**
 * Validate the `scope` prop. Only `"global"` is accepted today; anything
 * else yields a warning and the region is treated as page-scoped (the
 * safer default). Missing scope is silent — that's the common path.
 *
 * @param {Record<string, *>} props
 * @param {*} openingNode
 * @param {string} blockPath
 * @param {string} filePath
 * @param {DiscoveryWarning[]} warnings
 * @param {Locator} locator
 * @returns {string | null}
 */
function readScopeProp(props, openingNode, blockPath, filePath, warnings, locator) {
  if (!Object.prototype.hasOwnProperty.call(props, "scope")) return null;
  const scope = props.scope;
  if (scope === "global") return "global";
  warnings.push({
    file: filePath,
    loc: locOf(openingNode, locator),
    message: `<EditableRegion blockPath="${blockPath}"> has unsupported scope=${JSON.stringify(scope)}. Treating as page-scoped. Only "global" is recognized today.`,
  });
  return null;
}

/**
 * Structural check that `value` looks like an `ItemSchema`: a plain
 * object whose values are `{ blockType: string, defaultValue: * }`.
 *
 * @param {*} value
 */
function isValidItemSchema(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  for (const field of Object.values(value)) {
    if (field == null || typeof field !== "object" || Array.isArray(field)) return false;
    if (typeof field.blockType !== "string") return false;
    if (!Object.prototype.hasOwnProperty.call(field, "defaultValue")) return false;
  }
  return true;
}

/**
 * @param {*} node
 * @returns {string | null}
 */
function literalString(node) {
  if (node && node.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
}

/**
 * @param {*} opening
 */
function readJsxProps(opening) {
  /** @type {Record<string, *>} */
  const props = {};
  for (const attr of opening.attributes) {
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type !== "JSXIdentifier") continue;
    const value = readJsxAttrValue(attr.value);
    if (value === UNRESOLVED) continue;
    props[attr.name.name] = value;
  }
  return props;
}

/**
 * @param {*} node
 */
function readJsxAttrValue(node) {
  if (node == null) return true;
  if (node.type === "Literal") return node.value;
  if (node.type === "JSXExpressionContainer") return evalLiteral(node.expression);
  return UNRESOLVED;
}

/**
 * @param {*} node
 * @returns {* | typeof UNRESOLVED}
 */
function evalLiteral(node) {
  if (!node) return UNRESOLVED;
  switch (node.type) {
    case "Literal":
      // RegExp / BigInt literals carry extra fields and aren't plain JSON
      // values; treat them as unresolved (Babel never evaluated them either).
      if (node.regex || node.bigint) return UNRESOLVED;
      return node.value;
    case "TemplateLiteral":
      if (node.expressions.length === 0) return node.quasis[0].value.cooked;
      return UNRESOLVED;
    case "UnaryExpression": {
      if (node.operator !== "-") return UNRESOLVED;
      const inner = evalLiteral(node.argument);
      return typeof inner === "number" ? -inner : UNRESOLVED;
    }
    case "ObjectExpression": {
      /** @type {Record<string, *>} */
      const obj = {};
      for (const prop of node.properties) {
        if (prop.type !== "Property") return UNRESOLVED;
        const key =
          prop.key.type === "Identifier" ? prop.key.name :
          prop.key.type === "Literal" && typeof prop.key.value === "string" ? prop.key.value :
          null;
        if (key == null) return UNRESOLVED;
        const value = evalLiteral(prop.value);
        if (value === UNRESOLVED) return UNRESOLVED;
        obj[key] = value;
      }
      return obj;
    }
    case "ArrayExpression": {
      const arr = [];
      for (const el of node.elements) {
        if (el == null) return UNRESOLVED;
        const value = evalLiteral(el);
        if (value === UNRESOLVED) return UNRESOLVED;
        arr.push(value);
      }
      return arr;
    }
    default:
      return UNRESOLVED;
  }
}

/**
 * @param {*} node
 * @param {Locator} locator
 * @returns {{ line: number, column: number } | null}
 */
function locOf(node, locator) {
  if (!node || typeof node.start !== "number") return null;
  return locator(node.start);
}

/**
 * @typedef {(offset: number) => { line: number, column: number }} Locator
 */

/**
 * Build an offset -> { line, column } mapper for one source string. Lines are
 * 1-based and columns 0-based, matching the `loc` Babel produced so warning
 * positions are byte-for-byte unchanged. Offsets are UTF-16 (JS string
 * indices), which is exactly what oxc emits.
 *
 * @param {string} source
 * @returns {Locator}
 */
function makeLocator(source) {
  /** @type {number[]} */
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) lineStarts.push(i + 1);
  }
  return (offset) => {
    // Greatest line start <= offset (binary search).
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineStarts[lo] };
  };
}

/**
 * @typedef {Object} Visitors
 * @property {(node: any) => void} enter
 * @property {(node: any) => void} [leave]
 */

/**
 * Minimal depth-first walk over the plain-object ESTree AST oxc returns. A
 * node is any object with a string `type`; children live in node-valued or
 * array-valued properties. This replaces `@babel/traverse` - we only need
 * enter/leave in source order, not its scope/path machinery.
 *
 * @param {any} node
 * @param {Visitors} visitors
 */
function walk(node, visitors) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visitors);
    return;
  }
  if (typeof node.type !== "string") return;
  visitors.enter(node);
  for (const key in node) {
    if (key === "type" || key === "start" || key === "end") continue;
    walk(node[key], visitors);
  }
  if (visitors.leave) visitors.leave(node);
}