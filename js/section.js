// ===== 섹션/항목 관리 모듈 =====

// === 공유 드래그 이동 핸들러 ===
function handleDragMove(state, containerEl, itemSelector, e) {
  if (!state) return;
  state.ghost.style.top = (e.clientY - state.offsetY) + 'px';
  state.ghost.style.left = (e.clientX - state.offsetX) + 'px';
  const items = [...containerEl.querySelectorAll(itemSelector + ':not(.dragging)')];
  items.forEach(el => el.classList.remove('drag-over'));
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { el.classList.add('drag-over'); break; }
  }
}

// === 모달 상태 ===
let editingItem = null;
let modalMode = 'add';
let modalSecId = null;
let sectionRepeatType = 'daily';
let sectionColor = SECTION_COLORS[0];

// === 적용 범위 선택 모달 ===
let scopeResolveCallback = null;

function askScope(title, desc) {
  return new Promise(resolve => {
    document.getElementById('scope-modal-title').textContent = title;
    document.getElementById('scope-modal-desc').textContent = desc;
    setTimeout(() => {
      document.getElementById('scope-modal').classList.add('open');
      scopeResolveCallback = resolve;
    }, 100);
  });
}

function scopeResolve(choice) {
  document.getElementById('scope-modal').classList.remove('open');
  if (document.activeElement) document.activeElement.blur();
  if (scopeResolveCallback) {
    scopeResolveCallback(choice);
    scopeResolveCallback = null;
  }
}

// ===== 날짜별 섹션 체크리스트 =====
function renderSectionsForDate(dateKey) {
  const container = document.getElementById('cal-sections-container');
  if (!container) return;
  const sections = getSectionsForDate(dateKey);

  if (sections.length === 0) {
    container.innerHTML = '<div class="empty-hint">이 날짜에 해당하는 체크리스트가 없습니다.</div>';
    return;
  }

  container.innerHTML = '';
  sections.forEach(sec => {
    const visibleItems = getItemsForDate(sec, dateKey);
    const secDiv = document.createElement('div');
    secDiv.className = 'section';
    secDiv.innerHTML = `
      <div class="section-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="section-color-dot" style="background:${sec.color}"></span>
          <span class="section-title" style="color:${sec.color}">${sec.title}</span>
          <span class="section-repeat-badge" style="color:${sec.color};background:${sec.color}1F">${getRepeatLabel(sec)}</span>
        </div>
        <button class="section-add" style="color:${sec.color}" onclick="openAddModal('${sec.id}')">+</button>
      </div>
      <div class="cal-sec-items"></div>
    `;
    container.appendChild(secDiv);

    const itemsDiv = secDiv.querySelector('.cal-sec-items');
    if (visibleItems.length === 0) {
      itemsDiv.innerHTML = '<div class="empty-hint">항목이 없어요. + 버튼으로 추가하세요.</div>';
    }
    visibleItems.forEach(item => {
      const isDone = isCompleted(dateKey, item.id);
      const el = document.createElement('div');
      el.className = 'item' + (isDone ? ' done' : '');
      el.innerHTML = `
        <button class="check ${isDone ? 'checked' : ''}" style="${isDone ? 'background:'+sec.color+';border-color:'+sec.color : ''}" onclick="toggleCalItem('${dateKey}','${item.id}')">
          ${CHECK_SVG}
        </button>
        <span class="item-emoji">${item.emoji}</span>
        <span class="item-label" onclick="toggleCalItem('${dateKey}','${item.id}')">${item.label}</span>
        <div class="item-actions" style="opacity:0;transition:opacity 0.2s">
          <button class="item-btn" onclick="openEditModal('${sec.id}','${item.id}')">✏️</button>
          <button class="item-btn del" onclick="deleteItem('${sec.id}','${item.id}')">✕</button>
        </div>
      `;
      el.addEventListener('mouseenter', () => { const a = el.querySelector('.item-actions'); if (a) a.style.opacity = '1'; });
      el.addEventListener('mouseleave', () => { const a = el.querySelector('.item-actions'); if (a) a.style.opacity = '0'; });
      itemsDiv.appendChild(el);
    });
  });
}

function toggleCalItem(dateKey, itemId) {
  toggleComplete(dateKey, itemId);
  renderSectionsForDate(dateKey);
  if (dateKey === todayKey()) renderChecklist();
}

async function deleteItem(secId, itemId) {
  const scope = await askScope('항목 삭제', '이 항목을 삭제합니다.');
  if (!scope) return;
  if (scope === 'all') {
    removeItemFromSection(secId, itemId);
  } else {
    endItem(secId, itemId);
  }
  if (selectedDate) renderSectionsForDate(selectedDate);
  renderCalendar();
  renderChecklist();
  renderAllSections();
}

// ===== 전체 섹션 목록 (아코디언 관리 패널) =====
let expandedSections = {};
let showEndedSections = false;

function renderSectionItem(sec, idx, extraClass) {
  const isOpen = expandedSections[sec.id];
  return `
    <div class="acc-section ${extraClass || ''}" style="border-left:3px solid ${sec.color}" data-sec-idx="${idx}">
      <div class="acc-header" onclick="toggleAccordion('${sec.id}')">
        <span class="drag-handle" data-drag-idx="${idx}">⠿</span>
        <span class="acc-arrow">${isOpen ? '▼' : '▶'}</span>
        <span class="section-color-dot" style="background:${sec.color}"></span>
        <span class="acc-title" style="color:${sec.color}">${sec.title}</span>
        <span class="section-repeat-badge" style="color:${sec.color};background:${sec.color}1F">${getRepeatLabel(sec)}</span>
        <span class="acc-date-range">${formatDateRange(sec)}</span>
        <span class="acc-count">${sec.items.length}개</span>
        <button class="item-btn" onclick="event.stopPropagation();openEditSectionModal('${sec.id}')">✏️</button>
        <button class="recurring-item-del" onclick="event.stopPropagation();confirmDeleteSection('${sec.id}','${sec.title}')">✕</button>
      </div>
      ${isOpen ? renderAccordionBody(sec) : ''}
    </div>`;
}

function renderAllSections() {
  const container = document.getElementById('all-sections-list');
  const active = [], upcoming = [], ended = [];

  data.sections.forEach((sec, idx) => {
    const status = getSectionStatus(sec);
    if (status === 'active') active.push({ sec, idx });
    else if (status === 'upcoming') upcoming.push({ sec, idx });
    else ended.push({ sec, idx });
  });

  let html = '';
  html += `<div class="acc-group-label">진행 중 <span class="acc-group-count">(${active.length})</span></div>`;
  if (active.length === 0) {
    html += '<div class="empty-hint">진행 중인 루틴이 없습니다.</div>';
  } else {
    html += active.map(({ sec, idx }) => renderSectionItem(sec, idx)).join('');
  }

  if (upcoming.length > 0) {
    html += `<div class="acc-group-label">예정 <span class="acc-group-count">(${upcoming.length})</span></div>`;
    html += upcoming.map(({ sec, idx }) => renderSectionItem(sec, idx)).join('');
  }

  html += `<div class="add-section-row"><button class="add-section-btn" onclick="openSectionModal()">+ 새 섹션 추가</button></div>`;

  if (ended.length > 0) {
    html += `<button class="acc-group-toggle" onclick="toggleEndedSections()">
      <span>${showEndedSections ? '▼' : '▶'}</span> 종료된 루틴 보기 <span class="acc-group-count">(${ended.length})</span>
    </button>`;
    if (showEndedSections) {
      html += ended.map(({ sec, idx }) => renderSectionItem(sec, idx, 'ended')).join('');
    }
  }

  container.innerHTML = html;
  initSectionDrag(container);
}

function toggleEndedSections() {
  showEndedSections = !showEndedSections;
  renderAllSections();
}

function toggleAccordion(secId) {
  expandedSections[secId] = !expandedSections[secId];
  renderAllSections();
}

function renderAccordionBody(sec) {
  let html = `<div class="acc-body" data-sec-id="${sec.id}">`;
  if (sec.items.length === 0) {
    html += '<div class="empty-hint" style="padding:6px 0">항목이 없어요.</div>';
  }
  sec.items.forEach((item, idx) => {
    const itemStart = item.startDate || item.addedDate || sec.startDate;
    let dateLabel = formatAddedDate(itemStart);
    if (item.endDate) dateLabel += ' ~ ' + formatAddedDate(item.endDate);
    const addedDateHtml = itemStart ? `<span class="item-added-date">${dateLabel}</span>` : '';
    html += `
      <div class="acc-item" data-item-idx="${idx}">
        <span class="item-drag-handle" data-item-drag-idx="${idx}" data-item-sec-id="${sec.id}">⠿</span>
        <span class="item-emoji">${item.emoji}</span>
        <span class="acc-item-label">${item.label}</span>
        ${addedDateHtml}
        <button class="item-btn" onclick="openEditModal('${sec.id}','${item.id}')">✏️</button>
        <button class="item-btn del" onclick="deleteItemFromPanel('${sec.id}','${item.id}')">✕</button>
      </div>`;
  });
  html += `
    <div class="acc-inline-add">
      <input type="text" class="meal-input" id="acc-emoji-${sec.id}" placeholder="🌿" maxlength="2" style="width:40px;text-align:center">
      <input type="text" class="meal-input" id="acc-label-${sec.id}" placeholder="항목 이름 입력..."
             onkeydown="if(event.key==='Enter')addItemInline('${sec.id}')" style="flex:1">
      <button class="meal-add-btn" onclick="addItemInline('${sec.id}')">추가</button>
    </div>`;
  html += '</div>';
  return html;
}

function addItemInline(secId) {
  const emojiInput = document.getElementById('acc-emoji-' + secId);
  const labelInput = document.getElementById('acc-label-' + secId);
  const emoji = emojiInput.value.trim() || '📌';
  const label = labelInput.value.trim();
  if (!label) return;

  addItemToSection(secId, emoji, label);

  expandedSections[secId] = true;

  renderAllSections();
  renderCalendar();
  renderChecklist();
  if (selectedDate) renderSectionsForDate(selectedDate);

  requestAnimationFrame(() => {
    setTimeout(() => {
      const labelEl = document.getElementById('acc-label-' + secId);
      const emojiEl = document.getElementById('acc-emoji-' + secId);
      if (labelEl) {
        if (emojiEl) emojiEl.value = '';
        labelEl.value = '';
        labelEl.focus();
      }
    }, 50);
  });
}

async function deleteItemFromPanel(secId, itemId) {
  const scope = await askScope('항목 삭제', '이 항목을 삭제합니다.');
  if (!scope) return;
  if (scope === 'all') {
    removeItemFromSection(secId, itemId);
  } else {
    endItem(secId, itemId);
  }
  renderAllSections();
  renderCalendar();
  renderChecklist();
  if (selectedDate) renderSectionsForDate(selectedDate);
}

async function confirmDeleteSection(secId, title) {
  const scope = await askScope('섹션 삭제', `"${title}" 섹션을 삭제합니다.`);
  if (!scope) return;
  if (scope === 'all') {
    removeSection(secId);
  } else {
    removeSectionFuture(secId);
  }
  renderCalendar();
  renderChecklist();
  if (selectedDate) renderSectionsForDate(selectedDate);
}

// ===== 포인터 기반 드래그 앤 드롭 =====
function initSectionDrag(container) {
  container.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', onDragPointerDown);
    handle.addEventListener('click', e => e.stopPropagation());
  });
  container.querySelectorAll('.item-drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', onItemDragPointerDown);
  });
}

let dragState = null;

function onDragPointerDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const srcIdx = parseInt(handle.dataset.dragIdx);
  const section = handle.closest('.acc-section');
  const container = document.getElementById('all-sections-list');
  const rect = section.getBoundingClientRect();

  const ghost = section.cloneNode(true);
  ghost.className = 'acc-section drag-ghost';
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:999;pointer-events:none;opacity:0.8;`;
  ghost.style.borderLeft = section.style.borderLeft;
  document.body.appendChild(ghost);

  section.classList.add('dragging');

  dragState = {
    srcIdx, ghost, section, container,
    offsetY: e.clientY - rect.top,
    offsetX: e.clientX - rect.left,
  };

  document.addEventListener('pointermove', onDragPointerMove);
  document.addEventListener('pointerup', onDragPointerUp);
}

function onDragPointerMove(e) {
  handleDragMove(dragState, dragState.container, '.acc-section', e);
}

function onDragPointerUp(e) {
  if (!dragState) return;
  document.removeEventListener('pointermove', onDragPointerMove);
  document.removeEventListener('pointerup', onDragPointerUp);

  const { srcIdx, ghost, section, container } = dragState;
  ghost.remove();
  section.classList.remove('dragging');

  const items = [...container.querySelectorAll('.acc-section')];
  let dropIdx = data.sections.length;
  for (let i = 0; i < items.length; i++) {
    if (items[i].classList.contains('drag-over')) {
      dropIdx = parseInt(items[i].dataset.secIdx);
      break;
    }
  }

  items.forEach(item => item.classList.remove('drag-over'));
  dragState = null;

  if (srcIdx === dropIdx) return;

  const moved = data.sections.splice(srcIdx, 1)[0];
  const adjustedIdx = dropIdx > srcIdx ? dropIdx - 1 : dropIdx;
  data.sections.splice(adjustedIdx, 0, moved);
  saveData();
  renderAllSections();
  renderChecklist();
}

// ===== 항목 드래그 앤 드롭 =====
let itemDragState = null;

function onItemDragPointerDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const srcIdx = parseInt(handle.dataset.itemDragIdx);
  const secId = handle.dataset.itemSecId;
  const item = handle.closest('.acc-item');
  const body = handle.closest('.acc-body');
  const rect = item.getBoundingClientRect();

  const ghost = item.cloneNode(true);
  ghost.className = 'acc-item drag-ghost';
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:999;pointer-events:none;opacity:0.8;background:var(--bg3);border-radius:8px;`;
  document.body.appendChild(ghost);

  item.classList.add('dragging');

  itemDragState = {
    srcIdx, secId, ghost, item, body,
    offsetY: e.clientY - rect.top,
    offsetX: e.clientX - rect.left,
  };

  document.addEventListener('pointermove', onItemDragMove);
  document.addEventListener('pointerup', onItemDragUp);
}

function onItemDragMove(e) {
  handleDragMove(itemDragState, itemDragState.body, '.acc-item', e);
}

function onItemDragUp(e) {
  if (!itemDragState) return;
  document.removeEventListener('pointermove', onItemDragMove);
  document.removeEventListener('pointerup', onItemDragUp);

  const { srcIdx, secId, ghost, item, body } = itemDragState;
  ghost.remove();
  item.classList.remove('dragging');

  const sec = data.sections.find(s => s.id === secId);
  if (!sec) { itemDragState = null; return; }

  const items = [...body.querySelectorAll('.acc-item')];
  let dropIdx = sec.items.length;
  for (let i = 0; i < items.length; i++) {
    if (items[i].classList.contains('drag-over')) {
      dropIdx = parseInt(items[i].dataset.itemIdx);
      break;
    }
  }

  items.forEach(el => el.classList.remove('drag-over'));
  itemDragState = null;

  if (srcIdx === dropIdx) return;

  const movedItem = sec.items.splice(srcIdx, 1)[0];
  const adj = dropIdx > srcIdx ? dropIdx - 1 : dropIdx;
  sec.items.splice(adj, 0, movedItem);
  saveData();
  renderAllSections();
  renderChecklist();
}

// ===== 항목 추가/수정 모달 =====
function openAddModal(secId) {
  modalMode = 'add';
  modalSecId = secId;
  editingItem = null;
  document.getElementById('modal-title').textContent = '항목 추가';
  document.getElementById('modal-emoji').value = '';
  document.getElementById('modal-label').value = '';
  document.getElementById('modal-item-start-date').value = dateKeyToISO(todayKey());
  document.getElementById('modal-item-endless').checked = true;
  document.getElementById('modal-item-end-date').value = '';
  document.getElementById('modal-item-end-date').disabled = true;
  updateModalSections(secId);
  document.getElementById('item-modal').classList.add('open');
  document.getElementById('modal-label').focus();
}

function openEditModal(secId, itemId) {
  modalMode = 'edit';
  modalSecId = secId;
  const sec = data.sections.find(s => s.id === secId);
  editingItem = sec.items.find(i => i.id === itemId);
  document.getElementById('modal-title').textContent = '항목 수정';
  document.getElementById('modal-emoji').value = editingItem.emoji;
  document.getElementById('modal-label').value = editingItem.label;
  const itemStart = editingItem.startDate || editingItem.addedDate || sec.startDate;
  document.getElementById('modal-item-start-date').value = dateKeyToISO(itemStart);
  const hasEnd = !!editingItem.endDate;
  document.getElementById('modal-item-endless').checked = !hasEnd;
  document.getElementById('modal-item-end-date').disabled = !hasEnd;
  document.getElementById('modal-item-end-date').value = hasEnd ? dateKeyToISO(editingItem.endDate) : '';
  updateModalSections(secId);
  document.getElementById('item-modal').classList.add('open');
  document.getElementById('modal-label').focus();
}

function updateModalSections(selectedId) {
  const sel = document.getElementById('modal-section');
  sel.innerHTML = data.sections.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.title}</option>`).join('');
}

function closeModal() {
  document.getElementById('item-modal').classList.remove('open');
}

function saveItem() {
  const secId = document.getElementById('modal-section').value;
  const emoji = document.getElementById('modal-emoji').value.trim() || '📌';
  const label = document.getElementById('modal-label').value.trim();
  if (!label) return;
  const startDate = isoToDateKey(document.getElementById('modal-item-start-date').value) || todayKey();
  const endless = document.getElementById('modal-item-endless').checked;
  const endDate = endless ? null : isoToDateKey(document.getElementById('modal-item-end-date').value);
  const mode = modalMode;
  const savedSecId = modalSecId;
  const savedItem = editingItem;
  closeModal();
  if (mode === 'add') {
    addItemToSection(secId, emoji, label, startDate, endDate);
  } else if (savedItem) {
    updateItem(savedSecId, savedItem.id, emoji, label, startDate, endDate);
  }
  if (selectedDate) renderSectionsForDate(selectedDate);
  renderCalendar();
  renderChecklist();
  renderAllSections();
}

// ===== 섹션 편집 모달 =====
let editingSectionId = null;
let editRepeatType = 'daily';

function openEditSectionModal(secId) {
  const sec = data.sections.find(s => s.id === secId);
  if (!sec) return;
  editingSectionId = secId;
  sectionColor = sec.color;
  editRepeatType = sec.repeat;
  document.getElementById('section-edit-name').value = sec.title;
  document.getElementById('section-edit-start-date').value = dateKeyToISO(sec.startDate);
  const hasEnd = !!sec.endDate;
  document.getElementById('section-edit-endless').checked = !hasEnd;
  document.getElementById('section-edit-end-date').disabled = !hasEnd;
  document.getElementById('section-edit-end-date').value = hasEnd ? dateKeyToISO(sec.endDate) : '';
  renderEditColorPicker();
  renderEditRepeatOptions();
  updateEditRepeatExtra(sec.repeatDay);
  document.getElementById('section-edit-modal').classList.add('open');
  document.getElementById('section-edit-name').focus();
}

function closeEditSectionModal() {
  document.getElementById('section-edit-modal').classList.remove('open');
  editingSectionId = null;
}

function renderEditColorPicker() {
  const container = document.getElementById('section-edit-color-options');
  const isCustom = !SECTION_COLORS.includes(sectionColor);
  container.innerHTML = SECTION_COLORS.map(c =>
    `<button class="color-opt ${c === sectionColor ? 'active' : ''}" style="background:${c}" onclick="selectEditSectionColor('${c}')"></button>`
  ).join('') + `<label class="color-opt custom-color-opt ${isCustom ? 'active' : ''}" style="background:${isCustom ? sectionColor : '#888'}">
    <input type="color" value="${sectionColor}" onchange="selectEditSectionColor(this.value)" style="opacity:0;position:absolute;width:0;height:0">
    <span class="custom-color-icon">✎</span>
  </label>`;
}

function selectEditSectionColor(color) {
  sectionColor = color;
  renderEditColorPicker();
}

function renderEditRepeatOptions() {
  const container = document.getElementById('section-edit-repeat-options');
  container.innerHTML = REPEAT_TYPES.map(rt =>
    `<button class="repeat-opt ${rt.key === editRepeatType ? 'active' : ''}" onclick="selectEditRepeat('${rt.key}')">${rt.label}</button>`
  ).join('');
}

function selectEditRepeat(type) {
  editRepeatType = type;
  renderEditRepeatOptions();
  updateEditRepeatExtra(null);
}

function updateEditRepeatExtra(preselect) {
  const container = document.getElementById('section-edit-repeat-extra');
  if (editRepeatType === 'weekly' || editRepeatType === 'biweekly') {
    container.innerHTML = `
      <label>요일 선택</label>
      <select id="edit-repeat-day">${DAY_NAMES.map((n, i) => `<option value="${i}" ${preselect === i ? 'selected' : ''}>${n}요일</option>`).join('')}</select>
    `;
    container.style.display = 'block';
  } else if (editRepeatType === 'monthly') {
    container.innerHTML = `
      <label>날짜 선택</label>
      <select id="edit-repeat-day">${Array.from({length:31}, (_, i) => `<option value="${i+1}" ${preselect === i+1 ? 'selected' : ''}>${i+1}일</option>`).join('')}</select>
    `;
    container.style.display = 'block';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function saveEditSection() {
  if (!editingSectionId) return;
  const secId = editingSectionId;
  const name = document.getElementById('section-edit-name').value.trim();
  if (!name) return;
  let repeatDay = null;
  if (editRepeatType === 'weekly' || editRepeatType === 'biweekly' || editRepeatType === 'monthly') {
    const sel = document.getElementById('edit-repeat-day');
    repeatDay = parseInt(sel.value);
  }
  const editStartDate = isoToDateKey(document.getElementById('section-edit-start-date').value) || todayKey();
  const editEndless = document.getElementById('section-edit-endless').checked;
  const editEndDate = editEndless ? null : isoToDateKey(document.getElementById('section-edit-end-date').value);

  closeEditSectionModal();

  const updates = { title: name, color: sectionColor, repeat: editRepeatType, repeatDay: repeatDay, startDate: editStartDate, endDate: editEndDate };
  updateSection(secId, updates);
  renderCalendar();
  renderChecklist();
  if (selectedDate) renderSectionsForDate(selectedDate);
}

// ===== 유틸리티 =====
function toggleEndless(prefix) {
  const checkbox = document.getElementById(prefix + '-endless');
  const endInput = document.getElementById(prefix + '-end-date');
  endInput.disabled = checkbox.checked;
  if (checkbox.checked) endInput.value = '';
}

function dateKeyToISO(dateKey) {
  const parts = dateKey.split('-').map(Number);
  return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
}

function isoToDateKey(iso) {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

// ===== 섹션 추가 모달 =====
function openSectionModal() {
  sectionRepeatType = 'daily';
  sectionColor = SECTION_COLORS[data.sections.length % SECTION_COLORS.length];
  document.getElementById('section-name').value = '';
  document.getElementById('section-start-date').value = dateKeyToISO(todayKey());
  document.getElementById('section-end-date').value = '';
  document.getElementById('section-end-date').disabled = true;
  document.getElementById('section-endless').checked = true;
  renderSectionRepeatOptions();
  renderColorPicker();
  updateSectionRepeatExtra();
  document.getElementById('section-modal').classList.add('open');
  document.getElementById('section-name').focus();
}

function closeSectionModal() {
  document.getElementById('section-modal').classList.remove('open');
}

function renderColorPicker() {
  const container = document.getElementById('section-color-options');
  const isCustom = !SECTION_COLORS.includes(sectionColor);
  container.innerHTML = SECTION_COLORS.map(c =>
    `<button class="color-opt ${c === sectionColor ? 'active' : ''}" style="background:${c}" onclick="selectSectionColor('${c}')"></button>`
  ).join('') + `<label class="color-opt custom-color-opt ${isCustom ? 'active' : ''}" style="background:${isCustom ? sectionColor : '#888'}">
    <input type="color" value="${sectionColor}" onchange="selectSectionColor(this.value)" style="opacity:0;position:absolute;width:0;height:0">
    <span class="custom-color-icon">✎</span>
  </label>`;
}

function selectSectionColor(color) {
  sectionColor = color;
  renderColorPicker();
}

function renderSectionRepeatOptions() {
  const container = document.getElementById('section-repeat-options');
  container.innerHTML = REPEAT_TYPES.map(rt =>
    `<button class="repeat-opt ${rt.key === sectionRepeatType ? 'active' : ''}" onclick="selectSectionRepeat('${rt.key}')">${rt.label}</button>`
  ).join('');
}

function selectSectionRepeat(type) {
  sectionRepeatType = type;
  renderSectionRepeatOptions();
  updateSectionRepeatExtra();
}

function updateSectionRepeatExtra() {
  const container = document.getElementById('section-repeat-extra');
  if (sectionRepeatType === 'weekly' || sectionRepeatType === 'biweekly') {
    container.innerHTML = `
      <label>요일 선택</label>
      <select id="section-repeat-day">${DAY_NAMES.map((n, i) => `<option value="${i}">${n}요일</option>`).join('')}</select>
    `;
    container.style.display = 'block';
  } else if (sectionRepeatType === 'monthly') {
    container.innerHTML = `
      <label>날짜 선택</label>
      <select id="section-repeat-day">${Array.from({length:31}, (_, i) => `<option value="${i+1}">${i+1}일</option>`).join('')}</select>
    `;
    container.style.display = 'block';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function saveSection() {
  const name = document.getElementById('section-name').value.trim();
  if (!name) return;
  let repeatDay = null;
  if (sectionRepeatType === 'weekly' || sectionRepeatType === 'biweekly' || sectionRepeatType === 'monthly') {
    const sel = document.getElementById('section-repeat-day');
    repeatDay = parseInt(sel.value);
  }
  const startDate = isoToDateKey(document.getElementById('section-start-date').value) || todayKey();
  const endless = document.getElementById('section-endless').checked;
  const endDate = endless ? null : isoToDateKey(document.getElementById('section-end-date').value);
  addSection(name, sectionColor, sectionRepeatType, repeatDay, startDate, endDate);
  closeSectionModal();
  renderCalendar();
  renderChecklist();
}
