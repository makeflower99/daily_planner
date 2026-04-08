# 데이터 스키마 문서

> Daily Planner 프로젝트의 모든 데이터 구조에 대한 단일 진실 공급원(Single Source of Truth).

---

## 목차

1. [SQLite 스키마](#1-sqlite-스키마)
2. [JSON Blob 스키마](#2-json-blob-스키마)
3. [Section 객체](#3-section-객체)
4. [반복 타입 (Repeat Types)](#4-반복-타입)
5. [날짜 키 형식](#5-날짜-키-형식)
6. [DailyRecords 스냅샷](#6-dailyrecords-스냅샷)
7. [기본 섹션 (Default Sections)](#7-기본-섹션)
8. [레거시 필드](#8-레거시-필드)
9. [localStorage 키](#9-localstorage-키)

---

## 1. SQLite 스키마

### 1.1 메인 DB (`planner.db`)

DB 경로: `DB_DIR` 환경변수 (기본값 `/data`), WAL 모드 사용, 외래 키 활성화.

#### `users` 테이블

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 유저 고유 ID (자동 증가)
  username TEXT UNIQUE NOT NULL,          -- 로그인 아이디 (고유)
  password_hash TEXT NOT NULL,            -- bcrypt 해시된 비밀번호
  is_admin INTEGER DEFAULT 0,            -- 관리자 여부 (0: 일반, 1: 관리자)
  created_at TEXT DEFAULT (datetime('now'))  -- 계정 생성 시각 (UTC)
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INTEGER PK | 자동 증가 고유 식별자 |
| `username` | TEXT UNIQUE | 로그인에 사용하는 아이디 |
| `password_hash` | TEXT | bcrypt로 해시된 비밀번호 |
| `is_admin` | INTEGER | 관리자 플래그 (0 또는 1) |
| `created_at` | TEXT | ISO 형식 생성 시각 |

#### `user_data` 테이블

```sql
CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),  -- users.id 외래 키
  data TEXT NOT NULL DEFAULT '{}',                     -- 유저 데이터 JSON blob
  updated_at TEXT DEFAULT (datetime('now'))             -- 마지막 저장 시각
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `user_id` | INTEGER PK FK | `users.id`에 대한 외래 키 (1:1 관계) |
| `data` | TEXT | JSON 문자열로 직렬화된 전체 유저 데이터 ([2장](#2-json-blob-스키마) 참조) |
| `updated_at` | TEXT | 마지막 저장 시각 (UPSERT 시 자동 갱신) |

유저 생성 시 트랜잭션으로 `users` INSERT + `user_data` INSERT (`'{}'`) 를 원자적으로 실행한다.

데이터 저장은 UPSERT 패턴을 사용한다:
```sql
INSERT INTO user_data (user_id, data, updated_at)
VALUES (?, ?, datetime('now'))
ON CONFLICT(user_id) DO UPDATE SET data = ?, updated_at = datetime('now')
```

### 1.2 세션 DB (`sessions.db`)

경로: `DB_DIR/sessions.db` (메인 DB와 같은 디렉토리).

`better-sqlite3-session-store` 패키지가 자동으로 세션 테이블을 생성/관리한다.

| 설정 | 값 | 설명 |
|------|-----|------|
| 만료 세션 정리 주기 | 15분 (900,000ms) | `expired.intervalMs` |
| 쿠키 `maxAge` | 7일 | `7 * 24 * 60 * 60 * 1000` |
| `httpOnly` | `true` | JS에서 쿠키 접근 불가 |
| `sameSite` | `lax` | CSRF 기본 방어 |
| `secure` | `false` | Cloudflare Tunnel 뒤에서 HTTP 통신이므로 false |

세션에 저장되는 값:
- `req.session.userId` — `users.id`
- `req.session.username` — `users.username`

---

## 2. JSON Blob 스키마

`user_data.data` 컬럼에 저장되는 JSON 객체의 전체 구조.
서버 저장 시 **1MB 제한**이 적용된다.

```javascript
{
  sections: Section[],          // 체크리스트 섹션 배열 (3장 참조)
  memos: {                      // 날짜별 메모
    [dateKey: string]: string   // 예: { "2026-4-8": "오늘 할 일..." }
  },
  mealPlans: {                  // 날짜별 식단 계획
    [dateKey: string]: {
      breakfast: string[],      // 아침 메뉴 목록
      lunch: string[],          // 점심 메뉴 목록
      dinner: string[],         // 저녁 메뉴 목록
      snack: string[]           // 간식 목록
    }
  },
  mealChecks: {                 // [레거시] 8장 참조
    [dateKey: string]: object
  },
  mealTimes: {                  // 날짜별 끼니 시간
    [dateKey: string]: {
      breakfast?: string,       // 예: "07:30"
      lunch?: string,           // 예: "12:00"
      dinner?: string,          // 예: "18:30"
      snack?: string            // 예: "15:00"
    }
  },
  weights: {                    // 날짜별 몸무게
    [dateKey: string]: number   // 예: { "2026-4-8": 72.5 }
  },
  targetWeight: number,         // 목표 몸무게 (단일 값, 예: 68.0)
  completions: {                // 체크리스트 완료 상태
    [dateKey: string]: {
      [itemId: string]: boolean // 예: { "2026-4-8": { "i1": true, "i2": false } }
    }
  },
  dailyRecords: {               // 일일 스냅샷 (6장 참조)
    [dateKey: string]: DailyRecord
  },
  todos: {                      // 날짜별 할 일 목록
    [dateKey: string]: [
      {
        id: string,             // 고유 ID. 형식: 't' + Date.now()
        text: string,           // 할 일 텍스트
        done: boolean           // 완료 여부
      }
    ]
  }
}
```

### 필드 가드

`loadData()` 및 `importFromJSON()`에서 누락된 필드를 자동으로 빈 값으로 초기화한다:

```javascript
if (!data.memos) data.memos = {};
if (!data.mealPlans) data.mealPlans = {};
if (!data.completions) data.completions = {};
if (!data.dailyRecords) data.dailyRecords = {};
if (!data.mealChecks) data.mealChecks = {};
if (!data.mealTimes) data.mealTimes = {};
if (!data.weights) data.weights = {};
if (!data.sections) data.sections = [];
if (!data.todos) data.todos = {};
```

`sections`의 각 요소에 `color`가 없으면 `SECTION_COLORS` 배열에서 인덱스 기반으로 자동 할당한다.

### 초기 데이터 (신규 유저)

서버에서 데이터를 불러왔으나 `sections` 필드가 없는 경우 (신규 유저), 기본 구조로 초기화:

```javascript
{
  sections: SECTIONS_DEFAULT,  // 7장 참조
  memos: {},
  mealPlans: {},
  completions: {},
  dailyRecords: {},
}
```

---

## 3. Section 객체

체크리스트의 최상위 단위. 반복 일정 규칙과 하위 항목(Item)을 포함한다.

### Section 구조

```javascript
{
  id: string,           // 고유 ID. 형식: 's' + Date.now() (예: "s1712345678901")
                         // 기본 섹션은 'morning', 'meal', 'study' 같은 문자열 ID 사용
  title: string,        // 섹션 제목 (예: "아침 루틴")
  color: string,        // 색상 코드 (예: "#7C5CFC")
  repeat: string,       // 반복 타입 (4장 참조)
  repeatDay: number|null, // 반복 요일/날짜 (repeat 타입에 따라 다름)
  startDate: string,    // 시작일 (dateKey 형식, 예: "2026-4-1")
  endDate: string|null, // 종료일 (null이면 무기한)
  items: Item[]          // 하위 체크리스트 항목 배열
}
```

### Item 구조

```javascript
{
  id: string,            // 고유 ID. 형식: 'i' + Date.now() (예: "i1712345678901")
                          // 기본 섹션은 'i1', 'i2' 등의 문자열 ID 사용
  emoji: string,         // 이모지 (예: "🪥", 기본값: "📌")
  label: string,         // 항목 텍스트 (예: "양치")
  addedDate?: string,    // 항목 추가 날짜 (dateKey 형식, 선택적)
                          // addItemToSection()으로 추가 시 todayKey()가 설정됨
                          // 기본 섹션의 항목에는 없음 (섹션의 startDate를 fallback으로 사용)
  startDate?: string,    // 항목 시작일 (dateKey 형식)
                          // 추가 시 todayKey() 기본 설정, 사용자가 직접 수정 가능
                          // 없으면 addedDate → 섹션 startDate 순으로 fallback
  endDate?: string       // 항목 종료일 (dateKey 형식)
                          // 사용자가 직접 설정하거나, "습관 종료" 시 todayKey()로 설정
                          // null/undefined면 무기한
}
```

### 항목별 날짜 필터링

`isItemOnDate(item, section, dateKey)` 함수로 특정 날짜에 항목이 활성인지 판별:
1. `item.startDate || item.addedDate || section.startDate` 이전이면 `false`
2. `item.endDate`가 있고 해당 날짜 이후이면 `false`

`getItemsForDate(section, dateKey)` — 섹션 내 활성 항목만 반환.

### 사용 가능한 색상 (`SECTION_COLORS`)

```javascript
['#B026FF', '#FF44CC', '#FF3355', '#FF6B2B',
 '#FFE633', '#39FF14', '#00E5FF', '#4D6DFF', '#1B0CFF']
```

### "습관 종료" / "완전히 삭제" 패턴

항목과 섹션의 삭제/종료 방식:

#### 항목 삭제
- **완전히 삭제**: `removeItemFromSection()` — 섹션의 items 배열에서 제거, 모든 기록 삭제
- **습관 종료**: `endItem()` — `item.endDate = todayKey()` 설정, 오늘까지 표시/내일부터 미표시

#### 섹션 삭제
- **완전히 삭제**: `removeSection()` — sections 배열에서 완전 제거
- **습관 종료**: `removeSectionFuture()` — `endDate = todayKey()` 설정

#### 섹션 수정
- `updateSection()` — 섹션 속성(이름/색상/기간/반복) 직접 수정, 항목에 영향 없음
- scope 모달 없이 바로 적용 (섹션은 항목 그룹화 컨테이너)

#### 항목 추가/수정
- `addItemToSection(sectionId, emoji, label, startDate, endDate)` — 항목에 시작일/종료일 설정 가능 (기본 startDate=오늘)
- `updateItem(sectionId, itemId, emoji, label, startDate, endDate)` — 항목의 이모지/라벨/시작일/종료일 수정

---

## 4. 반복 타입

`section.repeat`에 사용되는 7가지 반복 유형과 `isSectionOnDate()` 함수의 날짜 매칭 로직.

| repeat 값 | 라벨 | repeatDay | 매칭 조건 |
|-----------|------|-----------|-----------|
| `daily` | 매일 | `null` | 항상 `true` |
| `weekdays` | 주중 | `null` | `getDay()` 1~5 (월~금) |
| `weekends` | 주말 | `null` | `getDay()` 0 또는 6 (일, 토) |
| `weekly` | 매주 | 요일 번호 (0=일, 6=토) | `getDay() === repeatDay` |
| `biweekly` | 격주 | 요일 번호 (0=일, 6=토) | 요일 일치 + `startDate`부터 주차가 짝수 |
| `everyOtherDay` | 격일 | `null` | `startDate`부터 경과 일수가 짝수 |
| `monthly` | 매월 | 날짜 (1~31) | `getDate() === repeatDay` |

### 공통 전제 조건

모든 반복 타입에 앞서 다음 조건을 먼저 검사한다:

1. `date < startDate` → `false` (시작일 이전이면 표시 안 함)
2. `endDate`가 존재하고 `date > endDate` → `false` (종료일 이후면 표시 안 함)

### 격주(biweekly) 계산 상세

```javascript
const diffDays = Math.round((date - startDate) / 86400000);
return dow === section.repeatDay && Math.floor(diffDays / 7) % 2 === 0;
```

`startDate`로부터 경과한 일수를 7로 나눈 **주차 번호**가 짝수인 주에만 매칭.

### 격일(everyOtherDay) 계산 상세

```javascript
const diffDays = Math.round((date - startDate) / 86400000);
return diffDays % 2 === 0;
```

`startDate`로부터 경과한 일수가 짝수이면 매칭 (시작일 포함).

---

## 5. 날짜 키 형식

프로젝트 전체에서 날짜를 문자열 키로 사용할 때의 형식.

### 형식: `YYYY-M-D`

- **zero-padding 없음** (예: 4월 8일 = `2026-4-8`, **아님**: `2026-04-08`)
- `todayKey()` 함수로 생성

```javascript
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
```

### 사용처

| 데이터 | 키 예시 |
|--------|---------|
| `completions["2026-4-8"]["i1"]` | 2026년 4월 8일의 항목 i1 완료 여부 |
| `memos["2026-4-8"]` | 2026년 4월 8일의 메모 |
| `mealPlans["2026-4-8"]` | 2026년 4월 8일의 식단 계획 |
| `mealTimes["2026-4-8"]` | 2026년 4월 8일의 끼니 시간 |
| `weights["2026-4-8"]` | 2026년 4월 8일의 몸무게 |
| `dailyRecords["2026-4-8"]` | 2026년 4월 8일의 일일 스냅샷 |
| `todos["2026-4-8"]` | 2026년 4월 8일의 할 일 목록 |
| `section.startDate` | 섹션 시작일 |
| `section.endDate` | 섹션 종료일 |
| `item.addedDate` | 항목 추가 날짜 |
| `item.startDate` | 항목 시작일 |
| `item.endDate` | 항목 종료일 |

---

## 6. DailyRecords 스냅샷

일일 기록 탭(tracker)에서 사용하는 스냅샷 데이터. 해당 날짜의 체크리스트 상태와 식단 실행 기록을 보존한다.

### DailyRecord 구조

```javascript
{
  checklist: {
    [itemId: string]: {
      section: string,    // 소속 섹션 제목 (예: "아침 루틴")
      color: string,      // 섹션 색상 (예: "#7C5CFC")
      emoji: string,      // 항목 이모지 (예: "🪥")
      label: string,      // 항목 텍스트 (예: "양치")
      done: boolean       // 완료 여부
    }
  },
  meals: {
    breakfast: string[],  // 실제 섭취한 아침 메뉴
    lunch: string[],      // 실제 섭취한 점심 메뉴
    dinner: string[],     // 실제 섭취한 저녁 메뉴
    snack: string[]       // 실제 섭취한 간식
  }
}
```

### 생성 시점

`saveDailySnapshot(dateKey)` 함수가 호출될 때 생성/갱신된다:

1. **체크리스트 토글 시** — `trackerToggleCheck()`에서 완료 상태 토글 후 스냅샷 저장
2. **JSON 내보내기 시** — `exportToJSON()`에서 오늘 날짜의 스냅샷을 먼저 저장

### 스냅샷 생성 로직

```javascript
function saveDailySnapshot(dateKey) {
  const sections = getSectionsForDate(dateKey);
  const record = { checklist: {}, meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
  
  // 해당 날짜의 모든 섹션과 항목을 순회하며 현재 상태 캡처
  sections.forEach(sec => {
    sec.items.forEach(item => {
      record.checklist[item.id] = {
        section: sec.title,
        color: sec.color,
        emoji: item.emoji,
        label: item.label,
        done: isCompleted(dateKey, item.id),
      };
    });
  });
  
  // 기존 meals 데이터가 있으면 보존
  if (data.dailyRecords[dateKey] && data.dailyRecords[dateKey].meals) {
    record.meals = data.dailyRecords[dateKey].meals;
  }
  
  data.dailyRecords[dateKey] = record;
}
```

### Tracker에서의 활용

일일 기록 탭(`tracker.js`)에서 날짜별 기록을 표시할 때:

1. **현재 날짜 또는 활성 섹션 있는 날짜**: `getSectionsForDate()`로 실시간 데이터를 직접 조회
2. **과거 날짜 (섹션이 이미 종료된 경우)**: `getDailyRecord()`에서 저장된 스냅샷의 `checklist` 데이터를 사용 (archived 표시, 토글 불가)

이 이중 구조 덕분에 섹션이 삭제/종료된 후에도 과거 기록을 조회할 수 있다.

### 식단 실행 기록 (`meals`)

식단 실행 기록은 `dailyRecords[dateKey].meals`에 저장된다:

- `toggleMealActual()` 함수로 개별 음식 항목을 토글
- `mealPlans`는 **계획**, `dailyRecords.meals`는 **실행** 기록
- Tracker 탭에서 계획 vs 실행을 비교하여 달성률 계산

---

## 7. 기본 섹션 (Default Sections)

신규 유저의 초기 데이터로 제공되는 3개의 기본 섹션 (`SECTIONS_DEFAULT`).

### 아침 루틴

```javascript
{
  id: 'morning',
  title: '아침 루틴',
  color: '#7C5CFC',
  repeat: 'daily',
  repeatDay: null,
  startDate: '2026-4-1',
  items: [
    { id: 'i1', emoji: '🪥', label: '양치' },
    { id: 'i2', emoji: '💧', label: '따뜻한 물 마시기' },
    { id: 'i3', emoji: '🧘', label: '스트레칭 20분' },
    { id: 'i4', emoji: '🙏', label: '명상 10분' },
  ]
}
```

### 식단

```javascript
{
  id: 'meal',
  title: '식단',
  color: '#FF9F43',
  repeat: 'daily',
  repeatDay: null,
  startDate: '2026-4-1',
  items: [
    { id: 'i5', emoji: '🍚', label: '현미밥 1공기' },
    { id: 'i6', emoji: '🫘', label: '두부 한 모' },
    { id: 'i7', emoji: '🐟', label: '생선' },
    { id: 'i8', emoji: '🥬', label: '야채 / 나물' },
    { id: 'i9', emoji: '🍲', label: '국' },
    { id: 'i10', emoji: '🥢', label: '김치' },
  ]
}
```

### 공부

```javascript
{
  id: 'study',
  title: '공부',
  color: '#4ECDC4',
  repeat: 'daily',
  repeatDay: null,
  startDate: '2026-4-1',
  items: [
    { id: 'i11', emoji: '📚', label: '집중 공부 4시간' },
    { id: 'i12', emoji: '🗣', label: '듀오링고 30분' },
  ]
}
```

> **참고:** 기본 섹션의 ID(`'morning'`, `'meal'`, `'study'`)와 항목 ID(`'i1'`~`'i12'`)는 하드코딩된 문자열이다. 유저가 새로 생성하는 섹션/항목은 `'s' + Date.now()` / `'i' + Date.now()` 형식의 타임스탬프 기반 ID를 사용한다.

---

## 8. 레거시 필드

### `mealChecks`

- **타입:** `{ [dateKey: string]: object }`
- **상태:** 레거시 (더 이상 적극적으로 사용되지 않음)
- **설명:** 이전 버전에서 식단 체크 상태를 저장하던 필드. 현재는 `dailyRecords[dateKey].meals`가 식단 실행 기록 역할을 대신한다.
- **필드 가드에서 초기화됨:** `if (!data.mealChecks) data.mealChecks = {};`
- **주의:** 기존 유저 데이터에 남아 있을 수 있으므로 필드 가드에서 제거하지 않는다. `importFromJSON()`에서는 별도로 가드하지 않는다.

---

## 9. localStorage 키

서버 기반 아키텍처에서 localStorage는 보조적 역할만 수행한다.

### `planner_v4_{username}`

- **용도:** 오프라인 폴백용 데이터 캐시
- **형식:** JSON 문자열 (2장의 JSON Blob 스키마 전체)
- **키 생성:** `getStorageKey()` 함수 — `'planner_v4_' + _currentUsername`
- **쓰기 시점:** `saveData()` 호출 시마다 (서버 저장과 동시에)
- **읽기 시점:** 서버 fetch 실패 시 폴백으로 사용
- **유저별 분리:** 같은 브라우저에서 여러 유저가 로그인해도 데이터가 섞이지 않음

```javascript
// 키 생성 로직
function getStorageKey() {
  return _currentUsername ? `planner_v4_${_currentUsername}` : 'planner_v4';
}
```

> `_currentUsername`이 비어 있으면 (로그인 전 또는 오류 시) `'planner_v4'`로 폴백된다.

### `planner_theme`

- **용도:** 다크/라이트 테마 설정
- **형식:** 문자열 (`"light"` 또는 미설정 시 다크 테마 기본)
- **특징:** 기기별 설정으로, 서버에 저장되지 않음 (유저 데이터와 독립적)

---

## 부록: 식단 타입 상수

```javascript
const MEAL_TYPES = [
  { key: 'breakfast', label: '아침', emoji: '🌅' },
  { key: 'lunch',     label: '점심', emoji: '☀️' },
  { key: 'dinner',    label: '저녁', emoji: '🌙' },
  { key: 'snack',     label: '간식', emoji: '🍎' },
];
```

## 부록: 데이터 흐름 요약

```
페이지 로드
  → fetch GET /api/data
  → data 객체 초기화 (필드 가드 적용)
  → 각 탭 렌더링

유저 조작
  → data 객체 직접 수정
  → saveData() 호출
    → localStorage 캐시 즉시 저장
    → 300ms 디바운스 후 fetch PUT /api/data

페이지 닫기
  → navigator.sendBeacon() POST /api/data (text/plain)
```
