"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useCountry, countryName } from "@/entities/country";
import { calendarQuery } from "@/entities/month-value";
import { methodQuery } from "@/entities/release";
import { useSession } from "@/entities/session";
import { useAoiScope, type AoiScope, type Bbox } from "@/features/pick-aoi";
import { useAgency, useInbox, withRaised, type Alert, type Fire, type Unit } from "@/shared/agency";
import { api, unwrap, qk } from "@/shared/api";
import { useT, useTl } from "@/shared/i18n";
import { prefs } from "@/shared/lib/prefs";
import { adm1RegionsQuery, approxRegions, childRegionsQuery, type DrawnAoi, type MapCanvasHandle, type MapRegion } from "@/widgets/map-canvas";
import { outlookQuery } from "../api/queries";
import { addDays, grid, partialOf, prevRange, rangeTxt, realAoi, regionOfAoi, SENSORS, sumMonths, worstMonth, type MonthRow, type Sensor } from "../model/home";
import { cx } from "./cx";
import { HomeBand } from "./home-band";
import { HomeHead } from "./home-head";
import { HomeMap } from "./home-map";
import { HomeSide } from "./home-side";
import { useFmt, useTok } from "./use-ui";

/**
 * 상황판(home) — 원천: 목업 pages/home.js · home.css (g6 확정본).
 * 데이터 둘로 나눈다(결정 F4·F7):
 *  - 경북 시나리오(감지 목록 경보·불·자원·개수 띠·역할 화면 수·시계·계절) = AgencyPort(useAgency) 목.
 *  - 통합 값(과거 같은 달 대비·관측 활동 캘린더·가장 많았던 달/해·달 일별·지도 점·예측 칸) = 실제 API(계약 /api/v1, MSW 스냅숏 또는 실서버).
 *    지역은 전 지역(지역 고르기 ?aoi= — 기본 나라 AOI, 대한민국 → 시도 → 시군구 · 다른 나라 → 1급). 지도 범위 = 그 지역 상자.
 * 화면은 둘을 섞어 다시 계산하지 않는다 — 통합 값은 release 그대로(A1), 시나리오 값은 원장 그대로.
 */
export function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <HomeScreen />
    </Suspense>
  );
}

export interface Region {
  id: string;
  name: string;
  lat: number;
  lon: number;
}
export interface Range {
  start: string;
  end: string;
}

function useAgencyData() {
  const agency = useAgency();
  const sit = useQuery({ queryKey: ["agency", "situation"], queryFn: () => agency.getSituation(), staleTime: Infinity });
  const alerts = useQuery({ queryKey: ["agency", "alerts"], queryFn: () => agency.listAlerts(), staleTime: Infinity });
  const fires = useQuery({ queryKey: ["agency", "fires"], queryFn: () => agency.listFires(), staleTime: Infinity });
  const units = useQuery({ queryKey: ["agency", "units"], queryFn: () => agency.listUnits(), staleTime: Infinity });
  /* 시나리오 권역 시군(경북 북부 11개 — 원장 regions). 포트에 시군 목록 메서드가 따로 없어 지휘 통계 묶음의 regions 를 읽는다 */
  const regs = useQuery({
    queryKey: ["agency", "command-stats", "KOR", "", "occur", 0],
    queryFn: () => agency.getCommandStats({ iso3: "KOR", sel: [], hourly_source: "occur" }),
    staleTime: Infinity,
  });
  const regions: Region[] = useMemo(() => {
    const b = (regs.data as { board?: { regions?: Region[] } } | undefined)?.board;
    return (b?.regions ?? []).map((r) => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon }));
  }, [regs.data]);
  return { sit: sit.data ?? null, alerts: alerts.data ?? [], fires: fires.data ?? [], units: units.data ?? [], regions };
}

function HomeScreen() {
  const t = useT();
  const tl = useTl();
  const lang = useLocale();
  const fmt = useFmt();
  const { tok, ramp } = useTok();
  const { iso3, info } = useCountry();
  const kor = iso3 === "KOR";
  const { data: session } = useSession();
  const ag = useAgencyData();

  /* 시나리오 오늘(원장 시계, Asia/Seoul) */
  const today = useMemo(() => (ag.sit ? new Date(ag.sit.now_ms + 9 * 3600e3).toISOString().slice(0, 10) : null), [ag.sit]);

  /* 화면 상태(목업 EM.state · UI) */
  const [region, setRegion] = useState<string | null>(null);
  const [rangeSt, setRange] = useState<Range | null>(null);
  const range: Range | null = rangeSt ?? (today ? { start: addDays(today, -6), end: today } : null);
  const [sensor, setSensorSt] = useState<Sensor>(() => {
    const s = typeof window !== "undefined" ? (prefs.get("sensor") as Sensor | null) : null;
    return s && SENSORS.includes(s) ? s : "harmonized";
  });
  const setSensor = (s: Sensor) => {
    prefs.set("sensor", s);
    setSensorSt(s);
  };
  const [vals, setVals] = useState(false);
  const [pop, setPop] = useState<{ year: number; month: number } | null>(null);
  const [daySel, setDaySel] = useState<string | null>(null);
  const [selFire, setSelFire] = useState<string | null>(null);
  const [cntSel, setCntSel] = useState<"live" | "new" | "busy" | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; z?: number; k: number } | null>(null);
  /* 변경 확인 줄(목업 note · role=status) — 5.2초 뒤 꺼진다. hot = 지도 원시 점 수를 그릴 때 넣는다(점이 도착하면 같은 줄이 새 수로 바뀐다) */
  const [status, setStatus] = useState<Note | null>(null);
  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus((s) => (s && s.k === status.k ? { ...s, off: true } : s)), 5200);
    return () => clearTimeout(id);
  }, [status]);
  const note = (text: string, sub?: string, kind?: "info", hot?: { pre: string; post?: string }) => setStatus((s) => ({ text, sub: sub ?? "", kind: kind ?? null, hot: hot ?? null, k: (s?.k ?? 0) + 1, off: false }));
  /* 지표 머리 깜박임(목업 pulseKPI) — 관심 영역·기간·전년 대비가 바뀔 때 */
  const [pulse, setPulse] = useState(0);
  const pulseKPI = () => setPulse((n) => n + 1);
  /* 전년 대비(목업 UI.yoy · ROLES-V2 §4) — 화면 단위 상태 */
  const [yoy, setYoySt] = useState(false);
  /* 지도 원시 점 수(VIIRS·MODIS 따로) — 지도가 받은 /hotspots 결과 */
  const [hot, setHot] = useState<{ v: number; m: number } | null>(null);
  /* 지금 지도 범위(100 제곱도 안일 때) — 한국 밖 감지 묶음이 큰 나라에서 쓴다 */
  const [detBox, setDetBox] = useState<Bbox | null>(null);

  /* 실제 데이터 — 지금 판 + 관심 영역 AOI */
  const mvQ = useQuery(methodQuery());
  const mv = mvQ.data?.method_version ?? null;
  const S = useAoiScope();
  /* 지도 면 = 고른 범위의 아래 단(실제 API 경계, 대한민국 → 시도 · 시도 → 시군구 · 다른 나라 → 1급). 스냅숏(MSW)은 경계가 503 이라 나라 1급 정적 파일 */
  const kidsQ = useQuery(childRegionsQuery(S.scope, lang, mv));
  const adm1Q = useQuery(adm1RegionsQuery(iso3, lang));
  const mapRegions: MapRegion[] = useMemo(() => (kidsQ.data?.length ? kidsQ.data : (adm1Q.data ?? [])), [kidsQ.data, adm1Q.data]);
  /* 그린 관심 영역(사각형·다각형·반경) → 집계 지역(목업 approxRegions: 이름표 자리가 안에 든 지역 · 없으면 가장 가까운 하나). 지역 id 는 실제 AOI 로 옮긴다 */
  const [drawn, setDrawnSt] = useState<DrawnAoi | null>(null);
  /* 지도 손잡이(PNG·날아가기) — 콜백 ref 로 받는 상태 */
  const [mapH, setMapH] = useState<MapCanvasHandle | null>(null);
  const agg = useMemo(() => {
    if (!drawn) return null;
    const ap = approxRegions(drawn, mapRegions);
    const toAoi = (id: string) => (S.byId.has(id) ? id : S.byId.has(`ADM1_${id}`) ? `ADM1_${id}` : null);
    return { ...ap, regionIds: ap.ids, aois: ap.ids.map(toAoi).filter((x): x is string => !!x) };
  }, [drawn, mapRegions, S.byId]);
  const aggAois = agg?.aois ?? [];
  const aoi = aggAois.length === 1 ? aggAois[0]! : realAoi(S.chosen, kor ? region : null);
  const aoiBbox = (S.byId.get(aoi)?.bbox as Bbox | undefined) ?? null;
  const aoiQ = useQuery({
    queryKey: qk(`aois/${aoi}`, undefined, mv),
    queryFn: ({ signal }) => api.GET("/aois/{aoiId}", { params: { path: { aoiId: aoi } }, signal }).then(unwrap),
    enabled: !!mv,
    staleTime: Infinity,
  });
  const calQ = useQuery(calendarQuery(aoi, { start_year: 2001, end_year: 2026 }, mv));
  /* 여러 지역에 걸친 그린 영역 = 지역마다 캘린더를 받아 값 열만 더한다(목업 집계 시군 합) */
  const multi = aggAois.length > 1 ? aggAois : [];
  const multiQ = useQueries({ queries: multi.map((id) => calendarQuery(id, { start_year: 2001, end_year: 2026 }, mv)) });
  const multiDone = multi.length > 0 && multiQ.every((q) => typeof q.data === "object" && q.data);
  const multiKey = multiQ.map((q) => q.dataUpdatedAt).join(",");
  const months: MonthRow[] = useMemo(() => {
    if (multi.length) return multiDone ? sumMonths(multiQ.map((q) => (q.data as { months: unknown }).months as MonthRow[])) : [];
    return typeof calQ.data === "object" && calQ.data ? (calQ.data.months as unknown as MonthRow[]) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 여러 지역 응답은 갱신 시각 묶음(multiKey)으로 본다
  }, [calQ.data, multi.length, multiDone, multiKey]);
  const gH = useMemo(() => grid(months, "harmonized"), [months]);
  const worst = useMemo(() => worstMonth(gH), [gH]);
  const partial = useMemo(() => partialOf(months), [months]);
  const outlook = useQuery(outlookQuery());

  /* 나라·고른 지역이 바뀌면 지도 도구로 고른 시군·달을 비운다 */
  const seenKey = `${iso3}|${S.chosen}`;
  const [isoSeen, setIsoSeen] = useState(seenKey);
  if (isoSeen !== seenKey) {
    setIsoSeen(seenKey);
    setRegion(null);
    setPop(null);
    setDrawnSt(null);
    /* 지역이 바뀌면 확인 줄(목업 setAOI note) + 지표 깜박임 */
    note(t("home.set_aoi.area") + (S.nameOf(S.chosen) || countryName(info, lang, iso3)), t("home.set_aoi.calendar_indicators_questions_and"));
    pulseKPI();
  }

  /* 이름 */
  const cname = countryName(info, lang, iso3);
  const regName = (id: string) => tl("region", id, null, ag.regions.find((r) => r.id === id)?.name ?? id);
  const regionName = (id: string) => mapRegions.find((r) => r.id === id)?.name ?? S.nameOf(id);
  const drawnKind = drawn ? (drawn.type === "bbox" ? t("home.aoi.bbox") : drawn.type === "polygon" ? t("home.aoi.polygon") : t("home.aoi.radius", { r: String(Math.round(drawn.radius_km * 10) / 10) })) : "";
  const aggNames = (agg?.regionIds ?? []).map(regionName);
  const aoiLabel = drawn ? drawnKind + (aggNames.length ? ` · ${aggNames.length > 1 ? t("home.aoi.and_more", { a: aggNames[0]!, n: aggNames.length - 1 }) : aggNames[0]}` : "") : region ? regName(region) : S.nameOf(S.chosen) || cname;
  const apiAoi = aoiQ.data as { name_ko?: string; name_en?: string | null } | undefined;
  const dataAoiName = drawn ? aoiLabel : apiAoi ? (lang === "ko" ? apiAoi.name_ko : apiAoi.name_en || apiAoi.name_ko) || aoi : aoi;

  /* 시나리오 원장(경북)만: 다른 나라는 비운다(목업 FIRES·feedAlerts) */
  const fires: Fire[] = kor ? ag.fires : [];
  /* 감지 목록 = 원장 경보 + 셸 수신함에 새로 올라온 경보(최신 먼저 · 목업 EM.alerts 에 raiseAlert 가 앞에 붙는 것과 같다) */
  const box = useInbox();
  const alerts: Alert[] = kor ? withRaised(ag.alerts, box).filter((a) => a.targets.some((x) => x === "responder" || x === "firefighter")) : [];
  const units: Unit[] = kor ? ag.units : [];

  const ctx: Ctx = {
    t,
    tl,
    fmt,
    tok,
    ramp,
    lang,
    iso3,
    kor,
    info,
    cname,
    today,
    nowMs: ag.sit?.now_ms ?? null,
    tz: ag.sit?.tz ?? "Asia/Seoul",
    season: ag.sit?.season ?? "",
    role: session?.role ?? null,
    regions: kor ? ag.regions : [],
    regName,
    /* 시나리오 불 거르기: 지도 도구 시군 또는 고른 시군구가 시나리오 시군이면 그 시군 */
    region: region ?? regionOfAoi(S.chosen),
    setRegion: (r) => {
      setRegion(r);
      setPop(null);
    },
    aoi,
    aoiBbox,
    scope: S,
    mapRegions,
    drawn,
    setDrawn: (a) => {
      setDrawnSt(a);
      setRegion(null);
      setPop(null);
      pulseKPI();
      /* 그린 영역 확인 줄(목업 applyGeom note): 「관심 영역 · 사각형 · 집계 시군 … → 캘린더·지표·CSV 반영」 */
      if (a) {
        const kind = a.type === "bbox" ? t("home.aoi.bbox") : a.type === "polygon" ? t("home.aoi.polygon") : t("home.aoi.radius", { r: String(Math.round(a.radius_km * 10) / 10) });
        const ap = approxRegions(a, mapRegions);
        const names = ap.ids.map((id) => mapRegions.find((r) => r.id === id)?.name ?? S.nameOf(id));
        const approxT = names.length ? t(/^SIDO_/.test(S.scope) ? "home.aoi.approx_kor" : "home.aoi.approx_adm1", { r: names.join("·") }) : "";
        note(t("home.set_aoi.area") + kind, approxT + t("home.apply_geom.calendar_indicators_and_csv"));
      } else note(t("home.set_aoi.area") + (S.nameOf(S.chosen) || cname), t("home.set_aoi.calendar_indicators_questions_and"));
    },
    drawnKind,
    agg: agg ? { names: aggNames, ids: agg.regionIds, fallback: agg.fallback, sgg: /^SIDO_/.test(S.scope) } : null,
    mapH,
    setMapH,
    aoiLabel,
    dataAoiName,
    range,
    /* 목업 setRange: 2001-01-01 ~ 오늘로 자르고 앞뒤를 바로잡는다 · 확인 줄(quiet 면 부른 쪽이 따로) · 지표 깜박임 */
    setRange: (r0, o) => {
      const hi = today ?? r0.end;
      const clip = (d: string) => (d < "2001-01-01" ? "2001-01-01" : d > hi ? hi : d);
      let a = clip(r0.start);
      let b = clip(r0.end);
      if (a > b) [a, b] = [b, a];
      setRange({ start: a, end: b });
      if (!(daySel && daySel === a && a === b)) setDaySel(null);
      pulseKPI();
      if (!o?.quiet) note(t("home.set_range.period") + a + (a === b ? t("home.set_range.1_day") : ` – ${b}`), "", undefined, { pre: t("home.set_range.map_raw_points"), post: t("home.set_range.raw_detection_csv_updated") });
    },
    note,
    status,
    pulse,
    yoy,
    setYoy: (v) => {
      setYoySt(v);
      pulseKPI();
      if (v && range) {
        const p = prevRange(range);
        note(t("home.set_yo_y.year_over_year_on"), `${rangeTxt(range)} vs ${rangeTxt(p)}` + t("home.set_yo_y.indicators_daily_chart_and"));
      } else note(t("home.set_yo_y.year_over_year_off"), t("home.set_yo_y.indicators") + "=" + t("home.set_yo_y.vs_same_month_in"), "info");
    },
    hot,
    setHot,
    detBox,
    setDetBox,
    sensor,
    setSensor,
    vals,
    setVals,
    pop: pop ?? (worst ? { year: worst.year, month: worst.month } : null),
    setPop: (p) => {
      setPop(p);
      setDaySel(null);
    },
    daySel,
    setDaySel,
    selFire,
    setSelFire,
    cntSel,
    setCntSel,
    flyTo,
    fly: (lat, lon, z) => setFlyTo((f) => ({ lat, lon, z, k: (f?.k ?? 0) + 1 })),
    fires,
    alerts,
    units,
    mv,
    months,
    calPending: multi.length ? !multiDone : calQ.isPending,
    calError: calQ.error,
    partial,
    worst,
    outlook: outlook.data ?? null,
  };

  return (
    <div className="h-full min-h-0 min-w-0" data-page="home">
      <div className={cx("hm")} data-testid="home" data-ready={months.length && ag.sit ? "1" : "0"} data-aoi={aoi}>
        <HomeHead {...ctx} />
        <div className={cx("hm-lp")}>
          <HomeMap {...ctx} />
          <HomeSide {...ctx} />
        </div>
        <HomeBand {...ctx} />
      </div>
    </div>
  );
}

export type Note = { text: string; sub: string; kind: "info" | null; hot: { pre: string; post?: string } | null; k: number; off: boolean };

export type Ctx = {
  t: ReturnType<typeof useT>;
  tl: ReturnType<typeof useTl>;
  fmt: ReturnType<typeof useFmt>;
  tok: ReturnType<typeof useTok>["tok"];
  ramp: (t: number) => string;
  lang: string;
  iso3: string;
  kor: boolean;
  info: unknown;
  cname: string;
  today: string | null;
  nowMs: number | null;
  tz: string;
  season: string;
  role: string | null;
  regions: Region[];
  regName: (id: string) => string;
  region: string | null;
  setRegion: (r: string | null) => void;
  aoi: string;
  /** 고른 지역 상자(실서버 /aois bbox — 스냅숏 모드엔 없음) */
  aoiBbox: Bbox | null;
  scope: AoiScope;
  /** 지도 면(고른 범위 아래 단) */
  mapRegions: MapRegion[];
  /** 그린 관심 영역(사각형·다각형·반경) — 없으면 null */
  drawn: DrawnAoi | null;
  setDrawn: (a: DrawnAoi | null) => void;
  drawnKind: string;
  /** 그린 영역의 집계 지역(이름·지도 면 id · 근사 여부 · 시군구 단인지) */
  agg: { names: string[]; ids: string[]; fallback: boolean; sgg: boolean } | null;
  mapH: MapCanvasHandle | null;
  setMapH: (h: MapCanvasHandle | null) => void;
  aoiLabel: string;
  dataAoiName: string;
  range: Range | null;
  setRange: (r: Range, o?: { quiet?: boolean }) => void;
  /** 변경 확인 줄(목업 note) — hot 이면 지도 원시 점 수를 뒤에 붙인다 */
  note: (text: string, sub?: string, kind?: "info", hot?: { pre: string; post?: string }) => void;
  status: Note | null;
  /** 지표 머리 깜박임 횟수(바뀔 때마다 한 번) */
  pulse: number;
  yoy: boolean;
  setYoy: (v: boolean) => void;
  hot: { v: number; m: number } | null;
  setHot: (h: { v: number; m: number } | null) => void;
  detBox: Bbox | null;
  setDetBox: (b: Bbox | null) => void;
  sensor: Sensor;
  setSensor: (s: Sensor) => void;
  vals: boolean;
  setVals: (v: boolean) => void;
  pop: { year: number; month: number } | null;
  setPop: (p: { year: number; month: number }) => void;
  daySel: string | null;
  setDaySel: (d: string | null) => void;
  selFire: string | null;
  setSelFire: (id: string | null) => void;
  cntSel: "live" | "new" | "busy" | null;
  setCntSel: (k: "live" | "new" | "busy" | null) => void;
  flyTo: { lat: number; lon: number; z?: number; k: number } | null;
  fly: (lat: number, lon: number, z?: number) => void;
  fires: Fire[];
  alerts: Alert[];
  units: Unit[];
  mv: string | null;
  months: MonthRow[];
  calPending: boolean;
  calError: unknown;
  partial: MonthRow | null;
  worst: { year: number; month: number; v: number } | null;
  outlook: { method?: { targets?: string[] }; aoi?: { id: string; p?: (number | null)[] }[] } | null;
};

/** 시계: 원장 시각 + 실제 경과(목업 EM.nowMs) — 1초마다 */
export function useClock(nowMs: number | null) {
  const [t0] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;
  // eslint-disable-next-line react-hooks/purity -- 시계는 그릴 때마다 지금 시각을 읽는다
  return nowMs == null ? null : nowMs + (Date.now() - t0);
}
