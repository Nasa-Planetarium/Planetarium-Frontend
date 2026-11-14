# 비어 있는 폴더 (지우지 말 것)

Next.js 는 루트에 `app/`·`pages/` 가 있으면 `src/app`·`src/pages` 를 경로로 읽지 않는다.
그래서 이 빈 `pages/` 를 두고, FSD 층 `src/app`(앱 층)·`src/pages`(화면 층)를 그 이름 그대로 쓴다(steiger 가 층으로 알아봄).
경로 파일은 루트 `app/` 에만 둔다. 이 폴더에 .tsx/.ts 를 넣으면 Pages Router 경로가 생기니 넣지 않는다.
