import { describe, expect, it } from "vitest";
import { BOM, csvCell, csvFileText, csvRowCount, metaLine, rowsToCsv } from "./csv";
import { crc32, unzipStore, zipBytes } from "./zip";

describe("csv 공통 규칙", () => {
  it("칸: RFC 4180 따옴표 · 결측은 빈 칸(0 아님) · 원값 그대로", () => {
    expect(csvCell('x,"y"')).toBe('"x,""y"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(0.123456789012)).toBe("0.123456789012");
    expect(csvCell("안동시,의성군")).toBe('"안동시,의성군"');
  });
  it("행 → CSV: cols 없으면 모든 키를 처음 나온 순서로", () => {
    expect(rowsToCsv([{ a: 1 }, { a: 2, b: "x" }])).toBe("a,b\n1,\n2,x");
    expect(rowsToCsv([{ a: 1, b: 2 }], ["b"])).toBe("b\n2");
  });
  it("메타 줄: data_version · 지역 · 기간 · 그 밖 — 쉼표·세미콜론은 공백", () => {
    expect(metaLine({ data_version: "v1.2#ab", aoi: "SIDO_47", aoi_name: "경상북도", period: "2025-03", source: "/cells", cell_size_deg: 0.1 })).toBe(
      "# data_version=v1.2#ab; aoi=SIDO_47 (경상북도); period=2025-03; source=/cells; cell_size_deg=0.1",
    );
    expect(metaLine({ data_version: null, aoi: "a,b;c" })).toBe("# data_version=; aoi=a b c");
  });
  it("파일 글: BOM 한 번만 · 메타 첫 줄 · 행 수는 주석·머리줄 빼고", () => {
    const t = csvFileText(`${BOM}a,b\n1,2\n3,4\n\n`, { data_version: "v", aoi: "KR", period: "2025" });
    expect(t.startsWith(BOM)).toBe(true);
    expect(t.slice(1).startsWith(BOM)).toBe(false);
    expect(t.split("\n")[0]).toBe(`${BOM}# data_version=v; aoi=KR; period=2025`);
    expect(t.split("\n")[1]).toBe("a,b");
    expect(csvRowCount(t)).toBe(2);
    expect(csvRowCount("a\n")).toBe(0);
  });
});

describe("zip(STORE)", () => {
  it("CRC-32 표준 값", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("묶고 다시 풀면 이름(한글)·바이트·CRC 가 같다", () => {
    const z = zipBytes([
      { name: "calendar_경상북도.csv", data: `${BOM}a\n1\n` },
      { name: "b.csv", data: new Uint8Array([1, 2, 3]) },
    ]);
    expect(z[0]).toBe(0x50);
    expect(z[1]).toBe(0x4b);
    const e = unzipStore(z);
    expect(e.map((x) => x.name)).toEqual(["calendar_경상북도.csv", "b.csv"]);
    expect(e.every((x) => x.crcOk)).toBe(true);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(e[0]!.data)).toBe(`${BOM}a\n1\n`);
    expect([...e[1]!.data]).toEqual([1, 2, 3]);
  });
});
