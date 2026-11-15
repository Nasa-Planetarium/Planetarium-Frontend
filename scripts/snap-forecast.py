#!/usr/bin/env python3
"""
예측 분석(lab) 30일 전망 MSW 스냅숏 — 모델팀 FireOutlook Planner(`planetarium.forecast.forecast`)를 **실제로 불러** 받은 응답을 그대로 담는다.
값을 손으로 만들거나 다시 계산하지 않는다(결정 A1). 화면(DATA_MODE=http)은 POST /api/v1/forecast 만 부르고 이 파일을 읽지 않는다.

쓰는 법(모델 레포 Nasa-Planetarium/Planetarium-AI 를 clone 하고 data/processed/ 에 release data-v1.2-2026-11-15 파일을 둔 뒤, 이 저장소 루트에서):
  uv run --project <모델 레포> python scripts/snap-forecast.py --ai <모델 레포> --today 2026-11-15

만드는 것:
  public/data/snap/forecast.json   요청 본문 → 응답(모델 함수 반환값 그대로) 목록 + 출처(모델 레포 커밋 · planner 파일 sha256 · today)

질의(모두 horizon_days 30 — 화면 기본):
  - 한국 시도 17곳(기본 강원 SIDO_51) · 아르헨티나 주 24곳(기본 코르도바 ADM1_ARG-1299) — 지역 고르기 목록
  - 시군구 SGG_47730(의성군, 30일은 skill none → 평년 값) · SGG_31140(울산 남구, 산업 열원 의심)
  - 사각형 1개(강릉·동해·삼척 둘레) · 다각형 1개(경북 북부 의성·안동·청송·영덕 둘레)
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")

ap = argparse.ArgumentParser()
ap.add_argument("--ai", required=True, help="모델 레포 경로(Planetarium-AI)")
ap.add_argument("--today", default="2026-11-15", help="오늘(KST) 고정 — 스냅숏이 날마다 바뀌지 않게")
ap.add_argument("--root", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
args = ap.parse_args()
AI = os.path.abspath(os.path.expanduser(args.ai))
ROOT = os.path.abspath(args.root)
sys.path.insert(0, AI)

import polars as pl  # noqa: E402  (모델 레포 환경)
from planetarium import forecast as F  # noqa: E402
from planetarium.config import PROCESSED_DATA_DIR  # noqa: E402

BBOX = [128.6, 37.2, 129.4, 37.9]  # 서, 남, 동, 북 — 강릉·동해·삼척 둘레
POLY = {  # 경북 북부(의성·안동·청송·영덕) 둘레, [경도, 위도]
    "type": "Polygon",
    "coordinates": [[[128.45, 36.25], [129.45, 36.25], [129.45, 36.75], [128.95, 36.85], [128.45, 36.65], [128.45, 36.25]]],
}

aoi = pl.read_parquet(PROCESSED_DATA_DIR / "aoi_list.parquet", columns=["aoi_id", "name", "level", "parent_aoi"])
sido = sorted(aoi.filter(pl.col("level") == "sido")["aoi_id"].to_list())
arg = sorted(aoi.filter((pl.col("level") == "adm1") & (pl.col("parent_aoi") == "ADM0_ARG"))["aoi_id"].to_list())
regions: list = [*sido, *arg, "SGG_47730", "SGG_31140", BBOX, POLY]

F.warmup()
out = []
for reg in regions:
    body = {"region": reg, "horizon_days": 30}
    arg_reg = tuple(reg) if isinstance(reg, list) else reg
    t0 = time.perf_counter()
    res = F.forecast(arg_reg, horizon_days=30, today=args.today)
    dt = time.perf_counter() - t0
    res = json.loads(json.dumps(res, ensure_ascii=False, default=str))  # date → 문자열(CLI 와 같은 직렬화)
    out.append({"body": body, "response": res})
    print(f"{json.dumps(reg)[:60]:60s} p_any={res['p_any']:<7} vs={res['value_source']:<16} skill={res['skill']:<4} cnt={res['expected_count']} days={len(res['daily'])} {dt:.3f}s")


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


planner = sorted(n for n in os.listdir(PROCESSED_DATA_DIR) if n.startswith("planner_") and not n.endswith(".csv"))
src = {n: sha(os.path.realpath(PROCESSED_DATA_DIR / n)) for n in [*planner, "aoi_list.parquet", "aoi_occurrence_nextmonth_latest.parquet", "grid_occurrence_nextmonth_latest.parquet"]}
commit = subprocess.run(["git", "-C", AI, "rev-parse", "--short", "HEAD"], capture_output=True, text=True, encoding="utf-8", errors="replace").stdout.strip()
names = {r["aoi_id"]: r["name"] for r in aoi.filter(pl.col("aoi_id").is_in([x for x in regions if isinstance(x, str)])).to_dicts()}

snap = {
    "format": "forecast-snap-1",
    "release": "data-v1.2-2026-11-15",
    "made_by": "scripts/snap-forecast.py (planetarium.forecast.forecast 를 직접 부름)",
    "model_repo_commit": commit,
    "today_kst": args.today,
    "sources_sha256": src,
    "names": names,
    "presets": {"KOR": sido, "ARG": arg},
    "items": out,
}
p = os.path.join(ROOT, "public", "data", "snap", "forecast.json")
with open(p, "w", encoding="utf-8", newline="\n") as f:
    json.dump(snap, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", os.path.relpath(p, ROOT), os.path.getsize(p), "bytes", len(out), "items")
