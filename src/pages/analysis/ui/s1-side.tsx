"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { boundaryQuery, type CountryInfo } from "@/entities/country";
import { SATS } from "@/entities/satellite-pass";
import type { AoiRec } from "../api/queries";
import { cx } from "./cx";

/**
 * S1 오른쪽 판의 두 부품 — 목업 pages/analysis.js previewSVG · EM.ui.eras 이식.
 *
 * 경계 미리보기: 목업은 경북 북부 시군 윤곽(+하천)만 그렸다(그 밖 시도·시군구·WORLD 는 비움). 여기서는 전 지역 원칙(사용자 지적 ②)에 따라
 * 지금 나라의 1급 경계(public/geo/c/<ISO3>.json, Natural Earth)를 그리고, 고른 지역(1급 · 그 아래 단위면 그 1급)을 면으로 강조한다.
 * 하천은 전국 선 자료가 없어(대조표 W0) 그리지 않는다. WORLD 는 목업처럼 비운다.
 *
 * 위성 연대 띠: 임무 시작 틱(VIIRS 는 굵게) + 이름. 이름이 겹치면 짧은 이름(T·A·S·N20·N21), 그래도 겹치면 이름만 뺀다(틱·title 은 남음).
 */

type Ring = [number, number][];
export interface Region {
  id: string;
  name_en: string;
  name_ko?: string;
  c: [number, number];
  area_km2?: number;
}
export interface Boundary {
  regions: Region[];
  geometry: { features: { id: string; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } }[] };
}

/** 한국 시도 짧은 이름(미리보기 이름표 — 값이 아니라 표지) */
const KO_SHORT: Record<string, string> = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산",
  세종특별자치시: "세종", 경기도: "경기", 강원도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전라남도: "전남",
  경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주",
};
const fold = (s: string | null | undefined) => (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
/** 이름 비교용 꼬리 떼기(강원특별자치도 ↔ 강원도 · 전북특별자치도 ↔ 전라북도 같은 개칭은 앞 두 글자로) */
const koKey = (s: string | null | undefined) => {
  const v = (s ?? "").replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
  const fix: Record<string, string> = { 전북: "전라북", 전남: "전라남", 경북: "경상북", 경남: "경상남", 충북: "충청북", 충남: "충청남", 강원: "강원", 제주: "제주" };
  return fix[v] ?? v;
};

export function thin(r: Ring): Ring {
  if (r.length <= 160) return r;
  const k = Math.ceil(r.length / 160);
  return r.filter((_, i) => i % k === 0).concat([r[0] as [number, number]]);
}

/**
 * 강조할 1급 고르기(미리보기 · 칸 지도 같은 규칙): 고른 지역이 1급이면 그것, 그 아래(시군구)면 부모. 이름으로 잇는다(release 이름 ↔ Natural Earth 이름).
 * ADM1_<나라>-<번호> 지역은 경계 파일 id(<나라>-<번호>)로 바로 잇는다.
 */
export function regionMatcher(iso3: string, aoi: string, rec: AoiRec | null, parent: AoiRec | null): (r: Region) => boolean {
  const byId = /^ADM1_([A-Z]{3}-.+)$/.exec(aoi)?.[1] ?? (parent ? /^ADM1_([A-Z]{3}-.+)$/.exec(parent.aoi_id)?.[1] : null);
  const pick = rec && (rec.level === "kr_sido" || rec.level === "adm1") ? rec : parent && (parent.level === "kr_sido" || parent.level === "adm1") ? parent : null;
  return (r: Region) => {
    if (byId && r.id === byId) return true;
    if (!pick) return false;
    /* 앞 두 글자만 견주면 경상북·경상남(충청·전라도)이 같아져 둘 다 강조됐다 — 꼬리 뗀 이름 전체로 */
    if (iso3 === "KOR") return !!pick.name_ko && koKey(r.name_ko) === koKey(pick.name_ko);
    const a = fold(pick.name_en ?? pick.name_ko);
    return !!a && (fold(r.name_en) === a || fold(r.name_ko) === a);
  };
}

export function BoundaryPreview({
  iso3,
  info,
  aoi,
  rec,
  parent,
  lang,
  title,
  label,
  open: open0,
}: {
  iso3: string;
  info: CountryInfo | undefined;
  aoi: string;
  rec: AoiRec | null;
  parent: AoiRec | null;
  lang: string;
  title: string;
  label: string;
  open: boolean;
}) {
  const bq = useQuery({ ...boundaryQuery(iso3), enabled: aoi !== "WORLD" && !!iso3 });
  const b = (bq.data ?? null) as Boundary | null;

  const svg = useMemo(() => {
    if (!b || !b.regions?.length) return null;
    const geo = new Map(b.geometry.features.map((f) => [f.id, f.geometry] as const));
    const c0 = info ? info.c[0] : 0;
    const wrapX = (x: number) => {
      let v = x;
      while (v - c0 > 180) v -= 360;
      while (c0 - v > 180) v += 360;
      return v;
    };
    const regs = b.regions.map((r) => {
      const g = geo.get(r.id);
      const polys = !g ? [] : g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
      return { r, rings: polys.map((p) => thin((p[0] ?? []).map(([x, y]) => [wrapX(x as number), y as number] as [number, number]))) };
    });
    let w = 999;
    let e = -999;
    let s = 999;
    let n = -999;
    regs.forEach((g) =>
      g.rings.forEach((ring) =>
        ring.forEach(([x, y]) => {
          w = Math.min(w, x);
          e = Math.max(e, x);
          s = Math.min(s, y);
          n = Math.max(n, y);
        }),
      ),
    );
    if (!(e > w)) return null;
    const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const pad = 14;
    const VW = 400;
    const sc = (VW - pad * 2) / ((e - w) * k);
    const VH = Math.round((n - s) * sc + pad * 2);
    const X = (x: number) => (pad + (wrapX(x) - w) * k * sc).toFixed(1);
    const Y = (y: number) => (pad + (n - y) * sc).toFixed(1);
    const path = (rings: Ring[]) => rings.map((r) => `M${r.map(([x, y]) => `${X(x)} ${Y(y)}`).join("L")}Z`).join("");

    /* 강조할 1급(regionMatcher — 칸 지도와 같은 규칙) */
    const on = regionMatcher(iso3, aoi, rec, parent);
    const many = regs.length > 24;
    /* 이름표 겹침 줄이기: 나라 면적의 1.5% 보다 작은 1급(서울·인천 같은 도시)은 강조할 때만 이름 */
    const small = regs.reduce((a, g) => a + (g.r.area_km2 ?? 0), 0) * 0.015;
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={label}>
        {regs.map(({ r, rings }) => (
          <path key={r.id} className={cx("an-rg", on(r) && "on")} d={path(rings)} data-rg={r.id} data-on={on(r) ? "1" : undefined}>
            <title>{lang === "ko" ? (r.name_ko ?? r.name_en) : r.name_en}</title>
          </path>
        ))}
        {regs.map(({ r }) =>
          !on(r) && (many || (r.area_km2 ?? 1e9) < small) ? null : (
            <text key={r.id} className={cx("an-rl", on(r) && "on")} x={X(r.c[0])} y={Y(r.c[1])} textAnchor="middle">
              {lang === "ko" ? (KO_SHORT[r.name_ko ?? ""] ?? r.name_ko ?? r.name_en) : r.name_en}
            </text>
          ),
        )}
      </svg>
    );
  }, [b, info, aoi, rec, parent, iso3, lang, label]);

  if (aoi === "WORLD") return null;
  return (
    <details className={cx("panel an-prev")} open={open0} data-prev="">
      <summary className={cx("panel-h")}>
        <h3>{title}</h3>
        <ChevronDown className={cx("ic ic-inline an-prevx")} aria-hidden="true" />
      </summary>
      <div className={cx("an-map")} data-map="">
        {svg}
      </div>
    </details>
  );
}

/** 위성 연대 띠 — from·to 는 소수 연도(2000.83 = 2000-11) */
export function Eras({ from, to, label, tip }: { from: number; to: number; label: string; tip: (sat: string, ym: string) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const yf = (d: string) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12;
  const span = to - from;
  const pre = SATS.filter((s) => yf(s.start) < from);
  const pq = pre[pre.length - 1];
  const inAxis = SATS.filter((s) => yf(s.start) >= from && yf(s.start) <= to);
  /* 이름 자리: 왼쪽부터 놓고, 앞 이름과 겹치면 짧은 이름 → 그래도 겹치면 뺀다(글자 폭은 fs-1 고정폭 글꼴 근사 6.2px) */
  const CH = 6.2;
  const GAP = 8;
  const items = [...(pq ? [{ s: pq, x: 0, pin: true }] : []), ...inAxis.map((s) => ({ s, x: ((yf(s.start) - from) / span) * W, pin: false }))];
  const placed: { key: string; l: number; txt: string; title: string; short: boolean }[] = [];
  let prevR = -1e9;
  items.forEach((it, i) => {
    const nextX = items[i + 1]?.x ?? Infinity;
    const full = it.pin && yf(it.s.start) < from ? `${it.s.sat} ←${it.s.start.slice(0, 4)}` : it.s.sat;
    const vars = it.s.short !== it.s.sat ? [full, it.s.short] : [full];
    for (const v of vars) {
      const tw = v.length * CH;
      const l = Math.min(Math.max(0, it.x - (it.pin ? 0 : 2)), Math.max(0, W - tw));
      // 앞 이름과 안 겹치고, 다음 틱 자리를 덮지 않을 때(마지막 후보는 다음 틱 조건 없이)
      if (l >= prevR + GAP && (l + tw + GAP <= nextX || v === vars[vars.length - 1])) {
        placed.push({ key: it.s.sat, l, txt: v, title: tip(`${it.s.sat} ${it.s.sensor}`, it.s.start.slice(0, 7)), short: v !== vars[0] });
        prevR = l + tw;
        break;
      }
    }
  });
  return (
    <div ref={ref} className={cx("an-eras eras")} role="img" aria-label={`${label} · ${SATS.map((s) => `${s.sat} ${s.start.slice(0, 4)}`).join(" · ")}`} data-eras="">
      <span className={cx("er-ln")} />
      {pq ? <span className={cx("er-t", pq.sensor === "VIIRS" && "v")} style={{ left: "0%" }} title={pre.map((s) => tip(`${s.sat} ${s.sensor}`, s.start.slice(0, 7))).join(" · ")} /> : null}
      {inAxis.map((s) => (
        <span key={s.sat} className={cx("er-t", s.sensor === "VIIRS" && "v")} style={{ left: `${(((yf(s.start) - from) / span) * 100).toFixed(2)}%` }} title={tip(`${s.sat} ${s.sensor}`, s.start.slice(0, 7))} />
      ))}
      {W
        ? placed.map((p) => (
            <span key={p.key} className={cx("er-l", p.short && "short")} style={{ left: `${p.l.toFixed(1)}px` }} title={p.title}>
              {p.txt}
            </span>
          ))
        : null}
    </div>
  );
}
