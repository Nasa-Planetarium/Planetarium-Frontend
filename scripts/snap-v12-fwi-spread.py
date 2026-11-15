#!/usr/bin/env python3
"""
release v1.2(data-v1.2-2026-11-15) → MSW 시험용 정적 스냅숏: FWI(산불 기상 위험도) · 확산 nowcast.

쓰는 법(aibox, 읽기 전용):
  ~/planetarium/api/.venv/bin/python scripts/snap-v12-fwi-spread.py \
      --release ~/planetarium/release/v1.2-2026-11-15 --out public/data/snap/v12 [--fwi-days 14]

만드는 것:
  fwi.json     fwi_aoi_day.parquet 의 295 AOI × 마지막 N 날(기본 14). 열 값은 파일 그대로(소수 4자리 반올림만).
  spread.json  spread_nowcast_latest.parquet 의 모든 칸(10,189). 값은 파일 그대로(위경도 4자리 · p_spread 5자리 반올림만).
               칸마다 「칸 중심이 들어 있는 범위 안 AOI」(KR · SIDO_* · SGG_* · ADM0_ARG · ADM1_ARG-*) 를 aoi_boundaries.geojson 으로 미리 판정해 둔다
               — 계약 /spread-nowcast 의 aoi_id 규칙(「칸 중심이 AOI 경계 안」)을 MSW 가 흉내 낼 수 있게.
  manifest-fwi-spread.json  원본 파일·결과 파일의 바이트 수와 sha256.

이 스크립트는 값을 다시 계산하지 않는다(결정 A1). level(low/moderate/high)은 계약이 「서버가 붙인다」고 정한 규칙
(low < 0.05 ≤ moderate ≤ 0.20 < high)이라 MSW 처리기가 붙이고, 여기서는 넣지 않는다.
"""
import argparse
import hashlib
import json
import os

import duckdb
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ap = argparse.ArgumentParser()
ap.add_argument("--release", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--fwi-days", type=int, default=14)
a = ap.parse_args()
R = os.path.expanduser(a.release)
OUT = a.out
os.makedirs(OUT, exist_ok=True)


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def r(x, k):
    return None if x is None else round(float(x), k)


RELEASE = "data-v1.2-2026-11-15"
con = duckdb.connect()

# ── FWI ──
fwi_p = f"{R}/fwi_aoi_day.parquet"
last = con.execute(f"select max(date) from '{fwi_p}'").fetchone()[0]
rows = con.execute(
    f"""
    with t as (select *, max(date) over (partition by aoi_id) as as_of from '{fwi_p}')
    select aoi_id, name, level, as_of, date, fwi_mean, fwi_max, fwi_class, fwi_pct, fwi_rel_class,
           isi_mean, bui_mean, ffmc_mean, dc_mean, n_cells
    from t where date > as_of - interval {a.fwi_days} day
    order by aoi_id, date
    """
).fetchall()
aois = {}
for (aid, name, level, as_of, d, fm, fx, fc, fp, frc, isi, bui, ffmc, dc, nc) in rows:
    o = aois.setdefault(aid, {"name": name, "level": level, "as_of_date": as_of.isoformat(), "days": []})
    o["days"].append([d.isoformat(), r(fm, 4), r(fx, 4), fc, r(fp, 4), frc, r(isi, 4), r(bui, 4), r(ffmc, 4), r(dc, 4), None if nc is None else int(nc)])
fwi = {
    "release": RELEASE,
    "source": "fwi_aoi_day.parquet",
    "days_kept": a.fwi_days,
    "cols": ["date", "fwi_mean", "fwi_max", "fwi_class", "fwi_pct", "fwi_rel_class", "isi_mean", "bui_mean", "ffmc_mean", "dc_mean", "n_cells"],
    "aois": aois,
}
with open(f"{OUT}/fwi.json", "w", encoding="utf-8", newline="\n") as f:
    json.dump(fwi, f, ensure_ascii=False, separators=(",", ":"))

# ── 확산 nowcast ──
sp_p = f"{R}/spread_nowcast_latest.parquet"
heads = con.execute(f"select distinct as_of_date, target_date, model, source_satellite, weather_available, weather_lag_days from '{sp_p}'").fetchall()
assert len(heads) == 1, heads
as_of, target, model, sat, wx, lag = heads[0]
cells = con.execute(
    f"select region, cand_adm0, cell_lat, cell_lon, cell_size_deg, p_spread, active_today, fire_event_days, n_det_today_7x7 from '{sp_p}' order by p_spread desc, cell_lat, cell_lon"
).fetchall()
sizes = {c[4] for c in cells}
assert sizes == {0.025}, sizes

with open(f"{R}/aoi_boundaries.geojson", encoding="utf-8") as f:
    gj = json.load(f)
IN_SCOPE = lambda i: i == "KR" or i == "ADM0_ARG" or i.startswith("SIDO_") or i.startswith("SGG_") or i.startswith("ADM1_ARG-")
feats = [(ft["properties"]["aoi_id"], shape(ft["geometry"])) for ft in gj["features"] if IN_SCOPE(ft["properties"]["aoi_id"]) and ft["geometry"]]
ids = [i for i, _ in feats]
geoms = [g for _, g in feats]
tree = STRtree(geoms)
aoi_idx = {}
out_cells = []
n_member = {}
for (reg, adm0, lat, lon, _sz, p, act, fed, n7) in cells:
    pt = Point(float(lon), float(lat))
    hit = [ids[k] for k in tree.query(pt) if geoms[k].contains(pt)]
    mem = []
    for h in sorted(hit):
        if h not in aoi_idx:
            aoi_idx[h] = len(aoi_idx)
        mem.append(aoi_idx[h])
        n_member[h] = n_member.get(h, 0) + 1
    out_cells.append([reg, adm0, r(lat, 4), r(lon, 4), r(p, 5), 1 if act else 0, None if fed is None else int(fed), None if n7 is None else int(n7), mem])
spread = {
    "release": RELEASE,
    "source": "spread_nowcast_latest.parquet",
    "as_of_date": as_of.isoformat(),
    "target_date": target.isoformat(),
    "model": model,
    "source_satellite": sat,
    "weather_available": bool(wx),
    "weather_lag_days": None if lag is None else int(lag),
    "cell_size_deg": 0.025,
    "cols": ["region", "cand_adm0", "cell_lat", "cell_lon", "p_spread", "active_today", "fire_event_days", "n_det_today_7x7", "aoi"],
    "aoi_ids": list(aoi_idx.keys()),
    "cells": out_cells,
}
with open(f"{OUT}/spread.json", "w", encoding="utf-8", newline="\n") as f:
    json.dump(spread, f, ensure_ascii=False, separators=(",", ":"))

man = {
    "release": RELEASE,
    "script": "scripts/snap-v12-fwi-spread.py",
    "sources": {n: {"bytes": os.path.getsize(f"{R}/{n}"), "sha256": sha(f"{R}/{n}")} for n in ["fwi_aoi_day.parquet", "spread_nowcast_latest.parquet", "aoi_boundaries.geojson"]},
    "files": {n: {"bytes": os.path.getsize(f"{OUT}/{n}"), "sha256": sha(f"{OUT}/{n}")} for n in ["fwi.json", "spread.json"]},
    "counts": {
        "fwi_aois": len(aois),
        "fwi_rows": sum(len(v["days"]) for v in aois.values()),
        "fwi_last_date": last.isoformat(),
        "spread_cells": len(out_cells),
        "spread_member": {k: n_member[k] for k in ["KR", "ADM0_ARG"] if k in n_member},
        "spread_member_aois": len(n_member),
    },
}
with open(f"{OUT}/manifest-fwi-spread.json", "w", encoding="utf-8", newline="\n") as f:
    json.dump(man, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(json.dumps(man["counts"], ensure_ascii=False))
