/**
 * @file Low-level fetch wrapper for the CMS backend.
 *
 * No React, no browser-only APIs - safe to call from server components,
 * route handlers, or client hooks. Each function takes an explicit config
 * so callers stay in control of where credentials come from.
 */

/**
 * @import { CmsConfig } from "./config.js"
 * @import {
 *   ContentResponse,
 *   UpdatePageRequest,
 *   UpdatePageResponse,
 *   SyncManifestRequest,
 *   SyncResultResponse,
 *   ProblemDetails,
 * } from "./schemas.js"
 */

/**
 * Error thrown for any non-2xx response. Carries the backend's
 * ProblemDetails payload when one is available, plus a `blockPath` hint
 * for 409 conflicts so callers can surface per-field errors.
 */

export class CmsApiError extends Error {
  /**
   * @param {Object} args
   * @param {number} args.status
   * @param {string} args.detail
   * @param {string} [args.title]
   * @param {ProblemDetails|null} [args.problem]
   * @param {string|null} [args.blockPath]
   */
  constructor({ status, detail, title, problem, blockPath }) {
    super(detail || title || `CMS request failed (${status})`);
    this.name = "CmsApiError";
    this.status = status;
    this.title = title ?? null;
    this.detail = detail ?? null;
    this.problem = problem ?? null;
    this.blockPath = blockPath ?? null;
  }

  get isConflict() {
    return this.status === 409;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

/**
 * @param {CmsConfig} config
 * @returns {Record<string, string>}
 */
function baseHeaders(config) {
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json" };
  if (config.clientId) headers["X-CMS-Client-Id"] = config.clientId;
  return headers;
}

/**
 * Parse a non-2xx response into a CmsApiError. Tolerates non-JSON bodies.
 *
 * @param {Response} response
 * @returns {Promise<CmsApiError>}
 */
async function toApiError(response) {
  /** @type {ProblemDetails|null} */
  let problem = null;
  let rawBody = "";
  try {
    rawBody = await response.text();
    if (rawBody) {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object") {
        problem = /** @type {ProblemDetails} */ (parsed);
      }
    }
  } catch {
    // Body present but not JSON. Keep `rawBody` so the caller can still
    // surface whatever the backend wrote (often a plain "validation
    // failed: ..." string).
  }

  const blockPath =
    problem && typeof (/** @type {*} */ (problem).blockPath) === "string"
      ? /** @type {*} */ (problem).blockPath
      : null;

  // Prefer ProblemDetails.detail; fall back to the raw body so non-JSON
  // 4xx responses (rare but they happen) still bubble up something useful.
  const detail = problem?.detail || (rawBody && !problem ? rawBody : "") || response.statusText;

  return new CmsApiError({
    status: response.status,
    title: problem?.title,
    detail,
    problem,
    blockPath,
  });
}

/**
 * Build a URL with query parameters under the `/cms` prefix.
 *
 * @param {CmsConfig} config
 * @param {string} path  e.g. "/content"
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
function buildUrl(config, path, params) {
  const url = new URL(`${config.baseUrl}/cms${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * `GET /cms/content?slug={slug}` - full block list for a page.
 *
 * @param {CmsConfig} config
 * @param {string} slug
 * @param {RequestInit} [init]  Forwarded to fetch (e.g. Next.js `next` cache opts).
 * @returns {Promise<ContentResponse>}
 */
export async function fetchContent(config, slug, init) {
  const response = await fetch(buildUrl(config, "/content", { slug }), {
    ...init,
    method: "GET",
    headers: { ...baseHeaders(config), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw await toApiError(response);
  return /** @type {ContentResponse} */ (await response.json());
}

/**
 * `GET /cms/collections/{key}` - all items in a collection (e.g. "Teams",
 * "News"). Requires a Bearer token with `cms:access` role; pass it via
 * `init.headers.Authorization`. Server-side callers typically wire this
 * through `getCmsCollection` which attaches the service-credentials token
 * automatically.
 *
 * @param {CmsConfig} config
 * @param {string} key
 * @param {RequestInit} [init]
 * @returns {Promise<import("./schemas.js").CollectionItemResponse[]>}
 */
export async function fetchCollection(config, key, init) {
  const response = await fetch(
    `${config.baseUrl}/cms/collections/${encodeURIComponent(key)}`,
    {
      ...init,
      method: "GET",
      headers: { ...baseHeaders(config), ...(init?.headers ?? {}) },
    },
  );
  if (!response.ok) throw await toApiError(response);
  return /** @type {import("./schemas.js").CollectionItemResponse[]} */ (
    await response.json()
  );
}

/**
 * `GET /cms/collections/{key}/{slug}` - a single collection item.
 * Throws `CmsApiError` (with `isNotFound === true`) on 404 so callers
 * can branch on a single try/catch.
 *
 * @param {CmsConfig} config
 * @param {string} key
 * @param {string} slug
 * @param {RequestInit} [init]
 * @returns {Promise<import("./schemas.js").CollectionItemResponse>}
 */
export async function fetchCollectionItem(config, key, slug, init) {
  const response = await fetch(
    `${config.baseUrl}/cms/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}`,
    {
      ...init,
      method: "GET",
      headers: { ...baseHeaders(config), ...(init?.headers ?? {}) },
    },
  );
  if (!response.ok) throw await toApiError(response);
  return /** @type {import("./schemas.js").CollectionItemResponse} */ (
    await response.json()
  );
}

/**
 * `PUT /cms/content` - admin save. Requires a Keycloak token with `cms:access`
 * role; the backend reads `sub` and `azp` directly from the token.
 *
 * 401 → token missing/invalid/expired
 * 403 → token valid but missing `cms:access` role
 * 409 Conflict → surfaces as `CmsApiError` with `isConflict === true`
 *
 * @param {CmsConfig} config
 * @param {UpdatePageRequest} request
 * @param {string} [accessToken]
 * @returns {Promise<UpdatePageResponse>}
 */
export async function updateContent(config, request, accessToken) {
  /** @type {Record<string, string>} */
  const extraHeaders = accessToken ? { "Authorization": `Bearer ${accessToken}` } : {};
  const response = await fetch(buildUrl(config, "/content"), {
    method: "PUT",
    headers: { ...baseHeaders(config), ...extraHeaders },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await toApiError(response);
  return /** @type {UpdatePageResponse} */ (await response.json());
}

/**
 * `PUT /cms/draft` - admin draft autosave. Body shape is identical to
 * `PUT /cms/content` (`UpdatePageRequest`); the backend stores the values
 * as a Redis-overlay rather than persisting them, returns `204 No Content`,
 * and ignores the per-block `version` field. A successful `updateContent`
 * call clears the matching draft server-side, so callers don't need to
 * coordinate cleanup.
 *
 * @param {CmsConfig} config
 * @param {UpdatePageRequest} request
 * @param {string} [accessToken]
 * @returns {Promise<void>}
 */
export async function updateDraft(config, request, accessToken) {
  /** @type {Record<string, string>} */
  const extraHeaders = accessToken ? { "Authorization": `Bearer ${accessToken}` } : {};
  const response = await fetch(buildUrl(config, "/draft"), {
    method: "PUT",
    headers: { ...baseHeaders(config), ...extraHeaders },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await toApiError(response);
}

/**
 * `POST /cms/sync` - deploy pipeline only. Not called from end-user flows.
 *
 * @param {CmsConfig} config
 * @param {SyncManifestRequest} request
 * @param {string} [accessToken]  Service JWT from Keycloak client-credentials grant.
 * @returns {Promise<SyncResultResponse>}
 */
export async function syncManifest(config, request, accessToken) {
  /** @type {Record<string, string>} */
  const extraHeaders = accessToken ? { "Authorization": `Bearer ${accessToken}` } : {};
  const response = await fetch(buildUrl(config, "/sync"), {
    method: "POST",
    headers: { ...baseHeaders(config), ...extraHeaders },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await toApiError(response);
  return /** @type {SyncResultResponse} */ (await response.json());
}

/**
 * Upload an image file via XHR so upload progress can be tracked.
 * Endpoint: `POST {config.cdnUrl}` when configured, otherwise `POST {config.baseUrl}/cms/media`.
 * Expected response: `{ data: { url: string } }`
 *
 * @param {CmsConfig} config
 * @param {File} file
 * @param {(progress: number) => void} onProgress  Called with 0–100.
 * @param {string|null} [accessToken]
 * @returns {Promise<{ data: { url: string } }>}
 */
export function uploadImage(config, file, onProgress, accessToken) {
  const target = config.cdnUrl ?? `${config.baseUrl}/cms/media`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("file", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON in upload response"));
        }
      } else {
        let detail = xhr.statusText || "Upload failed";
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.detail) detail = parsed.detail;
        } catch { /* ignore */ }
        reject(new CmsApiError({ status: xhr.status, detail }));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.open("POST", target);
    if (config.clientId) xhr.setRequestHeader("X-CMS-Client-Id", config.clientId);
    if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.send(body);
  });
}

