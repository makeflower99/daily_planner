# 모듈 가이드 (Module Guide)

Daily Planner의 모든 JavaScript 모듈 및 백엔드 모듈의 함수 카탈로그와 의존성 맵.

---

## 1. 모듈 개요 테이블

| 파일 | 라인 수 | 역할 | 로드 순서 |
|------|---------|------|-----------|
| `js/data.js` | 622 | 데이터 관리: 서버 API 연동, 로컬 캐시, 섹션/항목/식단/몸무게 CRUD, JSON 내보내기/가져오기 | 1 (최초) |
| `js/checklist.js` | 218 | 체크리스트 탭: 미니 캘린더, 일일 루틴 체크, 진행률 표시 | 2 |
| `js/calendar.js` | 1051 | 캘린더 탭: 월간 뷰, 날짜 상세, 섹션/항목 관리 모달, 식단 계획, 드래그 앤 드롭 (3종) | 3 |
| `js/tracker.js` | 225 | 일일 기록 탭: 계획 vs 실행 비교, 달성률 통계, 습관 변화 추적 | 4 |
| `server.js` | 200 | Express 서버: 인증, API 라우트, 미들웨어, 정적 파일 서빙 | (백엔드) |
| `db.js` | 73 | SQLite DB 모듈: 테이블 생성, 유저/데이터 CRUD | (백엔드) |
| `backup.js` | 60 | DB 자동 백업: 6시간 간격, 최근 7개 보존 | (백엔드) |
| `scripts/create-user.js` | 32 | CLI 유저 생성 도구: bcrypt 해시, 입력 검증 | (스크립트) |

> 모든 프론트엔드 파일은 **전역 스코프**에서 함수를 정의하며, 로드 순서가 중요함.

---

## 2. 의존성 그래프 (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│                        index.html                               │
│  <script> 로드 순서: data → checklist → calendar → tracker      │
└─────────┬──────────────┬───────────────┬──────────────┬──────────┘
          │              │               │              │
          ▼              ▼               ▼              ▼
    ┌──────────┐  ┌─────────────┐  ┌───────────┐  ┌──────────┐
    │ data.js  │  │checklist.js │  │calendar.js│  │tracker.js│
    │ (기반)   │  │ (체크리스트)│  │ (캘린더)  │  │(일일기록)│
    └──────────┘  └──────┬──────┘  └─────┬─────┘  └────┬─────┘
          ▲              │               │              │
          │  호출         │  호출          │  호출         │  호출
          ├──────────────┘               │              │
          ├──────────────────────────────┘              │
          ├────────────────────────────────────────────┘
          │
    data.js 함수 호출 관계:
    ─────────────────────
    checklist.js → todayKey, getSectionsForDate, getItemsForDate,
                   isCompleted, toggleComplete, saveDailySnapshot,
                   getMealPlan, isMealChecked, toggleMealCheck,
                   getRepeatLabel, addTodo, toggleTodo, removeTodo,
                   getTodos, escapeHtml, MEAL_TYPES

    calendar.js  → todayKey, tomorrowKey, getSectionsForDate,
                   getItemsForDate, isCompleted,
                   toggleComplete, saveDailySnapshot, getMealPlan,
                   addMealItem, removeMealItem, reorderMealItem,
                   isMealChecked, toggleMealCheck, hasMealPlan,
                   getMealTime, saveMealTime, getWeight, saveWeight,
                   getTargetWeight, addSection, updateSection,
                   removeSection, removeSectionFuture,
                   addItemToSection, removeItemFromSection,
                   endItem, updateItem, getRepeatLabel,
                   formatDateRange, getSectionStatus, escapeHtml,
                   addTodo, toggleTodo, removeTodo, getTodos,
                   SECTION_COLORS, MEAL_TYPES, REPEAT_TYPES, data, saveData

    tracker.js   → todayKey, parseDateKey, getSectionsForDate,
                   getItemsForDate, isCompleted, toggleComplete,
                   saveDailySnapshot, getDailyRecord,
                   getMealPlan, getMealActual, toggleMealActual,
                   getTodos, toggleTodo, renderTodos,
                   escapeHtml, MEAL_TYPES, data

    모듈 간 상호 호출:
    ─────────────────
    checklist.js ──→ calendar.js  : renderCalendar, renderSectionsForDate
    calendar.js  ──→ checklist.js : renderChecklist
    tracker.js   ──→ checklist.js : renderChecklist

┌──────────────────────────────────────────────────────┐
│                    백엔드 의존성                      │
│                                                      │
│  server.js ──→ db.js     (DB 접근)                   │
│            ──→ backup.js (백업 스케줄 시작)           │
│                                                      │
│  backup.js ──→ db.js     (DB 백업)                   │
│                                                      │
│  scripts/create-user.js ──→ db.js (유저 생성)        │
└──────────────────────────────────────────────────────┘
```

---

## 3. data.js 함수 레퍼런스

### 3-1. 상수 및 전역 변수

| 이름 | 설명 |
|------|------|
| `STORAGE_KEY` | localStorage 기본 키 (`'planner_v4'`) |
| `SECTION_COLORS` | 섹션 색상 팔레트 배열 (9색) |
| `SECTIONS_DEFAULT` | 초기 기본 섹션 데이터 (아침 루틴, 식단, 공부) |
| `MEAL_TYPES` | 식단 타입 정의 배열 (아침/점심/저녁/간식) |
| `REPEAT_TYPES` | 반복 타입 정의 배열 (매일/주중/주말/매주/격주/격일/매월) |
| `data` | 현재 유저의 전체 데이터 객체 (메모리) |
| `_currentUsername` | 현재 로그인한 유저명 (localStorage 키 분리용) |
| `_saveTimeout` | 디바운스 타이머 ID |

### 3-2. 날짜 / 유틸리티

| 함수 | 설명 |
|------|------|
| `todayKey()` | 오늘 날짜를 `YYYY-M-D` 형식 문자열로 반환 |
| `tomorrowKey()` | 내일 날짜를 `YYYY-M-D` 형식 문자열로 반환 |
| `parseDateKey(dateKey)` | 날짜 키 문자열(`YYYY-M-D`)을 `Date` 객체로 변환 |
| `getStorageKey()` | 유저별 localStorage 키 반환 (`planner_v4_{username}`) |
| `escapeHtml(str)` | HTML 특수문자를 이스케이프하여 XSS 방지 |

### 3-3. 데이터 I/O

| 함수 | 설명 |
|------|------|
| `loadData()` | 서버에서 데이터 로드 (실패 시 localStorage 폴백), 필드 가드 적용 |
| `saveData()` | localStorage 캐시 + 300ms 디바운스 서버 PUT 저장 |
| `showStorageWarning()` | 저장 실패 시 경고 UI 표시 |
| `exportToJSON()` | 현재 데이터를 JSON 파일로 다운로드 |
| `importFromJSON(file)` | JSON 파일에서 데이터 가져오기 (Promise 반환) |

### 3-4. 섹션 상태 / 반복 스케줄 판별

| 함수 | 설명 |
|------|------|
| `getSectionStatus(section)` | 섹션의 상태 판별 (`'active'`, `'upcoming'`, `'ended'`) |
| `isSectionOnDate(section, dateKey)` | 특정 날짜에 섹션이 활성인지 반복 규칙으로 판별 |
| `getSectionsForDate(dateKey)` | 특정 날짜에 해당하는 모든 섹션 배열 반환 |
| `isItemOnDate(item, section, dateKey)` | 특정 날짜에 항목이 활성인지 판별 (항목별 startDate/endDate 기반) |
| `getItemsForDate(section, dateKey)` | 섹션 내 특정 날짜에 활성인 항목만 배열 반환 |
| `getRepeatLabel(section)` | 섹션의 반복 타입을 한국어 라벨로 변환 |
| `formatDateRange(section)` | 섹션의 시작~종료 날짜를 `M/D - M/D` 형식으로 포맷 |

### 3-5. 섹션 CRUD

| 함수 | 설명 |
|------|------|
| `addSection(title, color, repeat, repeatDay, startDate, endDate)` | 새 섹션 생성 후 저장 |
| `updateSection(sectionId, updates)` | 섹션 속성 업데이트 (전체 기간) |
| `removeSection(sectionId)` | 섹션 완전 삭제 |
| `removeSectionFuture(sectionId)` | "습관 종료": endDate를 오늘로 설정 (내일부터 종료) |

### 3-6. 항목 CRUD

| 함수 | 설명 |
|------|------|
| `addItemToSection(sectionId, emoji, label, startDate, endDate)` | 섹션에 새 항목 추가 (startDate 기본=오늘, endDate 선택) |
| `removeItemFromSection(sectionId, itemId)` | 섹션에서 항목 완전 삭제 |
| `endItem(sectionId, itemId)` | "습관 종료": 항목의 endDate를 오늘로 설정 (내일부터 미표시) |
| `updateItem(sectionId, itemId, emoji, label, startDate, endDate)` | 항목의 이모지/라벨/시작일/종료일 수정 |

### 3-7. 할 일 (To-Do)

| 함수 | 설명 |
|------|------|
| `addTodo(dateKey, text)` | 날짜에 할 일 추가 (`{id, text, done:false}`) |
| `toggleTodo(dateKey, todoId)` | 할 일 완료 상태 토글 |
| `removeTodo(dateKey, todoId)` | 할 일 삭제 |
| `getTodos(dateKey)` | 날짜의 할 일 배열 반환 |

### 3-7b. 완료 상태 추적

| 함수 | 설명 |
|------|------|
| `isCompleted(dateKey, itemId)` | 특정 날짜의 항목 완료 여부 반환 |
| `toggleComplete(dateKey, itemId)` | 특정 날짜의 항목 완료 상태 토글 |
| `getCompletionStats(dateKey)` | 특정 날짜의 완료 통계 반환 (`{total, done, pct}`). `getItemsForDate()` 사용하여 항목별 날짜 반영 |
| `getSectionStatsForDateRange(title, color, endDateKey, days)` | 섹션별 날짜 범위 통계 (차트용). `getItemsForDate()` 사용하여 항목별 날짜 반영. `[{dateKey, dateLabel, itemCount, doneCount, pct, active}]` 반환 |

### 3-8. 식단 계획

| 함수 | 설명 |
|------|------|
| `getMealPlan(dateKey)` | 특정 날짜의 식단 계획 반환 (끼니별 배열) |
| `addMealItem(dateKey, mealType, item)` | 특정 끼니에 음식 항목 추가 |
| `reorderMealItem(dateKey, mealType, fromIdx, toIdx)` | 식단 항목 순서 변경 (드래그 앤 드롭용) |
| `removeMealItem(dateKey, mealType, index)` | 식단 항목 삭제 |
| `isMealChecked(dateKey, mealType, index)` | 식단 항목 체크 여부 확인 (계획 vs 실행 비교) |
| `toggleMealCheck(dateKey, mealType, index)` | 식단 항목 체크 토글 |
| `hasMealPlan(dateKey)` | 특정 날짜에 식단 계획이 있는지 여부 |

### 3-9. 식단 실행 기록

| 함수 | 설명 |
|------|------|
| `getMealActual(dateKey)` | 특정 날짜의 실제 식사 기록 반환 |
| `toggleMealActual(dateKey, mealType, foodItem)` | 식단 실행 기록 토글 (음식명 기반) |

### 3-10. 식단 시간 / 몸무게 관리

| 함수 | 설명 |
|------|------|
| `getMealTime(dateKey, mealType)` | 특정 날짜의 끼니 시간 반환 |
| `saveMealTime(dateKey, mealType, time)` | 끼니 시간 저장 |
| `getWeight(dateKey)` | 특정 날짜의 몸무게 반환 |
| `saveWeight(dateKey, value)` | 몸무게 저장 (빈 값이면 삭제) |
| `getTargetWeight()` | 목표 몸무게 반환 |
| `saveTargetWeightData(value)` | 목표 몸무게 저장 |

### 3-11. 일일 기록 (스냅샷)

| 함수 | 설명 |
|------|------|
| `saveDailySnapshot(dateKey)` | 해당 날짜의 체크리스트+식단 상태를 스냅샷으로 저장 |
| `getDailyRecord(dateKey)` | 저장된 일일 기록 스냅샷 반환 |

---

## 4. checklist.js 함수 레퍼런스

### 전역 변수

| 이름 | 설명 |
|------|------|
| `checklistDate` | 현재 체크리스트에서 선택된 날짜 키 |
| `miniCalYear`, `miniCalMonth` | 미니 캘린더 현재 표시 연도/월 |

### 함수 목록

| 함수 | 설명 |
|------|------|
| `initChecklist()` | 체크리스트 초기화 (오늘 날짜 설정, 렌더링) |
| `toggleMiniCal()` | 미니 캘린더 열기/닫기 토글 |
| `changeMiniCalMonth(dir)` | 미니 캘린더 월 변경 (+1/-1) |
| `renderMiniCal()` | 미니 캘린더 그리드 렌더링 (요일 헤더, 날짜 셀, 오늘/선택 표시) |
| `pickMiniCalDate(day)` | 미니 캘린더에서 날짜 선택 시 체크리스트 갱신 |
| `changeChecklistDate(dir)` | 체크리스트 날짜 하루 이동 (+1/-1) |
| `updateChecklistDateLabel()` | 상단 날짜 라벨 텍스트 갱신 ("YYYY년 M월 D일 (요일)") |
| `renderChecklist()` | 체크리스트 전체 렌더링 (섹션별 항목, 식단 계획, 통계 바, 메모) |
| `renderChecklistMemo(dateKey)` | 체크리스트 탭 메모 영역 렌더링 (입력값 반영, 자동 저장 이벤트 바인딩) |
| `syncCalendar()` | 캘린더 탭이 활성이면 캘린더 렌더링 동기화 |
| `toggleMealItem(mealType, index)` | 체크리스트 탭에서 식단 항목 체크 토글 |
| `toggleItem(itemId)` | 체크리스트 항목 체크 토글 후 스냅샷 저장 및 재렌더링 |
| `renderTodos(dateKey)` | 할 일 목록 렌더링 (체크박스+텍스트+삭제 버튼, accent2 색상) |
| `addChecklistTodo()` | 체크리스트 탭에서 할 일 추가 |
| `toggleChecklistTodo(todoId)` | 체크리스트 탭에서 할 일 완료 토글 |
| `removeChecklistTodo(todoId)` | 체크리스트 탭에서 할 일 삭제 |
| `showTodoSaved()` | "저장됨 ✓" 인디케이터 표시 |

---

## 5. calendar.js 함수 레퍼런스

### 전역 변수

| 이름 | 설명 |
|------|------|
| `calYear`, `calMonth` | 캘린더 현재 표시 연도/월 |
| `selectedDate` | 캘린더에서 선택된 날짜 키 |
| `editingItem` | 항목 수정 모달에서 편집 중인 항목 객체 |
| `modalMode` | 항목 모달 모드 (`'add'` 또는 `'edit'`) |
| `modalSecId` | 항목 모달에서 대상 섹션 ID |
| `sectionRepeatType` | 섹션 추가 모달의 반복 타입 |
| `sectionColor` | 섹션 추가/수정 모달의 선택 색상 |
| `editingSectionId` | 섹션 수정 모달에서 편집 중인 섹션 ID |
| `editRepeatType` | 섹션 수정 모달의 반복 타입 |
| `expandedSections` | 아코디언 펼침 상태 맵 (섹션 ID -> boolean) |
| `showEndedSections` | 종료된 섹션 표시 여부 |
| `dragState` | 섹션 드래그 상태 객체 |
| `itemDragState` | 항목 드래그 상태 객체 |
| `mealDragState` | 식단 드래그 상태 객체 |
| `scopeResolveCallback` | 적용 범위 모달의 Promise resolve 콜백 |

### 5-1. 렌더링

| 함수 | 설명 |
|------|------|
| `initCalendar()` | 캘린더 초기화 (현재 연/월 설정) |
| `changeMonth(dir)` | 캘린더 월 변경 (+1/-1) |
| `renderCalendar()` | 월간 캘린더 그리드 렌더링 (요일, 날짜, 섹션 점, 식단 별표) |
| `selectDay(day, key)` | 캘린더 날짜 클릭 시 선택 처리 |
| `formatAddedDate(dateKey)` | 항목 추가 날짜를 `M/D 추가` 형식으로 포맷 |

### 5-2. 날짜 상세 패널

| 함수 | 설명 |
|------|------|
| `showDateDetail(key)` | 선택된 날짜의 상세 패널 표시 (루틴, 식단, 몸무게, 메모, 할 일) |
| `saveMemo()` | 선택된 날짜의 메모 저장 |
| `renderCalTodos(dateKey)` | 캘린더 탭 할 일 목록 렌더링 |
| `addCalTodo()` | 캘린더 탭에서 할 일 추가 |
| `calToggleTodo(todoId)` | 캘린더 탭에서 할 일 완료 토글 |
| `calRemoveTodo(todoId)` | 캘린더 탭에서 할 일 삭제 |
| `saveWeightValue()` | 선택된 날짜의 몸무게 저장 |
| `updateWeightDiff(currentVal)` | 현재 몸무게와 목표 몸무게의 차이 표시 |

### 5-3. 식단 계획 UI

| 함수 | 설명 |
|------|------|
| `renderMealPlan(dateKey)` | 식단 계획 UI 전체 렌더링 (끼니별 목록, 시간, 입력란) |
| `addMeal(dateKey, mealType)` | 새 식단 항목 추가 (입력 필드에서) |
| `toggleMealAndRender(dateKey, mealType, index)` | 식단 항목 체크 토글 후 재렌더링 |
| `saveMealTimeAndRender(dateKey, mealType, time)` | 끼니 시간 저장 |
| `removeMeal(dateKey, mealType, index)` | 식단 항목 삭제 후 재렌더링 |

### 5-4. 날짜별 섹션 체크리스트

| 함수 | 설명 |
|------|------|
| `renderSectionsForDate(dateKey)` | 선택된 날짜의 섹션별 체크리스트 렌더링 (체크+편집 버튼) |
| `toggleCalItem(dateKey, itemId)` | 캘린더 탭에서 항목 체크 토글 |
| `deleteItem(secId, itemId)` | 항목 삭제 (적용 범위 모달: 완전히 삭제/습관 종료) |

### 5-5. 전체 섹션 목록 (아코디언 관리 패널)

| 함수 | 설명 |
|------|------|
| `renderAllSections()` | 전체 섹션 아코디언 목록 렌더링 (진행중/예정/종료 그룹) |
| `renderSectionItem(sec, idx, extraClass)` | 개별 섹션 아코디언 헤더 HTML 생성 |
| `toggleEndedSections()` | 종료된 섹션 그룹 표시/숨기기 토글 |
| `toggleAccordion(secId)` | 아코디언 섹션 펼치기/접기 토글 |
| `renderAccordionBody(sec)` | 아코디언 본문 HTML 생성 (항목 목록, 인라인 추가) |
| `addItemInline(secId)` | 아코디언 내 인라인 항목 추가 (직접 추가, startDate=오늘) |
| `deleteItemFromPanel(secId, itemId)` | 관리 패널에서 항목 삭제 (완전히 삭제/습관 종료) |
| `confirmDeleteSection(secId, title)` | 섹션 삭제 확인 (완전히 삭제/습관 종료) |

### 5-6. 적용 범위 선택 모달

| 함수 | 설명 |
|------|------|
| `askScope(title, desc)` | 적용 범위 선택 모달 표시 (Promise 반환: `'all'` 또는 `'future'`) |
| `scopeResolve(choice)` | 적용 범위 모달 닫기 및 Promise resolve |

### 5-7. 항목 추가/수정 모달

| 함수 | 설명 |
|------|------|
| `openAddModal(secId)` | 항목 추가 모달 열기 |
| `openEditModal(secId, itemId)` | 항목 수정 모달 열기 (기존 값 채움) |
| `updateModalSections(selectedId)` | 모달 내 섹션 셀렉트 옵션 갱신 |
| `closeModal()` | 항목 모달 닫기 |
| `saveItem()` | 항목 모달 저장 (추가 또는 수정, 직접 반영) |

### 5-8. 섹션 수정 모달

| 함수 | 설명 |
|------|------|
| `openEditSectionModal(secId)` | 섹션 수정 모달 열기 (기존 값 채움) |
| `closeEditSectionModal()` | 섹션 수정 모달 닫기 |
| `renderEditColorPicker()` | 섹션 수정 모달의 색상 선택기 렌더링 |
| `selectEditSectionColor(color)` | 섹션 수정 모달에서 색상 선택 |
| `renderEditRepeatOptions()` | 섹션 수정 모달의 반복 타입 버튼 렌더링 |
| `selectEditRepeat(type)` | 섹션 수정 모달에서 반복 타입 선택 |
| `updateEditRepeatExtra(preselect)` | 섹션 수정 모달의 추가 반복 옵션 (요일/날짜 셀렉트) 렌더링 |
| `saveEditSection()` | 섹션 수정 저장 (적용 범위 모달 거침) |

### 5-9. 섹션 추가 모달

| 함수 | 설명 |
|------|------|
| `openSectionModal()` | 섹션 추가 모달 열기 (기본값 설정) |
| `closeSectionModal()` | 섹션 추가 모달 닫기 |
| `renderColorPicker()` | 섹션 추가 모달의 색상 선택기 렌더링 |
| `selectSectionColor(color)` | 섹션 추가 모달에서 색상 선택 |
| `renderSectionRepeatOptions()` | 섹션 추가 모달의 반복 타입 버튼 렌더링 |
| `selectSectionRepeat(type)` | 섹션 추가 모달에서 반복 타입 선택 |
| `updateSectionRepeatExtra()` | 섹션 추가 모달의 추가 반복 옵션 렌더링 |
| `saveSection()` | 새 섹션 생성 저장 |
| `toggleEndless(prefix)` | 무기한 체크박스 토글 (종료일 입력 활성화/비활성화) |

### 5-10. 날짜 변환 유틸리티

| 함수 | 설명 |
|------|------|
| `dateKeyToISO(dateKey)` | `YYYY-M-D` 형식을 `YYYY-MM-DD` ISO 형식으로 변환 |
| `isoToDateKey(iso)` | ISO 형식을 `YYYY-M-D` dateKey 형식으로 변환 |

### 5-11. 드래그 앤 드롭 - 섹션 순서

| 함수 | 설명 |
|------|------|
| `initSectionDrag(container)` | 섹션/항목/식단 드래그 핸들에 이벤트 리스너 등록 |
| `onDragPointerDown(e)` | 섹션 드래그 시작: 고스트 생성, 상태 초기화 |
| `onDragPointerMove(e)` | 섹션 드래그 중: 고스트 이동, 드롭 위치 하이라이트 |
| `onDragPointerUp(e)` | 섹션 드래그 종료: 배열 순서 변경, 재렌더링 |

### 5-12. 드래그 앤 드롭 - 항목 순서

| 함수 | 설명 |
|------|------|
| `onItemDragPointerDown(e)` | 항목 드래그 시작: 고스트 생성, 상태 초기화 |
| `onItemDragMove(e)` | 항목 드래그 중: 고스트 이동, 드롭 위치 하이라이트 |
| `onItemDragUp(e)` | 항목 드래그 종료: 배열 순서 변경, 재렌더링 |

### 5-13. 드래그 앤 드롭 - 식단 항목 순서

| 함수 | 설명 |
|------|------|
| `onMealDragPointerDown(e)` | 식단 항목 드래그 시작: 고스트 생성, 상태 초기화 |
| `onMealDragMove(e)` | 식단 항목 드래그 중: 고스트 이동, 드롭 위치 하이라이트 |
| `onMealDragUp(e)` | 식단 항목 드래그 종료: 순서 변경 (`reorderMealItem`), 재렌더링 |

---

## 6. tracker.js 함수 레퍼런스

### 전역 변수

| 이름 | 설명 |
|------|------|
| `trackerDate` | 일일 기록 탭에서 선택된 날짜 키 |

### 함수 목록

| 함수 | 설명 |
|------|------|
| `initTracker()` | 트래커 초기화 (오늘 날짜 설정) |
| `changeTrackerDate(dir)` | 트래커 날짜 하루 이동 (+1/-1) |
| `setChartDays(days)` | 습관 변화 차트 기간 변경 (7/14/30일) 후 재렌더링 |
| `renderTracker()` | 일일 기록 전체 렌더링 (통계 카드, 체크리스트 비교, 식단 비교, 습관 변화) |
| `computeSectionEvolution(dateKey)` | 섹션별 항목 추가 이력 계산 (시작 항목 수 vs 현재 항목 수, 달성률) |
| `toggleChartMode(secTitle)` | 섹션별 차트 모드 전환 ('items' ↔ 'achievement') |
| `buildItemCountChart(rangeData, color)` | 항목 수 변화 꺾은선 SVG 차트 생성 |
| `buildAchievementChart(rangeData, color)` | 달성률 변화 막대 SVG 차트 생성 |
| `generateChartFeedback(rangeData, sectionEvo)` | 달성률/개수 변화 룰 기반 피드백 메시지 생성 |
| `renderEvolutionHTML(evolutions)` | 습관 변화 카드 HTML 생성 (차트 전환 UI, 피드백 텍스트) |
| `trackerToggleCheck(dateKey, itemId)` | 트래커에서 체크리스트 항목 토글 후 스냅샷 저장 |
| `trackerToggleMeal(dateKey, mealType, food)` | 트래커에서 식단 실행 기록 토글 |
| `trackerToggleTodo(dateKey, todoId)` | 트래커에서 할 일 완료 상태 토글 |

---

## 7. 백엔드 모듈

### 7-1. server.js - 미들웨어 파이프라인

```
요청 → helmet (보안 헤더)
     → morgan (요청 로깅)
     → express.json + express.text (바디 파서, 1MB 제한)
     → express-session (SQLite 세션 스토어, 7일 만료)
     → globalLimiter (전체 Rate Limit: 100회/분)
     → [공개 라우트] login, css/js 정적 파일
     → requireAuth (인증 미들웨어)
     → [인증 라우트] logout, me, data CRUD, 메인 페이지
```

| 라우트/함수 | 설명 |
|-------------|------|
| `requireAuth(req, res, next)` | 세션 기반 인증 검사 미들웨어 (미인증 시 401 또는 리다이렉트) |
| `POST /api/auth/login` | 로그인 처리 (loginLimiter: 10회/15분, bcrypt 비교, 세션 재생성) |
| `POST /api/auth/logout` | 로그아웃 (세션 파기, 쿠키 삭제) |
| `GET /api/auth/me` | 현재 로그인 유저 정보 반환 (username, isAdmin) |
| `GET /api/data` | 유저 데이터 로드 |
| `handleDataSave(req, res)` | 데이터 저장 핸들러 (PUT/POST 공유, text/plain sendBeacon 대응, 1MB 제한, sections 검증) |
| `PUT /api/data` | 데이터 저장 (일반 fetch) |
| `POST /api/data` | 데이터 저장 (sendBeacon POST 대응) |
| `shutdown()` | 서버 종료 시 DB 연결 정리 (SIGINT/SIGTERM) |

### 7-2. db.js - 5개 exports

| export | 설명 |
|--------|------|
| `db` | better-sqlite3 DB 인스턴스 (WAL 모드, 외래키 활성) |
| `findUser(username)` | username으로 유저 조회 (`SELECT *`) |
| `findUserById(id)` | id로 유저 조회 (id, username, is_admin만 반환) |
| `createUser(username, passwordHash, isAdmin)` | 유저 생성 트랜잭션 (users + user_data 동시 INSERT) |
| `getUserData(userId)` | 유저 데이터 JSON 로드 (파싱 실패 시 빈 객체 반환) |
| `saveUserData(userId, data)` | 유저 데이터 JSON 저장 (UPSERT: INSERT ON CONFLICT UPDATE) |

> `createUser`는 db.transaction으로 원자성 보장. `getUserData`는 corrupt JSON 방어 내장.

### 7-3. backup.js - 1개 export

| 함수 | 설명 |
|------|------|
| `startBackupSchedule()` | 자동 백업 스케줄 시작 (즉시 1회 + 6시간 간격 반복) |
| `runBackup()` | DB 백업 실행 (`planner_{timestamp}.db`) |
| `cleanOldBackups()` | 오래된 백업 파일 삭제 (최근 7개만 보존) |
| `getTimestamp()` | 백업 파일명용 타임스탬프 생성 (`YYYY-MM-DD_HH-mm`) |

### 7-4. scripts/create-user.js - CLI 도구

| 기능 | 설명 |
|------|------|
| 인자 파싱 | `<아이디> <비밀번호> [--admin]` 형식 |
| 아이디 검증 | 영문/숫자/언더스코어, 2~30자 |
| 비밀번호 검증 | 4자 이상 |
| 중복 검사 | `findUser()`로 기존 유저 확인 |
| 유저 생성 | bcrypt 해시 후 `createUser()` 호출 |
