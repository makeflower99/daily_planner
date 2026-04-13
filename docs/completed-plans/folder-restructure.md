# 폴더 구조 정리 계획

**상태:** 진행 중
**날짜:** 2026-04-08

## 문제점
- 루트 디렉토리에 백엔드/프론트엔드/문서/유틸리티 파일이 혼재
- `planner-dataplanner.db` (0바이트 빈 파일) 등 불필요 파일 존재
- `.DS_Store` macOS 잔여 파일이 Windows 환경에 존재
- 문서 파일(`architecture.html`, `DEV_LOG.md`, `PROJECT_REPORT.md`)이 루트에 산재
- CLI 도구(`create-user.js`)와 유틸리티 스크립트(`tunnel.bat`)가 루트에 위치

## 변경 사항
1. 불필요 파일 삭제: `planner-dataplanner.db`, `.DS_Store`
2. `docs/` 폴더 생성 → 문서 파일 이동
3. `docs/plans/` 폴더 생성 → 계획 문서 작성
4. `scripts/` 폴더 생성 → 유틸리티 스크립트 이동
5. `memo.txt` → `docs/memo.txt`로 이동
6. `.gitignore` 보강

## 변경 후 구조
```
daily_planner/
├── index.html, login.html     # 프론트엔드 진입점
├── server.js, db.js, backup.js # 백엔드 코어
├── package.json, Dockerfile, docker-compose.yml
├── CLAUDE.md, README.md       # 루트 문서 (관례)
├── css/styles.css
├── js/ (data, checklist, calendar, tracker)
├── docs/
│   ├── architecture.html, DEV_LOG.md, PROJECT_REPORT.md
│   ├── memo.txt
│   └── plans/
│       ├── folder-restructure.md  (이 문서)
│       └── calendar-js-split.md   (향후 예정)
├── scripts/
│   ├── create-user.js
│   └── tunnel.bat
└── backups/
```

## 경로 업데이트 필요 파일
- `Dockerfile`: `create-user.js` 경로
- `docker-compose.yml`: 해당 시 경로 확인
- `README.md`: `create-user.js`, `tunnel.bat` 경로
- `CLAUDE.md`: 파일 구조 섹션 업데이트
