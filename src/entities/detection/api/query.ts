import { api, rateWaitMs, unwrap } from "@/shared/api";
import type { DetPoint } from "../lib/cluster";

/**
 * 나라 하나의 최근 감지 점(계약 GET /hotspots). 실서버는 점을 100 제곱도 이하 범위로만 내므로(400 range_too_large)
 * 나라 본토 범위(bbox_main)를 9.9°×9.9° 조각으로 나눠 bbox 로 받는다(최대 MAX_TILES 조각).
 * 날짜 창은 지금 앞 2일 ~ 뒤 1일(date_local 이 현지 태양시라 하루씩 여유) — 24시간 자르기는 detections() 가 acq_datetime_utc 로 한다.
 * 실서버 heavy 한도(429, 분당 약 30 토큰 · /hotspots 2): 조각을 2개씩 받고, 429 면 Retry-After 만큼 기다려 그 조각부터 다시(최대 RATE_WAITS 번).
 * 그래도 막히면 받은 만큼으로 끝낸다(done/total · rate). 하나도 못 받았으면 그 오류를 던진다 — 화면은 429 를 「서버 요청 한도」로 적는다.
 * weight(조각) 를 주면(최근 달 1° 칸 감지량 합) 무게 큰 조각부터 받는다 — 한도에 걸려 멈춰도 불이 잦은 땅을 먼저 받는다. 무게 0 이면서 1급 지역 중심도 없는 조각(바다)은 받지 않는다.
 */
type Bbox = readonly [number, number, number, number];
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const STEP = 9.9; // 100 제곱도 한도에 소수 오차로 걸리지 않게 10 보다 조금 작게
const MAX_TILES = 120;
const RATE_WAITS = 3;
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const id = setTimeout(res, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      rej(signal.reason);
    });
  });

/* 경도는 날짜변경선을 넘으면(미국 172°–293°) 180 을 넘는 값으로 온다 → 조각마다 −180…180 으로 옮기고, 걸치면 둘로 자른다 */
const f4 = (v: number) => +v.toFixed(4);
export function tilesOf(b: Bbox): Bbox[] {
  const out: Bbox[] = [];
  const push = (w: number, s: number, e: number, n: number) => {
    if (w >= 180) out.push([f4(w - 360), f4(s), f4(e - 360), f4(n)]);
    else if (e > 180) {
      out.push([f4(w), f4(s), 180, f4(n)]);
      out.push([-180, f4(s), f4(e - 360), f4(n)]);
    } else out.push([f4(w), f4(s), f4(e), f4(n)]);
  };
  for (let w = b[0]; w < b[2]; w += STEP) for (let s = b[1]; s < b[3]; s += STEP) push(w, s, Math.min(b[2], w + STEP), Math.min(b[3], s + STEP));
  return out.slice(0, MAX_TILES);
}

async function tile(bbox: Bbox, start: string, end: string, signal: AbortSignal): Promise<DetPoint[]> {
  const out: DetPoint[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    const r = (await api
      .GET("/hotspots", {
        params: { query: { bbox: [...bbox], start, end, layer: "all", limit: 10000, ...(cursor ? { cursor } : {}) } },
        querySerializer: { array: { style: "form", explode: false } },
        signal,
      })
      .then(unwrap)) as unknown as { hotspots?: DetPoint[]; next_cursor?: string | null };
    out.push(...(r.hotspots ?? []));
    if (!r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return out;
}

/** nowMs 는 10분 단위로 잘라 키에 넣는다(목업 detCache 와 같은 주기) */
/** 조각 순서: 1급 지역 중심이 많이 든 조각부터(요청 한도에 걸려 멈춰도 사람이 사는 땅을 먼저 받는다 — 미국 172°E 알류샨 바다부터 받던 것) */
export function orderTiles(ts: Bbox[], centers: readonly (readonly [number, number])[]): Bbox[] {
  const n = (b: Bbox) => centers.filter(([la, lo]) => {
    const x = lo > 180 ? lo - 360 : lo;
    return la >= b[1] && la < b[3] && x >= b[0] && x < b[2];
  }).length;
  return ts.map((b, i) => ({ b, i, k: n(b) })).sort((a, b) => b.k - a.k || a.i - b.i).map((x) => x.b);
}

/** centers = 그 나라 1급 지역 중심 [위도, 경도] — 조각 순서에만 쓴다. weight = 조각 무게(있으면 무게 큰 순) */
export const recentDetectionsQuery = (
  iso3: string,
  bbox: Bbox | null | undefined,
  nowMs: number | null,
  mv: string | null,
  centers: readonly (readonly [number, number])[] = [],
  weight?: { key: string; of: (b: Bbox) => number } | null,
) => {
  const slot = nowMs != null ? Math.floor(nowMs / 600e3) * 600e3 : 0;
  const start = day(slot - 2 * 86400e3);
  const end = day(slot + 86400e3);
  return {
    queryKey: ["hotspots", "recent", iso3, bbox ?? null, start, end, mv, centers.length, weight?.key ?? ""] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<{ points: DetPoint[]; done: number; total: number; rate: boolean }> => {
      let ts = orderTiles(tilesOf(bbox!), centers);
      if (weight) {
        /* 무게 0 이고 1급 지역 중심도 없는 조각 = 바다(미국 84조각 중 다수) → 받지 않는다 */
        const hasCenter = (b: Bbox) => centers.some(([la, lo]) => {
          const x = lo > 180 ? lo - 360 : lo;
          return la >= b[1] && la < b[3] && x >= b[0] && x < b[2];
        });
        ts = ts
          .map((b, i) => ({ b, i, k: weight.of(b) }))
          .filter((x) => x.k > 0 || hasCenter(x.b))
          .sort((a, b) => b.k - a.k || a.i - b.i)
          .map((x) => x.b);
      }
      const points: DetPoint[] = [];
      let done = 0;
      let firstErr: unknown = null;
      let waits = 0;
      let rate = false;
      const queue = [...ts];
      while (queue.length) {
        const batch = queue.splice(0, 2);
        const got = await Promise.allSettled(batch.map((b) => tile(b, start, end, signal)));
        const again: Bbox[] = [];
        let wait = 0;
        got.forEach((x, j) => {
          if (x.status === "fulfilled") {
            points.push(...x.value);
            done++;
            return;
          }
          const w = rateWaitMs(x.reason);
          if (w == null) firstErr ??= x.reason;
          else {
            wait = Math.max(wait, w);
            again.push(batch[j]!);
          }
        });
        if (!again.length) continue;
        rate = true;
        if (waits >= RATE_WAITS) {
          firstErr ??= (got.find((x) => x.status === "rejected") as PromiseRejectedResult | undefined)?.reason;
          break;
        }
        waits++;
        await sleep(wait, signal);
        queue.unshift(...again);
      }
      if (!done && ts.length) throw firstErr ?? new Error("hotspots");
      return { points, done, total: ts.length, rate };
    },
    enabled: !!mv && nowMs != null && !!bbox,
    staleTime: 10 * 60 * 1000,
    retry: false,
  };
};
