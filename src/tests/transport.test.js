import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRestTransport } from "../defaults/transport.js";
import { CmsApiError } from "../lib/errors.js";

/**
 * Contract test for the default REST transport. The core only ever sees the
 * `CmsTransport` shape (see ../lib/transport.js); these assertions pin the
 * wire behaviour every custom backend adapter must match: endpoint paths,
 * headers (`X-CMS-Client-Id`, Bearer), the opaque `cache` -> Next.js mapping,
 * and `CmsApiError` on non-2xx.
 */

const BASE = "https://api.test";

/** Resolve the next fetch() call with a JSON body and status. */
function fetchResolves(body, status = 200) {
  global.fetch.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** [url, init] of the most recent fetch() call. */
function lastCall() {
  return global.fetch.mock.calls.at(-1);
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("getContent", () => {
  it("GETs /cms/content?slug= and returns the parsed body", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ slug: "home", blocks: [] });

    const out = await t.getContent("home");

    const [url, init] = lastCall();
    expect(url).toContain(`${BASE}/cms/content`);
    expect(new URL(url).searchParams.get("slug")).toBe("home");
    expect(init.method).toBe("GET");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(out).toEqual({ slug: "home", blocks: [] });
  });

  it("attaches Authorization only when an accessToken is given", async () => {
    const t = createRestTransport({ baseUrl: BASE });

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    expect(lastCall()[1].headers.Authorization).toBeUndefined();

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home", { accessToken: "tok" });
    expect(lastCall()[1].headers.Authorization).toBe("Bearer tok");
  });

  it("attaches X-CMS-Client-Id only when configured", async () => {
    fetchResolves({ slug: "home", blocks: [] });
    await createRestTransport({ baseUrl: BASE }).getContent("home");
    expect(lastCall()[1].headers["X-CMS-Client-Id"]).toBeUndefined();

    fetchResolves({ slug: "home", blocks: [] });
    await createRestTransport({ baseUrl: BASE, clientId: "client-1" }).getContent("home");
    expect(lastCall()[1].headers["X-CMS-Client-Id"]).toBe("client-1");
  });

  it("maps the opaque cache hint onto Next.js' next: { revalidate, tags }", async () => {
    const t = createRestTransport({ baseUrl: BASE });

    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home", { cache: { revalidate: 60, tags: ["cms"] } });
    expect(lastCall()[1].next).toEqual({ revalidate: 60, tags: ["cms"] });

    // No cache hint -> no `next` key at all (plain fetch).
    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    expect(lastCall()[1].next).toBeUndefined();
  });

  it("throws a CmsApiError carrying status + detail on non-2xx", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ title: "Not Found", detail: "no such page", status: 404 }, 404);

    await expect(t.getContent("missing")).rejects.toMatchObject({
      name: "CmsApiError",
      status: 404,
      detail: "no such page",
    });
  });

  it("surfaces 404 via the isNotFound helper", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ title: "Not Found", detail: "gone", status: 404 }, 404);
    const err = await t.getContent("x").catch((e) => e);
    expect(err).toBeInstanceOf(CmsApiError);
    expect(err.isNotFound).toBe(true);
  });
});

describe("getCollection", () => {
  it("builds the list URL with filter, offset and limit query params", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ items: [], total: 0, offset: 10, limit: 5 });

    await t.getCollection("News", { filter: { status: "active" }, offset: 10, limit: 5 });

    const sp = new URL(lastCall()[0]).searchParams;
    expect(lastCall()[0]).toContain(`${BASE}/cms/collections/News`);
    expect(sp.get("status")).toBe("active");
    expect(sp.get("offset")).toBe("10");
    expect(sp.get("limit")).toBe("5");
  });

  it("URL-encodes the collection key", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ items: [], total: 0, offset: 0, limit: 0 });
    await t.getCollection("My Teams");
    expect(lastCall()[0]).toContain("/cms/collections/My%20Teams");
  });

  it("skips null/undefined filter values", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves({ items: [], total: 0, offset: 0, limit: 0 });
    await t.getCollection("News", { filter: { status: null, category: "tech" } });
    const sp = new URL(lastCall()[0]).searchParams;
    expect(sp.has("status")).toBe(false);
    expect(sp.get("category")).toBe("tech");
  });

  it("coerces a bare array body into the paged envelope shape", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves([{ id: "1" }, { id: "2" }]);
    const out = await t.getCollection("News", { offset: 0, limit: 50 });
    expect(out).toEqual({ items: [{ id: "1" }, { id: "2" }], total: 2, offset: 0, limit: 50 });
  });

  it("passes an already-enveloped body through unchanged", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    const envelope = { items: [{ id: "1" }], total: 99, offset: 0, limit: 1 };
    fetchResolves(envelope);
    expect(await t.getCollection("News")).toEqual(envelope);
  });
});

describe("updateContent", () => {
  it("PUTs the request body to /cms/content", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    const request = { slug: "home", blocks: [{ blockPath: "hero.title", value: "Hi", version: 1 }] };
    fetchResolves({ updated: 1, unchanged: 0 });

    const out = await t.updateContent(request, { accessToken: "tok" });

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/cms/content`);
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual(request);
    expect(out).toEqual({ updated: 1, unchanged: 0 });
  });

  it("throws CmsApiError on a 409 conflict and exposes blockPath", async () => {
    const t = createRestTransport({ baseUrl: BASE });
    fetchResolves(
      { title: "Conflict", detail: "version mismatch", status: 409, blockPath: "hero.title" },
      409,
    );
    const err = await t.updateContent({ slug: "home", blocks: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(CmsApiError);
    expect(err.isConflict).toBe(true);
    expect(err.blockPath).toBe("hero.title");
  });
});

describe("baseUrl normalisation", () => {
  it("strips trailing slashes before building paths", async () => {
    const t = createRestTransport({ baseUrl: "https://api.test///" });
    fetchResolves({ slug: "home", blocks: [] });
    await t.getContent("home");
    expect(lastCall()[0]).toContain("https://api.test/cms/content");
    expect(lastCall()[0]).not.toContain("api.test//");
  });
});
