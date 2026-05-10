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
 * Reads `.env.local` from the working directory (Next.js consumers expect
 * that file to feed CMS_URL / KEYCLOAK_* into the build), walks `app/` for
 * `<EditableRegion>` and `useCmsBlock(..., metadata)` declarations, then
 * calls `syncAll`. On Keycloak 403 the failing token's claims are dumped
 * so the operator can see exactly which role is missing.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { syncAll } from "../server/get-content.js";
import { discoverManifests } from "../server/discover.js";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

loadEnvFile(args.env ?? path.resolve(process.cwd(), ".env.local"));

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
  await syncAll(manifests);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  await debugServiceTokenClaims().catch(() => {});
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

Required environment:
  CMS_URL              Backend base URL (default: http://localhost:5000)
  KEYCLOAK_ISSUER      Keycloak realm URL for service-to-service auth
  KEYCLOAK_CLIENT_ID   Service account client id
  KEYCLOAK_CLIENT_SECRET
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
 * On failure, fetch the service token directly and dump the claims that
 * the backend's `CmsAccessPolicy` checks (`azp`, `aud`, `resource_access`).
 * Most 403s come from the service account missing the `cms:access` role
 * mapping in Keycloak - this prints exactly what's there so you can tell.
 */
async function debugServiceTokenClaims() {
  const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET, KEYCLOAK_ISSUER } = process.env;
  if (!KEYCLOAK_CLIENT_ID || !KEYCLOAK_CLIENT_SECRET || !KEYCLOAK_ISSUER) return;

  const res = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    console.error(`[cms-sync:debug] Token fetch failed: ${res.status} ${await res.text()}`);
    return;
  }

  const { access_token } = await res.json();
  const [, payload] = access_token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

  console.error("[cms-sync:debug] Service token claims:");
  console.error(`  azp:             ${claims.azp}`);
  console.error(`  sub:             ${claims.sub}`);
  console.error(`  aud:             ${JSON.stringify(claims.aud)}`);
  console.error(`  scope:           ${claims.scope}`);
  console.error(`  resource_access: ${JSON.stringify(claims.resource_access)}`);

  const ourRoles = claims.resource_access?.[claims.azp]?.roles ?? [];
  console.error(`  -> roles for "${claims.azp}": ${JSON.stringify(ourRoles)}`);
  if (!ourRoles.includes("cms:access")) {
    console.error(`  ! "cms:access" role missing on service account.`);
    console.error(`     Keycloak Admin -> Clients -> ${claims.azp} -> Service account roles -> Assign "cms:access".`);
  }
}
