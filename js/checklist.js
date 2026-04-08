// ===== 체크리스트 모듈 (보기 + 체크 전용) =====

let checklistDate = null;
let miniCalYear, miniCalMonth;

function initChecklist() {
  checklistDate = todayKey();
  updateChecklistDateLabel();
  renderChecklist();
}

// ===== 미니 달력 =====
function toggleMiniCal() {
  const el = document.getElementById('mini-cal');
  if (el.style.display === 'none') {
    const parts = checklistDate.split('-').map(Number);
    miniCalYear = parts[0];
    miniCalMonth = parts[1] - 1;
    renderMiniCal();
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function changeMiniCalMonth(dir) {
  miniCalMonth += dir;
  if (miniCalMonth > 11) { miniCalMonth = 0; miniCalYear++; }
  if (miniCalMonth < 0) { miniCalMonth = 11; miniCalYear--; }
  renderMiniCal();
}

function renderMiniCal() {
  document.getElementById('mini-cal-month').textContent = `${miniCalYear}년 ${MONTH_NAMES[miniCalMonth]}`;
  const grid = document.getElementById('mini-cal-grid');
  grid.innerHTML = '';
  DAY_NAMES.forEach(d => {
    const el = document.createElement('div');
    el.className = 'mini-cal-day-name';
    el.textContent = d;
    grid.appendChild(el);
  });
  const firstDay = new Date(miniCalYear, miniCalMonth, 1).getDay();
  const daysInMonth = new Date(miniCalYear, miniCalMonth + 1, 0).getDate();
  const daysInPrev = new Date(miniCalYear, miniCalMonth, 0).getDate();
  const todayParts = todayKey().split('-').map(Number);
  const selParts = checklistDate.split('-').map(Number);

  for (let i = firstDay - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className = 'mini-cal-day other';
    el.textContent = daysInPrev - i;
    grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    el.className = 'mini-cal-day';
    if (d === todayParts[2] && miniCalMonth === todayParts[1] - 1 && miniCalYear === todayParts[0]) el.classList.add('today');
    if (d === selParts[2] && miniCalMonth === selParts[1] - 1 && miniCalYear === selParts[0]) el.classList.add('selected');
    el.textContent = d;
    el.onclick = () => pickMiniCalDate(d);
    grid.appendChild(el);
  }
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    const el = document.createElement('div');
    el.className = 'mini-cal-day other';
    el.textContent = d;
    grid.appendChild(el);
  }
}

function pickMiniCalDate(day) {
  checklistDate = `${miniCalYear}-${miniCalMonth+1}-${day}`;
  document.getElementById('mini-cal').style.display = 'none';
  updateChecklistDateLabel();
  renderChecklist();
}

function changeChecklistDate(dir) {
  const parts = checklistDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2] + dir);
  checklistDate = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  updateChecklistDateLabel();
  renderChecklist();
}

function updateChecklistDateLabel() {
  const d = parseDate(checklistDate);
  const parts = checklistDate.split('-').map(Number);
  document.getElementById('today-date').textContent =
    `${parts[0]}년 ${parts[1]}월 ${parts[2]}일 (${DAY_NAMES[d.getDay()]})`;

  const isToday = checklistDate === todayKey();
  document.getElementById('checklist-title').textContent = isToday ? '오늘의 루틴' : '루틴';
}

// ===== 체크리스트 섹션 렌더링 =====
function renderChecklistSections(container, dateKey) {
  const sections = getSectionsForDate(dateKey);
  let total = 0, done = 0;

  sections.forEach(section => {
    const visibleItems = getItemsForDate(section, dateKey);
    visibleItems.forEach(item => {
      total++;
      if (isCompleted(dateKey, item.id)) done++;
    });

    const sec = document.createElement('div');
    sec.className = 'section';
    sec.innerHTML = `
      <div class="section-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="section-color-dot" style="background:${section.color}"></span>
          <span class="section-title" style="color:${section.color}">${section.title}</span>
          <span class="section-repeat-badge" style="color:${section.color};background:${section.color}1F">${getRepeatLabel(section)}</span>
        </div>
      </div>
      <div id="sec-items-${section.id}"></div>
    `;
    container.appendChild(sec);
    const itemsDiv = sec.querySelector(`#sec-items-${section.id}`);
    if (visibleItems.length === 0) {
      itemsDiv.innerHTML = `<div class="empty-hint">항목이 없어요. 캘린더 탭에서 추가하세요.</div>`;
    }
    visibleItems.forEach(item => {
      const isDone = isCompleted(dateKey, item.id);
      const el = document.createElement('div');
      el.className = 'item' + (isDone ? ' done' : '');
      el.innerHTML = `
        <button class="check ${isDone ? 'checked' : ''}" style="${isDone ? 'background:'+section.color+';border-color:'+section.color : ''}" onclick="toggleItem('${item.id}')">
          ${CHECK_SVG}
        </button>
        <span class="item-emoji">${item.emoji}</span>
        <span class="item-label" onclick="toggleItem('${item.id}')">${item.label}</span>
      `;
      itemsDiv.appendChild(el);
    });
  });

  if (sections.length === 0) {
    container.innerHTML = `<div class="empty-hint">이 날짜에 해당하는 체크리스트가 없습니다.<br>캘린더 탭에서 섹션을 추가하세요.</div>`;
  }

  return { total, done };
}

// ===== 체크리스트 식단 렌더링 =====
function renderChecklistMeals(container, dateKey) {
  const mealPlan = getMealPlan(dateKey);
  let total = 0, done = 0;
  let mealItemsHtml = '';
  let hasMealItems = false;

  MEAL_TYPES.forEach(mt => {
    const foods = mealPlan[mt.key];
    if (foods.length === 0) return;
    hasMealItems = true;
    mealItemsHtml += `<div class="meal-sub-label">${mt.emoji} ${mt.label}</div>`;
    foods.forEach((food, idx) => {
      const checked = isMealChecked(dateKey, mt.key, idx);
      mealItemsHtml += `
        <div class="item ${checked ? 'done' : ''}">
          <button class="check ${checked ? 'checked' : ''}" style="${checked ? 'background:var(--accent3);border-color:var(--accent3)' : ''}" onclick="toggleMealItem('${mt.key}',${idx})">
            ${CHECK_SVG}
          </button>
          <span class="item-label" onclick="toggleMealItem('${mt.key}',${idx})">${food}</span>
        </div>`;
      if (checked) done++;
      total++;
    });
  });

  const mealSec = document.createElement('div');
  mealSec.className = 'section';
  mealSec.innerHTML = `
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="section-color-dot" style="background:var(--accent3)"></span>
        <span class="section-title" style="color:var(--accent3)">식단 계획</span>
      </div>
    </div>
    <div class="meal-group-card">
      ${hasMealItems ? mealItemsHtml : '<div class="empty-hint">캘린더 탭에서 식단을 추가하세요.</div>'}
    </div>
  `;
  container.appendChild(mealSec);

  return { total, done };
}

// ===== 체크리스트 메인 렌더러 =====
function renderChecklist() {
  const container = document.getElementById('sections-container');
  container.innerHTML = '';
  const dateKey = checklistDate || todayKey();

  const secStats = renderChecklistSections(container, dateKey);
  const mealStats = renderChecklistMeals(container, dateKey);

  const total = secStats.total + mealStats.total;
  const done = secStats.done + mealStats.done;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-text').textContent = `${done} / ${total}`;
  document.getElementById('stat-done').textContent = done;
  document.getElementById('stat-remain').textContent = total - done;
  document.getElementById('stat-pct').textContent = pct + '%';

  renderChecklistMemo(dateKey);
  renderTodos(dateKey);
}

let _checklistMemoTimer = null;

function renderChecklistMemo(dateKey) {
  const input = document.getElementById('checklist-memo-input');
  const saved = document.getElementById('checklist-memo-saved');
  if (!input) return;
  input.value = (data.memos && data.memos[dateKey]) ? data.memos[dateKey] : '';
  saved.style.opacity = '0';

  // 이벤트 리스너 재등록 (날짜 변경에 대응)
  input.oninput = function() {
    if (_checklistMemoTimer) clearTimeout(_checklistMemoTimer);
    saved.style.opacity = '0';
    _checklistMemoTimer = setTimeout(function() {
      if (!data.memos) data.memos = {};
      data.memos[dateKey] = input.value;
      saveData();
      saved.style.opacity = '1';
      setTimeout(function() { saved.style.opacity = '0'; }, 1500);
    }, 500);
  };
}

function syncCalendar() {
  if (document.getElementById('page-calendar').classList.contains('active')) {
    renderCalendar();
    if (selectedDate) renderSectionsForDate(selectedDate);
  }
}

function toggleMealItem(mealType, index) {
  toggleMealCheck(checklistDate, mealType, index);
  renderChecklist();
}

function toggleItem(itemId) {
  toggleComplete(checklistDate, itemId);
  saveDailySnapshot(checklistDate);
  renderChecklist();
  syncCalendar();
}

// === 할 일 (To-Do) ===
function renderTodos(dateKey) {
  const list = document.getElementById('checklist-todo-list');
  if (!list) return;
  const todos = getTodos(dateKey);

  if (todos.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = '';
  todos.forEach(todo => {
    const el = document.createElement('div');
    el.className = 'item' + (todo.done ? ' done' : '');
    el.innerHTML = `
      <button class="check ${todo.done ? 'checked' : ''}"
        style="${todo.done ? 'background:var(--accent2);border-color:var(--accent2)' : ''}"
        onclick="toggleChecklistTodo('${todo.id}')">
        ${CHECK_SVG}
      </button>
      <span class="item-label ${todo.done ? 'todo-done-text' : ''}" onclick="toggleChecklistTodo('${todo.id}')">${escapeHtml(todo.text)}</span>
      <button class="todo-del-btn" onclick="removeChecklistTodo('${todo.id}')">✕</button>
    `;
    list.appendChild(el);
  });

  // Enter 키 지원
  const input = document.getElementById('checklist-todo-input');
  if (input) {
    input.onkeydown = function(e) { if (e.key === 'Enter') addChecklistTodo(); };
  }
}

function addChecklistTodo() {
  const input = document.getElementById('checklist-todo-input');
  const text = input.value.trim();
  if (!text) return;
  addTodo(checklistDate, text);
  input.value = '';
  renderTodos(checklistDate);
  showTodoSaved();
}

function toggleChecklistTodo(todoId) {
  toggleTodo(checklistDate, todoId);
  renderTodos(checklistDate);
  showTodoSaved();
}

function removeChecklistTodo(todoId) {
  removeTodo(checklistDate, todoId);
  renderTodos(checklistDate);
  showTodoSaved();
}

function showTodoSaved() {
  const saved = document.getElementById('checklist-todo-saved');
  if (!saved) return;
  saved.style.opacity = '1';
  setTimeout(() => { saved.style.opacity = '0'; }, 1500);
}
