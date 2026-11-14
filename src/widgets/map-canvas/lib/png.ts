import { downloadCanvas } from "@/shared/ui/download";
import type { MapCanvasHandle } from "../ui/map-canvas";

/** 지도 PNG 내려받기(목업 map3d snapshot + 화면 「지도 PNG」): 제목 띠 붙인 스냅숏을 파일로 + 저장 토스트(「W × H PNG」). 성공하면 파일 이름 */
export function downloadMapPng(h: MapCanvasHandle | null, title: string, file: string): string | null {
  const c = h?.snapshot(title);
  if (!c) return null;
  const name = file.endsWith(".png") ? file : `${file}.png`;
  downloadCanvas(name, c);
  return name;
}
