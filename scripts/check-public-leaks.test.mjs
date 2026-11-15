import { describe, expect, it } from "vitest";
import { parseAllow, scanText } from "./check-public-leaks.mjs";

/* 잡혀야 하는 값은 이 시험 파일 자체가 잡히지 않게 나눠 쓴다 */
const HOST = ["ai", "box"].join("");
const rules = (s) => scanText(s).map((h) => h.rule);

describe("check-public-leaks", () => {
  it("네 규칙이 각각 잡는다", () => {
    expect(rules(`http://192.${168}.0.7:8080`)).toEqual(["ip"]);
    expect(rules(`"/home/${"someone"}/x"`)).toEqual(["home"]);
    expect(rules(`ssh ${HOST}`)).toEqual(["host"]);
    expect(rules(`localhost:${18490}/api`)).toEqual(["port"]);
    expect(rules(`(:${19001} 표본)`)).toEqual(["port"]);
  });

  it("주소와 포트가 같이 있으면 둘 다", () => {
    expect(rules(`http://192.${168}.0.10:${18490}`)).toEqual(["ip", "port"]);
  });

  it("포트·홈 경로가 아닌 것은 거른다", () => {
    expect(rules(`{"area_km2":${18234},"pt":${19517}}`)).toEqual([]);
    expect(rules(`page.goto("/ko/home/")`)).toEqual([]);
    expect(rules(`@/pages/home/ui`)).toEqual([]);
    expect(rules(`http://localhost:8080 · 19:12 KST · my${HOST}es`)).toEqual([]);
  });

  it("줄 번호를 준다", () => {
    expect(scanText(`a\nb ${HOST}\n`)).toEqual([{ line: 2, rule: "host", text: HOST }]);
  });

  it("예외 파일 — 파일 전체 / 파일+글자, 주석은 버린다", () => {
    const a = parseAllow(`# 설명\nvendor/x.txt\nsrc/a.ts ${HOST}  # 이유\n\n`);
    expect([...a.files]).toEqual(["vendor/x.txt"]);
    expect([...a.pairs]).toEqual([`src/a.ts ${HOST}`]);
  });
});
