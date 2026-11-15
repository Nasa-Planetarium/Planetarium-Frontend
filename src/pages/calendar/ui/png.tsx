"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Band, GridRow } from "../model/calendar";
import { CalSvg } from "./cal-svg";
import { tok } from "./bits";
import { notifyImageSaved, saveFile } from "@/shared/ui/download";

/**
 * 캘린더 이미지 PNG(목업 exportPNG · F10 ⑦): 연×월 격자(칸 30px, 기기와 무관하게 같은 판) + 제목 + 범례(램프·상태·값 출처 구간) + 진행 중 달 + 출처 줄.
 * SVG 를 그림(img)으로 그리면 웹 글꼴을 못 써 한글이 빈 네모가 된다(목업이 팀 시험 서버 헤드리스에서 잼) → 글자는 캔버스로 따로 쓴다.
 * 색은 토큰 var() → 지금 테마 값으로 바꿔 넣는다.
 */
const NS = "http://www.w3.org/2000/svg";
const resolveVars = (s: string) => s.replace(/var\(--([\w-]+)\)/g, (_, n: string) => tok(n) || "#000");

export interface PngInput {
  rows: GridRow[];
  ramp: (t: number) => string;
  scaleMax: number | null;
  bands: (Band & { label: string })[];
  title: string;
  sub: string;
  low: string;
  high: string;
  zero: string;
  missing: string;
  partial: string;
  partialLine: string | null;
  source: string;
  label: string;
  fileName: string;
}

export async function exportCalendarPng(o: PngInput) {
  const tmp = document.createElement("div");
  tmp.style.cssText = "position:fixed;left:-20000px;top:0;width:1100px;visibility:hidden";
  document.body.appendChild(tmp);
  try {
    const root = createRoot(tmp);
    flushSync(() => root.render(<CalSvg rows={o.rows} cs={30} ramp={o.ramp} scaleMax={o.scaleMax} yearEvery={1} eras bands={o.bands} bandText={false} label={o.label} />));
    const svg = tmp.querySelector("svg");
    if (!svg) throw new Error("no svg");
    const vb = svg.viewBox.baseVal;
    const pad = 16;
    const top = 52;
    const fw = Math.max(vb.width + pad * 2, 900);
    const el = (tag: string, at: Record<string, string | number>, txt?: string) => {
      const n = document.createElementNS(NS, tag);
      Object.entries(at).forEach(([k, v]) => n.setAttribute(k, String(v)));
      if (txt != null) n.textContent = txt;
      return n;
    };
    const ink = tok("text-1");
    const muted = tok("text-2");
    const out = el("svg", { xmlns: NS, "font-family": "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif" });
    out.appendChild(el("rect", { x: 0, y: 0, width: "100%", height: "100%", fill: tok("surface-0") }));
    out.appendChild(el("text", { x: pad, y: 24, fill: ink, "font-size": 16, "font-weight": 700 }, o.title));
    out.appendChild(el("text", { x: pad, y: 42, fill: muted, "font-size": 12 }, o.sub));
    const g = el("g", { transform: `translate(${pad},${top})` });
    g.innerHTML = resolveVars(svg.innerHTML);
    out.appendChild(g);
    root.unmount();
    let y = top + vb.height + 18;
    let x = pad;
    out.appendChild(el("text", { x, y: y + 10, fill: muted, "font-size": 11 }, o.low));
    x += 34;
    for (let i = 0; i < 7; i++) out.appendChild(el("rect", { x: x + i * 18, y, width: 18, height: 12, fill: o.ramp(i / 6) }));
    x += 7 * 18 + 6;
    out.appendChild(el("text", { x, y: y + 10, fill: muted, "font-size": 11 }, o.high));
    x += 150;
    const sw = (fill: string, stroke: string | null, dash: string | null, label: string) => {
      out.appendChild(el("rect", { x, y, width: 12, height: 12, fill, stroke: stroke ?? "none", ...(dash ? { "stroke-dasharray": dash } : {}) }));
      out.appendChild(el("text", { x: x + 17, y: y + 10, fill: muted, "font-size": 11 }, label));
      x += 24 + label.length * 7 + 14;
    };
    sw(tok("data-zero"), null, null, o.zero);
    sw(tok("hatch-bg"), tok("line-strong"), "2 2", o.missing);
    sw("none", muted, "3 2", o.partial);
    if (o.bands.length) {
      y += 22;
      x = pad;
      o.bands.forEach((b) => {
        out.appendChild(el("text", { x, y: y + 10, fill: ink, "font-size": 11 }, b.label));
        x += b.label.length * 6.6 + 18;
      });
    }
    y += 22;
    if (o.partialLine) {
      out.appendChild(el("text", { x: pad, y: y + 10, fill: ink, "font-size": 11 }, o.partialLine));
      y += 18;
    }
    out.appendChild(el("text", { x: pad, y: y + 10, fill: muted, "font-size": 11 }, o.source));
    const fh = y + 22;
    out.setAttribute("viewBox", `0 0 ${fw} ${fh}`);
    out.setAttribute("width", String(fw));
    out.setAttribute("height", String(fh));
    tmp.innerHTML = "";
    tmp.style.width = `${fw + 40}px`;
    out.style.cssText = `width:${fw}px;height:${fh}px;max-width:none;max-height:none;display:block`;
    tmp.appendChild(out);
    /* 글자 좌표(getCTM)·크기·색을 읽고, 래스터용 사본에서는 글자를 뺀다 */
    const texts = Array.from(out.querySelectorAll("text")).map((tx) => {
      const cs = getComputedStyle(tx);
      const m = tx.getCTM();
      const n0 = (a: string) => parseFloat(String(tx.getAttribute(a) ?? "0").split(/[\s,]+/)[0] ?? "0") || 0;
      return {
        s: tx.textContent ?? "",
        x: n0("x"),
        y: n0("y"),
        m: m ? [m.a, m.b, m.c, m.d, m.e, m.f] : [1, 0, 0, 1, 0, 0],
        anchor: tx.getAttribute("text-anchor") || "start",
        size: parseFloat(tx.getAttribute("font-size") || cs.fontSize) || 11,
        weight: tx.getAttribute("font-weight") || "400",
        fill: tx.getAttribute("fill") || ink,
        op: +(tx.getAttribute("fill-opacity") || "1"),
      };
    });
    const raster = out.cloneNode(true) as SVGSVGElement;
    raster.querySelectorAll("text").forEach((tx) => tx.remove());
    const xml = new XMLSerializer().serializeToString(raster);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("svg image"));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    });
    if (document.fonts?.ready) await document.fonts.ready;
    const c = document.createElement("canvas");
    c.width = fw * 2;
    c.height = fh * 2;
    const g2 = c.getContext("2d");
    if (!g2) throw new Error("no 2d");
    g2.drawImage(img, 0, 0, c.width, c.height);
    const fam = getComputedStyle(document.body).fontFamily || "sans-serif";
    texts.forEach((tx) => {
      if (!tx.s) return;
      g2.save();
      g2.setTransform(...(tx.m.map((v) => v * 2) as [number, number, number, number, number, number]));
      g2.font = `${tx.weight} ${tx.size}px ${fam}`;
      g2.fillStyle = tx.fill;
      g2.globalAlpha = tx.op || 1;
      g2.textAlign = tx.anchor === "middle" ? "center" : tx.anchor === "end" ? "right" : "left";
      g2.textBaseline = "alphabetic";
      g2.fillText(tx.s, tx.x, tx.y);
      g2.restore();
    });
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
    if (!blob) throw new Error("no blob");
    saveFile(o.fileName, blob);
    notifyImageSaved(o.fileName, c.width, c.height);
    return { width: c.width, height: c.height, bytes: blob.size };
  } finally {
    tmp.remove();
  }
}
