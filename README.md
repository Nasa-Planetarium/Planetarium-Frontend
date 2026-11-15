# EMBERLINE 프런트 (Next.js)

연소 활동 캘린더가 앞에 선 산불 관제 웹. 목업(`planetarium-mockup`)을 Next.js 로 새로 짓는다.
이 저장소는 **골격과 공통 층**까지다 — 화면 8개는 제목만 있는 빈 껍데기이고, 화면 담당이 채운다(소유 폴더는 [OWNERS.md](OWNERS.md)).

- 화면 정본 = 목업. **디자인은 목업 그대로**: shadcn/ui·Radix 는 동작·접근성 원소로만 쓰고, 겉모양은 목업 CSS 를 토큰·Tailwind 로 옮긴다. shadcn 기본 둥근 모서리·그림자·색이 화면에 보이면 결함이다.
- 결정 원장: `planetarium-spec/00-decisions.md` (A–G). 설계: `planetarium-spec/architecture/frontend-design.md`. 계약: `contract/openapi.yaml`(사본, 원본 `planetarium-spec/contract`).
- 이 소스는 프런트 팀에 **소스로 전달**한다(결정 G3). 원격 저장소 = `Nasa-Planetarium/Planetarium-Frontend`(GitHub) — `main` 개발, `release` 로 머지하면 배포(아래 「배포」).

## 실행

Node ≥ 22.18, pnpm 10.34.9(`packageManager` 고정 — pnpm 이 없으면 `corepack enable` 이 이 판을 받아 준다).

```bash
corepack enable                     # 처음 한 번(pnpm 이 이미 있으면 생략)
pnpm install --frozen-lockfile      # lock 그대로. 「Ignored build scripts: @parcel/watcher, @swc/core」 안내는 무시해도 된다(미리 빌드된 바이너리를 씀)
cp .env.example .env.local          # 필요하면 값 바꾸기(아래 「목 ↔ 실제 교체」)
pnpm dev                            # http://localhost:8797/ko/calendar/
pnpm build                          # 정적 내보내기 → out/ (환경변수 없으면 MSW 모드 — 운영 빌드는 아래 「배포」)
node scripts/serve-out.mjs          # out/ 을 127.0.0.1:8797 에서 확인
```

검사 — 커밋 전에 전부 통과해야 한다:

```bash
pnpm check            # typecheck · eslint · steiger · check:isolation · vitest
pnpm exec playwright install chromium   # 처음 한 번 — e2e 용 브라우저 받기
pnpm build && pnpm e2e                  # Playwright(out/ 을 띄워 연다). 이미 받아 둔 다른 판 chromium 을 쓰려면 PW_CHROMIUM=<실행 파일>
node scripts/check-isolation.mjs --self-test   # 격리 검사기가 실제로 위반을 잡는지(가짜 위반 3개)
node scripts/check-pages-out.mjs --mode http   # 빌드 결과가 Pages 한도 안인지 + 빌드에 박힌 데이터 모드(배포 전 문, CI 도 돈다)
```

## 배포 (Cloudflare Pages · GitHub Actions)

```
기능 가지 ──PR──▶ main ──PR(머지)──▶ release ──push──▶ deploy.yml ──▶ Cloudflare Pages(운영)
                  │                      │
                  └─ ci.yml              └─ ci.yml
```

- **main** = 개발. PR·main·release 에 올라온 커밋마다 `.github/workflows/ci.yml` 이 돈다:
  `pnpm install --frozen-lockfile` → `pnpm check` → 빌드 두 벌(http · msw) + `check-pages-out` → `pnpm e2e`(MSW 빌드, Playwright chromium).
- **release 로 머지 = 배포.** `.github/workflows/deploy.yml` 이 `pnpm check` → http 빌드 → `check-pages-out --mode http` →
  `cloudflare/wrangler-action`(wrangler 4.155.0)로 `pages deploy out --branch=main` 을 한다. 수동 실행(Actions › deploy › Run workflow)도 **release 가지에서만** 배포한다.
  배포는 한 번에 하나(`concurrency: deploy-production`), GitHub 환경 `production` 에 기록된다.
- 배포 빌드는 **실서버 모드로 고정**(`NEXT_PUBLIC_DATA_MODE=http`, `NEXT_PUBLIC_API_BASE=/api/v1`). 값을 환경변수로 주고, `check-pages-out` 이
  결과물 청크에 박힌 값을 다시 읽어 `http` 가 아니면 배포 전에 멈춘다. 기관 연동·로그인은 아직 목 어댑터(`mock`, 기본값) 그대로다.
- 액션은 커밋 SHA 로 고정했다(뒤 주석이 태그). wrangler 는 저장소 의존성에 넣지 않았다 — 배포 액션이 그 판을 러너 안에서만 설치한다.

### 무엇이 어디로 가나

| 경로 | 누가 응답 | 캐시(`public/_headers`) |
|---|---|---|
| `/_next/static/*` | 정적(해시 이름) | 1년 immutable |
| `/dem/*` · `/dem-world/*` | 정적(지형 타일) | 30일 — 이름에 해시가 없으니 바꿀 때는 경로·이름을 바꾼다 |
| `/geo/*` | 정적(경계·하천) | 7일 |
| `/data/*` | 정적(release 스냅숏) | 5분 + 재확인 |
| `/`, `/ko/*`, `/en/*`, `*.html` | 정적(페이지) | 0(배포 즉시 새 판) |
| `/api/v1/*` | **Pages Functions** `functions/api/[[path]].ts` → `API_ORIGIN` | 백엔드 응답의 Cache-Control 그대로 |

프록시 규칙(`functions/api/[[path]].ts`):
- `GET`·`HEAD` 만 넘긴다. 그 밖 메서드 → 405 problem+json(`method_not_allowed`). `/api/v1/` 밖 → 404(`not_found`).
  계약의 `POST /summary-queries` 는 화면이 부르지 않아 막혀 있다 — 화면이 부르게 되면 이 파일을 같이 고친다.
- 요청 헤더는 `Accept`·`Accept-Language`·`If-None-Match`·`If-Modified-Since` 만 넘긴다. **쿠키·Authorization 은 넘기지 않는다.**
- 응답은 상태·본문·헤더(Cache-Control·ETag·X-Method-Version 등) 그대로, `Set-Cookie` 와 hop-by-hop 헤더만 뺀다.
- `API_ORIGIN` 이 없거나 백엔드에 닿지 못하면 502 problem+json(`upstream_error`, `Cache-Control: no-store`).
- 접속자 IP 는 `X-Client-IP` 로(값 = Cloudflare 가 붙인 `CF-Connecting-IP`), 그리고 `X-Forwarded-Proto`·`X-Forwarded-Host` 를 붙인다.
  **백엔드가 `X-Client-IP` 를 믿을지는 백엔드(OMB) 몫이다** — 터널 공개 주소로 직접 오는 요청은 이 헤더를 아무 값으로나 지어 보낼 수 있다.
  믿으려면 백엔드가 Pages 에서 온 요청만 받게(예: Cloudflare Access 서비스 토큰·비밀 헤더) 막은 뒤에만 쓴다.

### 필요한 설정 — 누가 넣나

| 이름 | 종류 · 위치 | 값 | 누가 |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub 비밀(Settings › Secrets and variables › Actions, 또는 환경 `production`) | API 토큰 — 권한 **Account › Cloudflare Pages › Edit 하나만**, 계정 하나로 한정 | Cloudflare 계정 소유자가 만들고 → 레포 관리자가 등록 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub 비밀 | Cloudflare 계정 ID | 계정 소유자 → 레포 관리자 |
| `CF_PAGES_PROJECT` | GitHub **변수**(Variables) | Pages 프로젝트 이름(소문자·숫자·`-`) | 레포 관리자 |
| `API_ORIGIN` | **Cloudflare Pages 프로젝트 환경변수**(Settings › Variables and Secrets, Production) — GitHub 아님 | 백엔드 공개 주소, 예 `https://emberline-api.example`(경로는 버리고 출처만 씀) | Cloudflare 계정 소유자(주소는 OMB 가 터널을 연 뒤 알려 줌) |

- Pages 프로젝트는 **Direct Upload** 로 만들고 프로덕션 가지를 `main` 으로 둔다(`--branch=main` 이 운영 판이 되게). Git 연동 빌드는 켜지 않는다(빌드는 Actions 가 한다).
- `API_ORIGIN` 을 바꾸면 Functions 는 **다음 배포부터** 새 값을 쓴다 — 바꾼 뒤 Actions › deploy 를 release 에서 다시 돌린다.
- 한도: 파일 20,000 · 파일당 25 MiB · `_headers` 규칙 100. 지금 out/ = 파일 약 2,835 · 약 118.5 MiB · 가장 큰 파일 4.2 MiB(2026-11-15 aibox 측정). 넘으면 `check-pages-out` 이 배포 전에 멈춘다.

### 롤백

1. **빠르게**: Cloudflare 대시보드 › Workers & Pages › 프로젝트 › Deployments › 이전 운영 배포 › 「Rollback to this deployment」. 정적 자산과 Functions 가 그 판으로 함께 돌아간다.
2. **기록에 남게**: `release` 에서 문제 커밋을 `git revert` 해 PR 로 머지 → deploy.yml 이 되돌린 판을 다시 배포한다. 1 로 급히 돌렸으면 2 로 release 도 맞춰 둔다(안 그러면 다음 배포가 문제 판을 다시 올린다).

### 로컬에서 운영과 같게 보기(실서버 모드)

정적 내보내기는 서버가 없어서 `pnpm dev`·`serve-out.mjs` 에는 `/api/v1` 프록시가 없다(백엔드도 다른 출처 CORS 를 열지 않았다). 운영과 같은 모양은 Pages 런타임을 띄워 본다(로그인 불필요):

```bash
NEXT_PUBLIC_DATA_MODE=http pnpm build                    # Windows PowerShell: $env:NEXT_PUBLIC_DATA_MODE="http"; pnpm build
node scripts/check-pages-out.mjs --mode http
npx wrangler@4.155.0 pages dev out --port 8798 --binding API_ORIGIN=http://<백엔드 주소>   # http://127.0.0.1:8798/ko/calendar/
```

**MSW 모드는 시험용**: 환경변수 없이 `pnpm dev`·`pnpm build` 하면 코드 기본값(`src/shared/config/env.ts`)이 `msw` 라서 백엔드 없이 `public/data/snap` 스냅숏으로 돈다 — e2e·화면 작업용.
운영 배포는 이 기본값에 기대지 않는다(deploy.yml 이 `http` 를 주고, 결과물에서 다시 잰다).

## 구조 (FSD · App Router)

```
app/                    Next 경로 파일만(얇게). [locale]/{calendar,analysis,method,home,ops,land,cmd,lab}/page.tsx
pages/README.md         빈 폴더(지우지 말 것) — Next 가 src/app·src/pages 를 경로로 읽지 않게 한다
src/
  app/                  FSD 앱 층: boot/(공급자·어댑터 조립·데이터 시작) · shell/(머리줄 + 본문 배치) · styles/(토큰·테마·바탕)
  pages/<화면>/          FSD 화면 층 — 화면 하나 = 슬라이스 하나(지금은 PageFrame 만)
  widgets/              top-bar(머리줄 — 로그인 전 공개 탭 3 ¦ 로그인 뒤 상황판 + 역할 탭, 폰은 두 줄) · page-frame(제목 + 잠긴 화면 + 문지기 PageGate)
  features/             select-country · switch-locale · auth-login · account-menu · alert-drawer
  entities/             country · session · situation(시나리오 상황) · release(판) · month-value(캘린더·비교 쿼리)
  shared/
    api/                openapi-fetch 클라이언트 · problem+json 오류 · Query 키 규칙 · schema.d.ts(생성물)
    msw/                MSW — 계약 경로를 release 스냅숏 값으로 응답(실제 백엔드 전까지)
    data-cases/         자료 케이스 처리기 레지스트리(결측·구간 밖·진행 중…) — switch 금지
    agency/             AgencyPort(기관 연동 포트) + http 어댑터 자리
    auth/               AuthPort(인증 포트) + http 어댑터 자리
    mock/               ⚠ 목 모듈(기관 연동 목 원장 · 예시 로그인) — 조립 지점만 import
    i18n/ ui/ lib/ config/
messages/<lang>/*.json  목업 사전 변환물(생성물) · messages-extra/ 목업에 아직 없는 키
public/data/snap/       release 스냅숏(korea·countries·world-1deg) · public/geo/ 나라 색인·경계
scripts/                import-*(목업 → 저장소) · check-isolation · serve-out · shot-header
contract/openapi.yaml   계약 사본 → pnpm gen:api 로 타입 생성
```

층 방향: `app → pages → widgets → features → entities → shared`. 같은 층 슬라이스끼리 import 금지, 슬라이스 밖에서는 `index.ts`(공개 API)로만 — steiger 가 잰다.

## 데이터

| 무엇 | 어디서 | 지금 | 나중 |
|---|---|---|---|
| 실제 데이터(캘린더·비교 분석·방법·상황판 통합 값·전망) | `shared/api` 클라이언트(계약 타입) | 브라우저 **MSW** 가 `public/data/snap` 값을 계약 모양으로 응답 | `NEXT_PUBLIC_DATA_MODE=http` + `NEXT_PUBLIC_API_BASE` → 실제 백엔드 |
| 기관 연동(경보·출동·자원·필지·지휘 통계·시나리오 위험지수·기상·시계) | `useAgency()` → **AgencyPort** | 목 어댑터(`shared/mock/agency`, 목업 data.js 원장) | `NEXT_PUBLIC_AGENCY_ADAPTER=http` → `/api/v1/agency/**`(예약만, 미구현) |
| 로그인(예시 + 역할 선택) | `useSession()` → **AuthPort** | 목 어댑터(`shared/mock/auth`, 역할은 localStorage `em.role`) | `NEXT_PUBLIC_AUTH_ADAPTER=http` → `/api/v1/auth/**` |

- **값은 release 그대로**(결정 A1). 화면은 verdict·percentile·status 를 다시 계산하지 않는다.
- 행의 경우 가르기는 `shared/data-cases` 의 `judgeMonth(row, { view })` 하나로: 결측(null 「결측」, 0 아님 — E2) · 구간 밖(값 그대로, 구간 버리고 플래그 — E3) · 운용 전 · 진행 중 · NRT · 표본 부족. 사전 키 `shell.st.<st>`, 예외 카드 `shell.case.<id>.{why,what,how,opinion}`, 코드 `CASE_CODE`.
- **Query 키 = `[경로, 정규화 파라미터, method_version]`**(`shared/api/query-keys.ts`). 본보기: `entities/month-value` 의 `calendarQuery` · `comparisonQuery`, `entities/release` 의 `methodQuery`.
- 오류는 problem+json 의 문자열 `code` 로만 가른다(`ERROR_HANDLING` 표).
- MSW 는 정적 내보내기에서도 같은 출처 워커(`public/mockServiceWorker.js`)로 돈다. 워커가 뜨기 전 요청은 `shared/api/ready.ts` 문에서 기다린다.

### 목 ↔ 실제 교체 (결정 F5 「바로 수정할 수 있도록」)

1. `.env.local` 의 한 줄을 `http` 로.
2. 그 포트의 http 어댑터(`shared/agency/http-agency-adapter.ts` · `shared/auth/http-auth-adapter.ts`) 경로·모양을 실제 API 에 맞춘다.
3. 화면 코드는 그대로다(포트만 알기 때문). 새 어댑터 = 파일 하나 + `src/app/boot/adapters.ts` 표 한 줄.

**격리 규칙**: `src/shared/mock/**` 은 `src/app/boot/adapters.ts` 만 import 한다. 목 모듈은 포트 타입·`shared/config`·`shared/lib` 만 import 한다(실제 데이터 모듈과 서로 import 금지). eslint `no-restricted-imports` + `scripts/check-isolation.mjs` 두 곳이 잰다. 목 데이터·생성기(목업 land.js 필지, cmd.js 통계 등)를 옮길 때도 이 폴더 안에만 둔다.

## 디자인 토큰

- `src/app/styles/tokens.css` = 목업 `index.html :root` 블록 **글자 그대로**(생성물, `pnpm import:tokens`). 옛 별칭 31개만 뺐다. 손으로 고치지 말고 목업을 고친 뒤 다시 돌린다.
- `theme.css` 의 `@theme inline` 은 별칭만: `bg-s0..s3`(면) · `text-t1..t3`(글자) · `border-line-soft/strong` · `text-fs1..fs4/body/stat/page/count` · `alert-1..4` · `h0..h6` · `data-modis/viirs/harm` · shadcn 이름(`background`·`primary`…). 간격 `p-3` = 12px = `--sp-3`(4px 격자). 기기군 크기는 `ctl`·`bar-btn`·`hit`·`gutter-x`·`ic-nav` 같은 이름 있는 유틸 또는 `h-(--bar-h)`.
- 기기군: `<head>` 첫 스크립트가 `html[data-device=web|tablet|phone|foldable]`·`data-touch` 를 단다(목업 규칙 그대로, `?device=` 덮어쓰기). 변형 `phone:` `tablet:` `foldable:` `midsize:`(태블릿·폴더블) `web:` `touch:` `wide:`(≥1680) `narrow-web:`(<1280).
- 머리줄 넘침 단계: 머리줄에 `data-tf=0..8` → 변형 `tf1:`…`tf8:`(목업 fitTop 같은 순서로 칸을 통째로 뺌, 말줄임 없음).
- 글꼴: IBM Plex Sans KR · Plex Sans · Plex Mono 를 `next/font` 로 빌드 때 자체 호스팅.
- 다크 한 벌(밝은 판 없음). 런타임 CSS-in-JS 금지. 지도·캔버스가 색이 필요하면 CSS 변수를 읽는다.

## 사전(i18n)

- next-intl, 경로 접두사 `/ko` · `/en`(정적 내보내기라 서버 언어 협상 없음; 루트 `/` 가 저장값 → 브라우저 언어 → en 순으로 보냄).
- `pnpm import:i18n --mockup <목업>` 이 목업 `i18n/{ko,en}/*.js` 를 `messages/<lang>/<묶음>.json` 으로 바꾼다. **키는 그대로**: 화면은 목업과 같은 키로 `const t = useT(); t("shell.top.risk")`. 원장 문자열은 `useTl()`(목업 EM.tl).
- 잎이면서 가지인 키 11개는 `<키>._` 로 옮겨졌고 `useT` 가 알아서 찾는다. 복수형은 ICU(`{n, plural, …}`), `'` 는 `''` 로 이스케이프.
- 목업에 아직 없는 키는 `messages-extra/<lang>.json`(목업에 같은 키가 생기면 목업이 이긴다).

## 버전(정확히 고정, 배포 2주 넘은 판)

| 패키지 | 판 | 패키지 | 판 |
|---|---|---|---|
| next · eslint-config-next | 16.4.3 | react · react-dom | 19.3.1 |
| typescript | 5.9.3 | tailwindcss · @tailwindcss/postcss | 4.3.3 |
| next-intl | 4.14.9 | @tanstack/react-query | 5.105.0 |
| openapi-fetch · openapi-typescript | 0.17.0 · 7.13.0 | msw | 2.15.0 |
| radix-ui | 1.8.1 | lucide-react | 1.65.0 |
| sonner | 2.0.8 | maplibre-gl | 5.24.0(목업과 같은 판) |
| steiger · @feature-sliced/steiger-plugin | 0.8.1 | eslint | 9.39.5 |
| vitest | 4.1.12 | @playwright/test | 1.64.1 |
| class-variance-authority · clsx · tailwind-merge | 0.7.1 · 2.1.1 · 3.7.0 | pixelmatch · pngjs | 7.2.0 · 7.0.0 |

일부러 최신 메이저를 피한 것: typescript 7(openapi-typescript·typescript-eslint 가 <6.1 요구) · eslint 10 · vitest 5 · msw 3.

## 아직 안 한 것(골격 범위 밖, 다음 단계)

- 머리줄 「다음 위성 통과」 칸: 목업 `EM.passes`(궤도 계산) 이식 전이라 칸을 그리지 않는다. 다른 나라 「이번 달 배수」 값은 「–」.
- 목업 해시 링크(`#analysis?…`) 호환 변환, 지도(MapLibre) 래퍼, 차트, 알림 미확인 수(시나리오 경보), 시각 회귀(목업 9단계) 이전.
- 전망(outlook.json)이 아직 없어 `public/data/snap` 에 없다 — 생기면 `pnpm import:snapshot --snap <폴더> --outlook <파일>`.
