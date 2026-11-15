import createClient, { type Middleware } from "openapi-fetch";
import { API_BASE } from "@/shared/config";
import { ApiError, type Problem } from "./errors";
import { dataReady } from "./ready";
import type { paths } from "./schema";

/**
 * 계약(contract/openapi.yaml) 타입이 붙은 fetch 클라이언트 하나.
 * - 기준 경로 = NEXT_PUBLIC_API_BASE(기본 /api/v1). MSW 모드도 같은 경로를 쓴다(MSW 가 가로챔).
 * - 실패 응답(problem+json)은 ApiError 로 던진다 → TanStack Query 의 error 로 간다.
 * - 응답 헤더 X-Method-Version 을 기억한다(판이 바뀌면 Query 키가 바뀌게 — query-keys.ts).
 */
let lastMethodVersion: string | null = null;
export const getLastMethodVersion = () => lastMethodVersion;

const problemMiddleware: Middleware = {
  async onRequest({ request }) {
    await dataReady; // MSW 모드: 워커가 뜰 때까지 기다림(ready.ts)
    return request;
  },
  async onResponse({ response }) {
    const mv = response.headers.get("X-Method-Version");
    if (mv) lastMethodVersion = mv;
    if (response.ok) return response;
    let problem: Problem | null = null;
    try {
      problem = (await response.clone().json()) as Problem;
    } catch {
      problem = null;
    }
    /* Retry-After = 초(정수) 또는 HTTP 날짜. 없으면 본문 「retry after N s」 */
    const ra = response.headers.get("Retry-After");
    const raN = ra == null ? NaN : /^\d+$/.test(ra.trim()) ? Number(ra) : (Date.parse(ra) - Date.now()) / 1000;
    const raB = Number(/retry after (\d+)\s*s/i.exec(problem?.detail ?? "")?.[1] ?? NaN);
    const retryAfter = Number.isFinite(raN) ? Math.max(0, raN) : Number.isFinite(raB) ? raB : null;
    throw new ApiError(response.status, problem?.code ?? "internal", problem, undefined, retryAfter);
  },
  async onError({ error }) {
    return new ApiError(0, "network", null, error instanceof Error ? error.message : String(error));
  },
};

export const api = createClient<paths>({ baseUrl: API_BASE });
api.use(problemMiddleware);

/** openapi-fetch 결과에서 data 만(오류는 미들웨어가 이미 던짐) */
export function unwrap<T>(r: { data?: T; error?: unknown }): T {
  if (r.data === undefined) throw new ApiError(0, "internal", null, "empty response");
  return r.data;
}
