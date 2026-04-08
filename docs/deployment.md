# 배포 가이드

## 1. Docker 설정

### Dockerfile

Node 20 Alpine 기반 이미지를 사용하며, `better-sqlite3`의 네이티브 C++ 애드온 빌드를 위해 빌드 도구를 설치한다.

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++  # 네이티브 빌드 도구
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev               # 프로덕션 의존성만 설치
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

- `--omit=dev`: devDependencies를 제외하여 이미지 크기를 줄인다.
- `python3`, `make`, `g++`: `better-sqlite3`가 빌드 시 `node-gyp`를 사용하므로 필수.

### docker-compose.yml

2개의 서비스로 구성된다:

| 서비스 | 역할 | 이미지 |
|--------|------|--------|
| `planner` | 메인 앱 서버 | 로컬 빌드 (Dockerfile) |
| `tunnel` | Cloudflare Tunnel | `cloudflare/cloudflared:latest` |

```yaml
services:
  planner:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - planner-data:/data      # DB 영구 저장 (Docker 볼륨)
      - ./backups:/backups      # 백업 파일 (호스트 바인드)
    env_file:
      - .env                    # SESSION_SECRET 등
    environment:
      - DB_DIR=/data
      - BACKUP_DIR=/backups
    restart: unless-stopped

  tunnel:
    image: cloudflare/cloudflared:latest
    command: tunnel --protocol http2 --url http://planner:3000
    depends_on:
      - planner
    restart: unless-stopped

volumes:
  planner-data:                 # Named volume - Docker가 관리
```

**볼륨 설명:**
- `planner-data:/data` - Named volume. `planner.db`와 `sessions.db`가 저장된다. `docker compose down`으로 컨테이너를 삭제해도 데이터가 보존된다. 완전 삭제하려면 `docker volume rm daily_planner_planner-data`.
- `./backups:/backups` - 호스트 바인드 마운트. 백업 파일을 호스트에서 직접 확인할 수 있다.

---

## 2. 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `SESSION_SECRET` | **필수** | (없음) | 세션 암호화 키. 미설정 시 서버가 시작되지 않는다. |
| `DB_DIR` | 선택 | `/data` | SQLite DB 파일 저장 경로 |
| `BACKUP_DIR` | 선택 | `./backups` | 백업 파일 저장 경로 |
| `PORT` | 선택 | `3000` | 서버 포트 |
| `TRUST_PROXY` | 선택 | (미설정) | `1`로 설정하면 `trust proxy` 활성화 (리버스 프록시 뒤에서 사용 시) |
| `BIND_HOST` | 선택 | 자동 감지 | 서버 바인드 주소. 미설정 시 DB_DIR에 따라 자동 결정 (아래 참조) |

### .env 파일 설정

```bash
# .env 파일 생성
cp .env.example .env

# SESSION_SECRET에 랜덤 값 입력
# 예: openssl rand -hex 32 결과를 사용
SESSION_SECRET=여기에_긴_랜덤_문자열_입력
```

> `.env` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않는다.

---

## 3. 로컬 개발 (Docker 없이, Windows)

Docker 없이 Windows에서 직접 실행하는 방법:

### 사전 요구사항
- Node.js 20 이상
- Windows Build Tools (better-sqlite3 빌드용)

### 단계별 실행

```powershell
# 1. 의존성 설치
npm install

# 2. 환경변수 설정 (PowerShell)
$env:DB_DIR = "C:\planner-data"
$env:SESSION_SECRET = "랜덤시크릿문자열"
$env:BACKUP_DIR = "./backups"

# 또는 cmd에서:
set DB_DIR=C:\planner-data
set SESSION_SECRET=랜덤시크릿문자열
set BACKUP_DIR=./backups

# 3. DB 디렉토리 생성 (자동 생성되지만 명시적으로)
mkdir C:\planner-data

# 4. 유저 생성
node scripts/create-user.js myuser mypassword
# 관리자 유저:
node scripts/create-user.js admin adminpass --admin

# 5. 서버 시작
npm start
# → http://localhost:3000 에서 접속
```

> 로컬 실행 시 `DB_DIR`을 OneDrive 외부 경로로 설정할 것을 권장한다. OneDrive 동기화가 SQLite 파일을 잠그면 DB 오류가 발생할 수 있다.

---

## 4. Cloudflare Tunnel

외부에서 접속할 수 있도록 Cloudflare Tunnel을 사용한다. 포트 포워딩 없이 안전하게 외부 접속이 가능하다.

### 방법 1: 로컬에서 직접 (scripts/tunnel.bat)

```bat
@echo off
REM cloudflared가 설치되어 있어야 함
REM 설치: winget install Cloudflare.cloudflared

scripts\tunnel.bat
```

`tunnel.bat`은 다음 명령을 실행한다:
```
cloudflared tunnel --protocol http2 --url http://localhost:3000
```

실행하면 임시 URL이 생성되며, 이 URL을 공유하여 외부에서 접속할 수 있다.

### 방법 2: Docker Compose 터널 서비스

```bash
# 서버 + 터널 함께 시작
docker compose up

# 서버만 (터널 없이)
docker compose up planner
```

Docker 환경에서 tunnel 서비스는 `http://planner:3000`으로 접속한다 (Docker 내부 네트워크).

### --protocol http2

`--protocol http2` 옵션은 Cloudflare Tunnel이 HTTP/2 프로토콜을 사용하도록 강제한다. 기본값인 QUIC(UDP)는 일부 네트워크 환경에서 차단될 수 있어 HTTP/2(TCP)가 더 안정적이다.

---

## 5. Bind Host 자동 감지

서버는 `BIND_HOST` 환경변수가 설정되지 않은 경우, `DB_DIR` 값을 기준으로 바인드 주소를 자동 결정한다:

```javascript
const BIND_HOST = process.env.BIND_HOST || (process.env.DB_DIR === '/data' ? '0.0.0.0' : '127.0.0.1');
```

| 조건 | 바인드 주소 | 이유 |
|------|------------|------|
| `DB_DIR=/data` (Docker 기본값) | `0.0.0.0` | Docker 컨테이너는 외부에서 접근 가능해야 함 |
| `DB_DIR`이 다른 값 (로컬 실행) | `127.0.0.1` | 로컬 전용, 외부 접근 차단 |
| `BIND_HOST` 직접 설정 | 설정된 값 | 수동 오버라이드 |

- Docker에서는 `DB_DIR=/data`가 docker-compose.yml에 설정되어 있으므로 자동으로 `0.0.0.0`에 바인드된다.
- 로컬에서는 `127.0.0.1`에 바인드되어 같은 PC에서만 접속 가능하다 (보안).

---

## 6. 데이터베이스 관리

### DB 파일 구조

| 파일 | 용도 | 위치 |
|------|------|------|
| `planner.db` | 유저 정보 + 플래너 데이터 | `DB_DIR/planner.db` |
| `sessions.db` | 세션 저장소 | `DB_DIR/sessions.db` |

### WAL 모드

DB는 WAL(Write-Ahead Logging) 모드로 운영된다:
```javascript
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

WAL 모드는 읽기와 쓰기를 동시에 처리할 수 있어 성능이 향상된다. WAL 모드에서는 `planner.db-wal`, `planner.db-shm` 파일이 함께 생성된다. 이 파일들은 삭제하면 안 된다.

### 스키마

```sql
-- 유저 테이블
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 유저 데이터 (JSON blob)
CREATE TABLE user_data (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
);
```

### 유저 생성 (scripts/create-user.js)

```bash
# 기본 유저 생성
node scripts/create-user.js <아이디> <비밀번호>

# 관리자 유저 생성
node scripts/create-user.js <아이디> <비밀번호> --admin

# Docker 환경에서 유저 생성
docker compose run --rm planner node scripts/create-user.js <아이디> <비밀번호> [--admin]
```

**유효성 검사:**
- 아이디: 영문, 숫자, 언더스코어(`_`)만 허용, 2~30자
- 비밀번호: 4자 이상
- 중복 아이디 불가

비밀번호는 bcrypt (salt rounds: 10)로 해시되어 저장된다.

---

## 7. 백업 시스템

### 동작 방식

- **주기**: 서버 시작 직후 1회 + 이후 6시간 간격
- **보존**: 최근 7개 백업 파일만 유지, 초과분은 자동 삭제
- **API**: better-sqlite3의 `.backup()` 메서드 사용 (온라인 백업, 서비스 중단 없음)
- **저장 위치**: `BACKUP_DIR` 환경변수 (기본값: `./backups`)

### 파일 이름 형식

```
planner_YYYY-MM-DD_HH-mm.db
```

예시:
```
planner_2026-04-08_09-30.db
planner_2026-04-08_15-30.db
planner_2026-04-08_21-30.db
```

### 수동 복원

```bash
# 1. 서버 중지
docker compose down

# 2. 백업 파일 확인
ls backups/

# 3. 현재 DB를 백업 파일로 교체
# Docker 환경: 볼륨 내부에 직접 복사
docker run --rm -v daily_planner_planner-data:/data -v $(pwd)/backups:/backups alpine \
  cp /backups/planner_2026-04-08_09-30.db /data/planner.db

# 로컬 환경: 직접 복사
cp backups/planner_2026-04-08_09-30.db C:\planner-data\planner.db

# 4. 서버 재시작
docker compose up
```

> 복원 시 `sessions.db`는 교체하지 않아도 된다. 모든 유저의 세션이 만료되어 재로그인만 하면 된다.

---

## 8. 보안 체크리스트

### Rate Limiting

| 대상 | 제한 | 시간 윈도우 |
|------|------|------------|
| 전체 요청 | 100회 | 1분 |
| 로그인 API | 10회 | 15분 |

```javascript
// 전체 Rate Limiter
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });

// 로그인 Rate Limiter
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
```

### Helmet (보안 헤더)

```javascript
app.use(helmet({
  contentSecurityPolicy: false,  // 인라인 스크립트 사용으로 비활성화
}));
```

Helmet이 자동 설정하는 헤더: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` 등.

### 세션 설정

| 항목 | 값 | 설명 |
|------|-----|------|
| `httpOnly` | `true` | JavaScript에서 쿠키 접근 차단 |
| `sameSite` | `lax` | CSRF 방어 |
| `secure` | `false` | Tunnel-Express 간 HTTP 통신이므로 false |
| `maxAge` | 7일 | 세션 유효 기간 |
| 세션 고정 공격 방지 | `session.regenerate()` | 로그인 시 새 세션 ID 발급 |
| 만료 세션 정리 | 15분 간격 | `better-sqlite3-session-store`가 자동 처리 |

### bcrypt

- Salt rounds: 10
- `bcrypt.hashSync()`로 해시 생성, `bcrypt.compare()`로 검증

### 요청 크기 제한

```javascript
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));
```

서버 측에서도 JSON 문자열 길이를 1MB로 추가 검증한다:
```javascript
const json = JSON.stringify(body);
if (json.length > 1024 * 1024) {
  return res.status(413).json({ error: '데이터가 너무 큽니다' });
}
```

### 전체 보안 구조

```
외부 사용자 → Cloudflare (DDoS 보호) → Tunnel (HTTP/2) → Docker 컨테이너 → localhost:3000
                                                          ↑ PC 파일 시스템 격리
```

---

## 9. 트러블슈팅

### Docker 네트워킹 (v6.1 이슈)

Docker Desktop v6.1+에서 IPv6 관련 변경으로 컨테이너 간 통신이 실패할 수 있다.

**증상:** tunnel 서비스가 planner 서비스에 연결하지 못함 (`connection refused`).

**해결 방법:**

1. `docker-compose.yml`에 네트워크를 명시적으로 설정:
```yaml
services:
  planner:
    # ...
    networks:
      - app-net

  tunnel:
    # ...
    networks:
      - app-net

networks:
  app-net:
    driver: bridge
```

2. 또는 Docker Desktop 설정에서 IPv6를 비활성화한다.

### 세션 유지 문제

**증상:** 서버를 재시작하면 모든 유저가 로그아웃된다 (Docker 환경).

**원인:** `sessions.db`가 볼륨에 올바르게 저장되지 않을 때 발생.

**확인:**
```bash
# sessions.db가 /data 볼륨에 있는지 확인
docker compose exec planner ls -la /data/
# planner.db와 sessions.db가 모두 보여야 한다
```

`sessions.db`는 `DB_DIR` 경로에 저장된다. Docker에서 `DB_DIR=/data`이고 `/data`가 볼륨에 매핑되어 있으므로 컨테이너 재시작 후에도 세션이 유지된다.

### 서버가 시작되지 않음

**증상:** `SESSION_SECRET 환경변수가 설정되지 않았습니다` 오류.

**해결:**
```bash
# .env 파일이 있는지 확인
cat .env

# .env 파일 생성
cp .env.example .env
# SESSION_SECRET 값 입력
```

### better-sqlite3 빌드 실패

**증상:** `npm install` 시 `node-gyp` 관련 오류.

**해결 (Windows):**
```powershell
# Windows Build Tools 설치
npm install -g windows-build-tools

# 또는 Visual Studio Build Tools를 설치한 후:
npm config set msvs_version 2022
npm install
```

Docker 환경에서는 Dockerfile에서 `python3 make g++`를 설치하므로 이 문제가 발생하지 않는다.

### 백업이 생성되지 않음

**확인:**
```bash
# 백업 디렉토리 확인
ls -la backups/

# 서버 로그에서 백업 관련 메시지 확인
docker compose logs planner | grep BACKUP
```

`BACKUP_DIR` 경로에 쓰기 권한이 있는지 확인한다. Docker에서는 `./backups`가 호스트에 바인드 마운트되므로 호스트의 해당 디렉토리 권한을 확인한다.
