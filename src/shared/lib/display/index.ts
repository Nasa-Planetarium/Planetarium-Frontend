/**
 * 지도 표시 공통 부품(표시 규칙서 2026-11-15 R1–R14). 지도를 그리는 화면은 눈금 · 색 · 원 크기 · 단계 · 맞춤 · 섬 표지 · 문구를 여기서만 가져온다.
 * 「같은 뜻의 자료는 어느 나라, 어느 화면에서도 같은 모양, 색, 범례, 문구로 그린다. 표현을 바꾸는 기준은 지금 보이는 범위의 넓이 하나다.」
 */
export { UNIT_DEG, STEPS, N_STEPS, STEP_LABELS, density, stepOf, stepOfCell } from "./scale";
export { STEP_TOKENS, STEP_TOKENS_DARK, STEP_FALLBACK, DOT_TOKEN, DOT_EDGE_TOKEN, STATIC_TOKEN, CELL_OPACITY, DOT_AGE_OPACITY, tokVal, readStepColors, stepVar, useStepColors, stepColorExpr } from "./ramp";
export { CELLS1_MIN_AREA, POINTS_MAX_AREA, PX_MIN_ZOOM, HYST_BELOW, TILE_DEG, areaOf, levelOf, isCellLevel, isPointLevel, splitLon, tilesOf, tileKey, pointBoxes, boxHits } from "./level";
export type { Level, TimeWindow, Box } from "./level";
export { F, RMIN, RMAX, cellPx, radiusPx, radiusStops, radiusExpr, dotRadiusExpr, dotRadiusPx } from "./radius";
export { fitLon, boundsOf, boxBounds, lonInFit, FIT_PADDING, FIT_MAX_ZOOM } from "./fit";
export type { LL } from "./fit";
export { islandMarkers, ISLAND_MIN_PX, ISLAND_MERGE_PX } from "./island";
export { LEVEL_KEY, KEY_LEVEL, STATUS_KEY, TAIL_KEY } from "./copy";
export type { MapStatusKind } from "./copy";
