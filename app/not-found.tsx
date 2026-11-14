import Link from "next/link";

/** 없는 주소 — 언어를 모르므로 두 언어로 짧게. 정적 내보내기에서 out/404.html 이 된다 */
export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ background: "#0d0b09", color: "#f4efea", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <p>
          <Link href="/ko/calendar/" style={{ color: "inherit" }}>
            캘린더로
          </Link>{" "}
          ·{" "}
          <Link href="/en/calendar/" style={{ color: "inherit" }}>
            Go to Calendar
          </Link>
        </p>
      </body>
    </html>
  );
}
