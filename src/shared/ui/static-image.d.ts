// 정적 이미지 가져오기 타입. next-env.d.ts(next/image-types/global)는 빌드가 만들고 저장소에 없어서,
// 빌드 전에 도는 typecheck(pnpm check·CI)가 './logo-mark.png' 를 못 찾는다 → 같은 선언을 여기 둔다.
declare module "*.png" {
  const content: import("next/image").StaticImageData;
  export default content;
}
