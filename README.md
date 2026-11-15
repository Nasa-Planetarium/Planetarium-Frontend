# 📋 About EMBERLINE

## 1. Overview

- **Project name:** EMBERLINE
- **One-liner:** A visual dashboard and data service for people who track heat sources (fires) around the world.
- **Live site:** https://nasa-planetarium.github.io/
- **Development period:** 2026.11.14 – 2026.11.15
- **Team / Event:** Team Planetarium · NASA Space Apps Challenge 2026 Seoul — *Harmonization of MODIS and VIIRS Hot Spots*

EMBERLINE combines two NASA satellite fire records — MODIS (since 2000) and VIIRS (since 2012) — into **one consistent monthly series** (measured on the VIIRS S-NPP scale), so you can see where, when, and how much the world is burning across more than twenty years.

---

## 2. Key Features

- **🗓️ Burning Activity Calendar (global playback)** — Press play and every month since 2001 sweeps across the world map, so global fire activity is visible at a glance.
- **🌍 Country focus & dot map** — Click any country to open its own calendar. Fires are drawn as dots: big, long-lasting fires and small, short ones are easy to tell apart. Click a dot to see that cell's location and value.
- **📊 Year × Month calendar** — A grid of every year and month, with the monthly summary, the same month across years, and the fire events behind the numbers.
- **⚖️ Comparison (put a month in context)** — Pick any month and instantly see its value, its ratio to the usual year (median), and its percentile. Daily trends and a chart across the satellite switch compare raw counts with our harmonized series.
- **⬇️ Export data** — Download the same numbers you see on screen as a CSV file.
- **🔬 Method & Validation** — Explains how we harmonized MODIS and VIIRS and how well the result holds up.
- **🔐 Role-based screens after sign-in** — Public pages are open to everyone. After signing in, each role gets its own screens:
  - Early warning & response → Overview, Alerts & Dispatch
  - Fire incident command → Alerts & Dispatch (assigning engines and crews)
  - Land management → Burned Area review
  - Commander → Command Stats
  - Scientist → Forecast (Lab)
- **🌐 Korean / English** — Every screen works in both `/ko` and `/en`.
- **📱 Works on any device** — Layout adapts to web, tablet, foldable, and phone.
- **🧭 Honest data display** — Missing months are shown in grey (never as 0), months still being counted say "in progress", and 2000–2012 values are marked as "estimates" with their range.

---

## 3. Tech Stack

| Area | What we used |
|---|---|
| **Framework** | Next.js 16 (App Router, static export) + React 19 |
| **Language** | TypeScript 5.9 |
| **State / Data** | TanStack Query (server data & caching) · openapi-fetch (typed API client from `openapi.yaml`) · MSW (mock API while the backend was not ready) |
| **Styling** | Tailwind CSS 4 + design tokens copied from the mockup · shadcn/ui & Radix UI (only for behavior and accessibility) · lucide-react icons |
| **Map** | MapLibre GL |
| **i18n** | next-intl (`/ko`, `/en`) |
| **Quality** | ESLint · Steiger (FSD architecture check) · Vitest · Playwright (e2e) |
| **Deployment** | GitHub Actions → Cloudflare Pages (+ Pages Functions as the API proxy) |

### Why we chose them

- **Next.js + static export** — The whole site is built into plain files, so it is fast, cheap to host, and easy to roll back. Pages for `/ko` and `/en` are created ahead of time.
- **TypeScript + openapi-fetch** — API types are generated from the shared contract (`openapi.yaml`). If the backend changes a field, the code shows an error before anyone sees a broken screen.
- **TanStack Query instead of a global store** — Almost all our state is "data from the server". TanStack Query handles caching, loading, and errors for that, so we didn't need an extra store like Zustand or Redux.
- **MSW (mock API)** — In a two-day hackathon, frontend and backend were built at the same time. MSW let the screens run on real snapshot data first, and switching to the real backend is just one environment variable.
- **Tailwind CSS + design tokens** — The mockup's colors and spacing were copied as tokens, so the screens look exactly like the design. shadcn/Radix gave us accessible buttons, menus, and dialogs without changing the look.
- **MapLibre GL** — An open-source map library that can draw thousands of fire dots smoothly on a world map.
- **Cloudflare Pages + GitHub Actions** — Merging into `release` deploys automatically. Pages Functions safely forward `/api/v1` calls to the backend without exposing secret keys or cookies.

---

# 👩‍💻 Meet the Frontend Developer — Yunju Sung

Hi, I'm Yunju Sung, a planner working in the AX (AI Transformation) field.
In my day job, I work as a consultant who helps move work that people do by hand over to AI.

But in this project, I took on the role of frontend developer! I recently learned vibe coding, and I wanted a chance to show what I can do — that's why I applied to this hackathon.
I'm grateful to Team Planetarium for welcoming me despite all of this, and I gave it my best to fulfill the frontend role.

---

# 💭 Hackathon Retrospective

When designing EMBERLINE, we needed to show a world map, so I chose a **dashboard layout** that uses as much of the screen as possible. That part went smoothly. My first real question as the frontend developer was: *"How do I make this huge global map readable at a single glance?"* There were far more heat sources than I expected, so I thought hard about how to show them all clearly. In the end, I chose a **dot map** — it was the most intuitive way to show the difference between strong, long-burning fires and small, short-lived ones.

After that, I built the screen frames and layout around one question: *"How can we show the information different users care about in the most accessible way?"* So — what do you think? Are the screens and buttons intuitive!?

During the hackathon, I realized that **everything changes**. These days, the way we work is changing, and so is everything else. Especially while merging different datasets, I learned that a change doesn't happen just once — it can happen again and again. So we shouldn't be afraid of change. And beyond handling a single conversion, we should have the consideration to expect that more conversions will follow. Maybe the fact that I, a planner, could take on frontend development — even for just two days — is itself a sign of adapting to change!

---

*👇 Below are the rules I followed while working on the frontend.*

---

# 🔥 EMBERLINE Frontend (Next.js)

## What this repository is

This is the web app for EMBERLINE, a wildfire monitoring site whose main screen is the **Burning Activity Calendar**. We rebuilt the design mockup (`planetarium-mockup`) with Next.js. There are 8 screens: Calendar, Analysis, Method, Home, Ops, Land, Command, and Lab.

**The rules in plain words:**

- **Look exactly like the mockup.** The mockup is the "answer sheet". We borrow shadcn/ui and Radix only for how buttons and menus *work* — never for how they *look*. If a default rounded corner, shadow, or color from shadcn shows up on screen, that's a bug.
- **Follow the shared documents.** Decisions, design, and the API contract (`contract/openapi.yaml`) are written down, and we follow them instead of guessing.
- **Never push straight to `main`.** Make a branch → open a PR → get a review → merge.

## How the team fits together

```
[Model: Planetarium-AI]  →  [Backend: Planetarium-Backend (Spring)]  →  [Frontend (this repo)]
 data & predictions           cleans the data and serves it as an API     shows it on screen
```

The frontend only talks to the backend's cleaned-up API. It never calls the model's internal API directly.

## How we show data honestly

- Say **"satellite fire detections (VIIRS-based)"**, not "number of wildfires" — a satellite dot isn't the same as one fire.
- Values from **Nov 2000 – Jan 2012** are labeled **"estimate"** and shown with their range (`value_lo`–`value_hi`).
- A month with **no data (`missing`) is grey**, never painted as 0. A month still being counted (`partial`) says **"in progress"**.
- We don't draw `residual` values.
- The spread-risk map always shows its required notice.
- **No secret keys** (like `FIRMS_MAP_KEY`) in frontend code.
- We credit **NASA FIRMS** and the boundary data source (CC BY).
- The screen **never recalculates** verdicts, percentiles, or status — it shows the released values as they are.

## How to run it

You need Node 22.18 or newer and pnpm.

```bash
corepack enable                  # first time only
pnpm install --frozen-lockfile   # install exactly the locked versions
pnpm dev                         # open http://localhost:8797/ko/calendar/
```

Before every commit, all checks must pass:

```bash
pnpm check                       # types, lint, architecture, isolation, leak check, unit tests
pnpm build && pnpm e2e           # build the site and test it in a real browser
```

## Keeping the public repo safe

This repository is public. An automatic check (`check:leaks`) stops everything if it finds internal network addresses, personal home folders, our test server's name, or internal ports.

- In docs, we write general words like "team test server" and example addresses like `http://localhost:8080`.
- Real values go into **environment variables**, never into code.

## How deployment works

```
feature branch ──PR──▶ main ──PR──▶ release ──▶ auto deploy ──▶ Cloudflare Pages
```

- **`main` = development.** Every PR and push runs CI (type check, lint, architecture check, build).
- **Merging into `release` = deploying.** GitHub Actions builds the site and uploads it to Cloudflare Pages.
- The live site **always uses the real backend**. If the build accidentally uses mock data, the deploy stops.
- `/api/v1/*` requests go through a small proxy (Pages Functions). It only allows reading (`GET`/`HEAD`) and **never forwards cookies or login tokens**.
- **Something broke?** Roll back to the previous version in the Cloudflare dashboard, then `git revert` on `release` so the next deploy doesn't bring the bug back.

## How the code is organized (FSD)

```
app/          route files only (kept thin)
src/
  app/        startup, layout shell, styles & tokens
  pages/      one folder per screen
  widgets/    big blocks: top bar, page frame
  features/   user actions: pick a country, switch language, log in, alerts
  entities/   data "things": country, session, release, month values
  shared/     API client, mock API, i18n, UI parts, tools
```

Imports only go **downward**: `app → pages → widgets → features → entities → shared`. Folders on the same level don't import each other, and from outside a folder you only use its `index.ts`. A tool called Steiger checks this automatically.

## Mock ↔ real: switching with one line

| What | Now | Later |
|---|---|---|
| Fire data (calendar, analysis, method…) | MSW mock API answers with snapshot data | Real backend (`NEXT_PUBLIC_DATA_MODE=http`) |
| Agency features (alerts, dispatch, resources…) | Mock adapter | Real API (`NEXT_PUBLIC_AGENCY_ADAPTER=http`) |
| Sign-in & roles | Mock adapter (role saved in the browser) | Real API (`NEXT_PUBLIC_AUTH_ADAPTER=http`) |

Screens only know a **"port"** (a promise of what data looks like), not where the data comes from. So to switch from mock to real: change one line in `.env.local`, fit the real adapter to the actual API, and the screen code stays the same.

**Isolation rule:** mock code lives only in `src/shared/mock/`, and only one file (`src/app/boot/adapters.ts`) is allowed to import it. ESLint and a separate script both check this.

## Design tokens

- `tokens.css` is copied **word for word** from the mockup. Don't edit it by hand — change the mockup and run `pnpm import:tokens` again.
- Short Tailwind names point to those tokens (e.g. `bg-s0`, `text-t1`, `p-3` = 12px on a 4px grid).
- The page knows which device it's on (`web`, `tablet`, `phone`, `foldable`) and adjusts.
- When the top bar gets crowded, whole items are hidden step by step — text is never cut off with "…".
- Fonts: IBM Plex Sans KR / Plex Sans / Plex Mono, self-hosted at build time.
- One dark theme only. No runtime CSS-in-JS. Maps and canvases read colors from CSS variables.

## Languages (i18n)

- Pages live under `/ko` and `/en`. The root `/` sends you to your saved language → your browser's language → English.
- Text comes from the mockup's dictionaries, converted to JSON with **the same keys**, e.g. `t("shell.top.risk")`.
- Keys not in the mockup yet go into `messages-extra/`. If the mockup adds the same key later, the mockup wins.

## Versions

Every package is pinned to an **exact version** that had been out for at least two weeks (e.g. Next.js 16.4.3, React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.3, MapLibre GL 5.24.0). This keeps every teammate's build — and the deployed site — exactly the same.

