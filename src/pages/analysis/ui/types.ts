import type { TFn } from "@/shared/i18n";
import type { AoiRec, Comparison } from "../api/queries";
import type { Step } from "../model/analysis";
import type { CalendarData, CalView } from "../model/core";

/** /methods/current 중 이 화면이 읽는 몫(실서버 verdict_rule.baseline · 목 verdict_rule 없음 → 기본 2001–2025) */
export interface MethodDoc {
  method_version: string;
  data_version?: string;
  verdict_rule?: {
    id?: string;
    above_if_percentile_ge?: number;
    below_if_percentile_le?: number;
    uncertain_if_years_lt?: number;
    baseline?: { from?: number; to?: number };
    baseline_from?: number;
    baseline_to?: number;
  } | null;
  files?: { hotspots?: boolean } | null;
  value_sources?: { value_source: string; from: string | null; to: string | null }[] | null;
  meta?: { validation?: { model: string; scope: string; selected?: boolean; n?: number | null; metrics?: Record<string, number | null> }[] } | null;
}

type Tv = (k: string, v?: Record<string, string | number>) => string;
/** 세 단계가 같이 쓰는 화면 상태(주소가 정본: step·aoi·ym·view) */
export interface Ctx {
  t: TFn;
  T: Tv;
  W: Tv;
  lang: string;
  nf: (x: number | null | undefined) => string;
  device: string;
  aoi: string;
  rec: AoiRec | null;
  cal: CalendarData | null;
  c: Comparison | null;
  M: MethodDoc | null;
  view: CalView;
  y: number;
  m: number;
  base: { from: number; to: number };
  aoiName: (a: AoiRec | null) => string;
  writeQ: (patch: Record<string, string | null>, push?: boolean, country?: string) => void;
  go: (s: Step) => void;
  errWord: string | null;
  has: (id: string) => boolean;
}
