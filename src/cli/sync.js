#!/usr/bin/env node
/**
 * @file `cms-sync` CLI - discover blocks and push the manifest to the
 * backend in a single command. Designed to drop into `predev`/`prebuild`
 * scripts so consumers don't carry their own scripts/sync.mjs around.
 *
 *   "scripts": {
 *     "predev":   "cms-sync",
 *     "prebuild": "cms-sync"
 *   }
 *
 * Reads `.env.local` from the working directory, walks `app/` for
 * `<EditableRegion>` and `useCmsBlock(..., metadata)` declarations, then
 * calls `syncAll`.
 *
 * The service token for `POST /cms/sync` (and any failure diagnostics) comes
 * from an optional `cms.config.js` in the project root - the CLI is a plain
 * Node binary, so it loads that module instead of receiving function props:
 *
 *   // cms.config.js
 *   export const getServiceToken = async () => "...";   // default: no token
 *   export const onSyncError = (err) => { ... };         // optional
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { syncAll } from "../server/get-content.js";
import { discoverManifests } from "../server/discover.js";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

loadEnvFile(args.env ?? path.resolve(process.cwd(), ".env.local"));

// Load the project's CMS config (service token + diagnostics) AFTER env so a
// provider that reads process.env sees the loaded values.
const projectConfig = await loadProjectConfig(process.cwd());
const getServiceToken =
  typeof projectConfig.getServiceToken === "function" ? projectConfig.getServiceToken : undefined;
const onSyncError =
  typeof projectConfig.onSyncError === "function" ? projectConfig.onSyncError : null;

const appRoot = args.appRoot
  ? path.resolve(process.cwd(), args.appRoot)
  : path.resolve(process.cwd(), "app");

const { manifests, warnings } = await discoverManifests({
  appRoot,
  globalSlug: args.globalSlug,
});

for (const w of warnings) {
  const where = w.loc
    ? `${path.relative(process.cwd(), w.file)}:${w.loc.line}:${w.loc.column}`
    : path.relative(process.cwd(), w.file);
  console.warn(`[cms-discover] ${where}\n  ${w.message}`);
}

if (manifests.length === 0) {
  console.warn(
    `[cms-discover] No <EditableRegion> declarations found under ${path.relative(process.cwd(), appRoot)}. Nothing to sync.`,
  );
}

for (const m of manifests) {
  console.log(`[cms-discover] ${m.slug}  ${m.blocks.length} block(s)`);
}

if (args.dryRun) {
  process.stdout.write(JSON.stringify(manifests, null, 2) + "\n");
  process.exit(0);
}

try {
  await syncAll(manifests, { baseUrl: projectConfig.baseUrl, getServiceToken });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  if (onSyncError) await Promise.resolve(onSyncError(err)).catch(() => {});
  process.exit(1);
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ appRoot?: string, env?: string, globalSlug?: string, dryRun?: boolean, help?: boolean }} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--app-root") out.appRoot = argv[++i];
    else if (a === "--env") out.env = argv[++i];
    else if (a === "--global-slug") out.globalSlug = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else {
      console.error(`[cms-sync] Unknown argument: ${a}`);
      console.error(`Run \`cms-sync --help\` for usage.`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`cms-sync - discover <EditableRegion> declarations and push the manifest to the backend.

Usage:
  cms-sync [options]

Options:
  --app-root <path>    Directory to scan (default: ./app)
  --env <path>         dotenv file to preload before discovery (default: ./.env.local)
  --global-slug <name> Slug for scope="global" blocks (default: __global)
  --dry-run            Print the discovered manifest as JSON without syncing
  --help, -h           Show this message

Environment:
  CMS_URL              Backend base URL (default: http://localhost:5000)

Project config (optional, ./cms.config.js):
  getServiceToken      () => Promise<string> for POST /cms/sync (default: none)
  onSyncError          (err) => void, called on failure (e.g. token diagnostics)
`);
}

/**
 * Lightweight `.env` loader. Doesn't depend on `dotenv` so the package's
 * runtime footprint stays small. Existing process.env values win.
 *
 * @param {string} filePath
 */
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const src = readFileSync(filePath, "utf8");
  for (const line of src.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * Load the project's optional `cms.config.js` (or `.mjs`) from `cwd`. Returns
 * `{}` when absent. Exits on a load error so a broken config is loud, not
 * silently ignored.
 *
 * @param {string} cwd
 * @returns {Promise<{ getServiceToken?: () => Promise<string>, onSyncError?: (err: unknown) => void, baseUrl?: string }>}
 */
async function loadProjectConfig(cwd) {
  for (const name of ["cms.config.js", "cms.config.mjs"]) {
    const p = path.resolve(cwd, name);
    if (!existsSync(p)) continue;
    try {
      return await import(pathToFileURL(p).href);
    } catch (err) {
      console.error(
        `[cms-sync] Failed to load ${name}: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }
  return {};
}
