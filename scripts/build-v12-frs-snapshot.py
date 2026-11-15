#!/usr/bin/env python3
"""
release data-v1.2-2026-11-15 → MSW 시험용 스냅숏(public/data/snap/v12/) + 방법 화면 FRP 환산 비율 표(src/pages/method/model/frp-ratios.gen.ts).

단위 frp-regime-status(불 세기 FRP · 불 유형 배지 · 위성 일별 상태)만 만든다. 값은 release 파일 값 그대로(결정 A1) —
여기서 하는 일은 열 고르기 · 코드 인덱스 · 반올림(소수 3~5자리, 계약 예시와 같은 자리) · 칸×일 → 칸×월 묶기(Σ·max, 계약 /cells/frp freq=month 와 같은 규칙)뿐이다.
실제 백엔드가 오면 이 스냅숏은 쓰지 않는다(NEXT_PUBLIC_DATA_MODE=http). 화면은 이 파일들을 직접 읽지 않는다(MSW 처리기만).

쓰는 법 (팀 시험 서버, 저장소 루트에서):
  uv run --no-project --with duckdb --with shapely --with numpy python -I scripts/build-v12-frs-snapshot.py \
      --release ~/planetarium/release/v1.2-2026-11-15 --out .
메모리: systemd-run --user --scope -p MemoryMax=8G 아래에서 돌린다(FRP 파일 97,791,096행을 날짜로 거른다).

만드는 것
- public/data/snap/v12/fire-regime.json   aoi_month_fire_regime 295 AOI × 313달 전부
- public/data/snap/v12/frp-month.json     harmonized_cell_day_frp → 칸×월, FRP_MONTHS 기간, 불 유형 AOI 295곳의 칸(칸 중심 ∈ 경계 — 시제품 서버와 같은 규칙)
- public/data/snap/v12/satellite-status.json  satellite_day_status 전 행(계약 필드만) + satellite_month_status 전 행
- public/data/snap/v12/manifest-frs.json  원천 파일 sha256 · 행 수 · 만든 파일 sha256
- src/pages/method/model/frp-ratios.gen.ts  reports frp_snpp_ratios.csv 의 year=all 행(위성 × 낮/밤)
- public/data/snap/m2v_meta.json           release v1.2 m2v_meta.json 그대로 복사(줄 끝 LF, + snap/manifest.json 의 그 줄)
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import argparse
import csv
import datetime as dt
import hashlib
import json
import os

import duckdb
import numpy as np
import shapely
from shapely.geometry import shape

ap = argparse.ArgumentParser()
ap.add_argument("--release", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--frp-from", default="2024-01")
ap.add_argument("--frp-to", default="2026-11")
a = ap.parse_args()
D = os.path.expanduser(a.release)
OUT = os.path.abspath(a.out)
SNAP = os.path.join(OUT, "public", "data", "snap", "v12")
os.makedirs(SNAP, exist_ok=True)
REL = "data-v1.2-2026-11-15"

con = duckdb.connect()
con.execute("SET memory_limit='6GB'; SET threads=8")
q = lambda s, p=None: con.execute(s, p or []).fetchall()
R = lambda f: f"read_parquet('{D}/{f}.parquet')"


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def rnd(x, k):
    if x is None:
        return None
    v = round(float(x), k)
    return 0.0 if v == 0 else v  # -0.0 → 0 (계약 /cells/frp)


def dump(name, obj):
    p = os.path.join(SNAP, name)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return p


NM = 313
YM = [f"{2000 + (10 + i) // 12}-{(10 + i) % 12 + 1:02d}" for i in range(NM)]
assert YM[0] == "2000-11" and YM[-1] == "2026-11"
MI = "((year::INT-2000)*12+month::INT-11)"
report = {"release": REL, "source_dir": "release/" + os.path.basename(D.rstrip("/")), "sources": {}, "outputs": {}, "checks": {}}

# ── 1. 불 유형 배지 ──
RC = ["large_fire", "many_small", "mixed", "none"]
rows = q(f"select aoi_id, name, level, {MI} m, fire_regime, W, W_large, share_large, n_events, n_large_events, top_event_id, top_event_w from {R('aoi_month_fire_regime')} order by aoi_id, m")
report["sources"]["aoi_month_fire_regime"] = {"rows": len(rows)}
reg = {}
for aid, name, level, m, fr, W, WL, sl, ne, nl, te, tw in rows:
    e = reg.setdefault(aid, {"name": name, "level": level, "fr": [None] * NM, "W": [None] * NM, "WL": [None] * NM, "sl": [None] * NM, "ne": [None] * NM, "nl": [None] * NM, "te": [None] * NM, "tw": [None] * NM})
    assert 0 <= m < NM, (aid, m)
    e["fr"][m] = RC.index(fr)
    e["W"][m] = rnd(W, 3)
    e["WL"][m] = rnd(WL, 3)
    e["sl"][m] = rnd(sl, 5)
    e["ne"][m] = ne
    e["nl"][m] = nl
    e["te"][m] = te
    e["tw"][m] = rnd(tw, 3)
report["checks"]["regime_aois"] = len(reg)
report["checks"]["regime_rows_per_aoi"] = sorted({sum(v is not None for v in e["fr"]) for e in reg.values()})
p = dump("fire-regime.json", {"release": REL, "months": {"start": YM[0], "n": NM}, "codes": RC, "aoi": reg})
report["outputs"]["fire-regime.json"] = {"bytes": os.path.getsize(p), "sha256": sha(p)}

# ── 2. 위성 상태(일·월) — 계약 SatelliteDayStatus / SatelliteMonthStatus 필드만 ──
SAT = ["Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21"]
ST = ["ok", "low", "missing", "partial"]
days = q(f"select satellite, date_utc, status, n_det_global, coverage, ratio_to_seasonal, note from {R('satellite_day_status')} order by satellite, date_utc")
report["sources"]["satellite_day_status"] = {"rows": len(days)}
notes = sorted({d[6] for d in days if d[6] is not None})
covs = sorted({d[4] for d in days if d[4] is not None})
sd = {}
for s, d, st, n, cov, rs, note in days:
    assert s in SAT and st in ST, (s, st)
    e = sd.setdefault(s, {"start": d.isoformat(), "st": [], "n": [], "rs": [], "nt": [], "cv": []})
    k = (d - dt.date.fromisoformat(e["start"])).days
    while len(e["st"]) < k:  # 파일에 없는 날 = null(행 없음)
        for f in ("st", "n", "rs", "nt", "cv"):
            e[f].append(None)
    e["st"].append(ST.index(st))
    e["n"].append(n)
    e["rs"].append(rnd(rs, 4))
    e["nt"].append(None if note is None else notes.index(note))
    e["cv"].append(None if cov is None else covs.index(cov))
report["checks"]["sat_day_gaps"] = {s: sum(v is None for v in e["st"]) for s, e in sd.items()}
mrows = q(f"select satellite, year, month, obs_days, low_days, missing_days, days_in_month, first_day, last_day, month_status from {R('satellite_month_status')} order by satellite, year, month")
report["sources"]["satellite_month_status"] = {"rows": len(mrows)}
sm = [[s, y, m, o, l, mi, dim, fd.isoformat() if fd else None, ld.isoformat() if ld else None, ms] for s, y, m, o, l, mi, dim, fd, ld, ms in mrows]
p = dump("satellite-status.json", {"release": REL, "satellites": SAT, "codes": {"st": ST, "note": notes, "coverage": covs}, "day": sd, "month_fields": ["satellite", "year", "month", "obs_days", "low_days", "missing_days", "days_in_month", "first_day", "last_day", "month_status"], "month": sm, "through": max(d[1] for d in days).isoformat()})
report["outputs"]["satellite-status.json"] = {"bytes": os.path.getsize(p), "sha256": sha(p)}

# ── 3. FRP 칸×월 (FRP_MONTHS) + 불 유형 AOI 295곳의 칸 ──
f0, f1 = a.frp_from, a.frp_to
d0 = dt.date(int(f0[:4]), int(f0[5:]), 1)
y1, m1 = int(f1[:4]), int(f1[5:])
d1 = (dt.date(y1 + (m1 == 12), m1 % 12 + 1, 1) - dt.timedelta(days=1))
with open(os.path.join(D, "aoi_boundaries.geojson"), encoding="utf-8") as f:
    gj = json.load(f)
feats = {}
for ft in gj["features"]:
    pid = (ft.get("properties") or {}).get("aoi_id") or ft.get("id")
    if pid in reg:
        feats[pid] = shape(ft["geometry"])
report["checks"]["boundaries_found"] = f"{len(feats)}/{len(reg)}"
bounds = np.array([g.bounds for g in feats.values()])
W0, S0, E0, N0 = bounds[:, 0].min(), bounds[:, 1].min(), bounds[:, 2].max(), bounds[:, 3].max()
# 칸 모서리 = floor(lat×10)/10, 중심 = +0.05 (계약 CellId)
LAT = "((cell_id // 3600) - 900) / 10.0 + 0.05"
LON = "((cell_id % 3600) - 1800) / 10.0 + 0.05"
con.execute(
    f"""create temp table fm as
    select cell_id, (year(date_local)::INT-2000)*12+month(date_local)::INT-11 m,
           sum(frp_sum) fs, sum(frp_snpp_equiv_sum) es, max(frp_snpp_equiv_max) em, sum(n_points)::BIGINT np, count(*) nd
    from {R('harmonized_cell_day_frp')}
    where date_local between ? and ?
      and {LAT} between ? and ? and {LON} between ? and ?
    group by all""",
    [d0, d1, S0 - 0.1, N0 + 0.1, W0 - 0.1, E0 + 0.1],
)
cells = [r[0] for r in q("select distinct cell_id from fm order by 1")]
cid = np.array(cells, dtype=np.int64)
clat = (cid // 3600 - 900) / 10.0 + 0.05
clon = (cid % 3600 - 1800) / 10.0 + 0.05
member = {}
for aid, g in feats.items():
    shapely.prepare(g)
    x0, y0, x1, y1 = g.bounds
    idx = np.nonzero((clon >= x0) & (clon <= x1) & (clat >= y0) & (clat <= y1))[0]
    k = shapely.contains_xy(g, clon[idx], clat[idx]) if len(idx) else np.array([], bool)
    member[aid] = [int(i) for i in idx[k]]
used = sorted({i for v in member.values() for i in v})
remap = {old: new for new, old in enumerate(used)}
member = {aid: [remap[i] for i in v] for aid, v in member.items()}
ucell = [int(cid[i]) for i in used]
uset = {c: i for i, c in enumerate(ucell)}
fr_rows = q("select cell_id, m, fs, es, em, np, nd from fm order by m, cell_id")
rowsm = [[uset[c], m, rnd(fs, 3), rnd(es, 3), rnd(em, 3), np_, nd] for c, m, fs, es, em, np_, nd in fr_rows if c in uset]
m0 = YM.index(f0)
m1i = YM.index(f1)
report["sources"]["harmonized_cell_day_frp"] = {"window": [d0.isoformat(), d1.isoformat()], "cell_months_in_bbox": len(fr_rows), "cell_months_kept": len(rowsm), "cells_kept": len(ucell)}
# 확인: 칸×월 Σ es = 같은 칸·기간 일 행 Σ (KR 하나)
kr = set(ucell[i] for i in member.get("KR", []))
report["checks"]["kr_cells_with_frp_in_window"] = len(kr)
p = dump(
    "frp-month.json",
    {
        "release": REL,
        "freq": "month",
        "months": {"from": m0, "to": m1i, "start": YM[0]},
        "fields": ["cell", "m", "frp_sum", "frp_snpp_equiv_sum", "frp_snpp_equiv_max", "n_points", "n_days"],
        "cells": ucell,
        "rows": rowsm,
        "aoi": member,
        "rule": "aoi 칸 = 칸 중심(모서리+0.05) ∈ aoi_boundaries.geojson 경계(shapely contains_xy, 시제품 서버 v3.py 와 같은 규칙)",
    },
)
report["outputs"]["frp-month.json"] = {"bytes": os.path.getsize(p), "sha256": sha(p)}

# ── 4. FRP 환산 비율 표(방법 화면) ──
rp = os.path.join(D, "frp_snpp_ratios.csv")
if not os.path.exists(rp):
    rp = os.path.join(D, "reports", "frp_snpp_ratios.csv")
with open(rp, encoding="utf-8") as f:
    rr = list(csv.DictReader(f))
allr = [r for r in rr if r["year"] == "all"]
# 비교 연도(year_min·year_max 를 만든 해)는 csv 에 없다 — Terra 는 2012–2019 만 썼다(release 노트). 해마다 행은 2025 까지 있어 연도 칸을 csv 로 만들지 않는다.
tab = []
for r in allr:
    tab.append({
        "satellite": r["satellite"],
        "daynight": r["daynight"],
        "ratio": round(float(r["ratio"]), 3),
        "year_min": round(float(r["ratio_year_min"]), 3),
        "year_max": round(float(r["ratio_year_max"]), 3),
        "cell_days": int(r["cell_days"]),
    })
report["sources"]["frp_snpp_ratios.csv"] = {"rows": len(rr), "sha256": sha(rp)}
ts = os.path.join(OUT, "src", "pages", "method", "model", "frp-ratios.gen.ts")
with open(ts, "w", encoding="utf-8", newline="\n") as f:
    f.write("/**\n * 자동 생성 — scripts/build-v12-frs-snapshot.py. 손으로 고치지 말 것.\n")
    f.write(f" * 원천: release {REL} reports/frp_snpp_ratios.csv (sha256 {sha(rp)[:16]}…) 의 year=all 행.\n")
    f.write(" * ratio = Σ FRP(위성) / Σ FRP(S-NPP) 칸·날 중앙값(낮·밤 따로). frp_snpp_equiv = frp ÷ ratio. 값은 파일 값 소수 3자리 반올림.\n")
    f.write(" * 계약(/methods/current)에 이 표 필드가 없어 방법 설명 상수로 둔다(쟁점 — 계약에 frp_snpp_ratios 가 생기면 그쪽을 읽는다).\n */\n")
    f.write("export interface FrpRatio {\n  satellite: string;\n  daynight: \"D\" | \"N\";\n  ratio: number;\n  year_min: number;\n  year_max: number;\n  cell_days: number;\n}\n")
    f.write("export const FRP_RATIOS: readonly FrpRatio[] = " + json.dumps(tab, ensure_ascii=False, indent=2) + ";\n")
report["outputs"]["frp-ratios.gen.ts"] = {"rows": len(tab)}

# ── 5. release m2v_meta.json(v1.2 판) → public/data/snap/m2v_meta.json (MSW /methods/current 의 meta — static_exclusion 등 v1.2 키) ──
mp = os.path.join(OUT, "public", "data", "snap", "m2v_meta.json")
# 줄 끝만 LF 로(저장소는 LF 로 저장한다 — 그래야 manifest sha256 이 꺼낸 파일과 맞는다). 내용은 그대로
with open(os.path.join(D, "m2v_meta.json"), "rb") as f:
    raw = f.read()
with open(mp, "wb") as f:
    f.write(raw.replace(b"\r\n", b"\n"))
smp = os.path.join(OUT, "public", "data", "snap", "manifest.json")
if os.path.exists(smp):
    with open(smp, encoding="utf-8") as f:
        sm = json.load(f)
    sm.setdefault("files", {})["m2v_meta.json"] = {"bytes": os.path.getsize(mp), "sha256": sha(mp), "source": f"{REL}/m2v_meta.json"}
    with open(smp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(sm, f, ensure_ascii=False, indent=1)
        f.write("\n")
report["outputs"]["../m2v_meta.json"] = {"bytes": os.path.getsize(mp), "sha256": sha(mp)}

# 원천 sha256
for fn in ["aoi_month_fire_regime.parquet", "satellite_day_status.parquet", "satellite_month_status.parquet", "harmonized_cell_day_frp.parquet", "aoi_boundaries.geojson"]:
    report["sources"].setdefault(fn.split(".")[0], {})["file"] = fn
with open(os.path.join(D, "release_manifest.csv"), encoding="utf-8") as f:
    man = {r["file"]: r for r in csv.DictReader(f)}
for k, v in report["sources"].items():
    fn = v.get("file") or k
    if fn in man:
        v["sha256_manifest"] = man[fn]["sha256"]
with open(os.path.join(SNAP, "manifest-frs.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False, indent=1))
