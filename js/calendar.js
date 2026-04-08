// ===== 캘린더 모듈 =====

let calYear, calMonth, selectedDate = null;

function formatAddedDate(dateKey) {
  const parts = dateKey.split('-').map(Number);
  return `${parts[1]}/${parts[2]} 추가`;
}

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  selectedDate = `${calYear}-${calMonth+1}-1`;
  renderCalendar();
}

function renderCalendar() {
  document.getElementById('cal-month-label').textContent = `${calYear}년 ${MONTH_NAMES[calMonth]}`;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  DAY_NAMES.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-name';
    el.textContent = d;
    grid.appendChild(el);
  });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();

  for (let i = firstDay - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = daysInPrev - i;
    grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day';
    const key = `${calYear}-${calMonth+1}-${d}`;
    if (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()) el.classList.add('today');
    if (selectedDate === key) el.classList.add('selected');

    const numSpan = document.createElement('span');
    numSpan.textContent = d;
    el.appendChild(numSpan);

    const hasMeal = hasMealPlan(key);
    const dateSections = getSectionsForDate(key);

    if (hasMeal) {
      const star = document.createElement('span');
      star.className = 'cal-meal-star';
      star.textContent = '★';
      el.appendChild(star);
    }

    if (dateSections.length > 0) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      dateSections.forEach(sec => {
        dots.innerHTML += `<span class="cal-dot" style="background:${sec.color}"></span>`;
      });
      el.appendChild(dots);
    }

    el.onclick = () => selectDay(d, key);
    grid.appendChild(el);
  }
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = d;
    grid.appendChild(el);
  }

  renderAllSections();

  if (!selectedDate) {
    const today = new Date();
    if (calYear === today.getFullYear() && calMonth === today.getMonth()) {
      selectedDate = todayKey();
    } else {
      selectedDate = `${calYear}-${calMonth+1}-1`;
    }
  }
  showDateDetail(selectedDate);
}

function showDateDetail(key) {
  const day = parseInt(key.split('-')[2]);
  document.getElementById('cal-detail-title').textContent = `${calYear}년 ${MONTH_NAMES[calMonth]} ${day}일`;
  document.getElementById('memo-input').value = (data.memos && data.memos[key]) ? data.memos[key] : '';
  const weightVal = getWeight(key) || '';
  document.getElementById('weight-input').value = weightVal;
  updateWeightDiff(weightVal);
  renderMealPlan(key);
  renderSectionsForDate(key);
  renderCalTodos(key);
  document.getElementById('cal-detail-panel').style.display = 'block';
}

function selectDay(day, key) {
  selectedDate = key;
  renderCalendar();
}

function saveMemo() {
  if (!selectedDate) return;
  if (!data.memos) data.memos = {};
  data.memos[selectedDate] = document.getElementById('memo-input').value;
  saveData();
  renderCalendar();
  renderTracker();
  const msg = document.getElementById('memo-saved-msg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 1500);
}

// === 캘린더 탭 할 일 ===
function renderCalTodos(dateKey) {
  const list = document.getElementById('cal-todo-list');
  if (!list) return;
  const todos = getTodos(dateKey);

  list.innerHTML = '';
  todos.forEach(todo => {
    const el = document.createElement('div');
    el.className = 'item' + (todo.done ? ' done' : '');
    el.innerHTML = `
      <button class="check ${todo.done ? 'checked' : ''}"
        style="${todo.done ? 'background:var(--accent2);border-color:var(--accent2)' : ''}"
        onclick="calToggleTodo('${todo.id}')">
        ${CHECK_SVG}
      </button>
      <span class="item-label ${todo.done ? 'todo-done-text' : ''}" onclick="calToggleTodo('${todo.id}')">${escapeHtml(todo.text)}</span>
      <button class="todo-del-btn" onclick="calRemoveTodo('${todo.id}')">✕</button>
    `;
    list.appendChild(el);
  });

  const input = document.getElementById('cal-todo-input');
  if (input) {
    input.onkeydown = function(e) { if (e.key === 'Enter') addCalTodo(); };
  }
}

function addCalTodo() {
  const input = document.getElementById('cal-todo-input');
  const text = input.value.trim();
  if (!text) return;
  addTodo(selectedDate, text);
  input.value = '';
  renderCalTodos(selectedDate);
  if (selectedDate === checklistDate) renderTodos(checklistDate);
}

function calToggleTodo(todoId) {
  toggleTodo(selectedDate, todoId);
  renderCalTodos(selectedDate);
  if (selectedDate === checklistDate) renderTodos(checklistDate);
}

function calRemoveTodo(todoId) {
  removeTodo(selectedDate, todoId);
  renderCalTodos(selectedDate);
  if (selectedDate === checklistDate) renderTodos(checklistDate);
}

function saveWeightValue() {
  if (!selectedDate) return;
  const val = document.getElementById('weight-input').value;
  saveWeight(selectedDate, val);
  updateWeightDiff(val);
  const msg = document.getElementById('weight-saved-msg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 1500);
}

function updateWeightDiff(currentVal) {
  const diffRow = document.getElementById('weight-diff-row');
  const target = getTargetWeight();
  if (!target || !currentVal || currentVal === '') {
    diffRow.style.display = 'none';
    return;
  }
  const current = parseFloat(currentVal);
  const diff = current - target;
  const absDiff = Math.abs(diff).toFixed(1);
  diffRow.style.display = 'flex';
  document.getElementById('weight-target-display').textContent = `🎯 목표: ${target}kg`;
  const diffEl = document.getElementById('weight-diff-display');
  if (diff > 0) {
    diffEl.textContent = `▲ ${absDiff}kg 남음`;
    diffEl.className = 'weight-diff over';
  } else if (diff < 0) {
    diffEl.textContent = `▼ ${absDiff}kg 초과 달성!`;
    diffEl.className = 'weight-diff under';
  } else {
    diffEl.textContent = `✅ 목표 달성!`;
    diffEl.className = 'weight-diff achieved';
  }
}
