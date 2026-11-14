"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog as D } from "radix-ui";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { CONTINENTS, continentOf, countryName, fold, type CountryInfo } from "@/entities/country";
import { useT } from "@/shared/i18n";
import { iso3OfAoi, nameEn, parseLatLon, type AoiRec } from "../model/aoi";
import { cx } from "./cx";

/**
 * 지역 고르기(목업 셸 EM.openAoiPicker): 전 세계 → 나라(대륙 묶음) → 1급(한국 = 시도) → 시군구(캘린더 화면 aoi-picker 와 같은 동작 — 상황판·지휘 통계·예측 분석이 함께 쓴다).
 * 검색 = 이름 ko·en · aoi_id · ISO3, 위경도(「36.35, 128.70」 · 「36.35N 128.70E」)면 그 점을 품은 지역 후보(좁은 단위부터).
 * 위경도 후보: 계약 /aois 에 lat·lon 이 없어(실서버도 무시함 — 잼) 목록의 bbox 와 나라 색인 bbox 로 고른다 — 경계 밖 이웃이 섞일 수 있다(남은 차이).
 * 키보드: ↑↓ · Enter(고르기/들어가기) · →(들어가기) · ←·Backspace(빈 검색) 위 단 · Esc 닫기. 포커스 가두기는 Radix Dialog.
 */
interface Row {
  a: AoiRec;
  drill: boolean;
  whole: boolean;
  pt?: { lat: number; lon: number };
}
type Item = { kind: "sec"; title: string; n: number | string } | { kind: "row"; r: Row } | { kind: "none"; text: string };

export function AoiPicker({
  open,
  onOpenChange,
  anchor,
  phone,
  aois,
  countries,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  anchor: { left: number; bottom: number } | null;
  phone: boolean;
  aois: AoiRec[];
  countries: CountryInfo[];
  current: string;
  onPick: (id: string, pt?: { lat: number; lon: number }) => void;
}) {
  if (!open) return null;
  return <PickerOpen {...{ onOpenChange, anchor, phone, aois, countries, current, onPick }} />;
}

function PickerOpen({ onOpenChange, anchor, phone, aois, countries, current, onPick }: Omit<Parameters<typeof AoiPicker>[0], "open">) {
  const t = useT();
  const lang = useLocale();
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(aois.map((a) => [a.aoi_id, a] as const)), [aois]);
  const cidx = useMemo(() => new Map(countries.map((c) => [c.iso3, c] as const)), [countries]);
  const kids = useMemo(() => {
    const m = new Map<string, AoiRec[]>();
    aois.forEach((a) => {
      const pid = a.level === "group" ? "KR" : a.parent_id;
      if (pid && byId.has(pid)) m.set(pid, [...(m.get(pid) ?? []), a]);
    });
    return m;
  }, [aois, byId]);
  const [path, setPath] = useState<string[]>(() => {
    const ca = byId.get(current);
    /* 위 단 사슬(나라부터) — 지금 지역에 아래 단이 있으면 그 안까지 연다 */
    const out: string[] = [];
    let p = ca?.parent_id ?? null;
    for (let i = 0; p && byId.has(p) && i < 6; i++) {
      const a = byId.get(p) as AoiRec;
      if (a.level === "continent" || a.level === "world") break;
      out.unshift(p);
      p = a.parent_id;
    }
    if (ca && (kids.get(current) ?? []).some((k) => k.level !== "continent")) out.push(current);
    return out;
  });
  const listRef = useRef<HTMLDivElement>(null);
  const [pos] = useState(() => (!phone && anchor ? { left: Math.max(8, Math.min(window.innerWidth - 368, anchor.left)), top: Math.round(anchor.bottom + 4) } : null));

  const iso3 = (a: AoiRec) => iso3OfAoi(a.aoi_id);
  const nameOf = (a: AoiRec): { t: string; l: string } => {
    if (a.aoi_id === "WORLD") return { t: t("shell.aoi.world"), l: "" };
    const ci = a.level === "country" && iso3(a) ? cidx.get(iso3(a) as string) : undefined;
    if (ci) return { t: countryName(ci, lang, a.name_ko ?? a.aoi_id), l: "" };
    if (lang !== "ko" && nameEn(a)) return { t: nameEn(a) as string, l: "" };
    if (lang !== "ko") return { t: a.name_ko || a.aoi_id, l: "ko" };
    return { t: a.name_ko || a.name_en || a.aoi_id, l: "" };
  };
  const codeOf = (a: AoiRec) =>
    a.level === "world" ? "WLD" : a.level === "country" ? (iso3(a) ?? "") : /^SIDO_/.test(a.aoi_id) ? a.aoi_id.slice(5) : /^SGG_/.test(a.aoi_id) ? a.aoi_id.slice(4) : a.level === "group" ? "∑" : "";
  const hasKids = (a: AoiRec) => (kids.get(a.aoi_id) ?? []).some((k) => k.level !== "continent");
  const coll = lang === "ko" ? "ko-KR" : "en-US";
  const byName = (x: AoiRec, y: AoiRec) => nameOf(x).t.localeCompare(nameOf(y).t, coll);

  const ll = parseLatLon(q);
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    const add = (arr: AoiRec[], drillable: boolean, whole = false, pt?: { lat: number; lon: number }) =>
      arr.forEach((a) => out.push({ kind: "row", r: { a, drill: drillable && !whole && hasKids(a), whole, pt } }));
    const f = fold(q.trim());
    if (ll) {
      /* 위경도: bbox 가 그 점을 품은 지역(좁은 단위부터) + 나라 색인 bbox */
      const inB = (b: number[] | null | undefined) => !!b && b.length === 4 && ll.lon >= (b[0] as number) && ll.lon <= (b[2] as number) && ll.lat >= (b[1] as number) && ll.lat <= (b[3] as number);
      const area = (b: number[]) => ((b[2] as number) - (b[0] as number)) * ((b[3] as number) - (b[1] as number));
      const hits = new Map<string, number>();
      aois.forEach((a) => {
        if (a.level === "world" || a.level === "continent") return;
        if (inB(a.bbox)) hits.set(a.aoi_id, area(a.bbox as number[]));
        else if (a.level === "country") {
          const c = iso3(a) ? cidx.get(iso3(a) as string) : undefined;
          if (c && inB(c.bbox)) hits.set(a.aoi_id, area(c.bbox));
        }
      });
      const arr = [...hits.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => byId.get(id) as AoiRec);
      out.push({ kind: "sec", title: t("shell.aoi.pt", { lat: ll.lat.toFixed(4), lon: ll.lon.toFixed(4) }), n: arr.length });
      if (arr.length) add(arr, false, false, ll);
      else out.push({ kind: "none", text: t("shell.aoi.pt_none") });
      return out;
    }
    if (f) {
      const hit = aois
        .filter((a) => a.level !== "continent" && !a.hidden && [a.aoi_id, a.name_ko ?? "", a.name_en ?? "", iso3(a) ?? "", nameOf(a).t].some((x) => fold(x).includes(f)))
        .sort(byName)
        .slice(0, 200);
      if (hit.length) add(hit, false);
      else out.push({ kind: "none", text: t("shell.aoi.none") });
      return out;
    }
    if (!path.length) {
      const W = aois.filter((a) => a.level === "world");
      const KR = aois.filter((a) => a.aoi_id === "KR");
      add(W, false);
      if (KR.length) {
        out.push({ kind: "sec", title: countryName(cidx.get("KOR"), lang, "Korea"), n: 1 });
        add(KR, true);
      }
      const ctry = aois.filter((a) => a.level === "country" && a.aoi_id !== "KR" && !a.hidden);
      const contOf = (a: AoiRec) => {
        const c = iso3(a) ? cidx.get(iso3(a) as string) : undefined;
        return c ? continentOf(c) : "zz";
      };
      [...CONTINENTS, "zz"].forEach((k) => {
        const arr = ctry.filter((a) => contOf(a) === k).sort(byName);
        if (!arr.length) return;
        out.push({ kind: "sec", title: k === "zz" ? t("shell.aoi.other") : t(`shell.cont.${k}`), n: arr.length });
        add(arr, true);
      });
      return out;
    }
    const top = byId.get(path[path.length - 1] as string);
    if (!top) return out;
    add([top], false, true);
    const ch = (kids.get(top.aoi_id) ?? []).filter((a) => a.level !== "continent" && a.level !== "country");
    const grp = ch.filter((a) => a.level === "group");
    const rest = ch.filter((a) => a.level !== "group").sort(byName);
    add(grp, false);
    if (rest.length) {
      out.push({ kind: "sec", title: t(`shell.aoi.lv.${(rest[0] as AoiRec).level}`), n: rest.length });
      add(rest, true);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, path, aois, lang, t]);
  const rows = items.filter((x): x is { kind: "row"; r: Row } => x.kind === "row").map((x) => x.r);
  const [actSel, setAct] = useState<number | null>(null);
  const curIdx = Math.max(0, rows.findIndex((r) => r.a.aoi_id === current));
  const act = Math.min(actSel ?? curIdx, Math.max(0, rows.length - 1));

  const down = (id: string) => {
    setPath((p) => [...p, id]);
    setQ("");
    setAct(null);
  };
  const up = () => {
    setPath((p) => p.slice(0, -1));
    setAct(null);
  };
  const choose = (i: number) => {
    const r = rows[i];
    if (!r) return;
    if (r.drill) return down(r.a.aoi_id);
    onOpenChange(false);
    onPick(r.a.aoi_id, r.pt);
  };
  const scrollTo = (i: number) => listRef.current?.querySelector(`#ap-o${i}`)?.scrollIntoView({ block: "nearest" });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(0, Math.min(rows.length - 1, act + (e.key === "ArrowDown" ? 1 : -1)));
      setAct(n);
      scrollTo(n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(act);
    } else if ((e.key === "ArrowLeft" || e.key === "Backspace") && !q && path.length) {
      e.preventDefault();
      up();
    } else if (e.key === "ArrowRight" && !q && rows[act]?.drill) {
      e.preventDefault();
      down((rows[act] as Row).a.aoi_id);
    }
  };

  let ri = -1;
  return (
    <D.Root open onOpenChange={onOpenChange}>
      <D.Portal>
        {/* 창을 가림막 안에 둔다(목업 .cpick-scrim.is-sheet .cpick — 가림막 z-index 위에 창이 오도록) */}
        <D.Overlay className={cx("cpick-scrim", phone && "is-sheet")}>
        <D.Content className={cx("cpick apick")} style={pos ?? undefined} aria-describedby={undefined} onKeyDown={onKey} onOpenAutoFocus={(e) => phone && e.preventDefault()}>
          <D.Title className={cx("sr-only")}>{t("shell.aoi.title")}</D.Title>
          <div className={cx("cp-h")}>
            {path.length && !q ? (
              <button type="button" className={cx("iconbtn")} aria-label={t("shell.aoi.up")} onClick={up}>
                <ChevronLeft aria-hidden="true" />
              </button>
            ) : null}
            <input
              className={cx("input cp-q")}
              type="search"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("shell.aoi.search")}
              placeholder={t("shell.aoi.search")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAct(null);
              }}
            />
            <D.Close className={cx("iconbtn")} aria-label={t("shell.act.close")}>
              <X aria-hidden="true" />
            </D.Close>
          </div>
          <div className={cx("cp-l")} role="listbox" tabIndex={-1} aria-label={t("shell.aoi.title")} aria-activedescendant={rows.length ? `ap-o${act}` : undefined} ref={listRef}>
            {items.map((it, k) => {
              if (it.kind === "sec")
                return (
                  <div key={`s${k}`} className={cx("sechd cp-sec")} role="presentation">
                    <h3>{it.title}</h3>
                    <span className={cx("sh-n")}>{it.n}</span>
                  </div>
                );
              if (it.kind === "none")
                return (
                  <p key={`n${k}`} className={cx("cp-none")}>
                    {it.text}
                  </p>
                );
              ri++;
              const i = ri;
              const r = it.r;
              const n = nameOf(r.a);
              return (
                <button
                  key={`${r.a.aoi_id}-${k}`}
                  type="button"
                  role="option"
                  id={`ap-o${i}`}
                  className={cx("cp-r", r.drill && "is-drill", i === act && "is-act")}
                  data-a={r.a.aoi_id}
                  aria-selected={r.a.aoi_id === current}
                  onClick={() => choose(i)}
                >
                  <span className={cx("cp-c mono")}>{codeOf(r.a)}</span>
                  <span className={cx("cp-n")} lang={n.l || undefined}>
                    {r.whole ? t("shell.aoi.whole", { name: n.t }) : n.t}
                  </span>
                  <span className={cx("cp-k")}>
                    {r.drill ? (
                      <>
                        <ChevronRight aria-hidden="true" />
                        <span className={cx("sr-only")}>{t("shell.aoi.down")}</span>
                      </>
                    ) : (
                      t(`shell.aoi.lv.${r.a.level}`)
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </D.Content>
        </D.Overlay>
      </D.Portal>
    </D.Root>
  );
}
