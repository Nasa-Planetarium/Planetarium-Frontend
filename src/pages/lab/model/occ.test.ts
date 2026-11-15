import { describe, expect, it } from "vitest";
import { CARD, bandOf, cardRows, cellRing, geomBounds, pct, ppDiff, shadeOf, sortOcc, topCells } from "./occ";

describe("다음 달 발생 확률 화면 규칙", () => {
  it("색 단계 경계: 10%·40%·70% 는 위 단계", () => {
    expect([0, 0.0999, 0.1, 0.3999, 0.4, 0.6999, 0.7, 1].map(bandOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(bandOf(null)).toBeNull();
    expect(shadeOf(0.9, true)).toBe(4);
  });
  it("확률 표기", () => {
    expect(pct(0)).toBe("0%");
    expect(pct(0.004)).toBe("<1%");
    expect(pct(0.41973)).toBe("42%");
    expect(pct(0.996)).toBe(">99%");
    expect(pct(1)).toBe("100%");
    expect(pct(null)).toBe("–");
    expect(ppDiff(0.41973, 0.42857)).toBe("−1%p");
    expect(ppDiff(0.6, 0.4)).toBe("+20%p");
  });
  it("칸 사각형·상자", () => {
    expect(cellRing(-54.75, -68.25)[0]).toEqual([-68.5, -55]);
    expect(geomBounds([{ type: "Polygon", coordinates: [cellRing(36, 128)] }])).toEqual([127.75, 35.75, 128.25, 36.25]);
    expect(geomBounds([null])).toBeNull();
  });
  it("산업 열원 의심은 정렬과 상관없이 맨 아래", () => {
    const rows = [
      { name: "가", p_any: 0.9, baseline_p: 0.5, suspected_industrial: true },
      { name: "나", p_any: 0.2, baseline_p: 0.1, suspected_industrial: false },
      { name: "다", p_any: 0.5, baseline_p: 0.6, suspected_industrial: false },
    ];
    expect(sortOcc(rows, "p", -1, "ko").map((r) => r.name)).toEqual(["다", "나", "가"]);
    expect(sortOcc(rows, "p", 1, "ko").map((r) => r.name)).toEqual(["나", "다", "가"]);
  });
  it("검증 카드: release meta 값(모델이 두 기준선보다 PR-AUC 높고 Brier 낮음)", () => {
    expect(CARD.release).toBe("data-v1.2-2026-11-15");
    const k = cardRows("KOR", "Asia");
    expect(k.map((r) => r.row.group)).toEqual(["ALL", "KOR", "KR_SGG"]);
    for (const { row } of k) {
      expect(row.model.pr_auc).toBeGreaterThan(row.same_month.pr_auc);
      expect(row.model.brier).toBeLessThan(row.same_month.brier);
    }
    expect(cardRows("FRA", "Europe").map((r) => r.row.group)).toEqual(["ALL", "Europe"]);
  });
});

describe("상위 칸(top_cells 가 응답에 없을 때)", () => {
  const c = (lon: number, lat: number, p: number, ps = false) => ({ lon, lat, p_any: p, persistent_source: ps });
  it("경계 안 · 지속 열원 제외 · p_any 큰 순 · 최대 n", () => {
    const inBox = (x: number, y: number) => x >= 0 && x <= 10 && y >= 0 && y <= 10;
    const cells = [c(1, 1, 0.2), c(2, 2, 0.9, true), c(3, 3, 0.5), c(20, 20, 0.99), c(4, 4, 0.7)];
    expect(topCells(cells, inBox, 2).map((x) => x.p_any)).toEqual([0.7, 0.5]);
    expect(topCells(cells, inBox).length).toBe(3);
    expect(topCells([], inBox)).toEqual([]);
  });
});
