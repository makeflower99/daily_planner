# Daily Planner

멀티유저 데일리 플래너 웹 앱. 체크리스트, 캘린더, 식단 관리, 일일 기록 비교 기능 제공.

## 기술 스택

- **프론트엔드**: Vanilla JS, HTML5, CSS3
- **백엔드**: Node.js + Express + SQLite
- **인증**: express-session + bcrypt
- **보안**: helmet, rate-limit, Docker 컨테이너 격리
- **외부 접속**: Cloudflare Tunnel (HTTP/2)

## 실행 방법

### Docker (권장)

```bash
# 1. .env 파일 준비
cp .env.example .env
# SESSION_SECRET에 랜덤 값 입력 (예: openssl rand -hex 32)

# 2. 유저 생성
docker compose run --rm planner node scripts/create-user.js <아이디> <비밀번호>

# 3. 서버 + Cloudflare Tunnel 시작
docker compose up

# 4. 서버만 (터널 없이)
docker compose up planner
```

서버: http://localhost:3000  
외부 접속: Cloudflare Tunnel이 생성한 URL을 공유

### 로컬 직접 실행 (Docker 없이)

```bash
# 환경변수 설정 (Windows)
set DB_DIR=C:\planner-data
set SESSION_SECRET=랜덤시크릿문자열
set BACKUP_DIR=./backups

# 의존성 설치 & 서버 시작
npm install
npm start

# 유저 생성
node scripts/create-user.js <아이디> <비밀번호> [--admin]

# 외부 접속 (Cloudflare Tunnel)
scripts\tunnel.bat
```

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `SESSION_SECRET` | O | - | 세션 암호화 키 |
| `DB_DIR` | X | `/data` | DB 파일 저장 경로 |
| `BACKUP_DIR` | X | `./backups` | 백업 파일 저장 경로 |
| `PORT` | X | `3000` | 서버 포트 |
| `TRUST_PROXY` | X | - | `1`로 설정 시 프록시 모드 |

## 보안 구조

```
외부 사용자 -> Cloudflare (DDoS 보호) -> Tunnel (HTTP/2) -> Docker -> localhost:3000
```

- **1겹**: Docker 컨테이너로 DB를 PC 파일 시스템에서 격리
- **2겹**: `.env` 파일로 시크릿 관리 (코드에 비밀번호 없음)
- **3겹**: bcrypt로 비밀번호 암호화 저장
- **Rate Limit**: 전체 API 1분/100회, 로그인 15분/10회
- **DB 백업**: 6시간마다 자동 백업, 최근 7개 보존

## 문제 해결 / 데이터 관리

### 데이터 저장 위치

| 실행 방식 | DB 위치 |
|-----------|---------|
| Docker | Docker 볼륨 `daily_planner_planner-data` (컨테이너 내 `/data/planner.db`) |
| 로컬 직접 실행 | `DB_DIR` 환경변수 경로 (예: `C:\planner-data\planner.db`) |
| 자동 백업 | `./backups/planner_YYYY-MM-DD_HH-MM.db` (6시간마다, 최근 7개) |

> ⚠️ **Docker ↔ 로컬 전환 주의**: 두 모드는 서로 다른 DB를 보기 때문에, 모드를 바꾸면 데이터가 "사라진" 것처럼 보입니다. 실제로는 다른 저장소에 그대로 있습니다.

### Docker 볼륨 내용 확인

```bash
# Windows Git Bash는 MSYS_NO_PATHCONV=1 prefix 필요
docker run --rm -v daily_planner_planner-data:/data alpine ls -la /data
```

### 자동 백업 스냅샷에서 복원

`backups/` 폴더에 저장된 시점별 스냅샷(`planner_YYYY-MM-DD_HH-MM.db`)을 `planner.db`로 복사하면 복원됩니다.

**Docker 볼륨에 복원**:

```bash
# 1. 컨테이너 정지
docker compose down

# 2. 현재 Docker 볼륨 DB를 안전 백업 (덮어쓰기 전 보존)
docker run --rm -v daily_planner_planner-data:/data -v "$(pwd)/backups:/backup" alpine \
  cp /data/planner.db /backup/planner_before-restore.db

# 3. 원하는 스냅샷을 planner.db로 복원 (파일명을 실제 이름으로 교체)
docker run --rm -v daily_planner_planner-data:/data -v "$(pwd)/backups:/backup:ro" alpine \
  cp /backup/planner_2026-04-13_13-58.db /data/planner.db

# 4. 복원 확인
docker run --rm -v daily_planner_planner-data:/data alpine sh -c \
  "apk add --quiet sqlite && sqlite3 /data/planner.db 'SELECT username FROM users;'"

# 5. 재시작
docker compose up
```

**로컬 직접 실행 환경에 복원**:

```bash
# 서버 정지 후 (Ctrl+C)
copy backups\planner_2026-04-13_13-58.db C:\planner-data\planner.db
npm start
```

> ⚠️ SQLite는 WAL 모드로 동작하므로, **서버 실행 중에는 DB 파일을 덮어쓰지 말 것**. 반드시 정지 후 복사하세요.

### 로컬 DB → Docker 볼륨으로 이관

Docker로 전환했는데 기존 로컬 DB의 데이터를 가져오고 싶을 때:

```bash
docker compose down

# 로컬 DB 파일을 Docker 볼륨으로 복사
docker run --rm -v daily_planner_planner-data:/data -v "C:/planner-data:/source:ro" alpine \
  cp /source/planner.db /data/planner.db

docker compose up
```

### 비밀번호 리셋 (데이터는 유지)

> bcrypt 해시는 단방향이라 원본 비번을 복구할 수 없으므로 **리셋만 가능**합니다.  
> `users.password_hash` 컬럼만 교체하는 방식이라 `user_data`의 플래너 데이터는 그대로 유지됩니다.

```bash
# Docker 환경에서 admin 비번을 새 값으로 리셋
docker compose exec planner node -e "
const bcrypt = require('bcrypt');
const { db } = require('./db');
const hash = bcrypt.hashSync('새비밀번호', 10);
const r = db.prepare('UPDATE users SET password_hash=? WHERE username=?').run(hash, 'admin');
console.log('업데이트된 행:', r.changes);
"
```

로컬 직접 실행 환경에서는 `docker compose exec planner` 부분을 빼고 프로젝트 루트에서 `node -e "..."`로 실행하세요.

### `.env` 파일 분실 시 재생성

```bash
# 1. 랜덤 SESSION_SECRET 생성
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. .env.example 복사 후 위 값을 SESSION_SECRET에 붙여넣기
cp .env.example .env
```

`SESSION_SECRET`은 세션 쿠키 서명 키이므로, 값이 바뀌면 기존 로그인 세션만 무효화됩니다(재로그인 필요). DB의 bcrypt 비번 해시와는 무관하므로 **계정과 플래너 데이터는 그대로 유지**됩니다.

### 앱 재설치 시 데이터 보존 (JSON 내보내기/가져오기)

앱 재설치·다른 기기 이전 시에는 UI 기능으로 데이터를 옮길 수 있습니다.

**위치**: 앱 접속 → **일일 기록 탭 → 설정 → 데이터 관리**

- **내보내기**: `planner_backup_YYYYMMDD.json` 다운로드
- **가져오기**: 새 환경에서 유저를 먼저 만들고 로그인 → 동일 메뉴에서 JSON 업로드

| 포함 | 비포함 |
|------|--------|
| sections, completions, mealPlans, mealTimes, weights, dailyRecords, memos, todos | 유저 계정(ID/비번) — 새로 생성 필요 |
| | 테마 설정 — 브라우저 localStorage에 기기별 저장 |

## 주요 기능

- **체크리스트**: 반복 일정 관리, 미니 캘린더, 진행률 표시
- **캘린더**: 월간 뷰, 섹션/식단/메모/몸무게 관리
- **일일 기록**: 계획 vs 실행 비교 테이블, 달성률 통계
- **다크/라이트 테마**: 기기별 설정 저장
- **데이터 내보내기/가져오기**: JSON 백업

## 프로젝트 문서

- [DEV_LOG.md](docs/DEV_LOG.md) - 버전 히스토리 및 기능 목록
- [CLAUDE.md](CLAUDE.md) - 프로젝트 가이드 (개발 컨텍스트)
- [PROJECT_REPORT.md](docs/PROJECT_REPORT.md) - 상세 프로젝트 레포트
