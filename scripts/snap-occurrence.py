#!/usr/bin/env python3
"""
예측 분석(lab) MSW 시험 스냅숏 — 모델팀 release(data-v1.2-2026-11-15)의 「다음 달 발생 확률」 파일에서 잘라 만든다.

쓰는 법(저장소 루트, release 폴더는 sha256 검증이 끝난 것):
  uv run --no-project --with pandas --with pyarrow --with shapely \
    python scripts/snap-occurrence.py --release ~/planetarium/release/v1.2-2026-11-15

만드는 것(값은 파일 값 그대로, 다시 계산하지 않는다 — 결정 A1):
  public/data/snap/occurrence.json        0.5° 격자 52,855칸(열별 배열, 확률 ×1e5 정수) + 한국 시군구 252행 + AOI 격자 요약
  public/data/snap/kr-sgg-boundary.json   시군구 252 경계(aoi_boundaries.geojson 에서 단순화 — MSW /aois/{id}/boundary 용)
  src/pages/lab/model/occurrence-card.json 검증 수치(PR-AUC·Brier, 모델 vs 기준선) — release meta JSON 그대로 옮김

서버(OMB 백엔드)가 붙이는 값(계약 contract/openapi.yaml §occurrence):
  - vs_normal: p_any − baseline_p ≥ +0.10 higher, ≤ −0.10 lower, 그 사이 similar (모델팀 표시 규칙)
  - grid_summary: 칸 중심이 AOI 경계 안인 0.5° 격자의 칸 수·단계별 칸 수·최대·중앙값(지속 열원 제외)
  이 스크립트가 같은 규칙으로 미리 붙여 둔다. MSW 처리기는 이 값을 그대로 낸다.
이 파일들은 MSW 시험용이다. 화면(DATA_MODE=http)은 /api/v1 만 읽는다.
"""
import argparse
import hashlib
import json
import os
import sys

import numpy as np
import pandas as pd
import shapely
from shapely.geometry import mapping, shape

sys.stdout.reconfigure(encoding="utf-8")

ap = argparse.ArgumentParser()
ap.add_argument("--release", required=True)
ap.add_argument("--root", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ap.add_argument("--tol", type=float, default=0.002, help="경계 단순화 허용 오차(도)")
args = ap.parse_args()
R = os.path.expanduser(args.release)
ROOT = os.path.abspath(args.root)


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


F_GRID = "grid_occurrence_nextmonth_latest.parquet"
F_AOI = "aoi_occurrence_nextmonth_latest.parquet"
F_LIST = "aoi_list.parquet"
F_BND = "aoi_boundaries.geojson"
F_GMETA = "grid_occurrence_meta.json"
F_AMETA = "aoi_occurrence_meta.json"
src = {f: sha(os.path.join(R, f)) for f in [F_GRID, F_AOI, F_LIST, F_BND, F_GMETA, F_AMETA]}

# release_manifest.csv 의 sha256 과 대조(받은 파일이 release 그대로인지)
man = pd.read_csv(os.path.join(R, "release_manifest.csv"))
cols = {c.lower(): c for c in man.columns}
name_c = next((cols[c] for c in ("file", "name", "path", "filename") if c in cols), None)
sha_c = next((cols[c] for c in ("sha256", "hash") if c in cols), None)
verified = {}
if name_c and sha_c:
    mm = {os.path.basename(str(r[name_c])): str(r[sha_c]) for _, r in man.iterrows()}
    for f, h in src.items():
        verified[f] = (mm.get(f) == h) if f in mm else None
print("manifest 대조", verified)
if any(v is False for v in verified.values()):
    sys.exit("release_manifest.csv 와 sha256 이 다르다")

g = pd.read_parquet(os.path.join(R, F_GRID)).sort_values("cell_id").reset_index(drop=True)
a = pd.read_parquet(os.path.join(R, F_AOI))
L = pd.read_parquet(os.path.join(R, F_LIST)).set_index("aoi_id")

# ── 확인(잰 것) ──
assert g.cell_id.is_unique
calc = np.floor((g.lat.astype("float64") + 90) / 0.5).astype(int) * 720 + np.floor((g.lon.astype("float64") + 180) / 0.5).astype(int)
assert (calc == g.cell_id).all(), "cell_id 식 불일치"
assert g.target_month.nunique() == 1 and a.target_month.nunique() == 1
assert g.as_of_date.nunique() == 1 and a.as_of_date.nunique() == 1
assert g.model.nunique() == 1 and a.model.nunique() == 1
print("grid", len(g), "persistent", int(g.persistent_source.sum()), "|p_any+p_none-1| max", float((g.p_any + g.p_none - 1).abs().max()))
print("aoi", len(a), "industrial", int(a.suspected_industrial.sum()))


def vs(p, b):
    d = p.astype("float64") - b.astype("float64")
    return np.where(d >= 0.10, 2, np.where(d <= -0.10, 0, 1))  # 0 lower · 1 similar · 2 higher


VS = ["lower", "similar", "higher"]
gv = vs(g.p_any, g.baseline_p)
print("vs_normal 칸 수", {VS[k]: int((gv == k).sum()) for k in range(3)})
i5 = lambda s: [int(round(float(x) * 1e5)) for x in s]

adm0s = sorted(g.adm0.dropna().unique().tolist())
conts = sorted(g.continent.dropna().unique().tolist())
grid = {
    "n": len(g),
    "id": g.cell_id.astype(int).tolist(),
    "p": i5(g.p_any),
    "pn": i5(g.p_none),
    "b": i5(g.baseline_p),
    "vs": gv.astype(int).tolist(),
    "ps": g.persistent_source.astype(int).tolist(),
    "a0": [adm0s.index(x) if isinstance(x, str) else -1 for x in g.adm0],
    "ct": [conts.index(x) if isinstance(x, str) else -1 for x in g.continent],
    "r5": [None if pd.isna(x) else int(round(float(x) * 1e5)) for x in g.rate_5y],
    "l1": [None if pd.isna(x) else int(bool(x)) for x in g.lag1_projected],
    "codes": {"vs": VS, "adm0": adm0s, "continent": conts},
}

# ── 시군구 252 ──
av = vs(a.p_any, a.baseline_p)
aoi_rows = []
for k, r in a.reset_index(drop=True).iterrows():
    lid = r.aoi_id
    aoi_rows.append(
        {
            "id": lid,
            "name": str(L.loc[lid, "name"]) if lid in L.index else None,
            "parent": (str(L.loc[lid, "parent_aoi"]) if lid in L.index and isinstance(L.loc[lid, "parent_aoi"], str) else None),
            "p": int(round(float(r.p_any) * 1e5)),
            "pn": int(round(float(r.p_none) * 1e5)),
            "b": int(round(float(r.baseline_p) * 1e5)),
            "vs": int(av[k]),
            "ind": bool(r.suspected_industrial),
            "r5": None if pd.isna(r.rate_5y) else round(float(r.rate_5y), 5),
            "ny": None if pd.isna(r.n_years) else int(r.n_years),
            "l1": None if pd.isna(r.lag1_projected) else bool(r.lag1_projected),
        }
    )
print("시군구 vs_normal", {VS[k]: int((av == k).sum()) for k in range(3)}, "부모 없음", sum(1 for x in aoi_rows if not x["parent"]))

# ── 경계: AOI 격자 요약 + 시군구 경계 단순화 ──
with open(os.path.join(R, F_BND), encoding="utf-8") as f:
    B = json.load(f)
geoms = {}
for ft in B["features"]:
    aid = ft["properties"].get("aoi_id")
    if ft.get("geometry"):
        geoms[aid] = shape(ft["geometry"])
pts = shapely.points(g.lon.astype("float64").to_numpy(), g.lat.astype("float64").to_numpy())
tree = shapely.STRtree(pts)
want = ["WORLD", "KR"] + sorted(x for x in L.index if str(x).startswith("ADM0_")) + sorted(x for x in L.index if str(x).startswith("SIDO_"))
pa = g.p_any.astype("float64").to_numpy()
ps = g.persistent_source.to_numpy()
summ = {}
for aid in want:
    if aid == "WORLD":
        idx = np.arange(len(g))
    elif aid in geoms:
        idx = np.asarray(tree.query(geoms[aid], predicate="contains"), dtype=int)
    else:
        continue
    idx = np.sort(idx)
    keep = idx[~ps[idx]]
    v = pa[keep]
    top = keep[np.argsort(-v, kind="stable")][:10] if len(keep) else np.array([], dtype=int)
    summ[aid] = [
        int(len(idx)),
        int(ps[idx].sum()),
        int((v < 0.1).sum()),
        int(((v >= 0.1) & (v < 0.4)).sum()),
        int(((v >= 0.4) & (v < 0.7)).sum()),
        int((v >= 0.7).sum()),
        None if not len(v) else int(round(float(v.max()) * 1e5)),
        None if not len(v) else int(round(float(np.median(v)) * 1e5)),
        [int(g.cell_id.iat[i]) for i in top],
    ]
print("격자 요약 AOI", len(summ), "칸 0 AOI", sum(1 for s in summ.values() if s[0] == 0), "KR", summ.get("KR", [None])[:8], "ADM0_ARG", summ.get("ADM0_ARG", [None])[:8])

bnd = {}
nv = 0
for x in aoi_rows:
    gm = geoms.get(x["id"])
    if gm is None:
        continue
    s = shapely.simplify(gm, args.tol, preserve_topology=True)
    s = shapely.set_precision(s, 1e-4)
    m = mapping(s)
    nv += int(shapely.get_num_coordinates(s))
    bnd[x["id"]] = m
print("시군구 경계", len(bnd), "꼭짓점", nv)

out_snap = os.path.join(ROOT, "public", "data", "snap")
os.makedirs(out_snap, exist_ok=True)
release = "data-v1.2-2026-11-15"
occ = {
    "_note": "MSW 시험용 — scripts/snap-occurrence.py 가 release 파일에서 잘라 만든 것. 확률 ×1e5 정수. 화면은 이 파일을 읽지 않는다(/api/v1).",
    "release": release,
    "source_sha256": src,
    "target_month": str(g.target_month.iat[0]),
    "as_of_date": str(g.as_of_date.iat[0]),
    "model_grid": str(g.model.iat[0]),
    "model_aoi": str(a.model.iat[0]),
    "grid": grid,
    "aoi": aoi_rows,
    "summary_cols": ["n_cells", "n_persistent", "lt10", "p10_40", "p40_70", "ge70", "p_any_max", "p_any_median", "top_cells"],
    "summary": summ,
}
p1 = os.path.join(out_snap, "occurrence.json")
with open(p1, "w", encoding="utf-8", newline="\n") as f:
    json.dump(occ, f, ensure_ascii=False, separators=(",", ":"))
p2 = os.path.join(out_snap, "kr-sgg-boundary.json")
with open(p2, "w", encoding="utf-8", newline="\n") as f:
    json.dump({"_note": f"MSW 시험용 — {F_BND} 시군구 {len(bnd)}개, 단순화 {args.tol}° · 소수 4자리", "release": release, "source_sha256": src[F_BND], "geometry": bnd}, f, ensure_ascii=False, separators=(",", ":"))

# ── 검증 수치 카드 ──
gm_ = json.load(open(os.path.join(R, F_GMETA), encoding="utf-8"))
am_ = json.load(open(os.path.join(R, F_AMETA), encoding="utf-8"))
gcal = gm_.get("calibration")
grid_tab = []
for t in gm_["table_excl_persistent"]:
    grid_tab.append(
        {
            "group": t["group"],
            "rows": t["rows"],
            "pos_rate": round(t["pos_rate"], 4),
            "model": {"pr_auc": round(t[f"pr_auc_xgboost_{gcal}"], 4), "brier": round(t[f"brier_xgboost_{gcal}"], 4)},
            "same_month": {"pr_auc": round(t["pr_auc_baseline_same_month_rate"], 4), "brier": round(t["brier_baseline_same_month_rate"], 4)},
            "last_year": {"pr_auc": round(t["pr_auc_baseline_last_year_same_month"], 4), "brier": round(t["brier_baseline_last_year_same_month"], 4)},
            "beats": bool(t.get("beats")),
        }
    )
acal = am_.get("calibration")
am = {m["method"]: m for m in am_["metrics"]}
pick = lambda k: {"pr_auc": round(am[k]["pr_auc"], 4), "brier": round(am[k]["brier"], 4)}
aoi_tab = {
    "group": "KR_SGG",
    "rows": am[f"xgboost_{acal}"]["rows"],
    "pos_rate": round(am[f"xgboost_{acal}"]["pos_rate"], 4),
    "model": pick(f"xgboost_{acal}"),
    "same_month": pick("baseline_same_month_rate"),
    "last_year": pick("baseline_last_year_same_month"),
}
card = {
    "_note": "scripts/snap-occurrence.py 가 release meta(grid_occurrence_meta.json · aoi_occurrence_meta.json)에서 옮긴 검증 수치. 소수 4자리 반올림 외에 바꾸지 않는다. 계약(/api/v1)에 검증 수치 경로가 아직 없어 화면 상수로 둔다.",
    "release": release,
    "source_sha256": {F_GMETA: src[F_GMETA], F_AMETA: src[F_AMETA]},
    "grid": {"model": str(g.model.iat[0]), "calibration": gcal, "validation": gm_.get("validation"), "excl_persistent": True, "table": grid_tab},
    "aoi": {"model": str(a.model.iat[0]), "calibration": acal, "validation": am_.get("validation"), "table": aoi_tab},
}
p3 = os.path.join(ROOT, "src", "pages", "lab", "model", "occurrence-card.json")
os.makedirs(os.path.dirname(p3), exist_ok=True)
with open(p3, "w", encoding="utf-8", newline="\n") as f:
    json.dump(card, f, ensure_ascii=False, indent=1)
    f.write("\n")
for p in (p1, p2, p3):
    print(os.path.relpath(p, ROOT), os.path.getsize(p), "B")
print("beats", {t["group"]: t["beats"] for t in grid_tab})
