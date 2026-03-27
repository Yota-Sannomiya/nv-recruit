# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NV採用管理ツール (NowVillage Recruitment Manager) — a single-page recruitment/ATS tool for managing hiring candidates through a multi-stage pipeline. The app is used internally by NowVillage for positions including デジタルマーケティング, HubSpotコンサル, and 営業.

## Architecture

**No build system.** The project is two files with no package.json, no bundler, and no dev server:

- **`index.html`** — The production app. A self-contained HTML file that loads React 18, ReactDOM, and Babel Standalone from CDN. All JSX is compiled in-browser via `<script type="text/babel">`. This is the file that is deployed and used.
- **`recruitment-manager.jsx`** — An older/alternative version of the React component with `import`/`export` syntax (not used by index.html). It has a different feature set (fewer statuses, no casual interview stage, password stored in localStorage).

### Key differences between the two files
- `index.html` is more feature-complete: has カジュアル面談 (casual interview) stage, 書類お見送り/辞退 statuses, reject/withdraw reason tracking, age field, document URL, calendar picker component, days-stalled tracking, and a bulk status/delete feature.
- `recruitment-manager.jsx` has ball-holder tracking (ナウビレ社/候補者/エージェント), situation field, and a different GAS API integration pattern using localStorage for credentials.

### Data & Backend
- Data persists via **Google Apps Script (GAS)** backend — `GAS_URL` constant points to a deployed Apps Script web app.
- GAS API supports: `auth` (password check), `list` (fetch all), `save` (upsert single), `delete`, `bulk_save`.
- Authentication is password-based (entered at login, sent with every API call).
- `STORAGE_KEY = "nv-recruit-data"` is the localStorage key (used as fallback/cache in the JSX version).

### UI Structure (index.html)
All components are defined inline in a single `<script type="text/babel">` block. The app has 4 tabs:

1. **ListView** — Filterable/searchable table with bulk operations, CSV import/export
2. **KanbanView** — Drag-target columns by recruitment stage (9 columns from カジュアル面談 to 入社)
3. **InterviewView** — Calendar-style weekly view of upcoming interviews
4. **AnalyticsView** — KPI cards, funnel chart, source/position breakdowns, monthly trends

Core shared components: `Modal`, `Badge`, `DaysChip`, `CalendarPicker`, `CandidateForm`, form field helpers (`Fl`, `IFl`, `SFl`, `CFl`, `TFl`).

## Development

Open `index.html` directly in a browser — no server or build step needed. Changes to the file are immediately reflected on reload.

The color theme object `C` defines the dark-mode palette used throughout all inline styles.

## Candidate Data Model

Each candidate object is created by `emptyCandidate()` and flows through statuses defined in `STATUS_LIST` (21 statuses across 9 stages). The `KANBAN_COLUMNS` array maps statuses to board columns. Status changes record `statusChangedDate` for stale-tracking.

## CSV Import/Export

The app includes a custom CSV parser (handles quoted fields) and column auto-detection via `detectColumns`/`findCol` which matches header names by keyword. The `ImportModal` supports append and replace modes.

## 設計原則・業務ルール
- 選考フロー: 応募→書類通過→一次実施→一次通過→最終実施→内定(=最終通過)→承諾・入社
- 辞退はフェーズ別6種: カジュアル辞退/書類辞退/一次辞退/適性検査辞退/最終辞退/内定辞退
- ファネル集計は「最終通過＝内定」「内定辞退者も内定カウント」が設計原則
- 適性検査は一次→最終の間に実施

## 開発ルール
- 実装前に必ず壁打ち・要件整理をしてから作る。いきなりコードを書かない
- 日本語で応答する
- GitHub Pagesでホスティング。変更はcommit & pushで反映
- 実装完了後はコミットとプッシュまで一連で行うこと
