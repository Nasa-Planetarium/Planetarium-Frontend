/**
 * 브라우저 편의값(언어·나라·최근 나라·시계 UTC)만 localStorage 에 둔다. 키 접두사 「em.」 은 목업과 같다.
 * 사생활 모드·저장 차단에서도 화면이 깨지지 않게 모든 읽기·쓰기를 try/catch 로 감싼다.
 * 역할(로그인)은 여기 두지 않는다 — AuthPort 어댑터가 정한다.
 */
export const prefs = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(`em.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value == null) window.localStorage.removeItem(`em.${key}`);
      else window.localStorage.setItem(`em.${key}`, value);
    } catch {
      /* 저장 안 됨: 다음에 기본값 */
    }
  },
};
