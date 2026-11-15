#!/usr/bin/env python3
"""
release v1.2 fire_events.parquet -> public/data/layers/fire-events.json (MSW 시험용 스냅숏, 결정 F15).

쓰는 법(pyarrow 가 있는 파이썬):
  python -I scripts/snap-fire-events.py --release <release 폴더> [--out public/data/layers/fire-events.json]

값은 release 파일 그대로다(A1). 이 스크립트는 「행 고르기(자르기)」와 「AOI 소속 색인」만 만든다 — 값을 다시 계산하지 않는다.
- 한국(region KR): 12,397행 전부.
- 아르헨티나(region ARG, 1,228,581행)는 다 실을 수 없어 셋을 합친다(잘라 낸 규칙은 out.slices 에 그대로 적는다):
    (a) end_date >= RECENT_FROM 인 사건 전부(최근 창 — 상황판 기간)
    (b) 2016-01-01..2025-12-31 과 겹치는 사건 중 burned_area_km2 큰 순 TOP_BURNED 건(피해 면적 화면)
    (c) 달마다(2000-11..) 그 달과 겹치는 사건 중 sum_weight 큰 순 MONTH_TOP 건(캘린더·분석 달 카드)
  + 달마다 ADM0_ARG 사건 수(겹침 기준, 감지 1개 이상 · 3개 이상) — 위 (c) 만으로는 total 을 못 내므로 파일에서 센 값.
- AOI 소속(계약 /fire-events 설명의 aoi_id 대응, 2026-11-15 F15 검토 규칙):
    KR = country == 'KOR' · ADM0_ARG = country == 'ARG' · SIDO_* = sido_nm == aoi_list.name ·
    SGG_* = sgg_all 이름을 aoi_list 시군구로 풀기(전국 하나뿐인 이름 -> 그것, 동명 -> 부모 시도 이름 == sido_nm, 못 풀면 버림).
"""
import argparse
import hashlib
import json
import math
import os
import sys

import pyarrow.parquet as pq

RECENT_FROM = "2026-10-01"
TOP_BURNED = 60
MONTH_TOP = 3
PAST = ("2016-01-01", "2025-12-31")
COLS = [
    "event_id", "region", "start_date", "end_date", "duration_days", "n_det", "sum_weight", "frp_sum", "frp_max",
    "centroid_lat", "centroid_lon", "lat_min", "lat_max", "lon_min", "lon_max", "burned_area_km2", "burn_confirmed",
    "instrument", "n_viirs", "n_modis", "country", "adm1_code", "sido_nm", "sgg_cd", "sgg_nm", "sgg_all",
]


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def clean(v):
    """parquet 값 -> JSON 값. float32 열은 파일 값을 짧게 적되(유효 7자리 = float32 정밀도) 값은 바꾸지 않는다"""
    if v is None:
        return None
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if v == 0:
            return 0.0  # -0.0 은 0 으로
        return float(f"{v:.7g}")
    return v


def month_list(a, b):
    y, m = map(int, a.split("-"))
    y1, m1 = map(int, b.split("-"))
    out = []
    while (y, m) <= (y1, m1):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def month_end(ym):
    y, m = map(int, ym.split("-"))
    nd = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return f"{ym}-{nd:02d}"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data", "layers", "fire-events.json"))
    a = ap.parse_args()
    rel = os.path.abspath(a.release)
    fe_path = os.path.join(rel, "fire_events.parquet")
    al_path = os.path.join(rel, "aoi_list.parquet")

    t = pq.read_table(fe_path, columns=COLS)
    n_file = t.num_rows
    d = t.to_pydict()
    for k in ("start_date", "end_date"):
        d[k] = [x.isoformat() if x is not None else None for x in d[k]]
    al = pq.read_table(al_path, columns=["aoi_id", "name", "level", "parent_aoi"]).to_pydict()
    aoi_name = dict(zip(al["aoi_id"], al["name"]))
    sido_by_name = {}
    sgg_by_name = {}
    for i, lv in enumerate(al["level"]):
        if lv == "sido":
            sido_by_name[al["name"][i]] = al["aoi_id"][i]
        elif lv == "sgg":
            sgg_by_name.setdefault(al["name"][i], []).append((al["aoi_id"][i], al["parent_aoi"][i]))

    def sgg_of(i):
        names = d["sgg_all"][i]
        if not names:
            return []
        out = []
        for nm in [x.strip() for x in names.split(",") if x.strip()]:
            cands = sgg_by_name.get(nm, [])
            if len(cands) == 1:
                out.append(cands[0][0])
            elif len(cands) > 1:
                hit = [c for c in cands if aoi_name.get(c[1]) == d["sido_nm"][i]]
                if len(hit) == 1:
                    out.append(hit[0][0])
        return out

    n = n_file
    region = d["region"]
    sd, ed = d["start_date"], d["end_date"]
    kr = [i for i in range(n) if region[i] == "KR"]
    arg = [i for i in range(n) if region[i] == "ARG"]
    max_day = max(x for x in ed if x)
    months = month_list(min(x for x in sd if x)[:7], max_day[:7])

    # 아르헨티나 자르기
    pick = set(i for i in arg if ed[i] >= RECENT_FROM)
    n_recent = len(pick)
    past = [i for i in arg if sd[i] <= PAST[1] and ed[i] >= PAST[0] and d["burned_area_km2"][i] is not None]
    past.sort(key=lambda i: (-d["burned_area_km2"][i], d["event_id"][i]))
    pick.update(past[:TOP_BURNED])
    arg_country = [i for i in arg if d["country"][i] == "ARG"]
    month_counts = {}
    by_month = {ym: [] for ym in months}
    for i in arg_country:
        for ym in month_list(sd[i][:7], ed[i][:7]):
            if ym in by_month:
                by_month[ym].append(i)
    for ym, lst in by_month.items():
        month_counts[ym] = [len(lst), sum(1 for i in lst if d["n_det"][i] >= 3)]
        top = sorted(lst, key=lambda i: (-(d["sum_weight"][i] or 0), d["event_id"][i]))[:MONTH_TOP]
        top3 = sorted([i for i in lst if d["n_det"][i] >= 3], key=lambda i: (-(d["sum_weight"][i] or 0), d["event_id"][i]))[:MONTH_TOP]
        pick.update(top)
        pick.update(top3)

    rows_idx = kr + sorted(pick, key=lambda i: d["event_id"][i])
    pos = {i: k for k, i in enumerate(rows_idx)}
    rows = [[clean(d[c][i]) for c in COLS] for i in rows_idx]

    # AOI 소속 색인(행 번호 = rows 의 자리)
    member = {}

    def add(aoi, i):
        member.setdefault(aoi, []).append(pos[i])

    unresolved = 0
    for i in kr:
        if d["country"][i] == "KOR":
            add("KR", i)
        s = sido_by_name.get(d["sido_nm"][i]) if d["sido_nm"][i] else None
        if s:
            add(s, i)
        g = sgg_of(i)
        if d["sgg_all"][i] and not g:
            unresolved += 1
        for x in g:
            add(x, i)
    for i in rows_idx:
        if region[i] == "ARG" and d["country"][i] == "ARG":
            add("ADM0_ARG", i)

    out = {
        "release": "data-v1.2-2026-11-15",
        "source": {"file": "fire_events.parquet", "sha256": sha256(fe_path), "rows": n_file, "aoi_list_sha256": sha256(al_path)},
        "max_day": max_day,
        "cols": COLS,
        "rows": rows,
        "aoi": member,
        "regions": {"KR": "full", "ARG": "slice"},
        "slices": {
            "KR": {"rule": "region == KR, 전부", "rows": len(kr)},
            "ARG": {
                "rule": f"(a) end_date >= {RECENT_FROM} 전부 · (b) {PAST[0]}..{PAST[1]} 겹침 중 burned_area_km2 상위 {TOP_BURNED} · (c) 달마다 겹치는 ADM0_ARG 사건 sum_weight 상위 {MONTH_TOP}(감지 1개 이상·3개 이상 각각)",
                "recent_from": RECENT_FROM,
                "rows": len(pick),
                "rows_recent": n_recent,
                "rows_in_file": len(arg),
            },
        },
        "month_counts": {"ADM0_ARG": month_counts},
        "sgg_unresolved": unresolved,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(json.dumps({"out": a.out, "bytes": os.path.getsize(a.out), "rows": len(rows), "kr": len(kr), "arg_pick": len(pick), "arg_recent": n_recent, "aoi": len(member), "KR": len(member.get("KR", [])), "ADM0_ARG": len(member.get("ADM0_ARG", [])), "sgg_unresolved": unresolved, "max_day": max_day}, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
