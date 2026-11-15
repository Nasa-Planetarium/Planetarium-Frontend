/**
 * functions/api/[[path]].ts(Pages Functions 프록시) 단위 시험 — fetch(API_ORIGIN 경로)·env.API(서비스 바인딩 경로)를 바꿔 끼워 넘기는 요청·돌려주는 응답을 잰다.
 * 실제 Pages 런타임 확인은 `npx wrangler pages dev out`(README 「배포」).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest, parseOrigin } from "../functions/api/[[path]].ts";

const ENV = { API_ORIGIN: "https://api.example/ignored-path" };
const req = (path, init = {}) => new Request(`https://web.example${path}`, init);

afterEach(() => vi.unstubAllGlobals());

describe("Pages API 프록시", () => {
  it("/api/v1/* GET 을 API_ORIGIN 으로 넘기고, 허용 헤더만 + X-Client-IP", async () => {
    const seen = [];
    vi.stubGlobal("fetch", async (url, init) => {
      seen.push({ url, init });
      return new Response('{"ok":1}', { status: 200, headers: { "Cache-Control": "public, max-age=60", "X-Method-Version": "v1", "Set-Cookie": "a=b", ETag: '"e"' } });
    });
    const r = await onRequest({
      request: req("/api/v1/aois?x=1", { headers: { Accept: "application/json", Cookie: "s=1", Authorization: "Bearer t", "CF-Connecting-IP": "203.0.113.7", "Accept-Language": "ko" } }),
      env: ENV,
    });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('{"ok":1}');
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    expect(r.headers.get("x-method-version")).toBe("v1");
    expect(r.headers.get("etag")).toBe('"e"');
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://api.example/api/v1/aois?x=1");
    const h = seen[0].init.headers;
    expect(h.get("cookie")).toBeNull();
    expect(h.get("authorization")).toBeNull();
    expect(h.get("cf-connecting-ip")).toBeNull();
    expect(h.get("x-client-ip")).toBe("203.0.113.7");
    expect(h.get("accept")).toBe("application/json");
    expect(h.get("accept-language")).toBe("ko");
  });

  it("GET·HEAD 밖 메서드 → 405 problem+json, 백엔드 안 부름", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const r = await onRequest({ request: req("/api/v1/aois", { method, body: method === "POST" || method === "PUT" ? "{}" : undefined }), env: ENV });
      expect(r.status).toBe(405);
      expect(r.headers.get("content-type")).toBe("application/problem+json");
      expect(r.headers.get("allow")).toBe("GET, HEAD");
      expect((await r.json()).code).toBe("method_not_allowed");
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("/api/v1/ 밖 → 404", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const p of ["/api/x", "/api/v1", "/api/v2/aois"]) {
      const r = await onRequest({ request: req(p), env: ENV });
      expect(r.status).toBe(404);
      expect((await r.json()).code).toBe("not_found");
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("백엔드에 못 닿음 · API_ORIGIN 없음 → 502 upstream_error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("connect refused");
    });
    const a = await onRequest({ request: req("/api/v1/aois"), env: ENV });
    expect(a.status).toBe(502);
    expect(a.headers.get("cache-control")).toBe("no-store");
    expect((await a.json()).code).toBe("upstream_error");
    const b = await onRequest({ request: req("/api/v1/aois"), env: {} });
    expect(b.status).toBe(502);
  });

  it("백엔드 오류 응답(problem+json 4xx·5xx)은 그대로 넘긴다", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"code":"unknown_aoi"}', { status: 404, headers: { "Content-Type": "application/problem+json" } }));
    const r = await onRequest({ request: req("/api/v1/aois/NOPE"), env: ENV });
    expect(r.status).toBe(404);
    expect((await r.json()).code).toBe("unknown_aoi");
  });

  it("HEAD 는 본문 없이, 304 는 그대로", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 304, headers: { ETag: '"e"' } }));
    const r = await onRequest({ request: req("/api/v1/aois", { method: "HEAD" }), env: ENV });
    expect(r.status).toBe(304);
    expect(r.body).toBeNull();
  });

  it("parseOrigin — 출처만, http/https 밖·빈 값은 null", () => {
    expect(parseOrigin("https://a.example/x/y")).toBe("https://a.example");
    expect(parseOrigin("http://192.168.0.10:18490")).toBe("http://192.168.0.10:18490");
    expect(parseOrigin("ftp://a")).toBeNull();
    expect(parseOrigin("")).toBeNull();
    expect(parseOrigin(undefined)).toBeNull();
    expect(parseOrigin("not a url")).toBeNull();
  });
});

describe("Pages API 프록시 — 서비스 바인딩 API", () => {
  /** 바인딩 흉내: env.API.fetch 만 있는 객체. 부른 것을 seen 에 쌓는다 */
  const binding = (respond) => {
    const seen = [];
    return { seen, API: { fetch: async (url, init) => (seen.push({ url, init }), respond(url, init)) } };
  };

  it("바인딩이 있으면 바인딩으로(전역 fetch 안 부름), API_ORIGIN 이 같이 있어도 바인딩 우선", async () => {
    const g = vi.fn();
    vi.stubGlobal("fetch", g);
    const b = binding(() => new Response('{"via":"binding"}', { status: 200, headers: { "Cache-Control": "public, max-age=60", "Set-Cookie": "a=b", ETag: '"e"' } }));
    const r = await onRequest({
      request: req("/api/v1/aois?x=1", { headers: { Accept: "application/json", Cookie: "s=1", Authorization: "Bearer t", "CF-Connecting-IP": "203.0.113.7", "If-None-Match": '"e0"' } }),
      env: { API: b.API, API_ORIGIN: "https://api.example" },
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ via: "binding" });
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    expect(r.headers.get("etag")).toBe('"e"');
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(g).not.toHaveBeenCalled();
    expect(b.seen).toHaveLength(1);
    // 바인딩은 호스트를 보지 않는다 — 경로·쿼리는 그대로, 출처는 자리표시
    const u = new URL(b.seen[0].url);
    expect(u.pathname + u.search).toBe("/api/v1/aois?x=1");
    expect(u.origin).not.toBe("https://api.example");
    const h = b.seen[0].init.headers;
    expect(b.seen[0].init.method).toBe("GET");
    expect(b.seen[0].init.redirect).toBe("manual");
    expect(h.get("cookie")).toBeNull();
    expect(h.get("authorization")).toBeNull();
    expect(h.get("cf-connecting-ip")).toBeNull();
    expect(h.get("x-client-ip")).toBe("203.0.113.7");
    expect(h.get("if-none-match")).toBe('"e0"');
    expect(h.get("accept")).toBe("application/json");
  });

  it("바인딩이 있어도 GET·HEAD 밖 405, /api/v1/ 밖 404 — 바인딩 안 부름", async () => {
    const b = binding(() => new Response("x"));
    for (const method of ["POST", "PUT", "DELETE"]) {
      const r = await onRequest({ request: req("/api/v1/aois", { method, body: method === "DELETE" ? undefined : "{}" }), env: { API: b.API } });
      expect(r.status).toBe(405);
      expect(r.headers.get("allow")).toBe("GET, HEAD");
    }
    for (const p of ["/api/x", "/api/v1", "/api/v2/aois"]) {
      const r = await onRequest({ request: req(p), env: { API: b.API } });
      expect(r.status).toBe(404);
      expect((await r.json()).code).toBe("not_found");
    }
    expect(b.seen).toHaveLength(0);
  });

  it("바인딩이 던지면 502 problem+json upstream_error, no-store", async () => {
    const b = binding(() => {
      throw new Error("service binding failed");
    });
    const r = await onRequest({ request: req("/api/v1/aois"), env: { API: b.API, API_ORIGIN: "https://api.example" } });
    expect(r.status).toBe(502);
    expect(r.headers.get("content-type")).toBe("application/problem+json");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await r.json()).code).toBe("upstream_error");
  });

  it("바인딩 응답의 백엔드 오류(problem 404)·HEAD·304 는 그대로", async () => {
    const nf = binding(() => new Response('{"code":"unknown_aoi"}', { status: 404, headers: { "Content-Type": "application/problem+json" } }));
    const a = await onRequest({ request: req("/api/v1/aois/NOPE"), env: { API: nf.API } });
    expect(a.status).toBe(404);
    expect((await a.json()).code).toBe("unknown_aoi");
    const nm = binding(() => new Response(null, { status: 304, headers: { ETag: '"e"' } }));
    const b = await onRequest({ request: req("/api/v1/aois", { method: "HEAD" }), env: { API: nm.API } });
    expect(b.status).toBe(304);
    expect(b.body).toBeNull();
    expect(nm.seen[0].init.method).toBe("HEAD");
  });

  it("바인딩이 자리표시 출처로 돌려보내면(3xx Location) 같은 출처 경로로 바꾼다", async () => {
    let origin = "";
    const b = binding((url) => {
      origin = new URL(url).origin;
      return new Response(null, { status: 301, headers: { Location: `${origin}/api/v1/aois/` } });
    });
    const r = await onRequest({ request: req("/api/v1/aois"), env: { API: b.API } });
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/api/v1/aois/");
  });

  it("바인딩 없음 + API_ORIGIN 없음 → 502 Upstream not configured", async () => {
    const r = await onRequest({ request: req("/api/v1/aois"), env: { API: undefined } });
    expect(r.status).toBe(502);
    expect((await r.json()).title).toBe("Upstream not configured");
  });
});
