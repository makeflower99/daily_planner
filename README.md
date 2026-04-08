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
