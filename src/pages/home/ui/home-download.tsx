"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileSpreadsheet, Image as ImageIcon, MapPin } from "lucide-react";
import { ApiError } from "@/shared/api";
import { hotspotsQuery } from "../api/queries";
import { cx } from "./cx";
import type { Ctx } from "./home-page";
import { download, toCSV } from "./use-ui";

/** 시나리오 권역 지도 범위(경북 북부 원장 bounds 와 같은 범위 — 서,남,동,북) */
export const KR_VIEW: [number, number, number, number] = [128.05, 36.15, 129.55, 37.05];

/**
 * 내려받기(결정 F10 ⑦): 캘린더 PNG · 분석 CSV(지금 관심 영역의 release 달 행 그대로) · 원시 탐지 CSV(지도 기간 /hotspots 점).
 * 값은 API 응답 그대로 적는다(다시 계산 없음). 점이 「준비 중」(MSW 503)이면 그 이유를 메뉴에 적고 막는다.
 */
export function HomeDownload(c: Ctx) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const base = `emberline_${c.aoi}`;

  const calPng = () => {
    const svg = document.querySelector<SVGSVGElement>('[data-testid="home"] [data-cal] svg');
    if (!svg) return;
    const vb = svg.viewBox.baseVal;
    const k = 2;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = vb.width * k;
      cv.height = vb.height * k;
      const g = cv.getContext("2d");
      if (!g) return;
      g.fillStyle = c.tok?.["surface-0"] ?? "#000";
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => b && download(`${base}_calendar_${c.sensor}.png`, b));
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  };
  const calCsv = () => {
    const csv = toCSV(c.months, [
      { label: "aoi_id", get: () => c.aoi },
      { label: "year", get: (r) => r.year },
      { label: "month", get: (r) => r.month },
      { label: "value", get: (r) => r.value },
      { label: "value_lo", get: (r) => r.value_lo },
      { label: "value_hi", get: (r) => r.value_hi },
      { label: "value_projected", get: (r) => r.value_projected },
      { label: "as_of_date", get: (r) => r.as_of_date },
      { label: "raw_modis", get: (r) => r.raw_modis },
      { label: "raw_viirs", get: (r) => r.raw_viirs },
      { label: "status", get: (r) => r.status },
      { label: "verdict", get: (r) => r.verdict },
      { label: "percentile", get: (r) => r.percentile },
      { label: "ratio_to_median", get: (r) => r.ratio_to_median },
      { label: "method_version", get: () => c.mv },
    ]);
    download(`${base}_calendar.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  };
  const hotCsv = async () => {
    if (!c.range) return;
    try {
      const d = (await qc.fetchQuery(hotspotsQuery(c.aoiBbox ?? KR_VIEW, c.range.start, c.range.end, c.mv))) as unknown as { hotspots?: Record<string, unknown>[] };
      const rows = d.hotspots ?? [];
      if (!rows.length) {
        setNote(c.t("home.export_it.no_raw_detections_to"));
        return;
      }
      const keys = Object.keys(rows[0]!);
      download(`${base}_hotspots_${c.range.start}_${c.range.end}.csv`, new Blob([toCSV(rows, keys.map((k) => ({ label: k, get: (r) => r[k] as string | number | null })))], { type: "text/csv;charset=utf-8" }));
      setOpen(false);
    } catch (e) {
      setNote(c.t(e instanceof ApiError && e.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.request"));
    }
  };

  return (
    <div className={cx("hm-dl")} ref={box}>
      <button type="button" className={cx("btn hm-dl-btn")} data-dl="" aria-haspopup="menu" aria-expanded={open} onClick={() => (setOpen(!open), setNote(null))}>
        {c.t("home.short_label.download")}
        <ChevronDown className={cx("ic ic-inline")} aria-hidden="true" strokeWidth={1.9} />
      </button>
      {open ? (
        <div className={cx("hm-menu")} role="menu">
          <div className={cx("hm-menu-g")} role="presentation">
            {c.t("home.item.export_view")}
          </div>
          <button type="button" role="menuitem" onClick={() => (calPng(), setOpen(false))} disabled={!c.months.length}>
            <ImageIcon aria-hidden="true" strokeWidth={1.9} width={16} height={16} />
            <span>
              <b>{c.t("home.item.calendar_png")}</b>
              <span>{c.t("home.export_it.detection_calendar_2001_2026") + c.dataAoiName}</span>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={() => (calCsv(), setOpen(false))} disabled={!c.months.length}>
            <FileSpreadsheet aria-hidden="true" strokeWidth={1.9} width={16} height={16} />
            <span>
              <b>{c.t("home.item.analysis_csv")}</b>
              <span>{c.dataAoiName + c.t("home.item.value_state_reason_version")}</span>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={() => void hotCsv()} disabled={!c.range}>
            <MapPin aria-hidden="true" strokeWidth={1.9} width={16} height={16} />
            <span>
              <b>{c.t("home.item.raw_detections_csv")}</b>
              <span>{c.dataAoiName + c.t("home.item.map_period") + (c.range ? `${c.range.start} – ${c.range.end}` : "")}</span>
            </span>
          </button>
          {note ? <div className={cx("hm-menu-f")}>{note}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
