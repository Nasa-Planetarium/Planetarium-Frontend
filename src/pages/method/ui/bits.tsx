"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { cx } from "./cx";

/** 상태 표지 12px(목업 EM.ST_SHAPES) — 모양이 1차 신호, 색은 .dst-ic[data-st] 토큰 */
const SHAPES: Record<string, ReactNode> = {
  nrt: <path d="M6 1.5 10.75 10.5H1.25Z" />,
  partial: <rect x="1.5" y="1.5" width="9" height="9" strokeDasharray="2 1.5" />,
  missing: (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="M1.5 6 6 1.5M1.5 10.5l9-9M6 10.5 10.5 6" />
    </>
  ),
  low_sample: <circle cx="6" cy="6" r="4.25" />,
  out_of_range: (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="M1.5 6h9" />
    </>
  ),
};
export function StIcon({ st }: { st: string }) {
  const sh = SHAPES[st];
  if (!sh) return null;
  return (
    <svg className={cx("dst-ic")} data-st={st} viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
      {sh}
    </svg>
  );
}

/** 숫자 표기(목업 EM.fmt.num + method.js nf): 없으면 「–」, 자리수 안 주면 정수는 0 · 소수는 1 */
export function useNf() {
  const lang = useLocale();
  return useMemo(() => {
    const fs = [0, 1, 2, 3].map((d) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d }));
    const f = (d: number) => fs[Math.min(3, Math.max(0, d))] as Intl.NumberFormat;
    return (x: number | null | undefined, d?: number) => (x == null || Number.isNaN(+x) ? "–" : f(d ?? (Number.isInteger(+x) ? 0 : 1)).format(+x));
  }, [lang]);
}

/** wide = 태블릿·폰에서 한 줄 다. 웹(한 화면 배치)에서는 w1 = 한 칸, w2 = 두 칸으로 줄인다 */
export function Panel({ title, n, wide, w1, w2, children, attrs }: { title: ReactNode; n?: number | string | null; wide?: boolean; w1?: boolean; w2?: boolean; children: ReactNode; attrs?: Record<string, string> }) {
  return (
    <section className={cx("panel mt-p", wide && "mt-wide", w1 && "mt-w1", w2 && "mt-w2")} {...attrs}>
      <div className={cx("panel-h")}>
        <h3>
          {title}
          {n != null ? (
            <>
              {" "}
              <span className={cx("num mt-n")}>{n}</span>
            </>
          ) : null}
        </h3>
      </div>
      <div className={cx("panel-b")}>{children}</div>
    </section>
  );
}

/** 표: 머리 [글, 오른쪽 정렬, 추가 클래스] */
export function Table({ heads, rows, cls }: { heads: [ReactNode, (0 | 1)?, string?][]; rows: ReactNode[]; cls?: string }) {
  return (
    <div className={cx("tbl-wrap")}>
      <table className={cx("tbl", cls)}>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} className={cx(h[1] ? "r" : "", h[2] ?? "") || undefined}>
                {h[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function Kv({ pairs }: { pairs: [ReactNode, ReactNode][] }) {
  return (
    <dl className={cx("mt-kv")}>
      {pairs.map((p, i) => (
        <KvRow key={i} k={p[0]} v={p[1]} />
      ))}
    </dl>
  );
}
function KvRow({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
