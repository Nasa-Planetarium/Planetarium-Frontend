/**
 * ZIP 한 개를 브라우저에서 만든다(압축 없음 STORE — 의존성 없이, 몇 MB CSV 묶음용).
 * 파일 이름은 UTF-8(일반 목적 비트 11) — 한글 이름도 압축 풀기 도구가 깨지 않게.
 * 표준: PKWARE APPNOTE 4.3.7 로컬 머리 · 중앙 디렉터리 · 끝 레코드. 4GB·65,535개 넘는 묶음은 다루지 않는다(ZIP64 없음).
 */
let TABLE: Uint32Array | null = null;
function crcTable() {
  if (TABLE) return TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  TABLE = t;
  return t;
}

/** CRC-32(IEEE) */
export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
}

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** 항목들 → ZIP 바이트 */
export function zipBytes(entries: readonly ZipEntry[], when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosTime(when);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const crc = crc32(data);
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);
    locals.push(lh, data);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    centrals.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** ZIP 바이트 → 항목(이름 · 바이트) — 시험용(STORE 만 읽는다) */
export function unzipStore(buf: Uint8Array): { name: string; data: Uint8Array; crcOk: boolean }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: { name: string; data: Uint8Array; crcOk: boolean }[] = [];
  const dec = new TextDecoder();
  let o = 0;
  while (o + 30 <= buf.length && dv.getUint32(o, true) === 0x04034b50) {
    const crc = dv.getUint32(o + 14, true);
    const size = dv.getUint32(o + 18, true);
    const nl = dv.getUint16(o + 26, true);
    const xl = dv.getUint16(o + 28, true);
    const name = dec.decode(buf.subarray(o + 30, o + 30 + nl));
    const s = o + 30 + nl + xl;
    const data = buf.subarray(s, s + size);
    out.push({ name, data, crcOk: crc32(data) === crc });
    o = s + size;
  }
  return out;
}
