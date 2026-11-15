/**
 * MSW 처리기 — FireOutlook Planner 30일 전망 `POST /forecast`(F17, 계약 contract/openapi.yaml tags: outlook).
 *
 * 값 = public/data/snap/forecast.json — scripts/snap-forecast.py 가 모델팀 함수 `planetarium.forecast.forecast` 를 **직접 불러** 받은 응답 45개
 * (한국 시도 17 · 아르헨티나 주 24 · 시군구 2 · 사각형 1 · 다각형 1, today 2026-11-15, release data-v1.2-2026-11-15). 값을 만들거나 다시 계산하지 않는다(A1).
 * 스냅숏에 없는 본문(다른 지역·직접 그린 영역)은 계약대로 503 data_not_loaded — 가짜 값을 내지 않는다.
 * 실제 백엔드(DATA_MODE=http)에서는 이 파일이 빠진다. 화면은 이 파일을 import 하지 않는다.
 */
import { bypass, http, HttpResponse } from "msw";

export interface ForecastSnap {
  release: string;
  today_kst: string;
  names: Record<string, string>;
  presets: Record<string, string[]>;
  items: { body: { region: unknown; horizon_days: number }; response: Record<string, unknown> }[];
}

let snap: Promise<ForecastSnap> | null = null;
const getSnap = () => (snap ??= fetch(bypass(new Request(new URL("/data/snap/forecast.json", location.origin)))).then((r) => r.json() as Promise<ForecastSnap>));

/** 본문 region → 찾기 열쇠(좌표는 소수 6자리로 맞춤 — 같은 영역이면 같은 열쇠) */
export function regionKey(region: unknown): string | null {
  const r6 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : NaN);
  if (typeof region === "string") return region ? `aoi:${region}` : null;
  if (Array.isArray(region)) return region.length === 4 && region.every((v) => typeof v === "number" && Number.isFinite(v)) ? `bbox:${region.map(r6).join(",")}` : null;
  if (region && typeof region === "object") {
    const o = region as { type?: string; geometry?: unknown; coordinates?: unknown };
    const g = (o.type === "Feature" ? o.geometry : o) as { type?: string; coordinates?: unknown } | null;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) return null;
    const walk = (c: unknown): unknown => (Array.isArray(c) ? c.map(walk) : r6(c));
    return `geo:${g.type}:${JSON.stringify(walk(g.coordinates))}`;
  }
  return null;
}

/** 폴리곤 꼭짓점·링 수(계약 한도 ≤ 2,000 · ≤ 50) */
export function polygonSize(region: unknown): { vertices: number; rings: number } {
  let vertices = 0;
  let rings = 0;
  const o = region as { type?: string; geometry?: { coordinates?: unknown }; coordinates?: unknown } | null;
  const c = o?.type === "Feature" ? o.geometry?.coordinates : o?.coordinates;
  const walk = (x: unknown) => {
    if (!Array.isArray(x)) return;
    if (x.length && typeof x[0] === "number") {
      vertices++;
      return;
    }
    if (x.length && Array.isArray(x[0]) && typeof x[0][0] === "number") rings++;
    x.forEach((y) => walk(y));
  };
  walk(c);
  return { vertices, rings };
}

export function forecastHandlers(at: (p: string) => string, mv: () => Promise<string>) {
  const problem = async (status: number, code: string, no: number, detail: string, instance: string, param?: string) =>
    HttpResponse.json(
      { type: `https://emberline.example/errors/${code}`, title: code, status, code, error_no: no, detail, instance, request_id: `MSWFC${Date.now().toString(36).toUpperCase()}`, method_version: await mv(), ...(param ? { param } : {}) },
      { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } },
    );
  return [
    http.post(at("/forecast"), async ({ request }) => {
      const inst = new URL(request.url).pathname;
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return problem(415, "invalid_param", 10004, "Content-Type must be application/json", inst);
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 64 * 1024) return problem(413, "range_too_large", 10102, "body > 64 KB", inst);
      let body: { region?: unknown; horizon_days?: unknown; start?: unknown; end?: unknown };
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        return problem(400, "invalid_param", 10001, "body is not JSON", inst);
      }
      const key = regionKey(body.region);
      if (!key) return problem(400, "invalid_param", 40001, "region must be aoi_id, [west, south, east, north] or GeoJSON Polygon/MultiPolygon", inst, "region");
      if (key.startsWith("geo:")) {
        const n = polygonSize(body.region);
        if (n.vertices > 2000 || n.rings > 50) return problem(400, "polygon_too_complex", 40102, `vertices ${n.vertices} (≤ 2,000) · rings ${n.rings} (≤ 50)`, inst, "region");
      }
      const h = body.horizon_days;
      if (h == null && (body.start == null || body.end == null)) return problem(400, "invalid_param", 40005, "horizon_days or start·end is required", inst, "horizon_days");
      if (h != null && (typeof h !== "number" || !Number.isInteger(h) || h < 1 || h > 366)) return problem(400, "invalid_param", 40005, "horizon_days must be 1–366", inst, "horizon_days");
      const s = await getSnap();
      if (key.startsWith("aoi:") && !s.items.some((it) => regionKey(it.body.region) === key) && !/^(SIDO|SGG|ADM0|ADM1|CONT)_|^(KR|WORLD)$/.test(String(body.region))) {
        return problem(404, "unknown_aoi", 20401, `unknown aoi_id: ${String(body.region)}`, inst, "region");
      }
      /* 스냅숏은 30일 질의만 담았다 — 기간 지정·다른 지역·직접 그린 영역은 계산할 서버가 없다 */
      const hit = h === 30 && body.start == null ? s.items.find((it) => regionKey(it.body.region) === key) : undefined;
      if (!hit) return problem(503, "data_not_loaded", 50502, "forecast server not connected (snapshot has 30-day answers for preset regions only)", inst);
      return HttpResponse.json(hit.response, { headers: { "Cache-Control": "no-store", "X-Method-Version": await mv(), "X-Data-Version": s.release } });
    }),
  ];
}
