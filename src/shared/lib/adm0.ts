/**
 * 나라 코드 ↔ release 지역 id.
 * 나라 색인(public/geo/countries.json — Natural Earth ISO_A3)과 release 의 나라 AOI(ADM0_<Natural Earth ADM0_A3>)는 거의 같지만
 * 네 나라가 다르다(잰 것 2026-11-15: 실서버 /aois?include_hidden=true 의 country 249행과 색인 241개를 맞댐).
 * 색인 쪽 코드로 ADM0_ 를 만들면 그 나라 행이 없어 화면이 전 세계·한국으로 돌아간다.
 * 색인에 있고 release 에 행이 없는 나라: TUV(투발루)·ATC(애시모어 카르티에 — 나라 칩 목록에서 빠짐). 이 둘은 맞출 상대가 없다.
 */
const ADM0_OF_ISO: Readonly<Record<string, string>> = { ALA: "ALD", ESH: "SAH", PSE: "PSX", SSD: "SDS" };
const ISO_OF_ADM0: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(ADM0_OF_ISO).map(([i, a]) => [a, i]));

/** 나라 색인 코드 → release 지역 id(한국 = KR, 그 밖 ADM0_<코드>) */
export const aoiOfIso3 = (iso3: string) => (iso3 === "KOR" ? "KR" : `ADM0_${ADM0_OF_ISO[iso3] ?? iso3}`);
/** release ADM0_ 뒤 세 글자 → 나라 색인 코드 */
export const iso3OfAdm0 = (code: string) => ISO_OF_ADM0[code] ?? code;
