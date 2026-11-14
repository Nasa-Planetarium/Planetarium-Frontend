"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { Layers, LocateFixed, Minus, Pentagon, Plus, Search, Square, Truck, Crosshair } from "lucide-react";
import { boundaryQuery, type CountryInfo } from "@/entities/country";
import { ApiError } from "@/shared/api";
import { hotspotsQuery } from "../api/queries";
import { ACTIVE, CLOSED, fireLabel, frpCls } from "../model/home";
import { cx } from "./cx";
import { KR_VIEW } from "./home-download";
import type { Ctx } from "./home-page";
import { Feed } from "./home-side";
import { useDevice } from "@/shared/lib/use-device";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
type Ml = typeof import("maplibre-gl");
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });
const FLAME = '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1.5 4.5 6 6.5 6 11.5a6 6 0 0 1-12 0c0-3 1.7-4.8 2.9-6.2.2 1.7.9 2.8 2 3.3C10.8 8.5 10.6 5.6 12 3z"></path></svg>';
const TRUCK = '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h11v10H2z"></path><path d="M13 9h4.5l3.5 3.5V16h-8"></path><path d="M6.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"></path><path d="M17 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"></path></svg>';
function niceLen(maxM: number) {
  const p = Math.pow(10, Math.floor(Math.log10(maxM)));
  let best = p;
  [1, 2, 5].forEach((n) => {
    if (n * p <= maxM) best = n * p;
  });
  return best;
}
type Layer = "heat" | "fires" | "units" | "bounds";
/** 표지 클래스 바꾸기 — maplibre 가 단 maplibregl-* 클래스(자리 잡기)는 남긴다 */
function setCls(d: HTMLElement, cls: string) {
  const keep = Array.from(d.classList).filter((k) => k.startsWith("maplibregl-"));
  d.className = [...keep, cls].join(" ");
}

/**
 * 지도 — MapLibre 2D(결정 F9: 점은 원). 목업 map3d 의 홈 몫:
 *  - 바탕(map-void) + 나라 1급 경계 · 감지 점(/hotspots 실제 API, 지도 기간 — 원, 색 = 센서) · 시군 이름 · 화점(원장 불, 조준 고리) · 대응 자원(원장)
 *  - 오른쪽 위 도구 열(레이어 · 사각형 · 다각형 · 좌표) · 확대/축소/전체 · 축척 · 출처 · 범례 · 검색
 * 점이 「준비 중」(MSW 스냅숏 503)이면 범례 개수 자리에 그 이유를 적는다(0 으로 그리지 않음).
 */
export function HomeMap(c: Ctx) {
  const glEl = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [ml, setMl] = useState<Ml | null>(null);
  const [frame, setFrame] = useState(0);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ heat: true, fires: true, units: true, bounds: true });
  const [pop, setPop] = useState<"layers" | "pt" | null>(null);
  const [draw, setDraw] = useState<null | "bbox" | "polygon">(null);
  const [q, setQ] = useState("");
  const { data: boundary } = useQuery(boundaryQuery(c.iso3));
  const info = c.info as (CountryInfo & { bbox_main?: [number, number, number, number] }) | undefined;

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    let made: MlMap | null = null;
    void import("maplibre-gl").then((lib) => {
      if (dead || !glEl.current) return;
      const css = getComputedStyle(document.documentElement);
      const tk = (n: string) => css.getPropertyValue(`--${n}`).trim();
      const m = new lib.Map({
        container: glEl.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": tk("map-void") || "#070605" } }] },
        center: [128.8, 36.6],
        zoom: 8,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      made = m;
      m.touchZoomRotate.disableRotation();
      m.on("load", () => {
        m.addSource("bounds", { type: "geojson", data: fc([]) });
        m.addSource("hot", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "bounds-fill", type: "fill", source: "bounds", paint: { "fill-color": tk("surface-1"), "fill-opacity": 0.55 } });
        m.addLayer({ id: "bounds-line", type: "line", source: "bounds", paint: { "line-color": tk("text-3"), "line-width": 1, "line-opacity": 0.6, "line-dasharray": [3, 2] } });
        m.addLayer({
          id: "hot",
          type: "circle",
          source: "hot",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 8, 3, 11, 5],
            "circle-color": ["match", ["get", "s"], "MODIS", tk("data-modis"), tk("data-viirs")],
            "circle-opacity": 0.8,
            "circle-stroke-color": tk("map-halo"),
            "circle-stroke-width": 1,
          },
        });
        setMl(lib);
        setMap(m);
      });
      m.on("move", () => setFrame((n) => n + 1));
      ro = new ResizeObserver(() => {
        m.resize();
        setFrame((n) => n + 1);
      });
      ro.observe(glEl.current);
    });
    return () => {
      dead = true;
      ro?.disconnect();
      made?.remove();
    };
  }, []);

  /* 전체 보기: 한국 = 시나리오 권역(경북 북부 원장 범위), 밖 = 나라 본토 범위 */
  const bb = useMemo((): [number, number, number, number] | null => (c.kor ? KR_VIEW : (info?.bbox_main ?? info?.bbox ?? null)), [c.kor, info]);
  const fit = () => {
    if (map && bb) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: { top: 56, bottom: 64, left: 16, right: 58 }, animate: false });
  };
  const fitKey = bb ? bb.join(",") : "";
  const lastFit = useRef("");
  useEffect(() => {
    if (!map || !bb || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: { top: 56, bottom: 64, left: 16, right: 58 }, animate: false });
  }, [map, bb, fitKey]);
  useEffect(() => {
    if (map && c.flyTo) map.easeTo({ center: [c.flyTo.lon, c.flyTo.lat], zoom: c.flyTo.z ?? Math.max(map.getZoom(), 9.5), duration: 450 });
  }, [map, c.flyTo]);

  useEffect(() => {
    if (!map) return;
    (map.getSource("bounds") as GeoJSONSource | undefined)?.setData((layers.bounds ? ((boundary as { geometry?: unknown } | undefined)?.geometry ?? fc([])) : fc([])) as GeoData);
  }, [map, boundary, layers.bounds]);

  /* 감지 점 — 실제 API(/hotspots, 지도 기간 · 지도 범위) */
  const hb = bb ?? KR_VIEW;
  const hotQ = useQuery(hotspotsQuery(hb, c.range?.start ?? "", c.range?.end ?? "", c.range ? c.mv : null));
  const hot = useMemo(() => ((hotQ.data as unknown as { hotspots?: { latitude: number; longitude: number; instrument?: string; frp?: number }[] } | undefined)?.hotspots ?? []), [hotQ.data]);
  useEffect(() => {
    if (!map) return;
    (map.getSource("hot") as GeoJSONSource | undefined)?.setData(fc(layers.heat ? hot.map((h) => ({ type: "Feature", properties: { s: h.instrument ?? "VIIRS", frp: h.frp ?? 0 }, geometry: { type: "Point", coordinates: [h.longitude, h.latitude] } })) : []) as GeoData);
  }, [map, hot, layers.heat]);
  const nV = hot.filter((h) => h.instrument !== "MODIS").length;
  const nM = hot.length - nV;
  const hotErr = hotQ.error instanceof ApiError ? hotQ.error : null;

  /* 화점·자원·시군 이름 — DOM 표지(maplibre Marker). 표지 모양은 목업 index.html .m3-fire·.m3-unit·.m3-reg */
  const fireMk = useRef(new Map<string, { m: Marker; d: HTMLDivElement }>());
  const unitMk = useRef(new Map<string, { m: Marker; d: HTMLDivElement }>());
  const regMk = useRef<Marker[]>([]);
  const live = useMemo(() => c.fires.filter((f) => !f.historical), [c.fires]);
  const annot = useMemo(() => live.filter((f) => ACTIVE.includes(f.status)).sort((x, y) => y.level - x.level || String(y.detected_at).localeCompare(String(x.detected_at)))[0]?.id ?? null, [live]);
  useEffect(() => {
    if (!map || !ml) return;
    const css = getComputedStyle(document.documentElement);
    const tk = (n: string) => css.getPropertyValue(`--${n}`).trim();
    const keep = new Set<string>();
    (layers.fires ? live : []).forEach((f) => {
      keep.add(f.id);
      let mk = fireMk.current.get(f.id);
      if (!mk) {
        const d = document.createElement("div");
        d.innerHTML = `<span class="${cx("m3-pulse")}"></span><span class="${cx("m3-pin")}">${FLAME}</span><span class="${cx("m3-label")}"></span>`;
        d.setAttribute("role", "button");
        d.tabIndex = 0;
        d.addEventListener("click", (e) => {
          e.stopPropagation();
          c.setSelFire(f.id);
        });
        mk = { m: new ml.Marker({ element: d, anchor: "center" }).setLngLat([f.lon, f.lat]).addTo(map), d };
        fireMk.current.set(f.id, mk);
      }
      const closed = CLOSED.includes(f.status);
      const col = closed ? tk("text-3") : tk(`alert-${Math.max(1, Math.min(4, f.level || 1))}`);
      setCls(mk.d, cx("m3-fire", `lv-${f.level}`, frpCls(f.frp_max), closed && "is-closed is-past", f.status === "new" && "is-new", f.status === "onscene" && "is-half", c.selFire === f.id && "is-sel", (c.selFire === f.id || annot === f.id) && "show-label"));
      mk.d.style.setProperty("--c", col);
      const name = c.tl("fire", f.id, "name", f.name);
      mk.d.querySelector("span:last-child")!.textContent = fireLabel(f.name, name);
      mk.d.setAttribute("aria-label", `${name}, ${c.t(`shell.level.${f.level}`)}, ${c.t(`shell.status.${f.status}`)}`);
    });
    fireMk.current.forEach((mk, id) => {
      if (!keep.has(id)) {
        mk.m.remove();
        fireMk.current.delete(id);
      }
    });
    const ku = new Set<string>();
    (layers.units ? c.units : []).forEach((u) => {
      ku.add(u.id);
      let mk = unitMk.current.get(u.id);
      if (!mk) {
        const d = document.createElement("div");
        d.innerHTML = TRUCK;
        d.setAttribute("role", "button");
        mk = { m: new ml.Marker({ element: d, anchor: "center" }).setLngLat([u.lon, u.lat]).addTo(map), d };
        unitMk.current.set(u.id, mk);
      }
      mk.m.setLngLat([u.lon, u.lat]);
      setCls(mk.d, cx("m3-unit"));
      mk.d.style.setProperty("--c", u.status === "standby" ? tk("data-unit-standby") : u.status === "onscene" ? tk("alert-3") : u.status === "enroute" ? tk("text-1") : tk("data-unit-return"));
      mk.d.setAttribute("aria-label", `${c.tl("unit", u.id, "name", u.name)}, ${c.t(`shell.unit_status.${u.status}`)}`);
    });
    unitMk.current.forEach((mk, id) => {
      if (!ku.has(id)) {
        mk.m.remove();
        unitMk.current.delete(id);
      }
    });
  }, [map, ml, live, c.units, layers.fires, layers.units, c.selFire, annot, c]);
  useEffect(() => {
    if (!map || !ml) return;
    regMk.current.forEach((m) => m.remove());
    regMk.current = c.regions.map((r) => {
      const d = document.createElement("div");
      d.className = cx("m3-reg");
      d.style.pointerEvents = "none";
      d.textContent = c.regName(r.id);
      return new ml.Marker({ element: d, anchor: "center" }).setLngLat([r.lon, r.lat]).addTo(map);
    });
    return () => regMk.current.forEach((m) => m.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 이름은 언어·시군 목록이 바뀔 때만
  }, [map, ml, c.regions, c.lang]);

  const scale = useMemo(() => {
    void frame;
    if (!map) return null;
    const lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, map.getZoom()));
    const m = niceLen(mpp * 80);
    return { px: m / mpp, text: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }, [map, frame]);

  /* 사각형·다각형 그리기(근사): 끌어 그린 상자 안 시군 중심 → 그 시군(여럿이면 상자 가운데에 가장 가까운 시군). 실제 API AOI 는 시군 하나(SGG)라 묶음은 만들지 않는다 */
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const nearest = (lat: number, lon: number) => {
    let best: string | null = null;
    let bd = Infinity;
    const kx = Math.cos((36.6 * Math.PI) / 180);
    c.regions.forEach((r) => {
      const d = ((lon - r.lon) * kx) ** 2 + (lat - r.lat) ** 2;
      if (d < bd) {
        bd = d;
        best = r.id;
      }
    });
    return best;
  };
  const endDraw = () => {
    if (!map || !box) return;
    const a = map.unproject([Math.min(box.x0, box.x1), Math.min(box.y0, box.y1)]);
    const b = map.unproject([Math.max(box.x0, box.x1), Math.max(box.y0, box.y1)]);
    const inside = c.regions.filter((r) => r.lat <= a.lat && r.lat >= b.lat && r.lon >= a.lng && r.lon <= b.lng);
    const id = inside.length === 1 ? inside[0]!.id : nearest((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    if (id) c.setRegion(id);
    setBox(null);
    setDraw(null);
  };
  const [pt, setPt] = useState({ lat: "36.55", lon: "128.73" });
  const sugg = q.trim() ? c.regions.filter((r) => c.regName(r.id).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const attr = c.t(c.kor ? "shell.map.attr_kr" : "shell.map.attr_gl").split("|")[0];
  const phone = useDevice() === "phone";
  const [stop, setStop] = useState<"peek" | "half" | "full">("peek");
  const STOPS = ["peek", "half", "full"] as const;

  return (
    <div className={cx("hm-map map map3d hm-pinready", draw && "is-drawing")} data-map="" data-testid="home-map" ref={wrap}>
      <div ref={glEl} className={cx("gl")} style={{ position: "absolute", inset: 0 }} />
      {draw ? (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 5, cursor: "crosshair" }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setBox({ x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top });
          }}
          onPointerMove={(e) => {
            if (!box) return;
            const r = e.currentTarget.getBoundingClientRect();
            setBox({ ...box, x1: e.clientX - r.left, y1: e.clientY - r.top });
          }}
          onPointerUp={endDraw}
        >
          {box ? <div style={{ position: "absolute", left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0), border: "1.5px dashed var(--text-1)", background: "color-mix(in srgb, var(--text-1) 8%, transparent)" }} /> : null}
        </div>
      ) : null}
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
      <div className={cx("map-ui")}>
        <div className={cx("zoom")}>
          <button type="button" data-z="1" aria-label={c.t("shell.map.zoom_in")} onClick={() => map?.zoomIn()}>
            <Plus className={cx("ic ic-map")} aria-hidden="true" strokeWidth={1.9} />
          </button>
          <button type="button" data-z="-1" aria-label={c.t("shell.map.zoom_out")} onClick={() => map?.zoomOut()}>
            <Minus className={cx("ic ic-map")} aria-hidden="true" strokeWidth={1.9} />
          </button>
          <button type="button" data-z="0" aria-label={c.t("shell.map.fit")} onClick={fit}>
            <LocateFixed className={cx("ic ic-map")} aria-hidden="true" strokeWidth={1.9} />
          </button>
        </div>
        {scale ? (
          <div className={cx("scale")}>
            <i style={{ width: scale.px }} />
            <span>{scale.text}</span>
          </div>
        ) : null}
        <div className={cx("attrib")} title={c.kor ? c.t("shell.map.attr_kr_full") : undefined}>
          {attr}
        </div>
        <div className={cx("hm-ov hm-ov-tl")}>
          <div className={cx("hm-search")} role="search">
            <Search className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
            <input type="search" placeholder={c.t("home.over.search_places")} aria-label={c.t("home.over.search_places")} autoComplete="off" data-search="" value={q} onChange={(e) => setQ(e.target.value)} />
            {sugg.length ? (
              <div className={cx("hm-sugg")} data-sugg="" role="listbox">
                {sugg.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={cx("hm-sg")}
                    role="option"
                    aria-selected="false"
                    onClick={() => {
                      c.setRegion(r.id);
                      c.fly(r.lat, r.lon, 9.6);
                      setQ("");
                    }}
                  >
                    {c.regName(r.id)}
                    <span className={cx("dim")}>{c.t("home.aoi.group_kor")}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className={cx("hm-ov hm-ov-bl")}>
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
                {hotErr ? c.t(hotErr.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.request") : hotQ.isPending ? "–" : `VIIRS ${c.fmt.num(nV)}, MODIS ${c.fmt.num(nM)}`}
              </span>
              {c.kor ? (
                <span className={cx("hm-lgs hm-lg-unit")}>
                  <Truck className={cx("ic ic-inline")} aria-hidden="true" strokeWidth={1.9} />
                  {c.t("home.over.units")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className={cx("mtools")} role="toolbar" aria-label={c.t("home.over.map_tools_layers_draw")}>
          <button type="button" data-mt="layers" aria-expanded={pop === "layers"} aria-haspopup="true" onClick={() => setPop(pop === "layers" ? null : "layers")}>
            <Layers className={cx("ic ic-map")} aria-hidden="true" strokeWidth={1.9} />
            <span>{c.t("shell.map.layers")}</span>
          </button>
          <button type="button" data-mt="bbox" aria-pressed={draw === "bbox"} title={c.t("home.over.draw_a_box_on")} disabled={!c.kor} onClick={() => setDraw(draw === "bbox" ? null : "bbox")}>
            <Square className={cx("ic ic-map")} aria-hidden="true" strokeWidth={1.9} />
            <span>{c.t("home.over.box")}</span>
          </button>
          <button type="button" data-mt="polygon" aria-pressed={draw === "polygon"} title={c.t("home.over.draw_a_polygon_on")} disabled={!c.kor} onClick={() => setDraw(draw === "polygon" ? null : "polygon")}>
            <Pentagon className={cx("ic ic-map")} aria-hidden="true" strokeWidth={1.9} />
            <span>{c.t("home.over.polygon")}</span>
          </button>
          <button type="button" data-mt="pt" aria-expanded={pop === "pt"} aria-haspopup="dialog" title={c.t("home.over.set_by_latitude_longitude")} aria-label={c.t("home.over.set_area_by_point")} disabled={!c.kor} onClick={() => setPop(pop === "pt" ? null : "pt")}>
            <Crosshair className={cx("ic ic-map")} aria-hidden="true" strokeWidth={1.9} />
            <span>{c.t("home.over.point")}</span>
          </button>
        </div>
        {pop === "layers" ? (
          <div className={cx("mtools-pop")} role="group" aria-label={c.t("shell.map.layers")}>
            {(
              [
                ["heat", "home.over.hotspots"],
                ["fires", "home.over.fires"],
                ["units", "home.over.response_units"],
                ["bounds", "home.over.boundaries"],
              ] as [Layer, string][]
            ).map(([k, key]) => (
              <label key={k}>
                <input type="checkbox" data-k={k} checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />
                {c.t(key)}
              </label>
            ))}
          </div>
        ) : null}
        {pop === "pt" ? (
          <form
            className={cx("mtools-pop hm-ptbox")}
            role="dialog"
            aria-label={c.t("home.over.set_area_by_point")}
            onSubmit={(e) => {
              e.preventDefault();
              const la = Number(pt.lat);
              const lo = Number(pt.lon);
              if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) return;
              const id = nearest(la, lo);
              if (id) c.setRegion(id);
              c.fly(la, lo, 9.6);
              setPop(null);
            }}
          >
            <div className={cx("hm-pt-row")}>
              <input className={cx("input")} inputMode="decimal" aria-label="lat" value={pt.lat} onChange={(e) => setPt({ ...pt, lat: e.target.value })} />
              <input className={cx("input")} inputMode="decimal" aria-label="lon" value={pt.lon} onChange={(e) => setPt({ ...pt, lon: e.target.value })} />
              <button type="submit" className={cx("btn sm")}>
                {c.t("shell.act.open")}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
