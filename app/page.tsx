/**
 * 루트 / — 언어를 고르고 /<언어>/calendar/ 로 보낸다(정적 내보내기라 서버 언어 협상이 없다).
 * 순서(목업 index.html 과 같음): 목업식 해시 lang → 저장값 em.lang → navigator.languages → en.
 * 쿼리(?c= 등)는 그대로 넘긴다.
 */
import Link from "next/link";

const SCRIPT = `(function(){try{var ok={ko:1,en:1},lang=null,hq=(location.hash.split("?")[1]||"").split("&");
for(var i=0;i<hq.length;i++){var kv=hq[i].split("=");if(kv[0]==="lang"&&ok[kv[1]])lang=kv[1]}
if(!lang){try{var sv=localStorage.getItem("em.lang");if(ok[sv])lang=sv}catch(e){}}
if(!lang){var nl=navigator.languages||[navigator.language||""];for(var j=0;j<nl.length&&!lang;j++){var b=String(nl[j]).toLowerCase().split("-")[0];if(ok[b])lang=b}}
lang=lang||"en";location.replace("/"+lang+"/calendar/"+location.search)}catch(e){location.replace("/en/calendar/")}})();`;

export default function RootPage() {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark" />
        <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      </head>
      <body style={{ background: "#0d0b09" }}>
        <noscript>
          <Link href="/en/calendar/">Emberline</Link>
        </noscript>
      </body>
    </html>
  );
}
