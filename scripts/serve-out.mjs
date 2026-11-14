#!/usr/bin/env node
/**
 * 정적 내보내기 결과(out/ 또는 --dir)를 로컬에서 서빙하는 작은 서버 — 시험·스크린샷용(운영은 nginx).
 * 쓰는 법: node scripts/serve-out.mjs [--dir out] [--port 8797] [--host 127.0.0.1]
 * trailingSlash 규칙: /ko/calendar/ → out/ko/calendar/index.html. 없는 경로 → 404.html.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const dir = path.resolve(arg("--dir", "out"));
const port = Number(arg("--port", process.env.PORT ?? 8797));
const host = arg("--host", "127.0.0.1");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".bin": "application/octet-stream", ".md": "text/markdown; charset=utf-8", ".map": "application/json",
};

http
  .createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    let p = path.normalize(path.join(dir, decodeURIComponent(u.pathname)));
    if (!p.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p) && fs.existsSync(`${p}.html`)) p = `${p}.html`;
    if (!fs.existsSync(p)) {
      const nf = path.join(dir, "404.html");
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "404");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream", "Cache-Control": "no-store", "Service-Worker-Allowed": "/" });
    fs.createReadStream(p).pipe(res);
  })
  .listen(port, host, () => console.log(`serve ${dir} → http://${host}:${port}`));
