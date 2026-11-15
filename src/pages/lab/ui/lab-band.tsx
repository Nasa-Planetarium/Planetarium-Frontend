"use client";

import { CARD, cardRows, type Score } from "../model/occ";
import type { LabCtx } from "./lab-page";
import { cx } from "./cx";

/**
 * 아래 띠: 모델 검증(PR-AUC·Brier, 모델 vs 기준선) | 자료와 한계.
 * 검증 수치 = release meta(grid_occurrence_meta.json · aoi_occurrence_meta.json) 그대로 옮긴 상수(model/occurrence-card.json) —
 * 계약 /api/v1 에 검증 수치 경로가 아직 없다(보고 쟁점). 값은 바꾸지 않는다.
 */
export function LabBand(c: LabCtx) {
  const { t } = c;
  return (
    <div className={cx("lb-band")}>
      <div className={cx("lb-col")}>
        <section className={cx("panel lb-val")} aria-label={t("occ.val.title")} data-val="">
          <div className={cx("panel-h")}>
            <h2>
              {t("occ.val.title")} <small>{t("occ.val.sub")}</small>
            </h2>
          </div>
          <div className={cx("panel-b")}>
            <Validation {...c} />
          </div>
        </section>
      </div>
      <div className={cx("lb-col")}>
        <section className={cx("panel lb-how")} aria-label={t("occ.how.title")}>
          <div className={cx("panel-h")}>
            <h2>{t("occ.how.title")}</h2>
          </div>
          <div className={cx("panel-b")}>
            <p className={cx("oc-limit")} data-limit="">
              {t("occ.limit")}
            </p>
            <dl className={cx("sumlist oc-how")}>
              <dt>{t("occ.how.target")}</dt>
              <dd>{t("occ.how.target_v", { m: c.tm })}</dd>
              <dt>{t("occ.how.asof")}</dt>
              <dd className={cx("num")}>{c.asOf ?? "–"}</dd>
              <dt>{t("occ.how.model")}</dt>
              <dd>
                {t("occ.how.model_v")} <code className={cx("oc-id")}>{c.kor ? CARD.aoi.model : CARD.grid.model}</code>
              </dd>
              <dt>{t("occ.how.input")}</dt>
              <dd>{t("occ.how.input_v")}</dd>
              <dt>{t("occ.how.grey")}</dt>
              <dd>{c.kor ? t("occ.how.grey_kor") : t("occ.how.grey_world")}</dd>
              <dt>{t("occ.how.release")}</dt>
              <dd className={cx("num")}>{CARD.release}</dd>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

function Validation(c: LabCtx) {
  const { t } = c;
  const R = cardRows(c.iso3, c.continent);
  const nf = new Intl.NumberFormat(c.lang);
  const f3 = (v: number) => v.toFixed(3);
  const grp = (g: string) => (g === "ALL" ? t("occ.val.g_all") : g === "KR_SGG" ? t("occ.val.g_sgg") : g === "KOR" ? t("occ.val.g_kor") : g === "ARG" ? t("occ.val.g_arg") : t("occ.val.g_cont", { c: g }));
  const cell = (m: Score, b: Score, k: "pr_auc" | "brier") => {
    const better = k === "pr_auc" ? m[k] > b[k] : m[k] < b[k];
    return (
      <>
        <b className={cx("num")}>{f3(m[k])}</b>
        <span className={cx("oc-vsb num")}>
          {" "}
          / {f3(b[k])}
        </span>
        <span className={cx("oc-better", better ? "ok" : "no")}>{better ? t("occ.val.better") : t("occ.val.worse")}</span>
      </>
    );
  };
  return (
    <>
      <div className={cx("tbl-wrap")}>
        <table className={cx("tbl lb-vt oc-vt")} data-vt="">
          <thead>
            <tr>
              <th>{t("occ.val.scope")}</th>
              <th className={cx("r")}>{t("occ.val.prauc")}</th>
              <th className={cx("r")}>{t("occ.val.brier")}</th>
              <th className={cx("r")}>{t("occ.val.rows")}</th>
            </tr>
          </thead>
          <tbody>
            {R.map(({ scope, row }) => (
              <tr key={scope + row.group} data-g={row.group}>
                <td>
                  {grp(row.group)}
                  <span className={cx("lb-vsc")}>{scope === "aoi" ? t("occ.val.unit_sgg") : t("occ.val.unit_grid")}</span>
                </td>
                <td className={cx("r")}>{cell(row.model, row.same_month, "pr_auc")}</td>
                <td className={cx("r")}>{cell(row.model, row.same_month, "brier")}</td>
                <td className={cx("r num")}>{nf.format(row.rows)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={cx("lb-cap")}>{t("occ.val.cap", { g: CARD.grid.validation, a: CARD.aoi.validation })}</p>
    </>
  );
}
