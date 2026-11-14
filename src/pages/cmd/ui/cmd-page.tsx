"use client";

import { Suspense, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { countryName, useCountry } from "@/entities/country";
import { useSession } from "@/entities/session";
import { rowWordKey, useAoiScope, type AoiScope } from "@/features/pick-aoi";
import { useAgency, type CommandQuery, type Fire } from "@/shared/agency";
import { PAGES } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { prefs } from "@/shared/lib/prefs";
import { PageFrame } from "@/widgets/page-frame";
import { ptsOf, useRealBoard, type PtsState } from "../api/real-board";
import { annual, readBoard, SENSORS, type Board, type HeatPt, type Query, type Sensor } from "../model/cmd";
import { CmdBand } from "./cmd-band";
import { CmdHourly } from "./cmd-hourly";
import { CmdLow } from "./cmd-low";
import { CmdTop } from "./cmd-top";
import { cx } from "./cx";
import { useTv } from "./use-ui";

/**
 * 지휘 통계(cmd) — 원천: 목업 pages/cmd.js · cmd.css.
 * 데이터(2026-11-15 사용자 지적 반영): 위성 통계(달 값·연간 추이·캘린더·이상 달·시간대·지도 점)는 실제 /api/v1 — 고른 지역(?aoi=, 기본 나라)의
 * 아래 단 전부(대한민국 → 17 시도, 시도 → 시군구, 다른 나라 → 1급). 대응 성과(첫 도착·자원 가동·탄 면적)만 AgencyPort 목(한국 시나리오).
 * 역할(지휘자)로 로그인하지 않았으면 PageFrame 이 잠긴 화면을 그린다.
 * 한국 밖: 오른쪽 칸이 감지 묶음(목업 EM.ui.detTable) — 점 수는 지도 점(고른 해)에서.
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

function CmdScreen() {
  const t = useT();
  const lang = useLocale();
  const agency = useAgency();
  const { iso3, info } = useCountry();
  const kor = iso3 === "KOR";
  const S = useAoiScope();

  /* 질의(목업 q): 지역·계절·지표·필터. 지표는 셸 상태(em.sensor)를 따른다 */
  /* 범위가 바뀌면 고른 행은 비운다(행 id 가 범위마다 다르다) */
  const [qs, setQs] = useState<{ scope: string; q: Query }>(() => {
    const s = (typeof window !== "undefined" ? prefs.get("sensor") : null) as Sensor | null;
    return { scope: S.scope, q: { regions: [], season: "all", sensor: s && SENSORS.includes(s) ? s : "harmonized", conf: 0, frp: 0, agri: false } };
  });
  const { scope: scopeId, focus, rows: sRows, nameOf } = S;
  const q: Query = useMemo(() => (qs.scope === scopeId ? qs.q : { ...qs.q, regions: focus ? [focus] : [] }), [qs, scopeId, focus]);
  const setQ = (fn: (p: Query) => Query) => setQs((st) => ({ scope: scopeId, q: fn(st.scope === scopeId ? st.q : { ...st.q, regions: focus ? [focus] : [] }) }));
  const [view, setView] = useState<View>({ year: 2025, month: 3, cum: false, sel: null });

  /* 위성 통계 = 실제 자료(고른 범위의 아래 단 전부). 대응 성과만 목(AgencyPort — 한국 시나리오) */
  const real = useRealBoard({ rows: S.ready ? S.rows : [], scope: S.scopeRec, sel: q.regions, kor, mapYear: view.cum ? null : view.year, names: S.nameOf });
  const respQ = useQuery({
    queryKey: ["agency", "command-stats", "response"],
    queryFn: () => agency.getCommandStats({ iso3: "KOR" } satisfies CommandQuery),
    enabled: kor,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  const firesQ = useQuery({ queryKey: ["agency", "fires"], queryFn: () => agency.listFires(), staleTime: Infinity });
  const unitsQ = useQuery({ queryKey: ["agency", "units"], queryFn: () => agency.listUnits(), staleTime: Infinity });
  const response = kor ? (readBoard(respQ.data)?.response ?? null) : null;
  const board: Board | null = useMemo(() => (real.board ? { ...real.board, response } : null), [real.board, response]);
  const fires: Fire[] = useMemo(() => firesQ.data ?? [], [firesQ.data]);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    sRows.forEach((r) => (m[r.aoi_id] = nameOf(r)));
    return m;
  }, [sRows, nameOf]);
  const cname = countryName(info, lang, iso3);
  const aoiLabel = S.nameOf(S.scope);
  const rw = t(rowWordKey(S.rows[0]?.level));
  const vars = { rw, rw1: rw, Rw1: rw, aoi: aoiLabel, tz: kor ? "KST" : "UTC" };
  const T_ = useTv(vars);
  const ann = useMemo(() => (board ? annual(board, q.regions.length ? q.regions : board.regions.map((r) => r.id)) : []), [board, q.regions]);
  const pts = useMemo(() => ptsOf(real.yearPts.pts, q), [real.yearPts.pts, q]);

  const setSensor = (s: Sensor) => {
    prefs.set("sensor", s);
    setQ((p) => ({ ...p, sensor: s }));
  };
  const ctx = { board, q, setQ, setSensor, view, setView, T_, names, kor, aoiLabel, cname, fires, units: unitsQ.data ?? [], ann, iso3, info, scope: S, pts, ptsState: real.yearPts.state, ptsTotal: real.yearPts.total };

  return (
    <div className="h-full min-h-0 min-w-0" data-page="cmd">
      <div className={cx("cm")} data-testid="cmd" data-ready={board ? "1" : "0"} data-aoi={S.scope}>
        <CmdTop {...ctx} />
        {board && real.hourlyState === "ok" && board.hourly.days.length ? (
          <CmdHourly board={board} q={q} T_={T_} kor={kor} src="sat" setSrc={() => undefined} occurOff />
        ) : board ? (
          <section className={cx("panel cm-hr")} aria-label={T_("cmd.ui.hourly_distribution")} data-hourly={real.hourlyState}>
            <div className={cx("panel-h cm-hr-h")}>
              <h2>{T_("cmd.ui.hourly_distribution")}</h2>
            </div>
            <p className={cx("cm-cap")} role="status">
              {real.hourlyState === "wide" ? T_("cmd.real.hr_wide", { a: aoiLabel }) : real.hourlyState === "pending" ? T_("cmd.real.loading") : t("shell.err.data_not_loaded")}
            </p>
          </section>
        ) : null}
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
  scope: AoiScope;
  pts: HeatPt[];
  ptsState: PtsState;
  ptsTotal: number;
};
