// ===== 식단 계획 UI 모듈 =====

let mealDragState = null;

function renderMealPlan(dateKey) {
  const container = document.getElementById('meal-plan-container');
  const plan = getMealPlan(dateKey);

  container.innerHTML = MEAL_TYPES.map(mt => {
    const savedTime = getMealTime(dateKey, mt.key);
    return `
    <div class="meal-section">
      <div class="meal-section-title">${mt.emoji} ${mt.label}</div>
      <div class="meal-drag-list" id="meal-items-${mt.key}" data-meal-type="${mt.key}" data-date-key="${dateKey}">
        ${plan[mt.key].map((food, idx) => {
          const checked = isMealChecked(dateKey, mt.key, idx);
          return `
          <div class="item ${checked ? 'done' : ''}" data-meal-idx="${idx}">
            <span class="item-drag-handle meal-drag" data-meal-drag-idx="${idx}" data-meal-drag-type="${mt.key}" data-meal-drag-date="${dateKey}">⠿</span>
            <button class="check ${checked ? 'checked' : ''}" onclick="toggleMealAndRender('${dateKey}','${mt.key}',${idx})">
              ${CHECK_SVG}
            </button>
            <span class="item-label" onclick="toggleMealAndRender('${dateKey}','${mt.key}',${idx})">${food}</span>
            <div class="item-actions">
              <button class="item-btn del" onclick="removeMeal('${dateKey}','${mt.key}',${idx})">✕</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="meal-time-row">
        <label>⏰ 시간</label>
        <input type="time" class="meal-time-input" id="meal-time-${mt.key}" value="${savedTime}"
               onchange="saveMealTimeAndRender('${dateKey}','${mt.key}',this.value)">
      </div>
      <div class="meal-input-row">
        <input type="text" class="meal-input" id="meal-input-${mt.key}" placeholder="${mt.label} 음식 입력..."
               onkeydown="if(event.key==='Enter')addMeal('${dateKey}','${mt.key}')">
        <button class="meal-add-btn" onclick="addMeal('${dateKey}','${mt.key}')">추가</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.meal-drag').forEach(handle => {
    handle.addEventListener('pointerdown', onMealDragPointerDown);
  });
}

function addMeal(dateKey, mealType) {
  const input = document.getElementById('meal-input-' + mealType);
  const val = input.value.trim();
  if (!val) return;
  addMealItem(dateKey, mealType, val);
  renderMealPlan(dateKey);
  renderCalendar();
  const newInput = document.getElementById('meal-input-' + mealType);
  if (newInput) newInput.focus();
}

function toggleMealAndRender(dateKey, mealType, index) {
  toggleMealCheck(dateKey, mealType, index);
  renderMealPlan(dateKey);
}

function saveMealTimeAndRender(dateKey, mealType, time) {
  saveMealTime(dateKey, mealType, time);
}

function removeMeal(dateKey, mealType, index) {
  removeMealItem(dateKey, mealType, index);
  renderMealPlan(dateKey);
  renderCalendar();
}

// ===== 식단 항목 드래그 앤 드롭 =====
function onMealDragPointerDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const srcIdx = parseInt(handle.dataset.mealDragIdx);
  const mealType = handle.dataset.mealDragType;
  const dateKey = handle.dataset.mealDragDate;
  const item = handle.closest('.item');
  const list = handle.closest('.meal-drag-list');
  const rect = item.getBoundingClientRect();

  const ghost = item.cloneNode(true);
  ghost.className = 'item drag-ghost';
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:999;pointer-events:none;opacity:0.8;`;
  document.body.appendChild(ghost);

  item.classList.add('dragging');

  mealDragState = {
    srcIdx, mealType, dateKey, ghost, item, list,
    offsetY: e.clientY - rect.top,
    offsetX: e.clientX - rect.left,
  };

  document.addEventListener('pointermove', onMealDragMove);
  document.addEventListener('pointerup', onMealDragUp);
}

function onMealDragMove(e) {
  handleDragMove(mealDragState, mealDragState && mealDragState.list, '.item', e);
}

function onMealDragUp(e) {
  if (!mealDragState) return;
  document.removeEventListener('pointermove', onMealDragMove);
  document.removeEventListener('pointerup', onMealDragUp);

  const { srcIdx, mealType, dateKey, ghost, item, list } = mealDragState;
  ghost.remove();
  item.classList.remove('dragging');

  const items = [...list.querySelectorAll('.item')];
  let dropIdx = items.length;
  for (let i = 0; i < items.length; i++) {
    if (items[i].classList.contains('drag-over')) {
      dropIdx = parseInt(items[i].dataset.mealIdx);
      break;
    }
  }

  items.forEach(el => el.classList.remove('drag-over'));
  mealDragState = null;

  if (srcIdx === dropIdx) return;

  reorderMealItem(dateKey, mealType, srcIdx, dropIdx);
  renderMealPlan(dateKey);
  renderChecklist();
}
