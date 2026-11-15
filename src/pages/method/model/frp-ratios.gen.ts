/**
 * 자동 생성 — scripts/build-v12-frs-snapshot.py. 손으로 고치지 말 것.
 * 원천: release data-v1.2-2026-11-15 reports/frp_snpp_ratios.csv (sha256 c5a21d19a189789e…) 의 year=all 행.
 * ratio = Σ FRP(위성) / Σ FRP(S-NPP) 칸·날 중앙값(낮·밤 따로). frp_snpp_equiv = frp ÷ ratio. 값은 파일 값 소수 3자리 반올림.
 * 계약(/methods/current)에 이 표 필드가 없어 방법 설명 상수로 둔다(쟁점 — 계약에 frp_snpp_ratios 가 생기면 그쪽을 읽는다).
 */
export interface FrpRatio {
  satellite: string;
  daynight: "D" | "N";
  ratio: number;
  year_min: number;
  year_max: number;
  cell_days: number;
}
export const FRP_RATIOS: readonly FrpRatio[] = [
  {
    "satellite": "Aqua",
    "daynight": "D",
    "ratio": 1.141,
    "year_min": 1.12,
    "year_max": 1.195,
    "cell_days": 13873769
  },
  {
    "satellite": "Aqua",
    "daynight": "N",
    "ratio": 0.825,
    "year_min": 0.775,
    "year_max": 0.875,
    "cell_days": 876554
  },
  {
    "satellite": "N20",
    "daynight": "D",
    "ratio": 0.999,
    "year_min": 0.986,
    "year_max": 1.007,
    "cell_days": 19188045
  },
  {
    "satellite": "N20",
    "daynight": "N",
    "ratio": 1.018,
    "year_min": 1.006,
    "year_max": 1.027,
    "cell_days": 4796920
  },
  {
    "satellite": "N21",
    "daynight": "D",
    "ratio": 1.167,
    "year_min": 1.166,
    "year_max": 1.167,
    "cell_days": 5134341
  },
  {
    "satellite": "N21",
    "daynight": "N",
    "ratio": 1.222,
    "year_min": 1.216,
    "year_max": 1.231,
    "cell_days": 1348911
  },
  {
    "satellite": "Terra",
    "daynight": "D",
    "ratio": 0.963,
    "year_min": 0.91,
    "year_max": 0.996,
    "cell_days": 3188682
  },
  {
    "satellite": "Terra",
    "daynight": "N",
    "ratio": 2.406,
    "year_min": 2.202,
    "year_max": 2.641,
    "cell_days": 457817
  }
];
