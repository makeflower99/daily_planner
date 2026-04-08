# calendar.js 분리 계획

**상태:** 예정
**날짜:** 2026-04-08 (작성), 폴더 정리 완료 후 진행

## 현재 상태
- `js/calendar.js`: 1,051줄
- 3가지 기능이 하나의 파일에 혼합:
  1. 캘린더 렌더링/네비게이션/날짜 선택
  2. 식단 계획 CRUD, 식단 타입 관리, 끼니 시간
  3. 섹션/항목 CRUD, 모달 관리, 반복 설정

## 분리 계획

### calendar.js (캘린더 코어)
- 월간 캘린더 렌더링 (`renderCalendar`)
- 날짜 선택/네비게이션
- 캘린더 셀 클릭 이벤트
- 사이드 패널 날짜별 정보 표시 조율

### meal.js (식단 관리)
- 식단 계획 CRUD (아침/점심/저녁/간식)
- 끼니 시간 관리 (`mealTimes`)
- 식단 렌더링 (`renderMealSection`)
- 식단 타입: `breakfast`, `lunch`, `dinner`, `snack`

### section.js (섹션/항목 관리)
- 섹션 추가/편집/삭제 모달
- 항목 추가/편집/삭제
- 반복 설정 (`daily`, `weekdays`, `weekends`, `weekly`, `biweekly`, `everyOtherDay`, `monthly`)
- 적용 범위 선택 모달 (`askScope`)
- 색상 선택

## 주의사항
- **전역 스코프 의존성**: 모든 JS 파일이 전역 함수로 정의되어 상호 참조
- **로드 순서**: `data.js` → `checklist.js` → `calendar.js` → `tracker.js`
  - 분리 시: `data.js` → `checklist.js` → `section.js` → `meal.js` → `calendar.js` → `tracker.js`
- **index.html**: `<script>` 태그 추가 필요 (meal.js, section.js)
- **모달 상태 변수**: `editingItem`, `modalMode`, `modalSecId` 등이 calendar.js 최상단에 정의
  - section.js로 이동 시 calendar.js에서도 접근 가능해야 함 (전역 변수)

## 예상 작업량
- 중간 (각 파일 경계 파악 + 테스트 필요)
- 함수 간 의존관계를 먼저 매핑한 후 분리 진행
