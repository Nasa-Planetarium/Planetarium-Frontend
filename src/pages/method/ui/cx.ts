import s from "./method.module.css";

/** 목업 클래스 이름(공백 구분) → CSS 모듈 이름. 모듈에 없는 이름은 버린다 */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .map((n) => s[n])
    .filter(Boolean)
    .join(" ");
}
