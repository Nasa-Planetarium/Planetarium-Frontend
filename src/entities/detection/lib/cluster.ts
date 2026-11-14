/**
 * 지난 24시간 감지 묶음(목업 core.js EM.detections) — 한국 밖 경보·출동·피해 면적 화면(GLOBAL §6.2)의 개수 띠·「미확인 감지」 표.
 * 점은 실제 GET /hotspots(나라 AOI)에서 오고, 여기서는 묶기만 한다: 1급 행정구역 × 0.3° 칸.
 * 등급: 15점 이상 또는 최대 FRP 100 MW 이상 = 3, 5점 이상 또는 40 MW 이상 = 2, 나머지 1(목업 그대로).
 */
export interface DetPoint {
  latitude: number;
  longitude: number;
  acq_datetime_utc: string;
  instrument: string;
  frp: number | null;
  confidence: string;
  adm1?: string | null;
  adm1_code?: string | null;
  country?: string | null;
  adm0_a3?: string | null;
}

export interface DetCluster {
  id: string;
  region: string;
  lat: number;
  lon: number;
  n: number;
  viirs: number;
  modis: number;
  high: number;
  frp_max: number;
  last_ms: number;
  area_km2: number;
  level: 1 | 2 | 3;
}

export interface Detections {
  clusters: DetCluster[];
  points: DetPoint[];
  n: number;
  high: number;
  regions: number;
  viirs: number;
  modis: number;
}

/** 화소 면적(km²) — VIIRS 375 m · MODIS 1 km(목업 EM.hotspotRow pixel_area_km2) */
export const pixelAreaKm2 = (instrument: string) => (instrument === "VIIRS" ? 0.375 * 0.375 : 1);

export function detections(pts: readonly DetPoint[], nowMs: number): Detections {
  const from = nowMs - 86400e3;
  const cells: Record<string, { region: string; n: number; viirs: number; modis: number; high: number; frp_max: number; la: number; lo: number; last: number; area: number }> = {};
  const win: DetPoint[] = [];
  pts.forEach((h) => {
    const ms = Date.parse(h.acq_datetime_utc);
    if (!(ms > from && ms <= nowMs)) return;
    win.push(h);
    const region = h.adm1_code ?? h.adm1 ?? h.adm0_a3 ?? h.country ?? "–";
    const k = `${region}|${Math.floor(h.latitude / 0.3)}|${Math.floor(h.longitude / 0.3)}`;
    const c = (cells[k] ??= { region, n: 0, viirs: 0, modis: 0, high: 0, frp_max: 0, la: 0, lo: 0, last: 0, area: 0 });
    c.n++;
    if (h.instrument === "VIIRS") c.viirs++;
    else c.modis++;
    if (h.confidence === "h") c.high++;
    c.frp_max = Math.max(c.frp_max, h.frp ?? 0);
    c.la += h.latitude;
    c.lo += h.longitude;
    c.last = Math.max(c.last, ms);
    c.area += pixelAreaKm2(h.instrument);
  });
  const clusters: DetCluster[] = Object.entries(cells)
    .map(([k, c]) => {
      const level: 1 | 2 | 3 = c.n >= 15 || c.frp_max >= 100 ? 3 : c.n >= 5 || c.frp_max >= 40 ? 2 : 1;
      return {
        id: `D-${k.replace(/\|/g, "-")}`,
        region: c.region,
        lat: c.la / c.n,
        lon: c.lo / c.n,
        n: c.n,
        viirs: c.viirs,
        modis: c.modis,
        high: c.high,
        frp_max: Math.round(c.frp_max * 10) / 10,
        last_ms: c.last,
        area_km2: Math.round(c.area * 100) / 100,
        level,
      };
    })
    .sort((a, b) => b.level - a.level || b.n - a.n || b.last_ms - a.last_ms);
  return {
    clusters,
    points: win,
    n: clusters.reduce((s, c) => s + c.n, 0),
    high: clusters.reduce((s, c) => s + c.high, 0),
    regions: new Set(clusters.map((c) => c.region)).size,
    viirs: clusters.reduce((s, c) => s + c.viirs, 0),
    modis: clusters.reduce((s, c) => s + c.modis, 0),
  };
}

/** 「36.6°N 128.7°E」(목업 EM.llShort) */
export const llShort = (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? "W" : "E"}`;
