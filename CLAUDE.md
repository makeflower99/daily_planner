# Daily Planner - 프로젝트 가이드

## Quick Context (새 세션 필독)
- **한국어 UI** — 모든 텍스트/라벨이 한국어, 날짜 형식: `YYYY년 M월 D일 (요일)`
- **전역 스코프 JS** — ES 모듈 아님. 모든 함수가 전역. 로드 순서 중요: `data.js` → `checklist.js` → `section.js` → `meal.js` → `calendar.js` → `tracker.js`
- **날짜 키 형식** — `YYYY-M-D` (zero-padding 없음, 예: `2026-4-3`)
- **data.js가 핵심** — 60+ 전역 함수를 제공하는 데이터 레이어. 다른 모든 모듈이 의존
- **유저 입력 → innerHTML 시 반드시 `escapeHtml()` 사용** (XSS 방지)

## Documentation Map
| 문서 | 경로 | 설명 |
|------|------|------|
| CLAUDE.md | `CLAUDE.md` | 이 파일 — 프로젝트 진입점, 핵심 규칙 |
| Architecture (텍스트) | `architecture.md` | 시스템 아키텍처, 데이터 흐름, 보안 레이어 |
| Architecture (시각화) | `docs/architecture.html` | 인터랙티브 파이프라인 다이어그램 (브라우저에서 열기) |
| API 레퍼런스 | `docs/api-reference.md` | 6개 API 엔드포인트 상세 (요청/응답/에러) |
| 데이터 스키마 | `docs/data-schema.md` | SQLite DDL, JSON blob, Section 객체, Repeat 타입, 날짜 키 |
| 모듈 가이드 | `docs/module-guide.md` | JS 모듈 함수 카탈로그, 의존관계 그래프 |
| 디자인 시스템 | `docs/design-system.md` | CSS 변수, 테마, 컬러 팔레트, 컴포넌트 패턴 |
| 배포 가이드 | `docs/deployment.md` | Docker, 환경변수, Cloudflare Tunnel, 백업 |
| 개발 로그 | `docs/DEV_LOG.md` | 버전 히스토리 (v1.0 ~ v6.2) |
| 프로젝트 리포트 | `docs/PROJECT_REPORT.md` | 상세 UI 스펙 (역사적 참조) |
| 기능 아이디어 | `docs/memo.txt` | 향후 기능 아이디어 목록 |
| 완료 계획 | `docs/completed-plans/` | 완료된 작업 계획서 아카이브 |

## 개요
바닐라 JavaScript 프론트엔드 + Node.js(Express) + SQLite 백엔드 기반의 멀티유저 데일리 플래너 웹 앱.
한국어 UI. Cloudflare Tunnel을 통한 외부 접속 지원.

## 파일 구조
```
daily_planner/
├── index.html          # 메인 HTML, 모달, 초기화 스크립트
├── login.html          # 로그인 페이지
├── server.js           # Express 서버 (인증, API, 정적 파일 서빙)
├── db.js               # SQLite DB 모듈 (유저/데이터 CRUD)
├── backup.js           # DB 자동 백업 (6시간 간격, 최근 7개 보존)
├── package.json        # npm 의존성 정의
├── Dockerfile          # Docker 이미지 빌드 (Node 20 Alpine)
├── docker-compose.yml  # 서버 + Cloudflare Tunnel 통합 실행
├── .env                # 환경변수 (SESSION_SECRET) — Git 제외
├── .env.example        # .env 템플릿 (Git 포함)
├── .dockerignore       # Docker 빌드 제외 파일
├── CLAUDE.md           # 이 파일 (프로젝트 컨텍스트)
├── README.md           # 프로젝트 소개 및 실행 가이드
├── css/
│   └── styles.css      # 전체 스타일 (다크/라이트 테마 CSS 변수)
├── js/
│   ├── data.js         # 데이터 관리 (서버 API 연동, 로컬 캐시, 공유 상수/유틸)
│   ├── checklist.js    # 체크리스트 탭 (미니 캘린더, 진행률)
│   ├── section.js      # 섹션/항목 관리 (CRUD, 모달, 드래그앤드롭)
│   ├── meal.js         # 식단 계획 UI (CRUD, 드래그앤드롭)
│   ├── calendar.js     # 캘린더 탭 (월간 뷰, 몸무게, 메모, 할 일)
│   └── tracker.js      # 일일 기록 탭 (계획 vs 실행 비교)
├── docs/               # 문서
│   ├── architecture.html  # 아키텍처 시각화
│   ├── DEV_LOG.md         # 개발 로그 및 진행 상황
│   ├── PROJECT_REPORT.md  # 상세 프로젝트 문서
│   ├── memo.txt           # 향후 기능 아이디어
│   └── plans/             # 작업 계획 문서
│       ├── folder-restructure.md  # 폴더 구조 정리 계획
│       ├── calendar-js-split.md   # calendar.js 분리 계획 (예정)
│       └── service-improvement-v6.5.md  # v6.5 서비스 개선 계획
├── scripts/            # 유틸리티 스크립트
│   ├── create-user.js  # 유저 생성 CLI 도구
│   └── tunnel.bat      # Cloudflare Tunnel 실행 스크립트 (로컬용)
└── backups/            # DB 백업 파일 저장소 — Git 제외
```

## 기술 스택
| 구분 | 내용 |
|------|------|
| 프론트엔드 | Vanilla JS (ES6+), HTML5, CSS3 |
| 백엔드 | Node.js + Express |
| DB | SQLite (better-sqlite3) |
| 인증 | express-session + bcrypt (서버 세션 기반) |
| 보안 | helmet, express-rate-limit, morgan |
| 컨테이너 | Docker + Docker Compose |
| 외부 접속 | Cloudflare Tunnel (cloudflared, HTTP/2) |

## 서버 구조

### API 엔드포인트
| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/api/auth/login` | X | 로그인 (rate limited) |
| POST | `/api/auth/logout` | O | 로그아웃 |
| GET | `/api/auth/me` | O | 현재 유저 정보 |
| GET | `/api/data` | O | 유저 데이터 로드 |
| PUT | `/api/data` | O | 유저 데이터 저장 |
| POST | `/api/data` | O | 유저 데이터 저장 (sendBeacon용) |

### DB 위치
- **Docker 환경 (기본)**: `/data/planner.db`, `/data/sessions.db` (Docker 볼륨 `planner-data`)
- **로컬 직접 실행**: `DB_DIR` 환경변수로 지정 (예: `C:\planner-data`)
- **백업**: `/backups/` (Docker) 또는 `BACKUP_DIR` 환경변수 (로컬)
- **시크릿**: `.env` 파일의 `SESSION_SECRET` 환경변수 (필수)

### DB 스키마
```sql
users (id, username, password_hash, is_admin, created_at)
user_data (user_id FK, data TEXT, updated_at)
```
`user_data.data`에 유저별 JSON blob 저장 (프론트엔드 데이터 스키마 그대로).

## JS 모듈 로드 순서
`data.js` → `checklist.js` → `section.js` → `meal.js` → `calendar.js` → `tracker.js`

모든 파일은 전역 스코프에서 함수를 정의하며, 순서가 중요함.
- `section.js`는 `SECTION_COLORS`, `MEAL_TYPES` (data.js) 사용
- `meal.js`는 `handleDragMove()` (section.js), `renderChecklist()` (checklist.js) 사용
- `calendar.js`는 `renderAllSections()` (section.js), `renderMealPlan()` (meal.js) 사용

## 데이터 흐름
1. 페이지 로드 → `loadData()` (async, fetch GET `/api/data`)
2. 유저 조작 → 메모리 `data` 객체 수정 → `saveData()` 호출
3. `saveData()` → localStorage 캐시 + 300ms 디바운스 fetch PUT `/api/data`
4. 페이지 닫기 → `navigator.sendBeacon()` POST `/api/data`

### localStorage 용도 (서버 전환 후)
- **`planner_v4_{username}`**: 오프라인 폴백용 데이터 캐시 (유저별 분리)
- **`planner_theme`**: 테마 설정 (기기별, 서버에 저장 안 함)

### 데이터 스키마 (요약)
`user_data.data`에 JSON blob 저장. 주요 필드: `sections`, `completions`, `mealPlans`, `mealTimes`, `weights`, `targetWeight`, `dailyRecords`, `memos`, `todos`, `mealChecks`(레거시).

- **Item 구조:** `{id, emoji, label, addedDate?, startDate?, endDate?}` — 항목별 시작/종료일 관리
- **할 일 구조:** `data.todos[dateKey] = [{id, text, done}]` — 날짜별 할 일 목록

- **날짜 키 형식:** `YYYY-M-D` (zero-padding 없음, 예: `2026-4-3`)
- **상세:** `docs/data-schema.md` 참조

## 핵심 규칙
- CSS 변수(`--bg`, `--text` 등)를 사용하여 테마 지원. `:root`는 다크, `[data-theme="light"]`는 라이트
- 새 데이터 필드 추가 시 `loadData()`와 `importFromJSON()`에 가드 추가 필수
- 식단 타입: `breakfast`, `lunch`, `dinner`, `snack`
- 반복 타입: `daily`, `weekdays`, `weekends`, `weekly`, `biweekly`, `everyOtherDay`, `monthly`
- 유저 입력을 innerHTML에 넣을 때 `escapeHtml()` 사용 필수 (XSS 방지)
- 서버 데이터 저장 시 1MB 제한, sections 배열 필수 검증

## 실행 방법

### Docker (권장)
```bash
# 1. .env 파일 준비
cp .env.example .env
# SESSION_SECRET에 랜덤 값 입력

# 2. 유저 생성
docker compose run --rm planner node scripts/create-user.js <아이디> <비밀번호> [--admin]

# 3. 서버 + 터널 시작
docker compose up

# 4. 서버만 (터널 없이)
docker compose up planner
```

### 로컬 직접 실행 (Docker 없이)
```bash
# 환경변수 설정 (Windows)
set DB_DIR=C:\planner-data
set SESSION_SECRET=랜덤시크릿문자열
set BACKUP_DIR=./backups

# 의존성 설치
npm install

# 유저 생성
node scripts/create-user.js <아이디> <비밀번호> [--admin]

# 서버 시작
npm start
# → http://localhost:3000

# 외부 접속 (Cloudflare Tunnel)
scripts\tunnel.bat
```

### 보안 구조
```
외부 사용자 → Cloudflare (DDoS 보호) → Tunnel (HTTP/2) → Docker 컨테이너 → localhost:3000
                                                            ↑ PC 파일 시스템 격리
```
- 1겹: Docker로 DB를 인터넷에서 격리
- 2겹: `.env` 파일로 비밀번호/시크릿 관리 (코드에 미포함)
- 3겹: bcrypt로 비밀번호 암호화 저장
- DB 자동 백업: 6시간 간격, 최근 7개 보존

## UI 구조

### 네비게이션
- 상단 nav에 3개 탭 버튼 + 우측에 로그인 유저 아이디 표시 (`nav-username`)

### 탭 구조
1. **체크리스트** - 일일 루틴 체크, 미니 캘린더, 진행률, 메모 (달성률 하단)
2. **캘린더** - 월간 뷰, 섹션 관리, 식단 계획(시간 포함), 몸무게(목표 대비 차이 표시), 메모
3. **일일 기록** - 계획 vs 실행 비교 테이블, 할 일, 습관 변화 차트(항목 수/달성률 전환), 설정(목표 몸무게/테마/데이터 관리/로그아웃)

### 섹션 모달
- 섹션 추가/편집 모달에서 시작일/종료일은 1:1 비율 배치
- "무기한" 체크박스는 "종료일" 라벨 옆에 위치
- 섹션 수정은 scope 모달 없이 바로 적용 (항목에 영향 없음)

### 항목 모달
- 항목 추가/수정 모달에서 이모지, 이름, 시작일/종료일/무기한 설정 가능
- 항목의 시작일/종료일은 섹션과 독립적으로 관리
- 관리 패널에서 항목의 시작일 ~ 종료일 범위 표시

## 현재 진행 상황

### 버전: v6.6 (2026-04-08)
- **모든 핵심 기능 완료** — 체크리스트, 캘린더, 일일 기록, 식단/몸무게/메모, 드래그앤드롭, 멀티유저, Docker, 백업 등 37개 기능 완료
- **v6.6 신규** — 섹션 수정 시 scope 모달 제거(바로 적용), 항목 시작/종료일 직접 수정 가능, 습관 변화 차트 분리(항목 수 꺾은선/달성률 막대 전환), 일일 기록 탭 할 일 표시, 미사용 Future 함수 정리, getCompletionStats/getSectionStatsForDateRange 버그 수정
- **v6.5** — 매일 할 일(To-Do) 기능, 항목별 시작/종료일 관리, 캘린더 탭 섹션 형태 루틴 표시, 삭제 모달 개선
- **v6.4** — 습관 변화 차트 시각화 (SVG 차트, 룰 기반 피드백, 기간 선택), 메모를 체크리스트 탭으로 이동
- **폴더 구조 정리 완료** — `docs/`, `scripts/` 분리 (`docs/completed-plans/folder-restructure.md` 참조)
- **문서화 완료** — API 레퍼런스, 데이터 스키마, 모듈 가이드, 디자인 시스템, 배포 가이드, 아키텍처 문서 작성

### 알려진 이슈
- 라이트 테마에서 일부 인라인 rgba 값이 미세하게 어울리지 않을 수 있음
- 모바일 터치 드래그가 간헐적으로 불안정할 수 있음
- 같은 유저가 멀티탭 사용 시 마지막 저장이 덮어씀 (3명 규모에서 무시 가능)
- `mealChecks` 필드는 레거시 — 실제로는 `dailyRecords.meals` 사용

## 향후 작업 계획
- [ ] **습관 변화 추적 고도화** — 항목 삭제 이력 추적(deletedDate), 이름 변경 로그(changeLog), 메모 인라인 편집
- [ ] **AI 피드백** — LLM 연동, 듀오링고 스타일 격려 멘트 (이도 올려요! 스트레칭 중요! 야채 같이 먹어요!)
- [ ] **지출 관리** — 가계부 기능 추가
- [ ] **월간 달성 트렌드 차트** — 주/일별 달성률 변화 추이 시각화
- [ ] **습관 질적 개선 추적** — 시간 경과에 따라 점진적으로 목표 상향 (2주 후 웨이트 추가 등)
- [ ] **기본값 리셋 버튼** — 초기 설정으로 되돌리기 (루틴 시작일은 오늘로)
- [ ] **내일 일정 미리 추가** — 내일 할일 사전 등록
- [ ] **앱 배포** — 모바일 앱화 검토
