"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Info, Search, Truck, X } from "lucide-react";
import { focusBoundaryQuery, geomMainBounds, linesQuery, MapCanvas, type Bbox, type LayerKey, type MapCanvasHandle, type MapHotspot } from "@/widgets/map-canvas";
import { iso3OfAoi } from "@/features/pick-aoi";
import type { Alert, Fire } from "@/shared/agency";
import { ApiError } from "@/shared/api";
import { pageHref, type Locale } from "@/shared/config";
import { useRouter } from "next/navigation";
import { useDevice } from "@/shared/lib/use-device";
import { hotspotsQuery } from "../api/queries";
import { ACTIVE } from "../model/home";
import { cx } from "./cx";
import type { Ctx } from "./home-page";
import { HomePass } from "./home-pass";
import { Feed } from "./home-side";

/** 점 요청 한도 — 실서버는 100 제곱도 넘는 범위를 400(range_too_large)으로 거절한다 */
const MAX_AREA = 100;
const r2 = (v: number) => Math.round(v * 20) / 20;

/**
 * 상황판 지도 — 공통 지도(widgets/map-canvas, 목업 map3d EMMap3D 이식) 위에 상황판 몫만 얹는다.
 *  - 바탕: 지형 음영·바깥 가림·하천·도로·경계(고른 범위 아래 단)·이름표 비키기·경위도 눈금 = 공통 지도
 *  - 감지 점 = 실제 API /hotspots(지도 기간 · 보이는 범위, 100 제곱도 넘으면 확대 안내) — 확대하면 화소 사각형, 누르면 툴팁
 *  - 불·자원·출동 경로 = 기관 연동 포트 목(한국 시나리오만) — 겹친 자원은 묶음
 *  - 사각형·다각형·좌표+반경 그리기 → 관심 영역(home-page 가 집계 지역으로 바꿔 캘린더·지표·CSV 에 반영) + 배지(해제 ×)
 *  - 검색 = 지금 나라의 모든 지역(실제 /aois 이름) — 고르면 지역 범위가 바뀐다
 */
export function HomeMap(c: Ctx) {
  const phone = useDevice() === "phone";
  const [stop, setStop] = useState<"peek" | "half" | "full">("peek");
  const STOPS = ["peek", "half", "full"] as const;
  const [q, setQ] = useState("");
  const S = c.scope;
  const isCountry = S.chosen === S.own;
  const focus = useQuery(focusBoundaryQuery(isCountry ? null : S.chosen, c.mv)).data ?? null;
  const info = c.info as { bbox?: Bbox; bbox_main?: Bbox } | undefined;
  /* 전체 보기 = 고른 지역 상자(실서버 /aois bbox) → 경계 윤곽 범위 → 나라 본토 범위 */
  const view: Bbox | null = useMemo(() => {
    if (!isCountry && c.aoiBbox) return c.aoiBbox;
    if (!isCountry && focus) return geomMainBounds(focus);
    return info?.bbox_main ?? info?.bbox ?? c.aoiBbox ?? null;
  }, [isCountry, c.aoiBbox, focus, info]);

  /* 감지 점 — 보이는 범위(onView)로 받는다 */
  const [vb, setVb] = useState<Bbox | null>(null);
  const area = vb ? Math.abs((vb[2] - vb[0]) * (vb[3] - vb[1])) : Infinity;
  const hb: Bbox | null = vb && area <= MAX_AREA ? (vb.map(r2) as Bbox) : null;
  const hotQ = useQuery({ ...hotspotsQuery(hb ?? [0, 0, 0, 0], c.range?.start ?? "", c.range?.end ?? "", c.range ? c.mv : null), enabled: !!hb && !!c.range && !!c.mv });
  const raw = useMemo(
    () => ((hotQ.data as unknown as { hotspots?: { latitude: number; longitude: number; instrument?: string; frp?: number; confidence?: string; acq_datetime_utc?: string }[] } | undefined)?.hotspots ?? []),
    [hotQ.data],
  );
  const hot: MapHotspot[] = useMemo(
    () => raw.map((h) => ({ lat: h.latitude, lon: h.longitude, sensor: h.instrument ?? "VIIRS", frp: h.frp ?? null, conf: h.confidence ?? null, time: h.acq_datetime_utc?.replace("T", " ").replace(/:\d\dZ$/, " UTC") ?? null })),
    [raw],
  );
  const nV = hot.filter((h) => h.sensor !== "MODIS").length;
  const nM = hot.length - nV;
  const hotErr = hotQ.error instanceof ApiError ? hotQ.error : null;

  /* 원시 점 수를 화면(확인 줄)에 넘긴다 */
  const { setHot, setDetBox } = c;
  useEffect(() => setHot(hb && hotQ.data ? { v: nV, m: nM } : null), [setHot, hb, hotQ.data, nV, nM]);
  const hbKey = hb ? hb.join(",") : "";
  useEffect(() => setDetBox(hbKey ? (hbKey.split(",").map(Number) as unknown as Bbox) : null), [setDetBox, hbKey]);

  /* 불·자원·경로(시나리오 목 — 한국만) */
  const live = useMemo(() => c.fires.filter((f) => !f.historical), [c.fires]);
  const annot = useMemo(() => live.filter((f) => ACTIVE.includes(f.status)).sort((x, y) => y.level - x.level || String(y.detected_at).localeCompare(String(x.detected_at)))[0]?.id ?? null, [live]);
  /* 지도 불(목업 firesNow): 기간 안 사건 기록(과거 산불 포함) + 지금 진행 중인 불. 진행 중인데 기간 밖이면 이름에 「지금 진행 중(기간 밖)」(L10) */
  const rs = c.range?.start ?? "";
  const re = c.range?.end ?? "";
  const inRange = useCallback((f: Fire) => !!rs && ((f.contained_at as string | undefined) ?? f.detected_at).slice(0, 10) >= rs && f.detected_at.slice(0, 10) <= re, [rs, re]);
  const outside = useMemo(() => live.filter((f) => ACTIVE.includes(f.status) && !inRange(f)), [live, inRange]);
  const outTag = c.t("home.in_range.active_now_outside_period");
  const fires = useMemo(
    () =>
      c.fires
        .filter((f) => (!f.historical && ACTIVE.includes(f.status)) || inRange(f))
        .map((f) => {
          const nm = c.tl("fire", f.id, "name", f.name);
          const out = !f.historical && ACTIVE.includes(f.status) && !inRange(f);
          return { id: f.id, lat: f.lat, lon: f.lon, level: f.level || 1, status: f.status, name: out ? `${nm.split(" ").slice(-1)[0]} ${outTag}` : nm, frp_max: f.frp_max, historical: !!f.historical, burned_ha: (f.burned_ha as number | null | undefined) ?? null };
        }),
    [c, inRange, outTag],
  );
  const units = useMemo(() => c.units.map((u) => ({ id: u.id, lat: u.lat, lon: u.lon, status: u.status, type: u.type, name: c.tl("unit", u.id, "name", u.name), sub: c.t(`shell.unit_status.${u.status}`) })), [c]);
  /* 자원 표지 누르기(목업 onUnit): 「이름 · 상태」 + 「소속 · 종류 · n명」 확인 줄 */
  const onUnit = (id: string) => {
    const u = c.units.find((x) => x.id === id);
    if (!u) return;
    c.note(`${c.tl("unit", u.id, "name", u.name)} · ${c.t(`shell.unit_status.${u.status}`)}`, `${c.tl("unit", u.id, "org", u.org)} · ${c.t(`shell.unit_type.${u.type}`)}${u.crew != null ? ` · ${c.t("home.unit.crew", { n: u.crew })}` : ""}`, "info");
  };
  const routes = useMemo(
    () =>
      c.units
        .filter((u) => u.status === "enroute" && typeof u.fire_id === "string")
        .flatMap((u) => {
          const f = c.fires.find((x) => x.id === u.fire_id);
          return f ? [{ unit: u.id, from: { lat: u.lat, lon: u.lon }, to: { lat: f.lat, lon: f.lon }, progress: typeof u.progress === "number" ? u.progress : 0.5 }] : [];
        }),
    [c.units, c.fires],
  );

  const menu: { k: LayerKey; label: string }[] = [
    { k: "hotspots", label: c.t("home.over.hotspots") },
    { k: "fires", label: c.t("home.over.fires") },
    { k: "units", label: c.t("home.over.response_units") },
    { k: "boundaries", label: c.t("home.over.boundaries") },
    { k: "rivers", label: c.t("home.set_layer_k.river") },
    { k: "relief", label: c.t("maplab.relief") },
  ];

  /* 검색(목업 PLACES) — 지금 나라의 모든 지역(실제 /aois 이름) + 한국 시나리오 원장(불·과거 산불·면리 지명·하천·자원).
     순위: 지역 0 · 불 1 · 지명 2 · 하천 3 · 자원 4. 공백 무시·대소문자 무시 · 「시/군」 떼고도 맞춤 · ↑↓ Enter */
  const lines = useQuery(linesQuery(c.kor ? "KOR" : "")).data as { features?: { properties?: { kind?: string; name?: string }; geometry?: { type: string; coordinates: number[][] | number[][][] } }[] } | null | undefined;
  type Place = { key: string; name: string; kind: string; rank: number; aoi?: string; lat?: number; lon?: number; z?: number; fire?: string | null };
  const places: Place[] = useMemo(() => {
    const out: Place[] = S.aois
      .filter((a) => !a.hidden && a.aoi_id !== "WORLD" && iso3OfAoi(a.aoi_id) === c.iso3)
      .map((a) => ({ key: a.aoi_id, name: S.nameOf(a), kind: a.parent_id && a.parent_id !== S.own ? S.nameOf(a.parent_id) : c.cname, rank: 0, aoi: a.aoi_id }));
    if (!c.kor) return out;
    c.fires.forEach((f) => {
      out.push({ key: `f:${f.id}`, name: c.tl("fire", f.id, "name", f.name), kind: f.historical ? c.t("home.set_layer_k.past_fire") : c.t("home.over.fires"), rank: 1, lat: f.lat, lon: f.lon, z: f.historical ? 8.6 : 10.2, fire: f.historical ? null : f.id });
      /* 면·리 지명은 원장 원문(한국어)에서만 */
      if (c.lang === "ko")
        f.name
          .split(" ")
          .slice(1)
          .forEach((w) => {
            if (/[읍면리동]$/.test(w) && !out.some((p) => p.name === w)) out.push({ key: `p:${w}`, name: w, kind: `지명 · ${f.name.split(" ")[0]}`, rank: 2, lat: f.lat, lon: f.lon, z: 9.6 }); // i18n:keep
          });
    });
    (lines?.features ?? [])
      .filter((x) => x.properties?.kind === "river" && x.properties.name)
      .forEach((x) => {
        const g = x.geometry;
        const pts = (g?.type === "MultiLineString" ? (g.coordinates as number[][][]).flat() : ((g?.coordinates as number[][] | undefined) ?? [])) as number[][];
        const mid = pts[Math.floor(pts.length / 2)];
        if (mid && !out.some((p) => p.rank === 3 && p.name === x.properties!.name)) out.push({ key: `r:${x.properties!.name}`, name: c.tl("river", x.properties!.name!, "", x.properties!.name!), kind: c.t("home.set_layer_k.river"), rank: 3, lat: mid[1], lon: mid[0], z: 8.4 });
      });
    c.units.forEach((u) => out.push({ key: `u:${u.id}`, name: c.tl("unit", u.id, "name", u.name), kind: c.t("home.over.response_units"), rank: 4, lat: u.lat, lon: u.lon, z: 10.2 }));
    return out;
  }, [S, c, lines]);
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const sugg = useMemo(() => {
    const k = norm(q);
    if (!k) return [];
    return places
      .filter((p) => norm(p.name).includes(k) || norm(p.name.replace(/[시군]$/, "")) === k)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 8);
  }, [q, places]);
  const [hi, setHi] = useState(0);
  const goPlace = (p: Place | undefined) => {
    if (!p) return;
    if (p.aoi) {
      c.setDrawn(null);
      S.setAoi(p.aoi);
      setQ("");
      return;
    }
    if (p.lat != null && p.lon != null) c.fly(p.lat, p.lon, p.z);
    if (p.fire) c.setSelFire(p.fire);
    setQ("");
  };

  /* 새 경보 지도 알림 띠(목업 showFlash): 처음 받은 뒤 새로 들어온 대응 경보 하나 · 역할로 들어온 사람에게만 · 10초 뒤 닫힘 */
  const router = useRouter();
  const [flash, setFlash] = useState<Alert | null>(null);
  const ids = c.alerts.map((a) => a.id).join(",");
  const [seen, setSeen] = useState<string | null>(null);
  if (seen == null && c.alerts.length) setSeen(ids);
  else if (seen != null && seen !== ids) {
    const old = new Set(seen.split(","));
    const fresh = c.alerts.find((a) => !old.has(a.id) && a.status === "new");
    setSeen(ids);
    if (fresh && c.role && c.kor) setFlash(fresh);
  }
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 10000);
    return () => clearTimeout(id);
  }, [flash]);
  const canOpen = c.role === "responder" || c.role === "firefighter";
  const flashFire = flash ? c.fires.find((f) => f.id === flash.fire_id) : undefined;
  const hotTxt = c.hot ? `VIIRS ${c.fmt.num(c.hot.v)}, MODIS ${c.fmt.num(c.hot.m)}` : "–";
  const st = c.status;
  /* 홈 시야 여백(목업 homePad): 왼쪽 위 검색 줄·경보 띠 아래, 왼쪽 아래 범례·배지 위까지 비우고 맞춘다 · 오른쪽은 도구 열 · 합이 높이 절반을 넘으면 비율대로 줄인다 */
  const tlRef = useRef<HTMLDivElement>(null);
  const blRef = useRef<HTMLDivElement>(null);
  const flRef = useRef<HTMLDivElement>(null);
  const viewPad = useCallback(() => {
    const tl = tlRef.current;
    const host = tl?.closest('[data-testid="home-map"]') as HTMLElement | null;
    if (!tl || !host) return 24;
    const mr = host.getBoundingClientRect();
    let top = 12;
    let bottom = 12;
    top = Math.max(top, tl.getBoundingClientRect().bottom - mr.top + 10);
    if (flRef.current) top = Math.max(top, flRef.current.getBoundingClientRect().bottom - mr.top + 10);
    if (blRef.current) bottom = Math.max(bottom, mr.bottom - blRef.current.getBoundingClientRect().top + 6);
    const vmax = mr.height * 0.5;
    if (top + bottom > vmax) {
      const r = vmax / (top + bottom);
      top *= r;
      bottom *= r;
    }
    return { top: Math.round(top), bottom: Math.round(bottom), left: 16, right: Math.min(58, Math.round(mr.width * 0.12)) };
  }, []);
  /* 「고른 기간(26.11.01–11.03) 밖에 {진행 중 n곳}」 — 굵은 몫을 가운데 끼우려고 자리표로 나눈다 */
  const outParts = c.t("home.outv.text", { a: rs.slice(2).replace(/-/g, "."), b: re.slice(2).replace(/-/g, "."), n: "@@N@@" }).split("@@N@@");

  /* 관심 영역 배지(목업 renderAOIBadge): 「관심 영역 {종류} · 집계 시군 {r} ×」 */
  const approx = c.agg && c.agg.names.length ? c.t(c.agg.sgg ? "home.aoi.approx_kor" : "home.aoi.approx_adm1", { r: c.agg.names.join("·") }) : "";
  const regionLabel = c.drawn?.type === "point" ? `${c.drawnKind} · ${c.drawn.lat.toFixed(3)}°N ${c.drawn.lon.toFixed(3)}°E` : c.drawnKind;
  const hiRegions = c.agg?.ids ?? (S.focus ? [S.focus] : []);
  /* 지도 손잡이를 화면(home-page)에 넘긴다 — PNG 내려받기·날아가기 */
  const { setMapH } = c;
  const takeHandle = useCallback((h: MapCanvasHandle | null) => setMapH(h), [setMapH]);
  /* 감지 목록·검색에서 고른 불로 날아가기 */
  useEffect(() => {
    if (c.flyTo) c.mapH?.flyTo(c.flyTo.lat, c.flyTo.lon, c.flyTo.z ?? 9.6);
  }, [c.flyTo, c.mapH]);

  return (
    <MapCanvas
      ref={takeHandle}
      className={cx("hm-map")}
      testId="home-map"
      iso3={c.iso3}
      view={view}
      regions={c.mapRegions}
      hiRegions={hiRegions}
      focus={focus}
      hotspots={hot}
      fires={fires}
      units={units}
      routes={routes}
      selFire={c.selFire}
      annotFire={annot}
      onFire={(id) => c.setSelFire(id)}
      onUnit={onUnit}
      viewPad={viewPad}
      onRegion={(id) => (S.byId.has(id) ? S.setAoi(id) : undefined)}
      onView={(b) => setVb(b)}
      aoi={c.drawn}
      onDraw={(a) => c.setDrawn(a)}
      tools={["layers", "bbox", "polygon", "point"]}
      pointBounds={view}
      layerMenu={menu}
      ticks
      offView={!c.drawn && !isCountry && view ? { pts: [[(view[1] + view[3]) / 2, (view[0] + view[2]) / 2]], label: c.aoiLabel } : c.drawn ? { pts: [[(c.drawn.type === "bbox" ? (c.drawn.south + c.drawn.north) / 2 : c.drawn.type === "point" ? c.drawn.lat : c.drawn.pts[0]![0]), (c.drawn.type === "bbox" ? (c.drawn.west + c.drawn.east) / 2 : c.drawn.type === "point" ? c.drawn.lon : c.drawn.pts[0]![1])]], label: c.drawnKind } : null}
      status={vb && area > MAX_AREA ? c.t("maplab.zoom_for_points") : null}
    >
      <div ref={tlRef} className={cx("hm-ov hm-ov-tl")} style={{ pointerEvents: "none" }}>
        <div className={cx("hm-search")} role="search">
          <Search className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
          <input
            type="search"
            placeholder={c.t("home.over.search_places")}
            aria-label={c.t("home.over.search_places")}
            autoComplete="off"
            data-search=""
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                goPlace(sugg[hi] ?? sugg[0]);
              } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && sugg.length) {
                e.preventDefault();
                setHi((hi + (e.key === "ArrowDown" ? 1 : sugg.length - 1)) % sugg.length);
              } else if (e.key === "Escape") setQ("");
            }}
          />
          {q.trim() ? (
            <div className={cx("hm-sugg")} data-sugg="" role="listbox">
              {sugg.length ? (
                sugg.map((p, i) => (
                  <button key={p.key} type="button" className={cx("hm-sg")} role="option" aria-selected={i === hi} data-a={p.aoi} data-place={p.key} onMouseDown={(e) => e.preventDefault()} onClick={() => goPlace(p)}>
                    <b>{p.name}</b>
                    <span className={cx("dim")}>{p.kind}</span>
                  </button>
                ))
              ) : (
                <div className={cx("hm-sg-empty")}>{c.t("home.show_sugg.no_results")}</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {flash ? (
        <div ref={flRef} className={cx("hm-flash", `hm-l${flash.level}`)} role="alert" data-flash={flash.id} style={{ pointerEvents: "auto" }}>
          <span className={cx("lv", `l${flash.level}`)}>{c.t(`shell.level.${flash.level}`)}</span>
          <div className={cx("hm-flash-t")}>
            <b>{c.tl("alert", flash.id, "title", flash.title)}</b>
            <span>
              {flashFire ? c.tl("fire", flashFire.id, "name", flashFire.name) : ""}, {flash.at}
            </span>
          </div>
          {canOpen ? (
            <button
              type="button"
              className={cx("btn sm")}
              data-ops=""
              onClick={() => {
                setFlash(null);
                router.push(pageHref(c.lang as Locale, "ops"));
              }}
            >
              {c.t("home.show_flash.open_in_alerts")}
            </button>
          ) : (
            <button
              type="button"
              className={cx("btn sm")}
              data-fly=""
              onClick={() => {
                setFlash(null);
                c.setSelFire(flash.fire_id);
                if (flashFire) c.fly(flashFire.lat, flashFire.lon, 10.2);
              }}
            >
              {c.t("home.show_flash.show_on_map")}
            </button>
          )}
          <button type="button" className={cx("hm-x")} data-hide="" aria-label={c.t("home.show_flash.close")} onClick={() => setFlash(null)}>
            <X className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
          </button>
        </div>
      ) : null}
      {/* 변경 확인 줄(목업 note · 지도 아래쪽, 오른쪽 지표를 가리지 않게) */}
      <div className={cx("hm-status", st && !st.off && "is-on", st?.kind === "info" && "is-info")} data-status="" role="status" aria-live="polite" title={st ? `${st.text} ${st.sub}${st.hot ? st.hot.pre + hotTxt + (st.hot.post ?? "") : ""}` : undefined}>
        {st ? (
          <>
            {st.kind === "info" ? <Info className={cx("ic")} width={13} height={13} aria-hidden="true" strokeWidth={1.9} /> : <Check className={cx("ic")} width={13} height={13} aria-hidden="true" strokeWidth={1.9} />}
            <b>{st.text}</b>
            {st.sub || st.hot ? <span>{st.sub + (st.hot ? st.hot.pre + hotTxt + (st.hot.post ?? "") : "")}</span> : null}
          </>
        ) : null}
      </div>
      <div ref={blRef} className={cx("hm-ov hm-ov-bl")} style={{ pointerEvents: "none" }}>
        {outside.length ? (
          /* 과거 기간을 볼 때 지금 진행 중인 불(기간 밖) 안내(목업 renderOutside · L10) */
          <div className={cx("hm-outv")} role="note" data-outv="">
            <i className={cx("hm-outv-dot")} aria-hidden="true" />
            <span>
              {outParts[0]}
              <b>{c.t("home.outv.n", { n: outside.length })}</b>
              {outParts[1]}
            </span>
          </div>
        ) : null}
        {c.drawn ? (
          <div className={cx("hm-aoibadge")} data-aoibadge="" data-aoi-type={c.drawn.type}>
            <span className={cx("hm-aoi-k")}>{c.t("home.short_label.area")}</span>
            <b>{regionLabel}</b>
            {approx ? <span className={cx("hm-aoi-ap")}>{approx}</span> : null}
            <button type="button" className={cx("hm-x")} data-clear="" aria-label={c.t("home.render_aoibadge.clear_area")} onClick={() => c.setDrawn(null)}>
              <X className={cx("ic ic-inline")} aria-hidden="true" strokeWidth={1.9} />
            </button>
          </div>
        ) : null}
        <div className={cx("hm-lgrow")}>
          <div className={cx("hm-legend")}>
            <span>{c.t("home.over.hotspots")}</span>
            <span className={cx("hm-lgs")}>
              <i className={cx("hm-lgd v")} aria-hidden="true" />
              VIIRS
            </span>
            <span className={cx("hm-lgs")}>
              <i className={cx("hm-lgd m")} aria-hidden="true" />
              MODIS
            </span>
            <span className={cx("hm-lg-n tn")} data-hcount="" data-n={hot.length}>
              {hotErr ? c.t(hotErr.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.request") : !hb ? "–" : hotQ.isPending ? "–" : `VIIRS ${c.fmt.num(nV)}, MODIS ${c.fmt.num(nM)}`}
            </span>
            {c.kor ? (
              <span className={cx("hm-lgs hm-lg-unit")}>
                <Truck className={cx("ic ic-inline")} aria-hidden="true" strokeWidth={1.9} />
                {c.t("home.over.units")}
              </span>
            ) : null}
          </div>
          <HomePass c={c} view={view} />
        </div>
      </div>
      {phone ? (
        /* 폰: 감지 목록 바닥 시트(목업 EM.ui.sheet · 정지점 접힘 112px / 50% / 전체) */
        <div className={cx("sheet hm-sheet")} data-stop={stop} style={{ ["--sheet-h" as string]: stop === "peek" ? "112px" : stop === "half" ? "50%" : "calc(100% - var(--sp-6))" }}>
          <button
            type="button"
            className={cx("sh-grip")}
            aria-label={c.t("home.sheet.grip", { stop: c.t(`home.sheet.stop_${stop}`) })}
            onClick={() => setStop(STOPS[(STOPS.indexOf(stop) + 1) % 3]!)}
            onKeyDown={(e) => {
              const i = STOPS.indexOf(stop);
              const j = e.key === "ArrowUp" ? Math.min(2, i + 1) : e.key === "ArrowDown" ? Math.max(0, i - 1) : -1;
              if (j < 0) return;
              e.preventDefault();
              setStop(STOPS[j]!);
            }}
          />
          <div className={cx("sh-h")}>
            <Feed {...c} part="head" />
          </div>
          <div className={cx("sh-b")}>
            <Feed {...c} part="body" />
          </div>
        </div>
      ) : null}
    </MapCanvas>
  );
}
