// 목 모듈 공개 API — 조립 지점 src/app/boot/adapters.ts 만 import 한다(격리 규칙 F5·F6).
// 목 데이터·생성기는 이 폴더(src/shared/mock) 안에만 둔다. 실제 데이터 모듈과 서로 import 금지(pnpm check:isolation).
export { MockAgencyAdapter } from "./agency";
export { MockAuthAdapter } from "./auth";
