"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "@/shared/i18n";
import { useDevice } from "@/shared/lib/use-device";
import type { AoiScope } from "../model/use-aoi-scope";
import { AoiPicker } from "./aoi-picker";
import { cx } from "./cx";

/**
 * 지역 고르기 단추 — 지금 범위의 위 단 사슬(「대한민국 › 경상북도」)을 보이고, 누르면 지역 고르기 창(전 세계 → 나라 → 1급 → 시군구).
 * 경북 북부 11개 시군 고정 목록을 대신한다(실제 자료는 전 지역 — 사용자 지적 2026-11-15).
 */
export function ScopeButton({ s, size, label }: { s: AoiScope; size?: "sm"; label?: string }) {
  const t = useT();
  const phone = useDevice() === "phone";
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const path = s.path.length ? s.path : [];
  const cur = path.length ? path[path.length - 1] : null;
  const up = path.slice(Math.max(0, path.length - 3), -1);
  const curName = cur ? s.nameOf(cur) : s.nameOf(s.chosen);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cx("ap-btn", size)}
        data-aoi-pick={s.chosen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={!s.ready}
        aria-label={`${label ?? t("shell.aoi.title")}: ${[...up.map((a) => s.nameOf(a)), curName].join(" › ")}`}
        disabled={!s.ready}
        onClick={() => {
          const r = btn.current?.getBoundingClientRect();
          setAnchor(r ? { left: r.left, bottom: r.bottom } : null);
          setOpen(true);
        }}
      >
        <span className={cx("ap-path")}>
          {up.map((a) => (
            <span key={a.aoi_id} className={cx("ap-up")}>
              {s.nameOf(a)}
              <ChevronRight className={cx("ap-sep")} aria-hidden="true" />
            </span>
          ))}
          <span className={cx("ap-cur")}>{curName}</span>
        </span>
        <ChevronDown className={cx("ap-ic")} aria-hidden="true" strokeWidth={1.9} />
      </button>
      <AoiPicker open={open} onOpenChange={setOpen} anchor={anchor} phone={phone} aois={s.aois} countries={s.countries} current={s.chosen} onPick={(id) => s.setAoi(id)} />
    </>
  );
}
