/**
 * Cloudflare Pages Functions — 같은 출처 `/api/v1/*` 를 실제 백엔드(API_ORIGIN)로 넘기는 얇은 프록시.
 *
 * 화면은 정적 내보내기라 서버가 없다. 화면은 `/api/v1/...` 를 같은 출처로 부르고(NEXT_PUBLIC_API_BASE 기본값),
 * Pages 에서는 이 파일이 그 요청을 받아 `API_ORIGIN`(Pages 프로젝트 환경변수, 예: https://emberline-api.example)으로 넘긴다.
 *
 * 규칙
 *  - `/api/v1/` 밖(`/api/x` 등) → 404 problem+json(not_found)
 *  - GET · HEAD 만. 그 밖 메서드 → 405 problem+json(method_not_allowed) + Allow 헤더
 *    (계약의 POST /summary-queries 는 화면이 부르지 않는다 — 부르게 되면 여기와 README 를 같이 고친다)
 *  - 요청 헤더는 REQUEST_HEADERS 만 넘긴다. 쿠키·Authorization·CF-* 는 넘기지 않는다.
 *  - 접속자 IP 는 `X-Client-IP`(Cloudflare 가 붙인 CF-Connecting-IP 값)로 넘긴다. 백엔드가 이 값을 믿을지는 백엔드 몫이다
 *    (터널 뒤에서 누구나 이 헤더를 지어 보낼 수 있다 — README 「배포」 참고).
 *  - 응답은 상태·본문·헤더(Cache-Control·ETag·X-Method-Version 등)를 그대로. Set-Cookie 와 hop-by-hop 헤더만 뺀다.
 *  - API_ORIGIN 이 없거나 틀렸거나 백엔드에 닿지 못하면 → 502 problem+json(upstream_error)
 *
 * 타입: @cloudflare/workers-types 를 들이지 않으려고 쓰는 것(Request·Response·fetch)만 표준 타입으로 적는다.
 */

export interface Env {
  API_ORIGIN?: string;
}

interface Ctx {
  request: Request;
  env: Env;
}

const PREFIX = "/api/v1/";
const ALLOWED_METHODS = ["GET", "HEAD"];
const TIMEOUT_MS = 20_000;

/** 백엔드로 넘기는 요청 헤더(소문자) — 이 밖은 버린다 */
export const REQUEST_HEADERS = ["accept", "accept-language", "if-none-match", "if-modified-since"];

/** 응답에서 빼는 헤더(소문자) */
const DROP_RESPONSE_HEADERS = new Set([
  "set-cookie",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "server",
]);

/** 계약 Problem 모양(type·title·status·code·error_no·request_id) */
function problem(status: number, code: string, errorNo: number, title: string, instance: string, extra: Record<string, string> = {}): Response {
  const body = {
    type: `https://emberline.example/errors/${code}`,
    title,
    status,
    code,
    error_no: errorNo,
    instance,
    request_id: crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase(),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store", ...extra },
  });
}

/** API_ORIGIN → 출처(https://host[:port])만. 경로가 붙어 있어도 버린다. 틀리면 null */
export function parseOrigin(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export const onRequest = async ({ request, env }: Ctx): Promise<Response> => {
  const url = new URL(request.url);
  const instance = url.pathname;

  if (!url.pathname.startsWith(PREFIX)) return problem(404, "not_found", 10401, "Not found", instance);
  if (!ALLOWED_METHODS.includes(request.method)) {
    return problem(405, "method_not_allowed", 10002, "Method not allowed", instance, { Allow: ALLOWED_METHODS.join(", ") });
  }

  const origin = parseOrigin(env.API_ORIGIN);
  if (!origin) return problem(502, "upstream_error", 60501, "Upstream not configured", instance);

  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers();
  for (const h of REQUEST_HEADERS) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("X-Client-IP", clientIp);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
  headers.set("X-Forwarded-Host", url.host);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return problem(502, "upstream_error", 60501, "Upstream unreachable", instance);
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase())) out.append(key, value);
  });
  // 백엔드가 자기 주소로 돌려보내면(3xx) 같은 출처 경로로 바꾼다 — 백엔드 주소를 화면에 드러내지 않게
  const loc = out.get("location");
  if (loc && loc.startsWith(origin)) out.set("location", loc.slice(origin.length) || "/");

  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
};
