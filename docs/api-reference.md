# API 레퍼런스

Daily Planner 서버의 모든 API 엔드포인트를 문서화한 레퍼런스입니다.

## 엔드포인트 요약

| Method | Path | Auth | Rate Limit | 설명 |
|--------|------|:----:|------------|------|
| POST | `/api/auth/login` | ✗ | 10회/15분 | 로그인 |
| POST | `/api/auth/logout` | ✓ | 100회/분 | 로그아웃 |
| GET | `/api/auth/me` | ✓ | 100회/분 | 현재 유저 정보 |
| GET | `/api/data` | ✓ | 100회/분 | 유저 데이터 로드 |
| PUT | `/api/data` | ✓ | 100회/분 | 유저 데이터 저장 (fetch) |
| POST | `/api/data` | ✓ | 100회/분 | 유저 데이터 저장 (sendBeacon) |

---

## 미들웨어 파이프라인

요청은 다음 순서로 미들웨어를 통과합니다:

1. **helmet** — 보안 헤더 설정 (CSP는 인라인 스크립트 사용으로 비활성화)
2. **morgan** — 요청 로깅 (`short` 포맷)
3. **express.json** — JSON 바디 파싱 (1MB 제한)
4. **express.text** — text/plain 바디 파싱 (sendBeacon 대응, 1MB 제한)
5. **express-session** — 세션 관리 (SQLite 스토어)
6. **globalLimiter** — 전체 Rate Limit (100회/분)
7. **requireAuth** — 인증 미들웨어 (인증 필요 라우트에만 적용)

### 인증 미들웨어 (`requireAuth`) 동작

```
요청 도달
  ├── session.userId 존재 → next() (통과)
  ├── API 요청 (/api/*) → 401 { error: "로그인이 필요합니다" }
  └── 페이지 요청 → 302 redirect → /login.html
```

---

## 정적 파일 라우팅 (인증 불필요)

| Path | 설명 |
|------|------|
| `GET /css/*` | CSS 파일 서빙 |
| `GET /js/*` | JavaScript 파일 서빙 |
| `GET /login.html` | 로그인 페이지 |
| `GET /login` | `/login.html`로 리다이렉트 |

---

## 인증 엔드포인트

### POST `/api/auth/login`

로그인 처리. 성공 시 세션 쿠키를 발급합니다.

**Rate Limit:** 15분 내 10회 (`loginLimiter`)

**Request:**
```json
{
  "username": "admin",
  "password": "mypassword123"
}
```

**성공 Response (200):**
```json
{
  "username": "admin"
}
```
- 쿠키 `connect.sid` 설정 (httpOnly, sameSite=lax, 7일 유효)
- 세션 고정 공격 방지를 위해 `session.regenerate()` 호출 후 새 세션 ID 발급

**에러 Response:**

| Status | Body | 조건 |
|--------|------|------|
| 400 | `{ "error": "아이디와 비밀번호를 입력하세요" }` | username 또는 password 누락 |
| 401 | `{ "error": "아이디 또는 비밀번호가 올바르지 않습니다" }` | 존재하지 않는 유저 또는 비밀번호 불일치 |
| 429 | `{ "error": "너무 많은 로그인 시도입니다. 15분 후 다시 시도하세요." }` | Rate Limit 초과 |
| 500 | `{ "error": "세션 오류" }` 또는 `{ "error": "서버 오류가 발생했습니다" }` | 내부 오류 |

---

### POST `/api/auth/logout`

세션을 파기하고 쿠키를 제거합니다.

**Auth:** 필수

**Request:** 바디 없음

**성공 Response (200):**
```json
{
  "ok": true
}
```
- `connect.sid` 쿠키 삭제
- 서버 세션 destroy

---

### GET `/api/auth/me`

현재 로그인된 유저 정보를 반환합니다.

**Auth:** 필수

**Request:** 바디 없음

**성공 Response (200):**
```json
{
  "username": "admin",
  "isAdmin": true
}
```

**에러 Response:**

| Status | Body | 조건 |
|--------|------|------|
| 401 | `{ "error": "유저를 찾을 수 없습니다" }` | DB에서 유저 조회 실패 |
| 401 | `{ "error": "로그인이 필요합니다" }` | 세션 없음 (requireAuth) |

---

## 데이터 엔드포인트

### GET `/api/data`

현재 유저의 전체 데이터를 JSON blob으로 반환합니다.

**Auth:** 필수

**Request:** 바디 없음

**성공 Response (200):**
```json
{
  "sections": [
    {
      "id": "s1712345678901",
      "title": "아침 루틴",
      "color": "#7C5CFC",
      "repeat": "daily",
      "repeatDay": null,
      "startDate": "2026-4-1",
      "endDate": null,
      "items": [
        {
          "id": "i1712345678902",
          "emoji": "🧘",
          "label": "스트레칭",
          "addedDate": "2026-4-1"
        }
      ]
    }
  ],
  "memos": {
    "2026-4-3": "오늘의 메모 내용"
  },
  "mealPlans": {
    "2026-4-3": {
      "breakfast": ["토스트", "우유"],
      "lunch": ["비빔밥"],
      "dinner": ["샐러드"],
      "snack": []
    }
  },
  "mealChecks": {},
  "mealTimes": {
    "2026-4-3": {
      "breakfast": "07:30",
      "lunch": "12:00",
      "dinner": "18:30"
    }
  },
  "weights": {
    "2026-4-3": 72.5
  },
  "targetWeight": 70,
  "completions": {
    "2026-4-3": {
      "i1712345678902": true
    }
  },
  "dailyRecords": {
    "2026-4-3": {
      "checklist": { "total": 5, "done": 3, "pct": 60 },
      "meals": {
        "breakfast": { "planned": ["토스트", "우유"], "actual": ["토스트"] },
        "lunch": { "planned": ["비빔밥"], "actual": ["비빔밥"] }
      }
    }
  }
}
```

---

### PUT `/api/data`

유저 데이터를 저장합니다. 프론트엔드의 `saveData()`에서 `fetch`로 호출합니다.

**Auth:** 필수

**Request:**
```http
PUT /api/data HTTP/1.1
Content-Type: application/json

{
  "sections": [...],
  "memos": {...},
  "mealPlans": {...},
  "completions": {...},
  "dailyRecords": {...},
  "mealTimes": {...},
  "weights": {...},
  "targetWeight": 70,
  "mealChecks": {}
}
```

**성공 Response (200):**
```json
{
  "ok": true
}
```

**에러 Response:**

| Status | Body | 조건 |
|--------|------|------|
| 400 | `{ "error": "잘못된 데이터" }` | body가 null/undefined 또는 text/plain 파싱 실패 |
| 400 | `{ "error": "잘못된 데이터 형식" }` | `sections`가 존재하지만 배열이 아닌 경우 |
| 413 | `{ "error": "데이터가 너무 큽니다" }` | JSON stringify 결과가 1MB 초과 |
| 429 | `{ "error": "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }` | 전체 Rate Limit 초과 |

---

### POST `/api/data`

`PUT /api/data`와 동일한 `handleDataSave` 핸들러를 사용합니다.

**용도:** `navigator.sendBeacon()`은 POST만 지원하므로, 페이지 닫기(beforeunload) 시 데이터를 확실하게 저장하기 위한 엔드포인트입니다.

**특이사항:**
- `sendBeacon`은 `Content-Type: text/plain`으로 전송할 수 있음
- 서버에서 `typeof body === 'string'`이면 `JSON.parse()` 시도
- 파싱 실패 시 400 에러 반환

**Request (sendBeacon):**
```http
POST /api/data HTTP/1.1
Content-Type: text/plain

{"sections":[...],"memos":{...},...}
```

**Response:** `PUT /api/data`와 동일

---

## 공유 핸들러: `handleDataSave`

`PUT /api/data`와 `POST /api/data` 모두 이 함수를 사용합니다.

**처리 흐름:**
```
요청 도달
  ├── body가 string → JSON.parse() 시도
  │     └── 실패 → 400 "잘못된 데이터"
  ├── body가 null/object 아님 → 400 "잘못된 데이터"
  ├── sections 존재 & 배열 아님 → 400 "잘못된 데이터 형식"
  ├── JSON.stringify 크기 > 1MB → 413 "데이터가 너무 큽니다"
  └── 통과 → saveUserData(userId, json) → 200 { ok: true }
```

---

## 세션 설정

| 항목 | 값 | 설명 |
|------|-----|------|
| 스토어 | SQLite (`sessions.db`) | better-sqlite3-session-store |
| 만료 세션 정리 | 15분 간격 | `intervalMs: 900000` |
| 쿠키 이름 | `connect.sid` | Express 기본값 |
| httpOnly | `true` | JS에서 쿠키 접근 불가 |
| sameSite | `lax` | CSRF 방지 |
| secure | `false` | Tunnel→Express는 HTTP이므로 false |
| maxAge | 7일 | `604800000ms` |
| resave | `false` | 변경 없는 세션 재저장 안 함 |
| saveUninitialized | `false` | 빈 세션 저장 안 함 |

---

## Rate Limiting

| Limiter | 적용 범위 | 제한 | 윈도우 | 에러 메시지 |
|---------|----------|------|--------|------------|
| `globalLimiter` | 모든 요청 | 100회 | 1분 | "요청이 너무 많습니다..." |
| `loginLimiter` | `POST /api/auth/login`만 | 10회 | 15분 | "너무 많은 로그인 시도입니다..." |

두 Rate Limiter 모두 `standardHeaders: true` (RateLimit-* 헤더 반환), `legacyHeaders: false`.

---

## 인증 필요/불필요 구분

```
인증 불필요 (requireAuth 이전에 등록):
  ├── GET  /login.html    — 로그인 페이지
  ├── GET  /login         — /login.html 리다이렉트
  ├── POST /api/auth/login — 로그인 API
  ├── GET  /css/*          — CSS 정적 파일
  └── GET  /js/*           — JS 정적 파일

app.use(requireAuth) ← 이 시점부터 인증 필수

인증 필수:
  ├── POST /api/auth/logout — 로그아웃
  ├── GET  /api/auth/me     — 유저 정보
  ├── GET  /api/data        — 데이터 로드
  ├── PUT  /api/data        — 데이터 저장
  ├── POST /api/data        — 데이터 저장 (sendBeacon)
  ├── GET  /                — 메인 페이지 (index.html)
  └── GET  /index.html      — 메인 페이지
```

---

## Graceful Shutdown

`SIGINT` 또는 `SIGTERM` 시그널 수신 시:
1. 메인 DB 연결 닫기 (`db.close()`)
2. 세션 DB 연결 닫기 (`sessionDb.close()`)
3. 프로세스 종료 (`process.exit(0)`)

---

## 서버 바인딩

```javascript
const BIND_HOST = process.env.BIND_HOST || (process.env.DB_DIR === '/data' ? '0.0.0.0' : '127.0.0.1');
```

| 환경 | BIND_HOST | 이유 |
|------|-----------|------|
| Docker (`DB_DIR=/data`) | `0.0.0.0` | 다른 컨테이너(tunnel)에서 접근 필요 |
| 로컬 | `127.0.0.1` | 로컬 전용, 방화벽 팝업 방지 |
| 수동 설정 | `BIND_HOST` 환경변수 | 직접 오버라이드 |
