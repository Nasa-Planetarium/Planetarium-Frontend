"use client";

import { Suspense, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { boundaryQuery, countryName, useCountry } from "@/entities/country";
import { useSession } from "@/entities/session";
import { useAgency, type CommandQuery, type Fire } from "@/shared/agency";
import { PAGES } from "@/shared/config";
import { useT, useTl } from "@/shared/i18n";
import { prefs } from "@/shared/lib/prefs";
import { PageFrame } from "@/widgets/page-frame";
import { annual, readBoard, SENSORS, type Board, type Query, type Sensor } from "../model/cmd";
import { CmdBand } from "./cmd-band";
import { CmdHourly } from "./cmd-hourly";
import { CmdLow } from "./cmd-low";
import { CmdTop } from "./cmd-top";
import { cx } from "./cx";
import { useTv } from "./use-ui";

/**
 * 지휘 통계(cmd) — 원천: 목업 pages/cmd.js · cmd.css.
 * 데이터: AgencyPort(useAgency — getCommandStats(질의) · listFires)만. 목 생성기는 src/shared/mock/agency/cmd-board.ts.
 * 역할(지휘자)로 로그인하지 않았으면 PageFrame 이 잠긴 화면을 그린다.
 * 한국 밖: 오른쪽 칸이 감지 묶음(목업 EM.ui.detTable), 개수 띠가 감지 묶음 값 — 감지 점은 계약 /hotspots 이 아직 없어 「–」(피해 면적 화면과 같은 규칙).
 */
export function CmdPage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <CmdGate />
    </Suspense>
  );
}

function CmdGate() {
  /* 주소(?c=)를 읽는 훅을 여기서 불러 정적 내보내기에서 이 경계가 브라우저 그리기로 넘어가게 한다(피해 면적과 같음 — 서버 HTML 은 대기 골격, 세션은 브라우저에서) */
  useCountry();
  const { data: session, isPending } = useSession();
  const ok = !isPending && !!session && (PAGES.cmd.roles ?? []).includes(session.role);
  if (!ok) return <PageFrame page="cmd" />;
  return <CmdScreen />;
}

/** 화면 상태(목업 S) — 연도·달·누적·고른 이상 행 */
export interface View {
  year: number;
  month: number | null;
  cum: boolean;
  sel: string | null;
}

interface AdmRegion {
  id: string;
  name_en: string;
  name_ko?: string;
  c: [number, number];
  area_km2: number;
}

function CmdScreen() {
  const t = useT();
  const tl = useTl();
  const lang = useLocale();
  const agency = useAgency();
  const { iso3, info } = useCountry();
  const kor = iso3 === "KOR";
  const { data: boundary } = useQuery({ ...boundaryQuery(iso3), enabled: !kor });
  const adm = useMemo(() => ((boundary as { regions?: AdmRegion[] } | undefined)?.regions ?? []).slice(), [boundary]);

  /* 질의(목업 q): 지역·계절·지표·필터. 지표는 셸 상태(em.sensor)를 따른다 */
  /* 나라가 바뀌면 고른 지역은 비운다(지역 id 가 나라마다 다르다) */
  const [qs, setQs] = useState<{ iso: string; q: Query }>(() => {
    const s = (typeof window !== "undefined" ? prefs.get("sensor") : null) as Sensor | null;
    return { iso: iso3, q: { regions: [], season: "all", sensor: s && SENSORS.includes(s) ? s : "harmonized", conf: 0, frp: 0, agri: false } };
  });
  const q: Query = qs.iso === iso3 ? qs.q : { ...qs.q, regions: [] };
  const setQ = (fn: (p: Query) => Query) => setQs((st) => ({ iso: iso3, q: fn(st.iso === iso3 ? st.q : { ...st.q, regions: [] }) }));
  const [hrSrc, setHrSrc] = useState<"occur" | "sat">("occur");
  const [view, setView] = useState<View>({ year: 2025, month: 3, cum: false, sel: null });

  const cq: CommandQuery | null = kor
    ? { iso3, sel: q.regions, hourly_source: hrSrc }
    : adm.length
      ? { iso3, regions: adm.map((r) => ({ id: r.id, lat: r.c[1], lon: r.c[0], area_km2: r.area_km2 })), sel: q.regions, hourly_source: hrSrc }
      : null;
  const boardQ = useQuery({
    queryKey: ["agency", "command-stats", iso3, q.regions.slice().sort().join(","), hrSrc, adm.length],
    queryFn: () => agency.getCommandStats(cq ?? undefined),
    enabled: !!cq,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  const firesQ = useQuery({ queryKey: ["agency", "fires"], queryFn: () => agency.listFires(), staleTime: Infinity });
  const unitsQ = useQuery({ queryKey: ["agency", "units"], queryFn: () => agency.listUnits(), staleTime: Infinity });
  const b0 = readBoard(boardQ.data);
  const board: Board | null = b0 && b0.kor === kor ? b0 : null;
  const fires: Fire[] = useMemo(() => firesQ.data ?? [], [firesQ.data]);

  /* 지역 이름: 한국 = 원장 시군(사전 data.region.<id>), 밖 = 경계 파일 1급 이름 */
  const names = useMemo(() => {
    const m: Record<string, string> = {};
    if (board?.kor) board.regions.forEach((r) => (m[r.id] = tl("region", r.id, null, r.name)));
    else adm.forEach((r) => (m[r.id] = (lang === "ko" && r.name_ko) || r.name_en));
    return m;
  }, [board, adm, tl, lang]);
  const cname = countryName(info, lang, iso3);
  const aoiLabel = kor ? tl("aoi", "gb-north", "label", "경북 북부") : cname;
  const vars = { rw: t(kor ? "data.rw.kor" : "data.rw.adm1"), rw1: t(kor ? "cmd.w.rw1_kor" : "cmd.w.rw1_adm1"), Rw1: t(kor ? "cmd.w.Rw1_kor" : "cmd.w.Rw1_adm1"), aoi: aoiLabel, tz: kor ? "KST" : "UTC" };
  const T_ = useTv(vars);
  const ann = useMemo(() => (board ? annual(board, q.regions.length ? q.regions : board.regions.map((r) => r.id)) : []), [board, q.regions]);

  const setSensor = (s: Sensor) => {
    prefs.set("sensor", s);
    setQ((p) => ({ ...p, sensor: s }));
  };
  const ctx = { board, q, setQ, setSensor, view, setView, T_, names, kor, aoiLabel, cname, fires, units: unitsQ.data ?? [], ann, iso3, info };

  return (
    <div className="h-full min-h-0 min-w-0" data-page="cmd">
      <div className={cx("cm")} data-testid="cmd" data-ready={board ? "1" : "0"}>
        <CmdTop {...ctx} />
        {board ? <CmdHourly board={board} q={q} T_={T_} kor={kor} src={hrSrc} setSrc={setHrSrc} /> : null}
        {board ? <CmdBand {...ctx} board={board} /> : null}
        {board ? <CmdLow {...ctx} board={board} /> : null}
      </div>
    </div>
  );
}
export type Ctx = {
  board: Board | null;
  q: Query;
  setQ: (fn: (p: Query) => Query) => void;
  setSensor: (s: Sensor) => void;
  view: View;
  setView: (fn: (p: View) => View) => void;
  T_: (k: string, p?: Record<string, string | number>) => string;
  names: Record<string, string>;
  kor: boolean;
  aoiLabel: string;
  cname: string;
  fires: Fire[];
  units: { status: string }[];
  ann: ReturnType<typeof annual>;
  iso3: string;
  info: unknown;
};
