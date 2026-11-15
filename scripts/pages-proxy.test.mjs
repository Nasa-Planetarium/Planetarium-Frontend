/**
 * functions/api/[[path]].ts(Pages Functions 프록시) 단위 시험 — fetch 를 바꿔 끼워 넘기는 요청·돌려주는 응답을 잰다.
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
