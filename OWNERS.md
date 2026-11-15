# 소유 폴더 — 화면 에이전트 병렬 작업 규칙

화면 하나 = 담당 하나. 담당은 **자기 소유 폴더 안에서만** 파일을 만들고 고친다. 공통 층(아래 「셸」)을 바꿔야 하면 셸 담당에게 요청한다.
FSD 규칙: 같은 층 슬라이스끼리 import 금지 → 화면끼리 같이 쓰는 것이 생기면 entities/shared 로 내리자고 셸 담당에게 요청.

| 화면 | 경로 | 소유 폴더(새로 만드는 슬라이스 이름 예시) | 데이터 |
|---|---|---|---|
| ① 캘린더 | `/[locale]/calendar` | `src/pages/calendar/**` · `src/widgets/calendar-*` · `src/features/calendar-*` (예 `widgets/calendar-heatmap`, `features/pick-month`, `widgets/world-replay`) | 실제(API) — `calendarQuery`·`judgeMonth`·`public/data/snap/world-1deg` |
| ② 비교 분석 | `/[locale]/analysis` | `src/pages/analysis/**` · `src/widgets/analysis-*` · `src/features/analysis-*` (예 `widgets/analysis-step-bar`, `features/analysis-select-aoi`) | 실제 — `calendarQuery`·`comparisonQuery` |
| ③ 방법·검증 | `/[locale]/method` | `src/pages/method/**` · `src/widgets/method-*` | 실제 — `methodQuery`·`CASE_CODE`·`caseCardKeys` |
| 상황판 | `/[locale]/home` | `src/pages/home/**` · `src/widgets/home-*` · `src/features/home-*` | 통합 값 = 실제, 시나리오(불·자원·경보) = `useAgency()` |
| 경보·출동 | `/[locale]/ops` | `src/pages/ops/**` · `src/widgets/ops-*` · `src/features/ops-*` · 목: `src/shared/mock/agency/ops-*.ts` | `useAgency()` 만 |
| 피해 면적 | `/[locale]/land` | `src/pages/land/**` · `src/widgets/land-*` · 목: `src/shared/mock/agency/land-*.ts`(필지 생성기) | `useAgency()` 만 |
| 지휘 통계 | `/[locale]/cmd` | `src/pages/cmd/**` · `src/widgets/cmd-*` · 목: `src/shared/mock/agency/cmd-*.ts` | `useAgency()` 만 |
| 예측 분석 | `/[locale]/lab` | `src/pages/lab/**` · `src/widgets/lab-*` | 실제 — 전망(outlook, 결정 F8) |
| **셸·공통** | — | `app/**` · `src/app/**` · `src/widgets/{top-bar,page-frame}` · `src/features/{select-country,switch-locale,auth-login,account-menu,alert-drawer}` · `src/entities/**` · `src/shared/**`(목 폴더의 화면별 파일 제외) · `scripts/**` · `messages-extra/**` · 설정 파일 | — |

## 같이 쓰는 파일 — 부딪힘 줄이기

- `messages/**`·`src/app/styles/tokens.css`·`src/shared/mock/agency/ledger.json`·`src/shared/api/schema.d.ts`·`public/**` 는 **생성물**이다. 손으로 고치지 않는다(목업·계약을 고치고 `pnpm import:*`·`pnpm gen:api`).
- 목업에 없는 사전 키가 필요하면 `messages-extra/{ko,en}.json` 에 **자기 화면 접두사**(`calendar.*`, `ops.*` …)로만 더한다. 이 두 파일은 여러 담당이 고치므로 다른 화면 블록은 건드리지 않는다.
- `src/shared/mock/agency/mock-agency-adapter.ts`(포트 구현)를 고쳐야 하면 메서드 몸통만 자기 생성기 파일을 부르도록 바꾸고, 포트(`src/shared/agency/port.ts`) 모양 변경은 셸 담당에게 요청한다.
- entities 에 새 쿼리가 필요하면 `src/entities/<x>/api/queries.ts` 에 공장 함수를 더한다(키 규칙 `qk(경로, 파라미터, method_version)`). 같은 entity 를 두 담당이 동시에 바꾸지 않게 셸 담당이 조정한다.

## 화면 담당이 지킬 것

1. 디자인은 목업 그대로 — 목업 `pages/<화면>.css` 를 토큰 유틸로 옮긴다. shadcn 기본 모양 금지. 손 CSS 전역 금지(꼭 필요하면 슬라이스 옆 CSS Module).
2. switch/case 금지 — 처리기 + 맵.
3. 목 데이터는 `src/shared/mock/**` 안에만, 화면은 포트(`useAgency`·`useAuth`)만 안다.
4. 실제 데이터 값은 다시 계산하지 않는다(release 그대로). 경우 가르기는 `judgeMonth`.
5. 키 문자열은 목업 그대로 `useT()`.
6. `pnpm check` 전부 통과 + 팀 시험 서버에서 `pnpm build && pnpm e2e`. 화면 시험은 `e2e/<화면>.spec.ts` 로 더한다.
