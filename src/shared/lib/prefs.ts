/**
 * 브라우저 저장값. 키 접두사 「em.」 은 목업과 같다.
 * 같은 브라우저를 여러 사람이 쓴다(심사장·발표장) — 앞사람 상태가 다음 사람에게 열리면 안 된다(완전 격리).
 *  · 모든 사용자 상태(역할 role · 나라 country · 최근 나라 recentCountries · 센서 sensor · 비교 분석 조건 an.v3 · 시계 clockUTC …)
 *    → sessionStorage 하나: 새로 고침에는 남고, 탭(창)을 닫거나 새 창을 열면 기본값. localStorage 는 쓰지 않는다.
 *  · 언어는 저장하지 않는다 — 주소 접두사(/ko/ · /en/)가 정본.
 *  · 옛 판이 localStorage 에 남긴 em.* 는 페이지가 처음 저장소에 닿을 때 전부 지운다(앞사람 정리).
 *  · 무조작 자동 초기화(src/app/boot/idle-reset.tsx)는 clearUserState 로 이 탭의 em.* 를 비운다.
 * 사생활 모드·저장 차단에서도 화면이 깨지지 않게 모든 읽기·쓰기를 try/catch 로 감싼다.
 */
const P = "em.";

/** 저장소에서 em.* 키를 모두 지우고 지운 개수를 돌려준다 */
function dropAll(s: Storage): number {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k != null && k.startsWith(P)) keys.push(k);
  }
  for (const k of keys) s.removeItem(k);
  return keys.length;
}

let cleaned = false;
/** 옛 localStorage em.* 지우기 — 페이지마다 한 번. 새 코드는 localStorage 에 쓰지 않으므로 여러 번 불러도 같다 */
export function clearLegacyLocal(): void {
  if (cleaned) return;
  cleaned = true;
  try {
    dropAll(window.localStorage);
  } catch {
    /* 저장소 없음 */
  }
}

/** 이 탭의 사용자 상태(sessionStorage em.*)를 모두 지운다(옛 localStorage 도 함께). 지운 개수 */
export function clearUserState(): number {
  let n = 0;
  try {
    n += dropAll(window.sessionStorage);
  } catch {
    /* 저장소 없음 */
  }
  try {
    n += dropAll(window.localStorage);
  } catch {
    /* 저장소 없음 */
  }
  return n;
}

const area = (): Storage => {
  clearLegacyLocal();
  return window.sessionStorage;
};

export const prefs = {
  get(key: string): string | null {
    try {
      return area().getItem(`${P}${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      const s = area();
      if (value == null) s.removeItem(`${P}${key}`);
      else s.setItem(`${P}${key}`, value);
    } catch {
      /* 저장 안 됨: 다음에 기본값 */
    }
  },
};
