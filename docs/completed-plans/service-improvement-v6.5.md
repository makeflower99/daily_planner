# v6.5 서비스 개선 계획 (2026-04-08)

## 배경
습관 관리 서비스의 핵심 가치인 "기록 보존"을 강화하고, 사용성을 개선하기 위한 4가지 변경.

## 변경 사항

### 1. 캘린더 탭 날짜별 루틴 표시
- 캘린더에서 날짜 선택 시 체크리스트 탭과 동일한 `.section` + `.item` 형태로 루틴 표시
- 기존 `renderSectionsForDate()` 함수를 섹션 스타일로 리팩토링
- `cal-sections-container` HTML 요소 추가

### 2. 항목별 시작/종료일 관리
- Item 구조에 `startDate`, `endDate` 필드 추가
- `isItemOnDate()`, `getItemsForDate()` 필터링 함수 추가
- 항목 삭제 시 섹션 분할 대신 항목 `endDate` 설정 (`endItem()`)
- 삭제 모달 문구: "모든 날짜" → "완전히 삭제", "오늘부터" → "습관 종료"
- 항목 추가/수정 시 scope modal 제거 (항목별 날짜로 자동 관리)
- 섹션 삭제: `endDate`를 어제→오늘로 변경 (오늘까지 표시)

### 3. 매일 할 일 (To-Do) 기능
- `data.todos[dateKey]` = `[{id, text, done}]` 구조
- 체크리스트 탭: 메모 아래에 할 일 입력/체크/삭제 UI
- 캘린더 탭: 메모 아래에 동일 UI
- `--accent2` (시안) 색상으로 루틴 섹션과 시각 구분
- 진행률 통계에 미포함 (별도 기능)

### 4. 기록 보존 철학 반영
- "습관 종료"는 기록 보존 + 내일부터 비활성
- "완전히 삭제"는 위험 스타일 적용
- 할 일 완료 기록 영구 보존

## 수정 파일
- `index.html`, `js/data.js`, `js/checklist.js`, `js/calendar.js`, `js/tracker.js`, `css/styles.css`

## 제거/대체된 함수
| 기존 | 대체 |
|------|------|
| `removeItemFuture()` | `endItem()` |
| `updateItemFuture()` | `updateItem()` (직접 수정) |
| `addItemToSectionFuture()` | `addItemToSection()` (startDate 자동 설정) |

## 추가된 함수
- `tomorrowKey()` — 내일 날짜 키
- `isItemOnDate(item, section, dateKey)` — 항목별 날짜 필터링
- `getItemsForDate(section, dateKey)` — 활성 항목 배열 반환
- `endItem(sectionId, itemId)` — 항목 종료 (endDate = 오늘)
- `addTodo()`, `toggleTodo()`, `removeTodo()`, `getTodos()` — 할 일 CRUD
- `renderTodos()`, `renderCalTodos()` — 할 일 렌더링
