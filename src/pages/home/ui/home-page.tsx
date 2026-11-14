"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useCountry, countryName } from "@/entities/country";
import { calendarQuery } from "@/entities/month-value";
import { methodQuery } from "@/entities/release";
import { useSession } from "@/entities/session";
import { useAgency, type Alert, type Fire, type Unit } from "@/shared/agency";
import { api, unwrap, qk } from "@/shared/api";
import { useT, useTl } from "@/shared/i18n";
import { prefs } from "@/shared/lib/prefs";
import { outlookQuery } from "../api/queries";
import { addDays, grid, partialOf, realAoi, SENSORS, worstMonth, type MonthRow, type Sensor } from "../model/home";
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

  /* 실제 데이터 — 지금 판 + 관심 영역 AOI */
  const mvQ = useQuery(methodQuery());
  const mv = mvQ.data?.method_version ?? null;
  const aoi = realAoi(iso3, kor ? region : null);
  const aoiQ = useQuery({
    queryKey: qk(`aois/${aoi}`, undefined, mv),
    queryFn: ({ signal }) => api.GET("/aois/{aoiId}", { params: { path: { aoiId: aoi } }, signal }).then(unwrap),
    enabled: !!mv,
    staleTime: Infinity,
  });
  const calQ = useQuery(calendarQuery(aoi, { start_year: 2001, end_year: 2026 }, mv));
  const months: MonthRow[] = useMemo(() => (typeof calQ.data === "object" && calQ.data ? (calQ.data.months as unknown as MonthRow[]) : []), [calQ.data]);
  const gH = useMemo(() => grid(months, "harmonized"), [months]);
  const worst = useMemo(() => worstMonth(gH), [gH]);
  const partial = useMemo(() => partialOf(months), [months]);
  const outlook = useQuery(outlookQuery());

  /* 나라가 바뀌면 고른 시군·달을 비운다 */
  const [isoSeen, setIsoSeen] = useState(iso3);
  if (isoSeen !== iso3) {
    setIsoSeen(iso3);
    setRegion(null);
    setPop(null);
  }

  /* 이름 */
  const cname = countryName(info, lang, iso3);
  const regName = (id: string) => tl("region", id, null, ag.regions.find((r) => r.id === id)?.name ?? id);
  const aoiLabel = kor ? (region ? regName(region) : tl("aoi", "gb-north", "label", t("home.aoi.default"))) : cname;
  const apiAoi = aoiQ.data as { name_ko?: string; name_en?: string | null } | undefined;
  const dataAoiName = apiAoi ? (lang === "ko" ? apiAoi.name_ko : apiAoi.name_en || apiAoi.name_ko) || aoi : aoi;

  /* 시나리오 원장(경북)만: 다른 나라는 비운다(목업 FIRES·feedAlerts) */
  const fires: Fire[] = kor ? ag.fires : [];
  const alerts: Alert[] = kor ? ag.alerts.filter((a) => a.targets.some((x) => x === "responder" || x === "firefighter")) : [];
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
    region,
    setRegion: (r) => {
      setRegion(r);
      setPop(null);
    },
    aoi,
    aoiLabel,
    dataAoiName,
    range,
    setRange,
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
    calPending: calQ.isPending,
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
  aoiLabel: string;
  dataAoiName: string;
  range: Range | null;
  setRange: (r: Range) => void;
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
