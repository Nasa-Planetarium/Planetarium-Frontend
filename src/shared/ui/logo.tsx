import Image from "next/image";
import logoMark from "./logo-mark.png";

/**
 * 로고 표지 — 불꽃 + 궤도(flame-orbit). 원본 남색 별 배경을 걷어 낸 투명 PNG(66px = 22px 의 3배, 붉은 후광 포함).
 * 접근성 이름은 감싸는 요소(머리줄 span role="img" aria-label="Emberline")가 가진다 → 여기는 꾸밈(alt="").
 * 정적 가져오기 → 빌드가 /_next/static/media/ 에 내용 해시 이름으로 내보낸다(1년 캐시 규칙에 들어감).
 */
export function LogoMark() {
  return <Image src={logoMark} alt="" aria-hidden="true" width={22} height={22} className="flex-none" draggable={false} />;
}
