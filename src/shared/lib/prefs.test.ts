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

describe("prefs — 사용자 상태는 탭 안(sessionStorage)에만, localStorage 0", () => {
  it("모든 키는 sessionStorage 에 쓰고 localStorage 에는 아무것도 안 쓴다", async () => {
    const { prefs } = await load();
    for (const [k, v] of [
      ["role", "scientist"],
      ["country", "JPN"],
      ["an.v3", "{}"],
      ["sensor", "viirs"],
      ["recentCountries", '["JPN"]'],
      ["clockUTC", "1"],
    ] as const) {
      prefs.set(k, v);
      expect(session.getItem(`em.${k}`)).toBe(v);
      expect(prefs.get(k)).toBe(v);
    }
    expect(local.length).toBe(0);
  });

  it("옛 판이 localStorage 에 남긴 em.* 는 처음 닿을 때 전부 지우고, em. 아닌 키는 둔다", async () => {
    for (const k of ["lang", "clockUTC", "role", "country", "recentCountries", "sensor", "an.v3", "future"]) local.setItem(`em.${k}`, "old");
    local.setItem("other.app", "keep");
    const { prefs } = await load();
    expect(prefs.get("country")).toBeNull();
    expect(local.length).toBe(1);
    expect(local.getItem("other.app")).toBe("keep");
  });

  it("clearUserState: 이 탭의 em.* 를 모두 지우고 개수를 돌려준다(다른 키는 둔다)", async () => {
    const { prefs, clearUserState } = await load();
    prefs.set("role", "land");
    prefs.set("country", "JPN");
    session.setItem("t.flag", "1");
    expect(clearUserState()).toBe(2);
    expect(prefs.get("role")).toBeNull();
    expect(session.getItem("t.flag")).toBe("1");
    expect(clearUserState()).toBe(0);
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
    const { prefs, clearUserState } = await load();
    expect(prefs.get("country")).toBeNull();
    expect(() => prefs.set("country", "JPN")).not.toThrow();
    expect(clearUserState()).toBe(0);
  });
});
