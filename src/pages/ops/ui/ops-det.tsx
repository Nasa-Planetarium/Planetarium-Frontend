"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { boundaryQuery, countryName, type CountryInfo } from "@/entities/country";
import { useT } from "@/shared/i18n";
import { cx } from "./cx";


type GeoData = Parameters<GeoJSONSource["setData"]>[0];
/**
 * 한국 밖(목업 EM.ui.detPage — GLOBAL §6.2): 경보·출동 원장은 경북 시나리오뿐이라 자원 칸 없이 감지 묶음 화면.
 * 머리(개수 띠: 24시간 감지 묶음 · 24시간 감지 · 높은 신뢰도 · 지역) + 지도(그 나라 1급 경계) + 「미확인 감지」 표.
 * 감지 점은 계약 GET /hotspots 에서 오는데 지금 release 에 없어 503 data_not_loaded(계약 §hotspots) — 값을 지어내지 않고 「–」·「자료 준비 중」.
 */
export function OpsDet({ iso3, info }: { iso3: string; info: CountryInfo | undefined }) {
  const t = useT();
  const locale = useLocale();
  const glEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const { data: boundary } = useQuery(boundaryQuery(iso3));
  /* 해외 영토가 넓은 나라는 본토 범위(bbox_main, 목업 countryView) */
  const bb = (info as (CountryInfo & { bbox_main?: [number, number, number, number] }) | undefined)?.bbox_main ?? info?.bbox;
  const fit = () => {
    const b = bb;
    if (b && mapRef.current) mapRef.current.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 24, animate: false });
  };

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !glEl.current) return;
      const cs = getComputedStyle(document.documentElement);
      const map = new ml.Map({
        container: glEl.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": cs.getPropertyValue("--map-void").trim() || "#070605" } }] },
        center: [0, 20],
        zoom: 1,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.on("load", () => {
        map.addSource("bounds", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "fill", type: "fill", source: "bounds", paint: { "fill-color": cs.getPropertyValue("--surface-1").trim(), "fill-opacity": 1 } });
        map.addLayer({ id: "line", type: "line", source: "bounds", paint: { "line-color": cs.getPropertyValue("--line-strong").trim(), "line-width": 1 } });
        mapRef.current = map;
        map.fire("em-ready");
      });
      ro = new ResizeObserver(() => map.resize());
      ro.observe(glEl.current);
    });
    return () => {
      dead = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let tries = 0;
    const tick = window.setInterval(() => {
      const map = mapRef.current;
      tries++;
      if (map && boundary) {
        (map.getSource("bounds") as GeoJSONSource | undefined)?.setData(((boundary as { geometry?: unknown }).geometry ?? boundary) as GeoData);
        const b = bb;
        if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 24, animate: false });
        window.clearInterval(tick);
      } else if (tries > 100) window.clearInterval(tick);
    }, 50);
    return () => window.clearInterval(tick);
  }, [boundary, bb]);

  return (
    <div className={cx("dp op-out")} data-testid="ops-det">
      <header className={cx("pghd")}>
        <div className={cx("ph-1")}>
          <h1>{t("ops.head.name")}</h1>
          <span className={cx("ph-scope")}>{countryName(info, locale, iso3)}</span>
        </div>
        <div className={cx("cntbar")} role="group" aria-label={t("shell.counts.aria")}>
          {(
            [
              ["det", "shell.det.clusters", true],
              ["pts", "shell.det.points", true],
              ["high", "shell.det.high", true],
              ["reg", "shell.det.regions", false],
            ] as const
          ).map(([k, label, short]) => (
            <button key={k} type="button" className={cx("cb")} aria-pressed="false" data-cnt={k}>
              <span className={cx("cb-k")}>
                {short ? (
                  <>
                    <span className={cx("cb-l")}>{t(label)}</span>
                    <span className={cx("cb-s")}>{t(`${label}.short`)}</span>
                  </>
                ) : (
                  t(label)
                )}
              </span>
              <span className={cx("cb-vw")}>
                <b className={cx("cb-v")}>–</b>
              </span>
            </button>
          ))}
        </div>
      </header>
      <div className={cx("dp-g")}>
        <section className={cx("dp-map map")} aria-label={t("shell.det.title")}>
          <div ref={glEl} className={cx("gl")} />
          <div className={cx("map-ui")}>
            <div className={cx("zoom")}>
              <button type="button" data-z="1" aria-label={t("shell.map.zoom_in")} onClick={() => mapRef.current?.zoomIn()}>
                <Plus aria-hidden="true" />
              </button>
              <button type="button" data-z="-1" aria-label={t("shell.map.zoom_out")} onClick={() => mapRef.current?.zoomOut()}>
                <Minus aria-hidden="true" />
              </button>
              <button type="button" data-z="fit" aria-label={t("shell.map.fit")} onClick={fit}>
                <LocateFixed aria-hidden="true" />
              </button>
            </div>
            <div className={cx("attrib")}>{t("shell.map.attr_gl").split("|")[0]}</div>
          </div>
        </section>
        <section className={cx("panel dp-list")} aria-label={t("shell.det.title")}>
          <div className={cx("sechd")}>
            <h2>{t("shell.det.title")}</h2>
            <span className={cx("sh-n")}>–</span>
          </div>
          <p className={cx("dt-none")} role="status">
            {t("shell.err.data_not_loaded")}
          </p>
        </section>
      </div>
    </div>
  );
}
