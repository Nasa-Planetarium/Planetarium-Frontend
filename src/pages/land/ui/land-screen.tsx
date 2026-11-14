"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { ArrowDown, Check, ChevronLeft, Download, Layers, Send, Table } from "lucide-react";
import { useSituation } from "@/entities/situation";
import { lastPass } from "@/entities/satellite-pass";
import { useAgency } from "@/shared/agency";
import { useT, useTl, type TFn } from "@/shared/i18n";
import { useDevice } from "@/shared/lib/use-device";
import { toast } from "@/shared/ui/toast";
import { downloadText } from "@/shared/ui/download";
import {
  allOf,
  firstPick,
  isFresh,
  isLandFire,
  isQueued,
  ledgerTs,
  lists,
  PITCH_HA,
  r1,
  readParcels,
  seedLog,
  stageAt,
  stageOf,
  when,
  type FireMeta,
  type LandFire,
  type LandUi,
  type Level,
  type LogRow,
  type ParcelRow,
  type TabKey,
} from "../model/land";
import { landStore, useLandUi } from "../model/store";
import { cx } from "./cx";
import { LandMap } from "./land-map";

const KST_MIN = 9 * 60;
const COVER = ["forest", "farm", "grass", "urban"] as const;
const COVER_LABEL = { forest: "land.g.forest", farm: "land.g.farmland", grass: "land.g.grassland", urban: "land.g.urban" } as const;
const OWN = ["national", "public", "private"] as const;
const OWN_LABEL = { national: "land.g.national_forest", public: "land.g.public_forest", private: "land.g.private_forest" } as const;
const STAGE_LABEL = ["land.g.pending", "land.g.field_check", "land.g.recovery_plan", "land.g.in_recovery"] as const;
const STAGE_ACT = ["land.g.request_field_check", "land.g.confirm_recovery_plan", "land.g.start_recovery"] as const;
const TABS: [TabKey, string][] = [
  ["s0", "land.g.pending"],
  ["s1", "land.g.field_check"],
  ["s2", "land.g.recovery_plan"],
  ["s3", "land.g.in_recovery"],
  ["hist", "land.g.past_fires"],
];
const DMG = ["", "land.g.low", "land.g.moderate", "land.g.severe"] as const;

/** 숫자 표기(목업 EM.fmt) */
function useFmt() {
  const t = useT();
  const lang = useLocale();
  return useMemo(() => {
    const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
    const num = (n: number, d = 0) => nf(d).format(n);
    const ha = (n: number) => (n >= 100 ? `${num(n)} ha` : `${num(n, 1)} ha`);
    const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
    return { num, ha, pct, t };
  }, [t, lang]);
}

const set = (fn: (s: LandUi) => LandUi) => landStore.set(fn);

export function LandScreen() {
  const t = useT();
  const tl = useTl();
  const F = useFmt();
  const agency = useAgency();
  const device = useDevice();
  const ui = useLandUi();
  const { data: situation } = useSituation();
  const firesQ = useQuery({ queryKey: ["agency", "fires"], queryFn: () => agency.listFires(), staleTime: Infinity });
  const burned = useMemo(() => (firesQ.data ?? []).filter(isLandFire), [firesQ.data]);
  const parcelQs = useQueries({
    queries: burned.map((f) => ({ queryKey: ["agency", "parcels", f.id], queryFn: () => agency.listParcels(f.id), staleTime: Infinity })),
  });
  const byFire: Record<string, { rows: ParcelRow[]; meta: FireMeta | null }> = {};
  burned.forEach((f, i) => {
    const d = parcelQs[i]?.data;
    if (d) byFire[f.id] = readParcels(d);
  });
  const metas: Record<string, FireMeta> = {};
  Object.entries(byFire).forEach(([id, v]) => {
    if (v.meta) metas[id] = v.meta;
  });
  const ready = burned.length > 0 && burned.every((f) => byFire[f.id]) && !!situation;
  const nowTs = situation ? ledgerTs(situation.now_ms, KST_MIN) : "2026-11-11 14:20";
  const today = nowTs.slice(0, 10);
  const L = lists(burned, metas, ui);
  const sel = burned.find((f) => f.id === ui.sel) ?? null;

  /* 처음 선택(목업 start): 화면이 스스로 고른 것이라 읽음 처리·판 이동 없음 */
  useEffect(() => {
    if (!ready || ui.sel) return;
    const id = firstPick(L);
    if (id) set((s) => ({ ...s, sel: id }));
  }, [ready, ui.sel, L]);

  const fname = (f: LandFire) => tl("fire", f.id, "name", f.name);
  const placeName = (p: string) => {
    const k = `land.place.${p}`;
    const v = t(k);
    return v === k ? p : v;
  };
  const regionName = (rid: string, meta: FireMeta | undefined) => tl("region", rid, null, meta?.region_names[rid] ?? rid);
  const addrPlace = (p: ParcelRow, meta: FireMeta | undefined) => (p.place_rid ? t("land.place.area", { r: regionName(p.place_rid, meta) }) : placeName(p.place));
  const addrOf = (p: ParcelRow, meta: FireMeta | undefined) => `${addrPlace(p, meta)} ${p.mtn ? `${t("land.lot.mtn")} ` : ""}${p.lot}`;
  const logsOf = (f: LandFire): LogRow[] => {
    const meta = metas[f.id];
    const seed = seedLog(f, meta?.queued ? 0 : (meta?.stage ?? 0), nowTs);
    return [...seed, ...(ui.logs[f.id] ?? [])];
  };
  const logText = (l: LogRow) => {
    const params = l.params ? { ...l.params } : undefined;
    if (params && typeof params.stage === "number") params.stage = t(STAGE_LABEL[params.stage] ?? STAGE_LABEL[0]);
    return t(l.key, params);
  };
  const addLog = (s: LandUi, id: string, row: Omit<LogRow, "at" | "ts" | "by">): LandUi => ({
    ...s,
    logs: { ...s.logs, [id]: [...(s.logs[id] ?? []), { at: nowTs.slice(5, 16), ts: nowTs, by: "role", ...row }] },
  });
  const checkedOf = (f: LandFire) => {
    const c = ui.checked[f.id];
    if (c) return c;
    return (byFire[f.id]?.rows ?? []).filter((p) => p.prio === 1).map((p) => p.id);
  };
  const rowsOf = (f: LandFire) => (byFire[f.id]?.rows ?? []).map((p) => ({ ...p, prio: ui.prio[p.id] ?? p.prio }));

  /* 사람이 고름: 읽음(새로 들어옴 해제) + 한 자리 골격은 상세로 */
  const select = (id: string) => {
    set((s) => ({ ...s, sel: id, settled: s.settled.includes(id) ? s.settled : [...s.settled, id], pane: "detail" }));
  };

  const requestCheck = (f: LandFire) => {
    const rows = rowsOf(f);
    const chk = checkedOf(f);
    const picked = rows.filter((p) => chk.includes(p.id));
    if (!picked.length) {
      toast({ text: t("land.req.none"), sub: t("land.req.none_sub"), icon: "alert", ms: 3500 });
      return;
    }
    const p1 = picked.filter((p) => p.prio === 1).length;
    const area = picked.reduce((s, p) => s + p.area, 0);
    const queued = isQueued(f, metas[f.id], ui);
    set((s0) => {
      let s: LandUi = { ...s0, req: [...s0.req, ...picked.map((p) => p.id)], settled: s0.settled.includes(f.id) ? s0.settled : [...s0.settled, f.id], checked: { ...s0.checked, [f.id]: [] } };
      if (queued) {
        s = { ...s, dequeued: [...s.dequeued, f.id], stage: { ...s.stage, [f.id]: 1 } };
        s = addLog(s, f.id, { key: "land.log.req", params: { n: F.num(picked.length), ha: F.ha(r1(area)), p1: F.num(p1) }, stage: 1 });
      } else s = addLog(s, f.id, { key: "land.log.req_more", params: { n: F.num(picked.length) } });
      if (s.pane === "parcels") s = { ...s, pane: "detail" };
      return s;
    });
    toast({ text: <b>{t("land.req.sent")}</b>, sub: t("land.req.sent_sub", { name: fname(f), n: F.num(picked.length), ha: F.ha(r1(area)) }), kind: "ok" });
  };
  const advance = (f: LandFire) => {
    const st = stageOf(f, metas[f.id], ui);
    if (st === 0) return requestCheck(f);
    const nx = st + 1;
    set((s) => addLog({ ...s, stage: { ...s.stage, [f.id]: nx } }, f.id, { key: "land.log.moved", params: { stage: nx }, stage: nx }));
    toast({ text: <b>{fname(f)}</b>, sub: t("land.log.moved", { stage: t(STAGE_LABEL[nx] ?? STAGE_LABEL[3]) }), kind: "ok", ms: 3500 });
  };

  /* 폰 판 이동 규칙(목업 renderPane) */
  const phone = device === "phone";
  let pane = ui.pane;
  if (pane === "parcels" && !phone) pane = "detail";
  if (pane === "detail" && !sel) pane = "list";
  const back: [LandUi["pane"], string] | null = pane === "detail" ? ["list", t("land.render_pane.list")] : pane === "parcels" ? ["detail", t("land.render_pane.details")] : null;

  if (!ready) return <div className={cx("ld")} data-pane="list" aria-busy="true" />;

  const counts = (["s0", "s1", "s2", "s3"] as const).map((k, i) => ({
    key: k,
    label: t(STAGE_LABEL[i] ?? STAGE_LABEL[0]),
    value: L[k].length,
    lv: k === "s0" ? L.s0.reduce((m, x) => Math.max(m, x.level || 0), 0) : 0,
  }));
  const areaTxt = sel ? F.ha(sel.burned_ha) : "";
  const placeTxt = sel && !sel.by_region ? placeName(String(sel.name).split(" ").slice(1).join(" ")) : "";

  return (
    <div className={cx("ld")} data-pane={pane} data-testid="land">
      {/* 머리(r8 콘솔): 화면 이름 + 범위 + 복구 단계 개수 띠(칸 = 목록 거르기) */}
      <div className={cx("ld-top")}>
        <header className={cx("pghd")}>
          <div className={cx("ph-1")}>
            <h1>{t("land.head.name")}</h1>
            <span className={cx("ph-scope")}>{t("land.head.scope")}</span>
          </div>
          <div className={cx("cntbar")} role="group" aria-label={t("shell.counts.aria")}>
            {counts.map((c) => (
              <button
                key={c.key}
                type="button"
                className={cx("cb")}
                aria-pressed={ui.cnt === c.key}
                data-cnt={c.key}
                onClick={() => set((s) => ({ ...s, cnt: s.cnt === c.key ? null : c.key, pane: s.pane !== "list" && phone ? "list" : s.pane }))}
              >
                <span className={cx("cb-k")}>{c.label}</span>
                <span className={cx("cb-vw")}>
                  {c.lv && c.value > 0 ? <i className={cx("cb-dot")} style={{ ["--c" as string]: `var(--alert-${c.lv})` }} aria-hidden="true" /> : null}
                  <b className={cx("cb-v")}>{c.value}</b>
                </span>
              </button>
            ))}
          </div>
        </header>
      </div>
      <nav className={cx("ld-pane")} aria-label={t("land.pick_place.back")} hidden={!back}>
        {back ? (
          <button type="button" className={cx("btn ghost ld-back")} onClick={() => set((s) => ({ ...s, pane: back[0] }))}>
            <ChevronLeft aria-hidden="true" />
            {back[1]}
          </button>
        ) : null}
      </nav>
      <section className={cx("ld-center")}>
        <LandMap
          className="ld-map"
          fires={allOf(L)}
          metas={metas}
          selId={ui.sel}
          layers={ui.layers}
          onSelect={(id) => select(id)}
          onLayer={(k, v) => set((s) => ({ ...s, layers: { ...s.layers, [k]: v } }))}
          areaLabel={areaTxt}
          placeLabel={placeTxt}
          pngName={`burn_${sel ? sel.id : "map"}.png`}
        />
        <div className={cx("panel ld-parcels")}>
          {sel ? (
            <Parcels
              f={sel}
              meta={metas[sel.id]}
              rows={rowsOf(sel)}
              checked={checkedOf(sel)}
              req={ui.req}
              stage={stageOf(sel, metas[sel.id], ui)}
              addrPlace={(p) => addrPlace(p, metas[sel.id])}
              addrOf={(p) => addrOf(p, metas[sel.id])}
              onCheck={(ids) => set((s) => ({ ...s, checked: { ...s.checked, [sel.id]: ids } }))}
              onPrio={(p, n) =>
                set((s) => addLog({ ...s, prio: { ...s.prio, [p.id]: n } }, sel.id, { key: "land.log.prio", params: { addr: addrOf(p, metas[sel.id]), n } }))
              }
              onReq={() => requestCheck(sel)}
            />
          ) : (
            <div className={cx("ld-empty")}>
              <Table aria-hidden="true" />
              <b>{t("land.render_parcels.no_parcels")}</b>
            </div>
          )}
        </div>
      </section>
      <div className={cx("ld-side")}>
        <aside className={cx("panel ld-list")} aria-label={t("land.pick_place.assessment_list")}>
          <div className={cx("ld-items")}>
            {TABS.map(([id, labelKey]) => {
              const items = L[id];
              const label = t(labelKey);
              if (ui.cnt && ui.cnt !== id) return null;
              if (!items.length && id !== "s0" && ui.cnt !== id) return null;
              return (
                <section key={id} className={cx("ld-grp")} aria-label={label}>
                  <h2 className={cx("ld-gh")}>{label}</h2>
                  {items.length ? (
                    items.map((f) => {
                      const fresh = isFresh(f, metas[f.id], ui);
                      const ts = f.contained_at ?? f.detected_at;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={cx("lrow", ui.sel === f.id && "is-sel")}
                          aria-pressed={ui.sel === f.id}
                          data-id={f.id}
                          data-fresh={fresh ? "1" : undefined}
                          onClick={() => select(f.id)}
                        >
                          <span className={cx("lr-dot")} style={{ ["--c" as string]: `var(--alert-${f.level || 1})` }} aria-hidden="true" />
                          <span className={cx("lr-t")}>{fname(f)}</span>
                          <span className={cx("lr-time")}>{f.historical ? ts.slice(0, 10) : ts.slice(5, 16)}</span>
                          <span className={cx("lr-m")}>
                            {t("land.render_list.burned")} <b>{F.ha(f.burned_ha)}</b>
                          </span>
                          {fresh ? <span className={cx("lr-s")}>{t("land.render_list.new")}</span> : null}
                        </button>
                      );
                    })
                  ) : (
                    <p className={cx("ld-none")}>{t("land.list.none", { stage: label })}</p>
                  )}
                </section>
              );
            })}
          </div>
        </aside>
        <aside className={cx("panel ld-detail")} aria-label={t("land.pick_place.selected_fire_details")}>
          {sel ? (
            <Detail
              f={sel}
              meta={metas[sel.id]}
              stage={stageOf(sel, metas[sel.id], ui)}
              logs={logsOf(sel)}
              nParcels={(byFire[sel.id]?.rows ?? []).length}
              today={today}
              fname={fname}
              cause={tl("fire", sel.id, "cause", String(sel.cause ?? ""))}
              logText={logText}
              regionName={(rid) => regionName(rid, metas[sel.id])}
              onNext={() => advance(sel)}
              onParcels={() => set((s) => ({ ...s, pane: "parcels" }))}
            />
          ) : (
            <div className={cx("ld-empty tall")}>
              <Layers aria-hidden="true" />
              <b>{t("land.render_detail.no_fire_selected")}</b>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ── 상세(목업 renderDetail) ── */
function ShareTable({ label, items, tot, F }: { label: string; items: { label: string; v: number }[]; tot: number; F: ReturnType<typeof useFmt> }) {
  const mx = items.reduce((m, it) => Math.max(m, it.v), 0);
  return (
    <table className={cx("tbl ld-share")} aria-label={label}>
      <tbody>
        {items.map((it) => (
          <tr key={it.label} className={cx(!it.v && "zero")}>
            <td>{it.label}</td>
            <td className={cx("r num rowbar")} style={{ ["--w" as string]: mx ? it.v / mx : 0 }}>
              {F.ha(r1(it.v))}
            </td>
            <td className={cx("r num ld-pc")}>{tot ? Math.round((it.v / tot) * 100) : 0}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Detail(p: {
  f: LandFire;
  meta: FireMeta | undefined;
  stage: number;
  logs: LogRow[];
  nParcels: number;
  today: string;
  fname: (f: LandFire) => string;
  cause: string;
  logText: (l: LogRow) => string;
  regionName: (rid: string) => string;
  onNext: () => void;
  onParcels: () => void;
}) {
  const F = useFmt();
  const t: TFn = F.t;
  const { f, stage: st, logs } = p;
  const pitches = f.burned_ha / PITCH_HA;
  const lc = f.landcover ?? {};
  const ow = f.ownership ?? {};
  const lcT = COVER.reduce((s, k) => s + (lc[k] ?? 0), 0);
  const owT = OWN.reduce((s, k) => s + (ow[k] ?? 0), 0);
  const next = st >= 1 && st < 3 ? t(STAGE_ACT[st] ?? STAGE_ACT[0]) : null;
  const byRegion = f.by_region;
  return (
    <>
      <div className={cx("ld-d-head")}>
        <div className={cx("ld-d-chips")}>
          <span className={cx("lv")} style={{ ["--c" as string]: `var(--alert-${f.level || 1})` }}>
            {t(`shell.level.${f.level || 1}`)}
          </span>
          {f.historical ? <span className={cx("ld-est")}>{t("land.stage_at.reconstructed")}</span> : null}
        </div>
        <h2>{p.fname(f)}</h2>
        <dl className={cx("ld-d-meta")}>
          <div>
            <dt>{t("land.stage_at.detected")}</dt>
            <dd className={cx("num")}>
              {when(f.detected_at, p.today)}
              <DetectPass f={f} />
            </dd>
          </div>
          <div>
            <dt>{t("land.stage_at.contained")}</dt>
            <dd className={cx(f.contained_at && "num")}>{f.contained_at ? when(f.contained_at, p.today) : t("land.stage_at.no_record")}</dd>
          </div>
          <div>
            <dt>{t("land.stage_at.cause")}</dt>
            <dd>{p.cause}</dd>
          </div>
        </dl>
      </div>
      <div className={cx("ld-hero")}>
        <span className={cx("ld-hero-k")}>{t("land.head.name")}</span>
        <p className={cx("ld-big")}>
          <b className={cx("num")}>{f.burned_ha >= 100 ? F.num(f.burned_ha) : F.num(f.burned_ha, 1)}</b>
          <span>ha</span>
        </p>
        <span className={cx("ld-hero-d")}>{t("land.hero.pitches", { n: F.num(pitches, pitches < 10 ? 1 : 0) })}</span>
      </div>
      <section className={cx("ld-sec")}>
        <h3>{t("land.stage_at.recovery_stage")}</h3>
        <ol className={cx("stages")} aria-label={t("land.stage_at.recovery_stage")}>
          {STAGE_LABEL.map((k, i) => {
            const at = i <= st ? stageAt(logs, i) : "";
            const label = t(k);
            return (
              <li key={k} className={cx(i < st ? "is-done" : i === st ? "is-now" : "")} aria-current={i === st ? "step" : undefined}>
                {i < st ? (
                  <span className={cx("sg-ck")}>
                    <Check aria-hidden="true" />
                    {label}
                  </span>
                ) : (
                  label
                )}
                {at ? <span className={cx("sg-t")}>{at}</span> : null}
              </li>
            );
          })}
        </ol>
        {next ? (
          <div className={cx("stages-next")}>
            <button type="button" className={cx("btn primary")} data-next onClick={p.onNext}>
              {next}
            </button>
          </div>
        ) : null}
        <button type="button" className={cx("btn ld-go")} data-go="parcels" onClick={p.onParcels}>
          {t("land.detail.view_parcels", { n: F.num(p.nParcels) })}
        </button>
      </section>
      <section className={cx("ld-sec")}>
        <h3>{t("land.stage_at.area_by_land_cover")}</h3>
        <ShareTable label={t("land.stage_at.burned_area_by_land")} items={COVER.map((k) => ({ label: t(COVER_LABEL[k]), v: lc[k] ?? 0 }))} tot={lcT} F={F} />
      </section>
      <section className={cx("ld-sec")}>
        <h3>{t("land.stage_at.ownership")}</h3>
        <ShareTable label={t("land.stage_at.burned_area_by_ownership")} items={OWN.map((k) => ({ label: t(OWN_LABEL[k]), v: ow[k] ?? 0 }))} tot={owT} F={F} />
      </section>
      {byRegion ? (
        <section className={cx("ld-sec")}>
          <h3>{t("land.stage_at.area_by_district")}</h3>
          <ShareTable
            label={t("land.stage_at.burned_area_by_district")}
            items={Object.keys(byRegion)
              .sort((a, b) => (byRegion[b] ?? 0) - (byRegion[a] ?? 0))
              .map((k) => ({ label: p.regionName(k), v: byRegion[k] ?? 0 }))}
            tot={f.burned_ha}
            F={F}
          />
        </section>
      ) : null}
      <section className={cx("ld-sec")}>
        <h3>{t("land.stage_at.activity_log")}</h3>
        <ol className={cx("hist")}>
          {[...logs].reverse().map((l, i) => (
            <li key={`${l.ts}-${i}`}>
              <span className={cx("hi-t")}>{l.at}</span>
              <span>{p.logText(l)}</span>
              <span className={cx("hi-w")}>{l.by === "system" ? t("land.log.system") : t("shell.role.land.label")}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

/* ── 필지 표(목업 renderParcels) ── */
type SortCol = "area" | "dmg" | "prio";
function Parcels(p: {
  f: LandFire;
  meta: FireMeta | undefined;
  rows: ParcelRow[];
  checked: string[];
  req: string[];
  stage: number;
  addrPlace: (r: ParcelRow) => string;
  addrOf: (r: ParcelRow) => string;
  onCheck: (ids: string[]) => void;
  onPrio: (r: ParcelRow, n: Level) => void;
  onReq: () => void;
}) {
  const F = useFmt();
  const t = F.t;
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 } | null>(null);
  const big = !!p.meta?.big;
  const n = p.checked.length;
  const sum = Math.round(p.rows.reduce((s, r) => s + r.area * 100, 0)) / 100;
  const maxA = p.rows.reduce((m, r) => Math.max(m, r.area), 0);
  const rows = sort ? [...p.rows].sort((a, b) => (a[sort.col] - b[sort.col]) * sort.dir) : p.rows;
  const sortable = p.rows.length > 10;
  const csv = () => {
    const head = [t("land.export_parcels.fire_id"), t("land.render_parcels.lot"), t("land.render_parcels.land_use"), t("land.stage_at.ownership"), t("land.export_parcels.burned_area_ha"), t("land.export_parcels.damage"), t("land.render_parcels.recovery_priority"), t("land.g.request_field_check"), t("land.export_parcels.estimate"), t("land.export_parcels.method")];
    const q = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head, ...p.rows.map((r) => [p.f.id, p.addrOf(r), t(`land.jimok.${r.jimok}`), t(`land.owner.${r.owner}`), r.area, t(DMG[r.dmg]), r.prio, p.req.includes(r.id) ? "Y" : "", "Y", t("land.export_parcels.satellite_burn_extent_x")])];
    downloadText(`parcels_${p.f.id}.csv`, lines.map((l) => l.map(q).join(",")).join("\n"));
  };
  const th = (col: SortCol, children: ReactNode, cls?: string) =>
    sortable ? (
      <th className={cx(cls)} aria-sort={sort?.col === col ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button type="button" className={cx("th-sort")} onClick={() => setSort((s) => ({ col, dir: s?.col === col && s.dir === -1 ? 1 : -1 }))}>
          {children}
          <ArrowDown aria-hidden="true" />
        </button>
      </th>
    ) : (
      <th className={cx(cls)}>{children}</th>
    );
  return (
    <>
      <div className={cx("panel-h ld-ph")}>
        <h3>{big ? t("land.parcels.big_n", { n: F.num(p.rows.length) }) : t("land.parcels.n", { n: F.num(p.rows.length) })}</h3>
        {big && p.meta ? (
          <p className={cx("ld-ph-n")}>
            {t("land.parcels.big_sum", { total: F.num(p.meta.total), sum: F.ha(r1(sum)), pct: F.pct(sum / p.f.burned_ha, 1) })}
          </p>
        ) : null}
        <div className={cx("ld-ph-a")}>
          <span className={cx("muted")}>{n ? t("land.parcels.picked", { n: F.num(n) }) : t("land.req.none")}</span>
          <button type="button" className={cx("btn sm")} data-csv onClick={csv}>
            <Download aria-hidden="true" />
            CSV
          </button>
          <button type="button" className={cx("btn sm", p.stage === 0 && "primary")} data-req disabled={!n} onClick={p.onReq}>
            {t("land.g.request_field_check")}
          </button>
        </div>
      </div>
      <div className={cx("tbl-wrap ld-tw")}>
        <table className={cx("tbl ld-tbl")}>
          <thead>
            <tr>
              <th className={cx("ld-cb")} data-lbl={t("land.parcels.pick_all_short")}>
                <label className={cx("ld-cbx")}>
                  <input
                    type="checkbox"
                    aria-label={t("land.render_parcels.select_all_parcels")}
                    checked={n === p.rows.length && n > 0}
                    ref={(el) => {
                      if (el) el.indeterminate = n > 0 && n < p.rows.length;
                    }}
                    onChange={(e) => p.onCheck(e.target.checked ? p.rows.map((r) => r.id) : [])}
                  />
                </label>
              </th>
              <th>{t("land.render_parcels.lot")}</th>
              <th className={cx("ld-c-j")}>{t("land.render_parcels.land_use")}</th>
              <th className={cx("ld-c-o")}>{t("land.render_parcels.owner")}</th>
              {th(
                "area",
                <>
                  {t("land.render_list.burned")}
                  <span className={cx("ld-c-u")}>(ha)</span>
                </>,
                "r",
              )}
              {th("dmg", t("land.render_parcels.damage"))}
              {th(
                "prio",
                <>
                  <span className={cx("ld-c-l")}>{t("land.render_parcels.recovery")}</span>
                  {t("land.render_parcels.priority")}
                </>,
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = p.checked.includes(r.id);
              const jm = t(`land.jimok.${r.jimok}`);
              const ow = t(`land.owner.${r.owner}`);
              return (
                <tr key={r.id} className={cx(on && "pick")} data-p={r.id}>
                  <td className={cx("ld-cb")}>
                    <label className={cx("ld-cbx")}>
                      <input
                        type="checkbox"
                        checked={on}
                        aria-label={t("land.parcels.pick_one", { addr: p.addrOf(r) })}
                        onChange={(e) => p.onCheck(e.target.checked ? [...p.checked, r.id] : p.checked.filter((x) => x !== r.id))}
                      />
                    </label>
                  </td>
                  <td className={cx("ld-addr")}>
                    <span className={cx("ld-addr-t")}>
                      {p.addrPlace(r)}{" "}
                      <span className={cx("ld-lot")}>
                        {r.mtn ? `${t("land.lot.mtn")} ` : ""}
                        {r.lot}
                      </span>
                      {p.req.includes(r.id) ? (
                        <span className={cx("ld-req")} title={t("land.render_parcels.field_check_requested")} aria-label={t("land.render_parcels.field_check_requested")}>
                          <Send aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                    <span className={cx("ld-addr-s")}>
                      {jm}({ow})
                    </span>
                  </td>
                  <td className={cx("ld-c-j")}>{jm}</td>
                  <td className={cx("ld-c-o")}>{ow}</td>
                  <td className={cx("r num rowbar")} style={{ ["--w" as string]: maxA ? r.area / maxA : 0 }}>
                    {F.num(r.area, big ? 1 : 2)}
                    <span className={cx("ld-c-ha")}> ha</span>
                  </td>
                  <td className={cx("ld-c-d")}>
                    <span className={cx("ld-dmg", `d${r.dmg}`)}>{t(DMG[r.dmg])}</span>
                  </td>
                  <td className={cx("ld-c-p")}>
                    <select className={cx("select ld-prio", `p${r.prio}`)} aria-label={t("land.render_parcels.recovery_priority")} value={r.prio} onChange={(e) => p.onPrio(r, Number(e.target.value) as Level)}>
                      {[1, 2, 3].map((k) => (
                        <option key={k} value={k}>
                          {t("land.prio.n", { n: k })}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 감지 시각 옆 직전 위성 통과(목업 land.js passOf · EM.ui.passTick): 감지 앞 60분 안의 통과만. 기준점 = 그 불 위치. 궤도 창 밖이면 없음 */
const PASS_MAX_MIN = 60;
function DetectPass({ f }: { f: LandFire }) {
  const t = useT();
  const ms = Date.parse(`${f.detected_at.slice(0, 10)}T${f.detected_at.slice(11, 16) || "00:00"}:00+09:00`);
  const p = useMemo(() => (Number.isFinite(ms) ? lastPass(ms, [f.lat, f.lon]) : null), [ms, f.lat, f.lon]);
  if (!p || ms - p.ms < 0 || ms - p.ms > PASS_MAX_MIN * 60000) return null;
  const hm = new Date(p.ms + 9 * 3600e3).toISOString().slice(11, 16);
  return (
    <span className={cx("ld-pass")}>
      {" "}
      <span className={cx("ptick")} title={t("shell.pass.title", { sat: `${p.sat} ${p.sensor}`, t: hm })} data-pass="">
        <i className={cx(p.sensor === "MODIS" ? "m" : "v")} aria-hidden="true" />
        <span className={cx("mono")}>{p.sat}</span> <span className={cx("mono")}>{hm}</span> {t("shell.pass.word")}
      </span>
    </span>
  );
}
