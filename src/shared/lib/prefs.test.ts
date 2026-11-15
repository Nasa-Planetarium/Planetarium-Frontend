import { beforeEach, describe, expect, it, vi } from "vitest";

/** 메모리 Storage — 시험 환경(node)에는 window 가 없어 직접 단다 */
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

let local: MemStorage;
let session: MemStorage;

async function load() {
  vi.resetModules();
  return import("./prefs");
}

beforeEach(() => {
  local = new MemStorage();
  session = new MemStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
});

describe("prefs — 사용자 상태는 탭 안에서만", () => {
  it("사용자 상태 키는 sessionStorage, 화면 편의값만 localStorage", async () => {
    const { prefs } = await load();
    prefs.set("country", "JPN");
    prefs.set("an.v3", "{}");
    prefs.set("sensor", "viirs");
    prefs.set("recentCountries", '["JPN"]');
    prefs.set("lang", "en");
    prefs.set("clockUTC", "1");
    expect(session.getItem("em.country")).toBe("JPN");
    expect(session.getItem("em.an.v3")).toBe("{}");
    expect(session.getItem("em.sensor")).toBe("viirs");
    expect(session.getItem("em.recentCountries")).toBe('["JPN"]');
    expect(local.getItem("em.country")).toBeNull();
    expect(local.getItem("em.lang")).toBe("en");
    expect(local.getItem("em.clockUTC")).toBe("1");
    expect(session.getItem("em.lang")).toBeNull();
  });

  it("옛 판이 localStorage 에 남긴 사용자 상태는 처음 닿을 때 지우고, 언어·시계는 둔다", async () => {
    for (const k of ["role", "country", "recentCountries", "sensor", "an.v3"]) local.setItem(`em.${k}`, "old");
    local.setItem("em.lang", "ja");
    local.setItem("em.clockUTC", "1");
    const { prefs } = await load();
    expect(prefs.get("country")).toBeNull();
    for (const k of ["role", "country", "recentCountries", "sensor", "an.v3"]) expect(local.getItem(`em.${k}`)).toBeNull();
    expect(prefs.get("lang")).toBe("ja");
    expect(prefs.get("clockUTC")).toBe("1");
  });

  it("저장소가 막혀도 던지지 않는다", async () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    });
    const { prefs } = await load();
    expect(prefs.get("country")).toBeNull();
    expect(() => prefs.set("country", "JPN")).not.toThrow();
  });
});
