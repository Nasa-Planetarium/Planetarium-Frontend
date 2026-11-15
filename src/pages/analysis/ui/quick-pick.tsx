"use client";

import { useMemo, useState } from "react";
import { countryName, type CountryInfo } from "@/entities/country";
import { aoiOfIso3, LAST, ymIso } from "../model/core";
import { cx } from "./cx";

/**
 * 나라·기간 바로 바꾸기(QA 2026-11-15) — 상단 「비교 분석」 탭으로 바로 들어와도 지난번 나라·달이 아니라 원하는 나라·달로 분석할 수 있게.
 * 드롭다운(나라 · 연도 · 월)은 고르기만 하고, 「적용」을 눌러야 주소(aoi · ym)가 바뀌어 분석 데이터가 다시 받아진다.
 * 나라는 자료가 있는 나라만(pick). 처음 값 = 지금 분석 중인 지역의 나라(앱에 저장된 나라가 아니라). 적용하면 그 나라 단위 aoi 와 앱 나라를 함께 바꾼다.
 */
type Tv = (k: string, v?: Record<string, string | number>) => string;

export function QuickPick(o: {
  T: Tv;
  lang: string;
  countries: readonly CountryInfo[];
  pick: Set<string> | null;
  /** 지금 분석 중인 나라 iso3, 전 세계(WORLD) 분석 중이면 "WORLD" */
  iso3: string;
  /** 「전체」(모든 나라 합 = WORLD 지역) 항목을 보일지 — 지역 목록에 WORLD 가 있을 때만(실서버 있음 · 목 스냅숏 없음) */
  hasWorld: boolean;
  y: number;
  m: number;
  step: number;
  writeQ: (patch: Record<string, string | null>, push?: boolean, country?: string) => void;
}) {
  const [c, setC] = useState(o.iso3);
  const [yy, setYy] = useState(o.y);
  const [mm, setMm] = useState(o.m);
  /* 주소가 바뀌면(적용 · 다른 화면에서 이동) 드롭다운도 그 값으로 */
  const key = `${o.iso3}|${o.y}|${o.m}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setC(o.iso3);
    setYy(o.y);
    setMm(o.m);
  }

  const list = useMemo(
    () =>
      (o.pick ? o.countries.filter((x) => o.pick!.has(x.iso3)) : o.countries)
        .map((x) => ({ iso3: x.iso3, name: countryName(x, o.lang, x.iso3) }))
        .sort((a, b) => a.name.localeCompare(b.name, o.lang)),
    [o.countries, o.pick, o.lang],
  );
  const years = useMemo(() => Array.from({ length: LAST[0] - 2000 + 1 }, (_, i) => LAST[0] - i), []);
  const changed = c !== o.iso3 || yy !== o.y || mm !== o.m;

  const apply = () => {
    if (!changed) return;
    /* 「전체」 = WORLD 지역(모든 나라 합). 앱 나라는 그대로 둔다 */
    if (c === "WORLD") o.writeQ({ aoi: "WORLD", ym: ymIso(yy, mm), step: String(o.step) }, true);
    else o.writeQ({ aoi: aoiOfIso3(c), ym: ymIso(yy, mm), step: String(o.step) }, true, c);
  };

  return (
    <div className={cx("an-qx")} role="group" aria-label={o.T("qx.aria")} data-qx="">
      <label className={cx("an-qxf")}>
        <span>{o.T("qx.country")}</span>
        <select value={c} onChange={(e) => setC(e.target.value)} data-qx-country="">
          {o.hasWorld ? <option value="WORLD">{o.T("qx.all")}</option> : null}
          {list.map((x) => (
            <option key={x.iso3} value={x.iso3}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label className={cx("an-qxf")}>
        <span>{o.T("qx.year")}</span>
        <select value={yy} onChange={(e) => setYy(+e.target.value)} data-qx-year="">
          {years.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className={cx("an-qxf")}>
        <span>{o.T("qx.month")}</span>
        <select value={mm} onChange={(e) => setMm(+e.target.value)} data-qx-month="">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => (
            <option key={v} value={v}>
              {o.T("qx.month_n", { m: v })}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={cx("btn primary an-qxgo")} disabled={!changed} onClick={apply} data-qx-apply="">
        {o.T("qx.apply")}
      </button>
    </div>
  );
}
