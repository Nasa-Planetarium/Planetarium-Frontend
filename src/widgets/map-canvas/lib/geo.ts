import type { Bbox, DrawnAoi, Geom, LatLon, MapFire, MapHotspot, PolygonGeom } from "../model/types";

/**
 * 공통 지도의 순수 계산(목업 map3d.js 에서 그대로 옮긴 셈 — 화면·DOM 없이 시험한다).
 * 목업은 경북 북부 위도(36.6°) 하나로 경도 축소(KX)를 고정했지만, 전 지역을 그리므로 그 자리의 위도로 센다.
 */
export const kx = (lat: number) => Math.max(0.05, Math.cos((lat * Math.PI) / 180));
const ll = (p: LatLon): [number, number] => [p[1], p[0]];

/** 감지 화소 사각형: VIIRS 375 m · MODIS 1 km(목업 square) */
export function pixelSquare(h: Pick<MapHotspot, "lat" | "lon" | "sensor">): [number, number][][] {
  const km = h.sensor === "VIIRS" ? 0.375 : 1;
  const dy = km / 2 / 111;
  const dx = dy / kx(h.lat);
  return [[[h.lon - dx, h.lat - dy], [h.lon + dx, h.lat - dy], [h.lon + dx, h.lat + dy], [h.lon - dx, h.lat + dy], [h.lon - dx, h.lat - dy]]];
}

/** 반경 원(목업 _sync aoi point) — 64 마디 고리 */
export function circleRing(lat: number, lon: number, km: number, n = 64): [number, number][] {
  const r = km / 111;
  const k = kx(lat);
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    ring.push([lon + (Math.cos(t) * r) / k, lat + Math.sin(t) * r]);
  }
  return ring;
}

/** 그린 영역 → GeoJSON Polygon(경도·위도). 결과를 화면(W3 집계·CSV)이 그대로 쓴다 */
export function aoiGeometry(a: DrawnAoi): PolygonGeom {
  const handlers: { [K in DrawnAoi["type"]]: (x: Extract<DrawnAoi, { type: K }>) => [number, number][] } = {
    bbox: (x) => [[x.west, x.north], [x.east, x.north], [x.east, x.south], [x.west, x.south], [x.west, x.north]],
    polygon: (x) => (x.pts.length ? [...x.pts.map(ll), ll(x.pts[0]!)] : []),
    point: (x) => circleRing(x.lat, x.lon, x.radius_km || 5),
  };
  const ring = (handlers[a.type] as (x: DrawnAoi) => [number, number][])(a);
  return { type: "Polygon", coordinates: [ring] };
}

/** 그린 영역의 범위(서, 남, 동, 북) — /hotspots?bbox 와 시야 맞춤에 쓴다 */
export function aoiBounds(a: DrawnAoi): Bbox {
  const ring = aoiGeometry(a).coordinates[0] ?? [];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  ring.forEach(([x, y]) => {
    w = Math.min(w, x!);
    e = Math.max(e, x!);
    s = Math.min(s, y!);
    n = Math.max(n, y!);
  });
  return [w, s, e, n];
}

/** 점이 그린 영역 안인가(목업 home.js inGeom — 사각형·다각형 짝수-홀수 규칙·반경은 거리) */
export function inAoi(a: DrawnAoi, lat: number, lon: number): boolean {
  if (a.type === "bbox") return lat >= a.south && lat <= a.north && lon >= a.west && lon <= a.east;
  if (a.type === "point") {
    const dy = (lat - a.lat) * 111;
    const dx = (lon - a.lon) * 111 * kx(a.lat);
    return Math.hypot(dx, dy) <= a.radius_km;
  }
  const P = a.pts;
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [yi, xi] = P[i]!;
    const [yj, xj] = P[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 그린 영역 → 집계 지역(목업 approxRegions): 이름표 자리가 안에 든 지역, 없으면 영역 가운데에 가장 가까운 지역 하나(근사) */
export function approxRegions(a: DrawnAoi, regions: readonly { id: string; lat: number; lon: number }[]): { ids: string[]; fallback: boolean } {
  const inside = regions.filter((r) => inAoi(a, r.lat, r.lon)).map((r) => r.id);
  if (inside.length) return { ids: inside, fallback: false };
  const b = aoiBounds(a);
  const cy = (b[1] + b[3]) / 2;
  const cxx = (b[0] + b[2]) / 2;
  let best: string | null = null;
  let bd = Infinity;
  regions.forEach((r) => {
    const d = ((r.lon - cxx) * kx(cy)) ** 2 + (r.lat - cy) ** 2;
    if (d < bd) {
      bd = d;
      best = r.id;
    }
  });
  return { ids: best ? [best] : [], fallback: true };
}

/** 출동 경로: 불까지 휘는 2차 베지어(목업 curve) — a·b = [경도, 위도] */
export function curve(a: [number, number], b: [number, number], n = 40): [number, number][] {
  const k = kx((a[1] + b[1]) / 2);
  const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.18 * k;
  const my = (a[1] + b[1]) / 2 + ((b[0] - a[0]) * 0.18) / k;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * mx + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * my + u * u * b[1]]);
  }
  return pts;
}

/** 점 가중치(열 지도·점 크기): FRP 제곱근 + 낮은 신뢰도 감쇠(목업 _sync hot) */
export const hotWeight = (h: Pick<MapHotspot, "frp" | "conf">) => Math.min(1, (0.16 + Math.sqrt(Math.max(0, h.frp ?? 0)) * 0.05) * (h.conf === "low" || h.conf === "l" ? 0.55 : 1));

/** 열 지도 세기 배율(목업 _heatGain): 가장 붐비는 1.2 km 칸 3x3 가중 합이 램프 끝을 넘지 않게. 점이 드물면 올린다 */
export function heatGain(hot: MapHotspot[]): number {
  if (!hot.length) return 1;
  const cell = 1.2 / 111;
  const g = new Map<string, number>();
  hot.forEach((h) => {
    const key = Math.floor(h.lat / cell) + ":" + Math.floor((h.lon * kx(h.lat)) / cell);
    g.set(key, (g.get(key) ?? 0) + hotWeight(h));
  });
  let M = 0;
  g.forEach((_, key) => {
    const [i, j] = key.split(":").map(Number) as [number, number];
    let sum = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) sum += g.get(i + a + ":" + (j + b)) ?? 0;
    if (sum > M) M = sum;
  });
  return Math.max(0.03, Math.min(3, 3 / Math.max(1e-6, M)));
}

/** 축척 막대: 110px 안에 드는 가장 긴 깔끔한 길이(목업 _scale — 0.5 km … 2000 km) */
export function niceScale(kmPerPx: number, maxPx = 110): { km: number; px: number; text: string } {
  const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  let km = nice[0]!;
  for (const n of nice) if (n / kmPerPx <= maxPx) km = n;
  return { km, px: Math.round(km / kmPerPx), text: km < 1 ? `${Math.round(km * 1000)} m` : `${km} km` };
}

/** 경위도 눈금 간격: 보이는 범위(도)에 맞춰 큰 눈금 4–8개(목업은 경북 고정 0.5°/0.1°) */
export function tickStep(spanDeg: number, phone = false): { step: number; minor: number } {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 45, 90];
  const want = phone ? 3 : 5;
  const step = steps.find((s) => spanDeg / s <= want) ?? 90;
  const minorOf: Record<string, number> = { "0.1": 0.05, "0.2": 0.05, "0.5": 0.1, "1": 0.5, "2": 0.5, "5": 1, "10": 2, "20": 5, "30": 10, "45": 15, "90": 30 };
  return { step, minor: minorOf[String(step)] ?? step / 2 };
}

/** 눈금 글자: 128.5°E · 36.0°N · 서경·남위는 W·S */
export function tickLabel(v: number, axis: "lon" | "lat", step: number): string {
  const d = step < 1 ? 1 : 0;
  const a = Math.abs(v);
  const hemi = axis === "lon" ? (v < 0 ? "W" : "E") : v < 0 ? "S" : "N";
  return `${a.toFixed(d)}°${hemi}`;
}

/** 좌표·반경 창 검사(목업 home ptBox.onsubmit) — 오류면 사전 키와 값을 돌려준다 */
export function checkPoint(lat: number, lon: number, rad: number, b: Bbox): { key: string; p?: Record<string, number> } | null {
  const r = (v: number) => Math.round(v * 100) / 100;
  if (!Number.isFinite(lat) || lat < b[1] || lat > b[3]) return { key: "home.pt.err_lat", p: { a: r(b[1]), b: r(b[3]) } };
  if (!Number.isFinite(lon) || lon < b[0] || lon > b[2]) return { key: "home.pt.err_lon", p: { a: r(b[0]), b: r(b[2]) } };
  if (!Number.isFinite(rad) || rad < 0.5 || rad > 60) return { key: "home.pt.err_rad" };
  return null;
}

/** 바깥 가림: 넓은 사각형에서 초점 지역(면)을 구멍으로 뺀다(목업 maskFeature). 고리 방향은 MapLibre 가 가리지 않는다 */
export function maskPolygon(focus: Geom, pad = 25): PolygonGeom | null {
  const polys: number[][][][] = focus.type === "Polygon" ? [focus.coordinates as number[][][]] : focus.type === "MultiPolygon" ? (focus.coordinates as number[][][][]) : [];
  if (!polys.length) return null;
  let w = 180, s = 90, e = -180, n = -90;
  polys.forEach((p) =>
    p[0]?.forEach(([x, y]) => {
      w = Math.min(w, x!);
      e = Math.max(e, x!);
      s = Math.min(s, y!);
      n = Math.max(n, y!);
    }),
  );
  const W = Math.max(-180, w - pad), E = Math.min(180, e + pad), S = Math.max(-85, s - pad), N = Math.min(85, n + pad);
  const holes = polys.map((p) => (p[0] ?? []).slice().reverse() as [number, number][]);
  return { type: "Polygon", coordinates: [[[W, S], [E, S], [E, N], [W, N], [W, S]], ...holes] };
}

/** 면의 주 범위(서, 남, 동, 북): 가장 큰 면의 5% 보다 작은 조각(먼 섬 등)은 뺀다 — 전체 보기 시야용(나라 bbox_main 과 같은 생각) */
export function geomMainBounds(g: Geom | null): Bbox | null {
  if (!g) return null;
  const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const area = (r: number[][]) => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0]! + r[i]![0]!) * (r[j]![1]! - r[i]![1]!);
    return Math.abs(a) / 2;
  };
  const sized = polys.map((p) => ({ p, a: area(p[0] ?? []) }));
  const big = Math.max(0, ...sized.map((x) => x.a));
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  sized
    .filter((x) => x.a >= big * 0.05)
    .forEach((x) =>
      (x.p[0] ?? []).forEach(([lo, la]) => {
        w = Math.min(w, lo!);
        e = Math.max(e, lo!);
        s = Math.min(s, la!);
        n = Math.max(n, la!);
      }),
    );
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/** 면의 대표점(이름표 자리): 가장 넓은 고리의 범위 가운데 — 고리가 없으면 null */
export function labelPoint(g: Geom | null): LatLon | null {
  if (!g) return null;
  const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates as number[][][]] : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];
  let best: number[][] | null = null;
  let ba = -1;
  polys.forEach((p) => {
    const r = p[0] ?? [];
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0]! + r[i]![0]!) * (r[j]![1]! - r[i]![1]!);
    a = Math.abs(a);
    if (a > ba) {
      ba = a;
      best = r;
    }
  });
  if (!best) return null;
  const r: number[][] = best;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  r.forEach(([x, y]) => {
    w = Math.min(w, x!);
    e = Math.max(e, x!);
    s = Math.min(s, y!);
    n = Math.max(n, y!);
  });
  return [(s + n) / 2, (w + e) / 2];
}

/* ── 불 표지 문법(목업 EM.fireMarkOf) ── */
const CLOSED = ["contained", "out", "resolved"];
const WORKING = ["onscene"];
export type FireState = "live" | "half" | "closed" | "hist";
export function fireMarkOf(f: Pick<MapFire, "historical" | "status" | "frp_max" | "level" | "burned_ha">) {
  const state: FireState = f.historical ? "hist" : CLOSED.includes(f.status) ? "closed" : WORKING.includes(f.status) ? "half" : "live";
  const v = f.frp_max;
  const size = v == null || v >= 80 ? "l" : v >= 20 ? "m" : "s";
  return { level: Math.max(1, Math.min(4, f.level || 1)), state, size, major: (f.burned_ha ?? 0) >= 100 };
}
export const isClosedFire = (status: string) => CLOSED.includes(status);

/* ── 이름표 비키기(목업 _labelDodge) ── */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
export interface LabelItem {
  id: string;
  w: number;
  h: number;
  pts: { x: number; y: number }[]; // 지역 = 점 하나, 강 = 선 위 세 점(0.55 · 0.35 · 0.75)
  river?: boolean;
}
export interface LabelPlace {
  id: string;
  at: [number, number, number] | null; // [점 번호, dx, dy] · null = 숨김
}
/**
 * 지역·강 이름표가 장애물(표지·떠 있는 UI·앞서 놓은 이름표)에 겹치면 위 → 아래 → 왼쪽 → 오른쪽 자리를 차례로 보고,
 * 어디에도 못 놓으면 숨긴다. 두 번에 나눠 놓는다(먼저 제자리가 빈 것, 그다음 나머지) — 이름이 서로 자리를 뒤바꾸지 않게.
 * 지역을 다 놓은 뒤 강을 놓는다. gapX·gapY = 이름표끼리 띄울 몫(한 낱말로 읽히지 않게)
 */
export function placeLabels(items: LabelItem[], obstacles: Box[], W: number, H: number, gapX = 6, gapY = 0): LabelPlace[] {
  const P = 2, E = 4;
  const obs = obstacles.slice();
  const hit = (a: Box) => obs.some((o) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t);
  const outside = (a: Box) => a.l < E || a.t < E || a.r > W - E || a.b > H - E;
  const bad = (a: Box) => hit(a) || outside(a);
  const out: LabelPlace[] = [];
  const bx = (it: LabelItem, [i, dx, dy]: [number, number, number]): Box => {
    const p = it.pts[i]!;
    return { l: p.x + dx - it.w / 2 - P, t: p.y + dy - it.h / 2 - P, r: p.x + dx + it.w / 2 + P, b: p.y + dy + it.h / 2 + P };
  };
  const cands = (it: LabelItem): [number, number, number][] => {
    const off: [number, number][] = [[0, -(it.h + 8)], [0, it.h + 8], [-(it.w / 2 + 16), 0], [it.w / 2 + 16, 0]];
    const c: [number, number, number][] = [];
    for (let i = 1; i < it.pts.length; i++) c.push([i, 0, 0]);
    it.pts.forEach((_, i) => off.forEach(([dx, dy]) => c.push([i, dx, dy])));
    return c;
  };
  const put = (it: LabelItem, at: [number, number, number] | null) => {
    if (at) {
      const b = bx(it, at);
      obs.push({ l: b.l - gapX, t: b.t - gapY, r: b.r + gapX, b: b.b + gapY });
    }
    out.push({ id: it.id, at });
  };
  const place = (list: LabelItem[]) => {
    const rest = list.filter((it) => {
      if (!it.pts.length || bad(bx(it, [0, 0, 0]))) return true;
      put(it, [0, 0, 0]);
      return false;
    });
    rest.forEach((it) => put(it, it.pts.length ? (cands(it).find((c) => !bad(bx(it, c))) ?? null) : null));
  };
  place(items.filter((x) => !x.river));
  place(items.filter((x) => x.river));
  return out;
}

/* ── 자원 묶음(목업 _ucPass) ── */
export interface ClusterIn {
  id: string;
  x: number;
  y: number;
  status: string;
  free?: boolean; // 묶지 않음(이동 중·고른 자원)
  prev?: string | null; // 직전 묶음 대표(경계에서 깜빡이지 않게 hit + 4)
}
export interface ClusterOut {
  rep: string;
  ids: string[];
}
const RANK: Record<string, number> = { onscene: 3, return: 2, standby: 1 };
/** 한 줄 잇기: 화면 중심 거리 < hit 이면 같은 무리. 대표 = 상태가 가장 급한 것(현장 → 귀소 → 대기), 같으면 id 순 */
export function clusterUnits(list: ClusterIn[], hit = 44): ClusterOut[] {
  const c = list.filter((q) => !q.free).map((q) => ({ ...q, g: -1 }));
  let g = 0;
  c.forEach((q) => {
    if (q.g >= 0) return;
    q.g = g;
    const st = [q];
    while (st.length) {
      const a = st.pop()!;
      c.forEach((b) => {
        if (b.g >= 0) return;
        const lim = a.prev != null && a.prev === b.prev ? hit + 4 : hit;
        if (Math.hypot(a.x - b.x, a.y - b.y) < lim) {
          b.g = g;
          st.push(b);
        }
      });
    }
    g++;
  });
  const out: ClusterOut[] = [];
  for (let i = 0; i < g; i++) {
    const gr = c.filter((q) => q.g === i);
    if (gr.length < 2) continue;
    const rep = gr.slice().sort((a, b) => (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0) || (a.id < b.id ? -1 : 1))[0]!;
    out.push({ rep: rep.id, ids: gr.map((q) => q.id).sort() });
  }
  return out;
}

/** 색 토큰(#rrggbb·rgb()) + 투명도 → rgba() (목업 EM.tokA) */
export function withAlpha(c: string, a: number): string {
  const s = c.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.split("").map((x) => x + x).join("") : hex[1]!;
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const p = rgb[1]!.split(",").map((x) => x.trim());
    return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
  }
  return s;
}
