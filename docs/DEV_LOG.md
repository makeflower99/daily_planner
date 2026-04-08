# Daily Planner - 개발 로그

## 버전 히스토리

### v1.0 - 초기 버전
- 기본 체크리스트 기능
- 섹션별 항목 관리
- localStorage 저장 (`planner_v2`)

### v2.0 - 캘린더 & 식단 추가
- 월간 캘린더 뷰
- 식단 계획 (아침/점심/저녁/간식)
- 메모 기능
- 데이터 마이그레이션 (`planner_v3` → `planner_v4`)
- 반복 일정 (매일/주중/주말/주간/격주/격일/월간)
- 드래그 앤 드롭 (섹션, 항목, 식단)

### v3.0 - 일일 기록 & 비교
- 일일 기록 탭 (계획 vs 실행 비교)
- 달성률 통계 (전체/루틴/식단)
- 데이터 내보내기/가져오기 (JSON)

### v4.0 - 2026-04-03 업데이트
- **글씨 크기 증가**: 전반적 폰트 사이즈 2~3px 상향 (가독성 개선)
- **다크/라이트 테마**: 테마 토글 기능 추가, localStorage로 설정 저장
- **설정 탭 통합**: 데이터 관리 + 테마 변경을 일일 기록 탭으로 이동
- **식단 시간 입력**: 각 끼니별 시간 기록 기능 (time input)
- **몸무게 기록**: 날짜별 몸무게 입력/저장 기능 (메모 위에 배치)
- **프로젝트 문서화**: CLAUDE.md, DEV_LOG.md 생성
- **목표 몸무게 설정**: 일일 기록 탭 설정에서 목표 몸무게 입력, 캘린더 몸무게 저장 시 목표 대비 차이 표시

### v5.0 - 2026-04-05 서버 전환 (멀티유저)
- **아키텍처 전환**: localStorage → Express + SQLite 서버 기반
- **멀티유저 지원**: 유저별 데이터 분리 (SQLite JSON blob 저장)
- **인증 시스템**: 아이디/비밀번호 로그인, 서버 세션 관리 (bcrypt, express-session)
- **로그인 페이지**: 다크/라이트 테마 지원, 한국어 UI
- **보안 강화**:
  - 로그인 rate limiting (15분/10회)
  - helmet 보안 헤더
  - 세션 고정 공격 방지 (session regeneration)
  - 세션 시크릿 파일 저장 (서버 재시작 시 세션 유지)
  - 데이터 저장 시 스키마 검증 + 1MB 크기 제한
  - XSS 방지용 escapeHtml() 유틸 추가
- **데이터 흐름 개선**:
  - saveData(): 300ms 디바운스 + 서버 저장 + localStorage 캐시
  - loadData(): async 서버 로드 + 오프라인 폴백
  - beforeunload: navigator.sendBeacon() (POST) 으로 확실한 저장
  - localStorage 키 유저별 분리 (교차 유저 캐시 방지)
- **외부 접속**: Cloudflare Tunnel 지원 (tunnel.bat)
- **운영 개선**: morgan 로깅, graceful shutdown, DB 트랜잭션
- **신규 파일**: server.js, db.js, create-user.js, login.html, package.json, tunnel.bat
- **DB 위치**: `C:\planner-data\` (OneDrive 외부)
- **변경 없는 파일**: checklist.js, calendar.js, tracker.js, styles.css

### v6.0 - 2026-04-07 Docker 컨테이너화 & 보안 강화
- **Docker 컨테이너화**: 서버를 Docker 컨테이너 안에서 격리 실행
  - `Dockerfile`: Node 20 Alpine 기반, better-sqlite3 네이티브 빌드 지원
  - `docker-compose.yml`: 서버 + Cloudflare Tunnel 통합 실행
  - `.dockerignore`: 빌드 시 불필요 파일 제외
- **보안 3겹 구조**:
  - 1겹: Docker로 DB를 인터넷에서 격리 (PC 파일 시스템 접근 불가)
  - 2겹: 세션 시크릿을 `.env` 파일로 분리 (코드에 비밀번호 없음)
  - 3겹: bcrypt 암호화 (기존 v5.0부터 적용)
- **환경변수 관리**: `.env` 파일 기반, `SESSION_SECRET` 필수 검증
- **DB 자동 백업**: 6시간마다 자동 백업, 최근 7개 보존 (`backup.js`)
  - better-sqlite3 `.backup()` API로 안전한 온라인 백업
  - `./backups/` 디렉토리에 로컬 저장 (컨테이너 외부)
- **전체 Rate Limiter**: 모든 API에 1분/100회 제한 추가
- **서버 바인딩**: `0.0.0.0` → `127.0.0.1` (로컬 전용, 방화벽 팝업 방지)
- **Cloudflare Tunnel**: `--protocol http2` 추가 (UDP 차단 네트워크 대응)
- **DB 경로 변경**: `C:\planner-data` → `/data` (Docker 볼륨 기본, 환경변수로 오버라이드 가능)
- **신규 파일**: Dockerfile, docker-compose.yml, backup.js, .env, .env.example, .dockerignore
- **수정 파일**: server.js, db.js, tunnel.bat, .gitignore

### v6.1 - 2026-04-07 Docker 네트워크 버그 수정 & 아키텍처 문서
- **서버 바인딩 버그 수정**: Docker 환경에서 `127.0.0.1` 바인딩으로 인해 tunnel 컨테이너가 planner에 접근 불가했던 문제 해결
  - 원인: Docker 컨테이너 내 `127.0.0.1`은 자기 자신만 접근 가능, 다른 컨테이너(tunnel)는 Docker 내부 네트워크(172.18.0.x)로 접근
  - 수정: 환경별 자동 감지 — Docker(`DB_DIR=/data`)이면 `0.0.0.0`, 로컬이면 `127.0.0.1`
  - `BIND_HOST` 환경변수로 직접 오버라이드 가능
  - Docker에서 `0.0.0.0`은 격리된 Docker 내부 네트워크에서만 노출되므로 보안상 안전
- **아키텍처 HTML 문서 추가**: `architecture.html` — 시스템 전체 파이프라인을 시각적으로 표현
  - 서버/프론트엔드 파이프라인을 클릭 가능한 박스 다이어그램으로 구성
  - 각 단계 클릭 시 아코디언으로 상세 설명 펼침 (단계 설명, 사용 기술, 관련 파일, 코드 흐름)
  - 다크 테마, 외부 의존성 없이 순수 CSS/JS로 구현
- **DB 복원 작업**: 로컬 백업(`backups/planner_2026-04-07_16-55.db`)에서 Docker 볼륨으로 유저 데이터 복원
  - 복원된 유저: admin (관리자), sunshine (일반 사용자)
- **수정 파일**: server.js
- **신규 파일**: architecture.html

### v6.2 - 2026-04-07 UI/UX 개선
- **무기한 버튼 위치 이동**: 섹션 추가/편집 모달에서 "무기한" 체크박스를 종료일 라벨 옆으로 이동, 시작일/종료일 입력 1:1 비율
- **인라인 항목 추가 커서 유지**: 등록된 루틴에서 항목 추가 후 입력 필드에 포커스가 유지되도록 복원 로직 개선
- **로그인 아이디 표시**: nav 바 우측에 현재 로그인 유저 아이디 표시 (`👤 username`)
- **항목 추가 날짜 항상 표시**: `addedDate`가 없는 기존 항목도 섹션 `startDate`를 fallback으로 사용하여 날짜 표시
- **수정 파일**: index.html, css/styles.css, js/calendar.js, js/data.js

### v6.3 - 2026-04-08 일일 기록 탭 기능 강화
- **메모 표시**: 일일 기록 탭에서 해당 날짜 메모를 읽기 전용으로 확인 가능 (v6.4에서 체크리스트 탭으로 이동)
- **습관 변화 추적**: 섹션별 항목 추가 이력(`addedDate`) 기반 성장 시각화
  - CSS 바 차트로 시작 항목 수 vs 현재 항목 수 비교
  - 격려 메시지 (1개 ✨ / 3개 💪 / 5개+ 🎉)
  - 섹션별 달성률 프로그레스 바
- **커서 복원 개선**: 인라인 항목 추가 시 scope 모달 포커스 해제 + `requestAnimationFrame` 기반 복원으로 안정성 향상
- **`parseDateKey()` 유틸 추가**: 날짜 키 문자열을 Date 객체로 변환하는 공용 함수 (data.js)
- **수정 파일**: js/tracker.js, js/data.js, js/calendar.js, css/styles.css

### v6.4 - 2026-04-08 습관 변화 차트 시각화 개선
- **SVG 복합 차트**: 습관 변화 섹션을 세로 막대그래프(달성률) + 꺾은선 그래프(요소 개수) 복합 차트로 교체
  - 좌측 Y축: 달성률 (0~100%), 우측 Y축: 항목 수
  - X축: 날짜 (M/D 형식), 비활성일은 회색 표시
  - viewBox 기반 반응형 SVG, CSS 변수로 다크/라이트 테마 호환
- **기간 선택 UI**: 7일 / 14일 / 30일 기간 버튼으로 차트 범위 조절 가능
- **룰 기반 피드백**: 차트 아래에 달성률 피드백 + 개수 변화 피드백 텍스트 표시
  - 달성률: 평균/최소값/추세 기반 6가지 메시지
  - 개수 변화: 증가/유지/감소에 따른 4가지 메시지
- **`getSectionStatsForDateRange()` 추가** (data.js): 섹션별 날짜 범위 통계 계산 함수
- **메모 위치 이동**: 일일 기록 탭(읽기 전용) → 체크리스트 탭 달성률 하단(편집 가능, 500ms 디바운스 자동 저장)
- **수정 파일**: js/tracker.js, js/data.js, js/checklist.js, css/styles.css, index.html
- **업데이트 문서**: CLAUDE.md, DEV_LOG.md, module-guide.md, PROJECT_REPORT.md

### v6.5 - 2026-04-08 서비스 개선 (할 일, 항목별 날짜, 캘린더 루틴)
- **매일 할 일 (To-Do) 기능**: 날짜별 일회성 할 일 추가/체크/삭제
  - 체크리스트 탭: 메모 아래에 할 일 입력/리스트 UI (accent2 색상)
  - 캘린더 탭: 날짜 상세 패널에 동일 UI
  - 데이터: `data.todos[dateKey] = [{id, text, done}]`
  - 진행률 통계에 미포함 (별도 기능)
- **항목별 시작/종료일**: Item 구조에 `startDate`, `endDate` 필드 추가
  - `isItemOnDate()`, `getItemsForDate()` 필터링 함수 추가
  - 항목 삭제 시 섹션 분할 없이 항목 endDate만 설정 (`endItem()`)
  - 항목 추가/수정 시 scope modal 제거 (직접 반영)
  - 기존 섹션 분할 함수 제거: `removeItemFuture()`, `updateItemFuture()`, `addItemToSectionFuture()`
- **캘린더 탭 섹션 형태 루틴 표시**: 날짜 선택 시 `.section` + `.item` 스타일로 루틴 체크리스트 표시
  - `cal-sections-container` HTML 요소 추가
  - `renderSectionsForDate()` 리팩토링 (체크리스트 탭과 동일 스타일)
- **삭제 모달 개선**: "모든 날짜" → "완전히 삭제" (위험 스타일), "오늘부터" → "습관 종료"
- **섹션 날짜 로직 수정**: `removeSectionFuture()` endDate를 어제→오늘로, `updateSectionFuture()` 새 섹션 startDate를 오늘→내일로
- **`tomorrowKey()` 헬퍼 추가** (data.js)
- **수정 파일**: index.html, js/data.js, js/checklist.js, js/calendar.js, js/tracker.js, css/styles.css
- **업데이트 문서**: CLAUDE.md, DEV_LOG.md, data-schema.md, module-guide.md
- **계획서**: docs/plans/service-improvement-v6.5.md

### v6.6 - 2026-04-08 섹션/항목 독립성 강화 & 차트 분리
- **섹션 수정 시 scope 모달 제거**: 섹션 편집(이름/색상/기간/반복)이 `askScope` 모달 없이 바로 적용
  - 섹션은 항목 그룹화 컨테이너일 뿐, 수정 시 항목에 영향 없음
  - `saveEditSection()`에서 `askScope()` 호출 및 scope 분기 제거, `updateSection()` 직접 호출
- **항목 시작/종료일 직접 수정 가능**: 항목 추가/수정 모달에 시작일·종료일·무기한 필드 추가
  - `addItemToSection()`, `updateItem()`에 `startDate`/`endDate` 파라미터 추가
  - 관리 패널 항목 날짜 표시: `startDate` 기준 + `endDate` 범위 표시
- **미사용 Future 함수 정리**: 항목/섹션 수정 시 섹션을 분리하던 불필요한 함수 5개 삭제
  - `preserveAddedDates()`, `updateSectionFuture()`, `removeItemFuture()`, `updateItemFuture()`, `addItemToSectionFuture()`
- **`getCompletionStats()` 버그 수정**: `sec.items` 직접 순회 → `getItemsForDate()` 사용 (항목별 날짜 반영)
- **`getSectionStatsForDateRange()` 버그 수정**: `addedDate`만 참조 → `getItemsForDate()` 사용 (항목 시작일 반영)
- **습관 변화 차트 분리**: 복합 차트 → 두 개의 독립 차트로 분리
  - 기본: 항목 수 변화 꺾은선 그래프 (`buildItemCountChart`)
  - ▶ 버튼 전환: 달성률 변화 막대 그래프 (`buildAchievementChart`)
  - 섹션별 독립 차트 모드 전환 (`toggleChartMode`)
- **일일 기록 탭 할 일 표시**: 습관 변화 섹션 위에 해당 날짜 할 일 테이블 추가
  - 완료/미완료 토글, 진행률(완료 수/전체, 퍼센트) 표시
  - `trackerToggleTodo()` 함수 추가
- **수정 파일**: index.html, js/calendar.js, js/data.js, js/tracker.js, css/styles.css

---

## 기능 목록

| 기능 | 상태 | 비고 |
|------|------|------|
| 체크리스트 | ✅ 완료 | 섹션별 항목, 진행률 |
| 미니 캘린더 | ✅ 완료 | 체크리스트 탭 날짜 선택 |
| 월간 캘린더 | ✅ 완료 | 색상 도트, 식단 별표 |
| 섹션 관리 (CRUD) | ✅ 완료 | 색상, 반복 주기, 기간 |
| 식단 계획 | ✅ 완료 | 4가지 끼니, 드래그 정렬 |
| 식단 시간 기록 | ✅ 완료 | v4.0 추가 |
| 몸무게 기록 | ✅ 완료 | v4.0 추가 |
| 목표 몸무게 & 차이 표시 | ✅ 완료 | v4.0 추가, 설정에서 목표 설정 |
| 메모 | ✅ 완료 | 날짜별 메모 |
| 일일 기록 비교 | ✅ 완료 | 계획 vs 실행 테이블 |
| 다크/라이트 테마 | ✅ 완료 | v4.0 추가 |
| 데이터 ���보내기/가져오기 | ✅ 완료 | JSON ���업 |
| 드래그 앤 드롭 | ✅ 완료 | 섹션, 항��, 식단 |
| 멀티유저 서버 | ✅ 완료 | v5.0 - Express + SQLite |
| 로그인 인증 | ✅ 완료 | v5.0 - 세션 기반 |
| 외부 접속 | ✅ 완료 | v5.0 - Cloudflare Tunnel |
| 보안 (rate limit, helmet 등) | ✅ 완료 | v5.0 |
| Docker 컨테이너 격리 | ✅ 완료 | v6.0 |
| .env 환경변수 관리 | ✅ 완료 | v6.0 |
| DB 자동 백업 (6시간/7개) | ✅ 완료 | v6.0 |
| 전체 Rate Limiter | ✅ 완료 | v6.0 |
| Docker 환경별 바인딩 자동 감지 | ✅ 완료 | v6.1 |
| 아키텍처 HTML 문서 | ✅ 완료 | v6.1 - 인터랙티브 파이프라인 다이어그램 |
| 무기한 버튼 위치 개선 | ✅ 완료 | v6.2 - 종료일 라벨 옆 배치, 1:1 비율 |
| 인라인 항목 추가 커서 유지 | ✅ 완료 | v6.2 - 포커스 복원 로직 개선 |
| 로그인 아이디 상단 표시 | ✅ 완료 | v6.2 - nav 우측 |
| 항목 추가 날짜 항상 표시 | ✅ 완료 | v6.2 - addedDate fallback to startDate |
| 체크리스트 메모 입력 | ✅ 완료 | v6.4 - 달성률 하단, 편집 가능 (일일 기록에서 이동) |
| 습관 변화 추적 | ✅ 완료 | v6.3 - addedDate 기반 성장 시각화 |
| 인라인 추가 커서 개선 | ✅ 완료 | v6.3 - scope 모달 blur + rAF |
| 매일 할 일 (To-Do) | ✅ 완료 | v6.5 - 날짜별 일회성 할 일 CRUD |
| 항목별 시작/종료일 | ✅ 완료 | v6.5 - item.startDate/endDate, isItemOnDate() |
| 캘린더 루틴 표시 | ✅ 완료 | v6.5 - 섹션 형태로 날짜별 루틴 체크리스트 |
| 삭제 모달 개선 | ✅ 완료 | v6.5 - "완전히 삭제"/"습관 종료" |
| 섹션 수정 scope 모달 제거 | ✅ 완료 | v6.6 - 섹션 편집 시 바로 적용 |
| 항목 시작/종료일 직접 수정 | ✅ 완료 | v6.6 - 모달에 날짜 필드 추가 |
| 습관 변화 차트 분리 | ✅ 완료 | v6.6 - 항목 수(꺾은선) / 달성률(막대) 전환 |
| 일일 기록 할 일 표시 | ✅ 완료 | v6.6 - 트래커 탭에서 할 일 확인/토글 |

---

## 향후 계획 (memo.txt 참고)

- [ ] AI 피드백 (LLM 연동)
- [ ] 지출 관리
- [ ] 월간 달성 트렌드 차트
- [ ] 습관 질적 개선 추적
- [ ] 기본값 리�� 버튼
- [ ] 내일 일정 미리 추가

---

## 알려진 이슈
- 라이트 테마에서 일부 인라인 스타일의 rgba 값이 미세하게 어울리지 않을 수 있음
- 모바일 터치 드래그가 간헐적으로 불안정할 수 있음
- 같은 유저가 멀티탭 사용 시 마지막 저장이 덮어씀 (3명 규모에서 무시 가능)
- `mealChecks` 필드는 레거시 — 실제로는 `dailyRecords.meals` 사용
