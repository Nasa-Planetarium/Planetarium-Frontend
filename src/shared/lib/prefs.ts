/**
 * 브라우저 저장값. 키 접두사 「em.」 은 목업과 같다.
 * 같은 브라우저를 여러 사람이 쓴다(심사장 등) — 앞사람 상태가 다음 사람에게 열리면 안 된다.
 *  · 사용자 상태(역할 role · 나라 country · 최근 나라 recentCountries · 센서 sensor · 비교 분석 조건 an.v3 · 그 밖의 모든 키)
 *    → sessionStorage: 새로 고침에는 남고, 탭(창)을 닫거나 새 창을 열면 기본값.
 *  · 화면 편의값(언어 lang · 시계 clockUTC)만 → localStorage(LOCAL_PREF_KEYS).
 * 옛 판이 localStorage 에 남긴 사용자 상태(LEGACY_LOCAL_KEYS)는 페이지가 처음 저장소에 닿을 때 지운다(앞사람 정리).
 * 사생활 모드·저장 차단에서도 화면이 깨지지 않게 모든 읽기·쓰기를 try/catch 로 감싼다.
 */
export const LOCAL_PREF_KEYS: readonly string[] = ["lang", "clockUTC"];
export const LEGACY_LOCAL_KEYS: readonly string[] = ["role", "country", "recentCountries", "sensor", "an.v3"];

let cleaned = false;
/** 옛 localStorage 사용자 상태 지우기 — 페이지마다 한 번. 새 코드는 이 키들을 localStorage 에 쓰지 않으므로 여러 번 불러도 같다 */
export function clearLegacyLocal(): void {
  if (cleaned) return;
  cleaned = true;
  try {
    for (const k of LEGACY_LOCAL_KEYS) window.localStorage.removeItem(`em.${k}`);
  } catch {
    /* 저장소 없음 */
  }
}

const area = (key: string): Storage => {
  clearLegacyLocal();
  return LOCAL_PREF_KEYS.includes(key) ? window.localStorage : window.sessionStorage;
};

export const prefs = {
  get(key: string): string | null {
    try {
      return area(key).getItem(`em.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      const s = area(key);
      if (value == null) s.removeItem(`em.${key}`);
      else s.setItem(`em.${key}`, value);
    } catch {
      /* 저장 안 됨: 다음에 기본값 */
    }
  },
};
