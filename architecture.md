# Daily Planner - 시스템 아키텍처

## 1. 시스템 개요

```
+----------+     +------------+     +-----------+     +------------------+     +----------+
|          |     |            |     | Cloudflare|     |   Docker         |     |          |
|  사용자   | --> | Cloudflare | --> |  Tunnel   | --> |   Container      | --> |  SQLite  |
| (브라우저)|     | (DDoS 방어) |     | (HTTP/2)  |     | (Express :3000)  |     |   DB     |
|          |     |            |     |           |     |                  |     |          |
+----------+     +------------+     +-----------+     +------------------+     +----------+
                                                             |
                                                      +------+------+
                                                      |             |
                                                  planner.db   sessions.db
                                                  (유저 데이터)  (세션 저장소)
```

### Docker Compose 서비스 구성

```
docker-compose.yml
|
+-- planner (Node.js 앱)
|   |-- build: . (Dockerfile)
|   |-- ports: 3000:3000
|   |-- volumes:
|   |     planner-data:/data      (DB 영구 저장)
|   |     ./backups:/backups      (백업 파일)
|   |-- env_file: .env
|   +-- restart: unless-stopped
|
+-- tunnel (Cloudflare Tunnel)
|   |-- image: cloudflare/cloudflared
|   |-- command: tunnel --protocol http2 --url http://planner:3000
|   +-- depends_on: planner
|
+-- volumes:
    +-- planner-data (Docker 관리 볼륨)
```

---

## 2. 요청 라이프사이클

```
요청 수신
    |
    v
+-------------------+
| helmet (보안 헤더)  |
+-------------------+
    |
    v
+-------------------+
| morgan (로깅)      |
+-------------------+
    |
    v
+-------------------+
| body parser        |
| (JSON 1MB / text)  |
+-------------------+
    |
    v
+-------------------+
| session 미들웨어    |
| (SQLite 스토어)     |
+-------------------+
    |
    v
+------------------------+
| 전역 Rate Limiter       |
| (100회/분)              |
+------------------------+
    |
    v
+------------------------------+
| 인증 불필요 라우트             |
|                              |
| GET  /login.html  --> 정적   |
| POST /api/auth/login         |
|      (loginLimiter 10회/15분) |
| GET  /css/*  --> 정적 파일    |
| GET  /js/*   --> 정적 파일    |
+------------------------------+
    |
    v  (이후 모든 경로)
+------------------------------+
| requireAuth 미들웨어          |
| session.userId 확인           |
| 없으면:                       |
|   API --> 401 JSON            |
|   페이지 --> /login.html 리다이렉트 |
+------------------------------+
    |
    v
+------------------------------+
| 인증 필요 라우트               |
|                              |
| POST /api/auth/logout        |
| GET  /api/auth/me            |
| GET  /api/data               |
| PUT  /api/data               |
| POST /api/data (sendBeacon)  |
| GET  /  --> index.html       |
+------------------------------+
```

### 정적 파일 vs API 처리 순서

1. **정적 파일** (`/css/*`, `/js/*`): 인증 없이 즉시 서빙 (express.static)
2. **로그인 페이지** (`/login.html`): 인증 없이 서빙
3. **로그인 API** (`/api/auth/login`): 별도 Rate Limiter 적용 (15분 내 10회)
4. **그 외 모든 경로**: `requireAuth` 미들웨어 통과 후 처리

---

## 3. 프론트엔드 아키텍처

### 모듈 로드 순서

```
index.html
    |
    |  <script> 태그 순서 (전역 스코프)
    |
    +-- data.js        (1) 데이터 레이어 (공유 상태)
    |   |-- data 객체 (전역 메모리)
    |   |-- saveData() / loadData()
    |   |-- 섹션/항목/식단/몸무게 CRUD 함수
    |   +-- escapeHtml(), todayKey() 유틸리티
    |
    +-- checklist.js   (2) 체크리스트 탭
    |   |-- 미니 캘린더 렌더링
    |   |-- 일일 루틴 체크 UI
    |   +-- 진행률 표시
    |
    +-- calendar.js    (3) 캘린더 탭
    |   |-- 월간 캘린더 뷰
    |   |-- 섹션 관리 모달
    |   |-- 식단 계획 (시간 포함)
    |   |-- 몸무게 기록 (목표 대비 차이)
    |   +-- 날짜별 메모
    |
    +-- tracker.js     (4) 일일 기록 탭
        |-- 계획 vs 실행 비교 테이블
        +-- 설정 (목표 몸무게/테마/데이터 관리/로그아웃)
```

### 전역 스코프 공유 구조

```
window (전역)
    |
    +-- data             <-- data.js에서 선언, 모든 모듈이 직접 참조
    +-- saveData()       <-- data.js, 모든 모듈이 데이터 변경 후 호출
    +-- loadData()       <-- data.js, 초기화 시 호출
    +-- escapeHtml()     <-- data.js, innerHTML 삽입 시 XSS 방지
    +-- todayKey()       <-- data.js, "YYYY-M-D" 형식 날짜 키 생성
    +-- renderChecklist()
    +-- renderCalendar()
    +-- renderTracker()
    +-- ...기타 탭별 함수들
```

### 탭 전환

```
[체크리스트]  [캘린더]  [일일 기록]     [👤 username]
     |            |          |
     v            v          v
  tab-content 영역 show/hide 토글 (CSS display)
```

---

## 4. 데이터 흐름

```
+------------------+
| 페이지 로드        |
+------------------+
         |
         v
+------------------+     +-------------------+
| fetch /api/auth/me| --> | _currentUsername   |
| (유저명 확인)      |     | 설정 + nav 표시    |
+------------------+     +-------------------+
         |
         v
+------------------+     실패 시    +---------------------+
| fetch GET         | ----------> | localStorage 폴백    |
| /api/data         |             | (planner_v4_{user})  |
+------------------+              +---------------------+
         |
         | 성공
         v
+------------------+
| data 객체 초기화   |
| (메모리 상태)      |
| + 필드 가드 체크   |
+------------------+
         |
         v
+==========================================+
|            사용자 조작 루프                 |
|                                          |
|  유저 입력 --> data 객체 수정              |
|      |                                   |
|      v                                   |
|  saveData()                              |
|      |                                   |
|      +---> localStorage 즉시 저장         |
|      |     (planner_v4_{username})        |
|      |                                   |
|      +---> 300ms 디바운스                 |
|            |                             |
|            v                             |
|       fetch PUT /api/data                |
|            |                             |
|            +-- 401 --> /login.html        |
|            +-- 실패 --> 경고 표시          |
|                                          |
+==========================================+
         |
         | 페이지 닫기 (beforeunload)
         v
+------------------+
| navigator         |
| .sendBeacon()     |
| POST /api/data    |
| (text/plain)      |
+------------------+
```

### 서버 측 데이터 저장

```
PUT or POST /api/data
         |
         v
+----------------------+
| body 파싱              |
| (JSON or text/plain)  |
+----------------------+
         |
         v
+----------------------+
| 검증                   |
| - sections 배열 체크   |
| - 1MB 크기 제한        |
+----------------------+
         |
         v
+----------------------+
| saveUserData()        |
| INSERT ... ON CONFLICT|
| DO UPDATE (UPSERT)   |
+----------------------+
         |
         v
+----------------------+
| user_data 테이블       |
| (user_id, data JSON,  |
|  updated_at)          |
+----------------------+
```

---

## 5. 보안 3계층 구조

```
+================================================================+
|  1계층: 네트워크 격리                                             |
|                                                                |
|  외부 --> Cloudflare (DDoS 보호)                                |
|       --> Cloudflare Tunnel (HTTP/2, 인바운드 포트 불필요)        |
|       --> Docker 컨테이너 (호스트 파일시스템 격리)                 |
|       --> localhost:3000 (컨테이너 내부)                         |
|                                                                |
|  * Docker 볼륨으로 DB를 인터넷에서 격리                           |
|  * BIND_HOST 자동 감지: Docker면 0.0.0.0, 로컬이면 127.0.0.1    |
+================================================================+
         |
         v
+================================================================+
|  2계층: 환경변수 + 시크릿 관리                                    |
|                                                                |
|  .env 파일 (Git 제외)                                           |
|  |-- SESSION_SECRET: 세션 암호화 키 (필수, 없으면 서버 시작 거부)  |
|  +-- TRUST_PROXY: Cloudflare Tunnel 프록시 모드                 |
|                                                                |
|  * .env.example만 Git에 포함 (템플릿)                            |
|  * Docker Compose에서 env_file로 주입                            |
+================================================================+
         |
         v
+================================================================+
|  3계층: 애플리케이션 보안                                         |
|                                                                |
|  +-- bcrypt: 비밀번호 단방향 해시 저장                            |
|  +-- express-session: 서버 세션 (SQLite 스토어, 7일 만료)        |
|  |   +-- httpOnly 쿠키 (JS 접근 차단)                           |
|  |   +-- sameSite: lax (CSRF 방어)                              |
|  |   +-- 세션 regenerate (세션 고정 공격 방지)                    |
|  +-- helmet: 보안 HTTP 헤더 자동 설정                            |
|  +-- express-rate-limit:                                       |
|  |   +-- 전역: 100회/분                                        |
|  |   +-- 로그인: 10회/15분                                      |
|  +-- 요청 크기 제한: JSON/text 1MB                               |
|  +-- escapeHtml(): 프론트엔드 XSS 방지                          |
+================================================================+
```

---

## 6. 백엔드 모듈 관계

```
+-------------------+
|    server.js      |  (메인 엔트리포인트)
|                   |
|  Express 앱 설정   |
|  미들웨어 체인     |
|  라우트 정의       |
|  Graceful Shutdown|
+-------------------+
      |          |
      |          +-------------------+
      v                              v
+-------------------+     +-------------------+
|     db.js         |     |    backup.js      |
|                   |     |                   |
| better-sqlite3    |     | startBackupSchedule|
| DB 초기화 + WAL   |     | 6시간 간격 백업    |
| 테이블 생성        |     | 최근 7개 보존     |
| CRUD 함수:        |     | db.backup() 사용  |
|  findUser()       |     |                   |
|  findUserById()   |     +-------------------+
|  getUserData()    |              |
|  saveUserData()   |              | require('./db')
|  createUser()     |              | { db } 임포트
+-------------------+              |
      ^                            |
      |                            v
      |                    +-------------------+
      |                    |  db 객체 공유       |
      |                    | (같은 DB 인스턴스)   |
      |                    +-------------------+
      |
      +--- require('./db')
      |
+-------------------+
|  create-user.js   |  (CLI 도구, 독립 실행)
|                   |
|  유저 생성 스크립트 |
|  { createUser }   |
|  임포트            |
+-------------------+

세션 DB는 server.js에서 별도 생성:
  better-sqlite3(path.join(DB_DIR, 'sessions.db'))
  --> better-sqlite3-session-store에 전달
```

### 모듈 의존성 요약

| 모듈 | 임포트 대상 | 역할 |
|------|------------|------|
| `server.js` | `db.js`, `backup.js` | 웹 서버, 라우팅, 인증 |
| `db.js` | `better-sqlite3` | DB 초기화, CRUD |
| `backup.js` | `db.js` (db 객체) | 주기적 DB 백업 |
| `create-user.js` | `db.js` (createUser) | CLI 유저 생성 |

---

## 7. 배포 토폴로지

### Docker Compose 환경 (권장)

```
+-------------------------------------------------------+
|  호스트 머신                                             |
|                                                       |
|  docker-compose.yml                                   |
|  .env (SESSION_SECRET, TRUST_PROXY)                   |
|                                                       |
|  +--------------------------------------------------+ |
|  | Docker Network (default bridge)                   | |
|  |                                                   | |
|  |  +--------------------+   +--------------------+  | |
|  |  | planner            |   | tunnel             |  | |
|  |  | (Node 20 Alpine)   |   | (cloudflared)      |  | |
|  |  |                    |   |                    |  | |
|  |  | :3000 <------------|---|-- http://planner    |  | |
|  |  |                    |   |    :3000            |  | |
|  |  +--------------------+   +--------------------+  | |
|  |         |                         |               | |
|  +---------|-------------------------|---------------+ |
|            |                         |                 |
|   +--------+--------+               |                 |
|   |                 |          Cloudflare Edge         |
|   v                 v               |                 |
| planner-data:/data  ./backups:/backups                |
| (Docker 볼륨)       (바인드 마운트)                      |
| - planner.db                                          |
| - sessions.db                                         |
+-------------------------------------------------------+
                                       |
                                       v
                              +------------------+
                              | 외부 사용자        |
                              | (*.trycloudflare  |
                              |  .com 등)         |
                              +------------------+
```

### BIND_HOST 자동 감지

```javascript
// server.js (라인 194)
const BIND_HOST = process.env.BIND_HOST
  || (process.env.DB_DIR === '/data' ? '0.0.0.0' : '127.0.0.1');
```

| 환경 | DB_DIR | BIND_HOST | 이유 |
|------|--------|-----------|------|
| Docker | `/data` (기본값) | `0.0.0.0` | 컨테이너 외부(tunnel)에서 접근 필요 |
| 로컬 | 사용자 지정 경로 | `127.0.0.1` | 로컬 전용, 외부 노출 방지 |
| 수동 | `BIND_HOST` 설정 | 설정값 | 사용자 오버라이드 |

### 로컬 직접 실행 환경

```
+-------------------------------------------------------+
|  호스트 머신                                             |
|                                                       |
|  환경변수:                                              |
|    DB_DIR=C:\planner-data                             |
|    SESSION_SECRET=...                                 |
|    BACKUP_DIR=./backups                               |
|                                                       |
|  +--------------------+     +--------------------+    |
|  | node server.js     |     | tunnel.bat         |    |
|  | localhost:3000     |     | (cloudflared)      |    |
|  | BIND=127.0.0.1     |     |                    |    |
|  +--------------------+     +--------------------+    |
|         |                                             |
|   +-----+------+                                      |
|   v            v                                      |
| C:\planner-data\   ./backups/                         |
| - planner.db       - planner_YYYY-MM-DD_HH-MM.db     |
| - sessions.db                                         |
+-------------------------------------------------------+
```

### DB 백업 전략

```
서버 시작
    |
    v
startBackupSchedule()
    |
    +-- 즉시 1회 백업 실행
    |
    +-- setInterval(6시간)
            |
            v
        runBackup()
            |
            v
        db.backup(planner_YYYY-MM-DD_HH-MM.db)
            |
            v
        cleanOldBackups()
            |
            v
        최근 7개만 유지, 나머지 삭제
```

### DB 스키마

```sql
-- planner.db
users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin     INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT datetime('now')
)

user_data (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id),
    data       TEXT NOT NULL DEFAULT '{}',   -- JSON blob (전체 유저 데이터)
    updated_at TEXT DEFAULT datetime('now')
)

-- sessions.db (better-sqlite3-session-store 자동 관리)
sessions (
    sid     TEXT PRIMARY KEY,
    sess    TEXT,
    expired DATETIME
)
```

### WAL 모드

`db.js`에서 `PRAGMA journal_mode = WAL` 설정으로 읽기/쓰기 동시성을 향상시킨다.
이를 통해 백업 중에도 정상적인 읽기/쓰기가 가능하다.
