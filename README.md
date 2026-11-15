# Planetarium-Frontend

Team Planetarium · NASA Space Apps 2026 Seoul
챌린지: Harmonization of MODIS and VIIRS Hot Spots

MODIS(2000~)와 VIIRS(2012~) 위성 화재 감지를 하나의 기준(VIIRS S-NPP 기준 감지량)으로 통합한 데이터를
지도·캘린더·그래프로 보여 주는 웹 프론트엔드입니다.

## 구조

```
[모델 Planetarium-AI]  →  [백엔드 Planetarium-Backend (Spring)]  →  [프론트엔드 (이 저장소)]
 데이터·예측 결과            파라미터를 정제해 API로 제공              화면 표시
```

- 프론트엔드는 정제된 데이터의 API만 호출합니다. 모델 쪽 내부 API는 직접 부르지 않습니다.
- 데이터·API 규칙: [Planetarium-AI/docs/api_contract.md](https://github.com/Nasa-Planetarium/Planetarium-AI/blob/main/docs/api_contract.md),
  [backend-handoff.md](https://github.com/Nasa-Planetarium/Planetarium-AI/blob/main/docs/backend-handoff.md)

## 기술 스택

- [Next.js](https://nextjs.org/) + React
- TypeScript
- Node.js (LTS 이상)

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.
백엔드 API 주소는 `.env.local`에 넣습니다 (이 파일은 GitHub에 올리지 않습니다).

## 작업 방법 (중요)

**`main`에 머지되면 CI/CD로 바로 배포됩니다.** `main`에 직접 push하지 않습니다.

1. `main`에서 브랜치 만들기 (예: `design/calendar-color`)
2. 브랜치에서 수정하고 `npm run dev`로 확인
3. 브랜치를 push하고 Pull Request 만들기
4. 리뷰 후 머지 → 자동 배포

## 화면

| 화면 | API |
|---|---|
| 지역 선택 | `/aoi` |
| 지도 (감지 점·확산 가능성·화재 사건) | `/hotspots`, `/spread`, `/events` |
| 연도 × 월 캘린더 (예년 대비) | `/calendar`, `/compare` |
| 기간 그래프 | `/summary` |
| 배지 (산불 기상 위험도·불 유형) | `/fwi`, `/regime` |
| CSV 다운로드 | `/export.csv` |
| 방법 설명·출처 | `/method` |

## 화면 표시 규칙

- "산불 건수"가 아니라 **"위성 화재 감지량 (VIIRS 기준)"**으로 표기
- 2000-11 ~ 2012-01 값은 **"추정값"**으로 표시하고 범위(`value_lo`~`value_hi`)를 함께 표시
- `status = missing`인 달은 **회색**, 0으로 칠하지 않기 / `partial`은 "집계 중"
- residual 값은 별도 막대·값·레이어로 그리지 않기
- 확산 가능성 지도에는 필수 안내 문구를 항상 표시
- 비밀 키(`FIRMS_MAP_KEY` 등)는 프론트엔드 코드에 절대 넣지 않기
- 하단 또는 About 페이지에 NASA FIRMS 인정 문구와 경계 데이터 출처(CC BY) 표기
