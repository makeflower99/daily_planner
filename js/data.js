// ===== 데이터 관리 모듈 =====

const STORAGE_KEY = 'planner_v4';

const SECTION_COLORS = [
  '#B026FF', '#FF44CC', '#FF3355', '#FF6B2B',
  '#FFE633', '#39FF14', '#00E5FF', '#4D6DFF', '#1B0CFF',
];

const SECTIONS_DEFAULT = [
  {
    id: 'morning', title: '아침 루틴', color: '#7C5CFC', repeat: 'daily', repeatDay: null, startDate: '2026-4-1',
    items: [
      { id: 'i1', emoji: '🪥', label: '양치' },
      { id: 'i2', emoji: '💧', label: '따뜻한 물 마시기' },
      { id: 'i3', emoji: '🧘', label: '스트레칭 20분' },
      { id: 'i4', emoji: '🙏', label: '명상 10분' },
    ]
  },
  {
    id: 'meal', title: '식단', color: '#FF9F43', repeat: 'daily', repeatDay: null, startDate: '2026-4-1',
    items: [
      { id: 'i5', emoji: '🍚', label: '현미밥 1공기' },
      { id: 'i6', emoji: '🫘', label: '두부 한 모' },
      { id: 'i7', emoji: '🐟', label: '생선' },
      { id: 'i8', emoji: '🥬', label: '야채 / 나물' },
      { id: 'i9', emoji: '🍲', label: '국' },
      { id: 'i10', emoji: '🥢', label: '김치' },
    ]
  },
  {
    id: 'study', title: '공부', color: '#4ECDC4', repeat: 'daily', repeatDay: null, startDate: '2026-4-1',
    items: [
      { id: 'i11', emoji: '📚', label: '집중 공부 4시간' },
      { id: 'i12', emoji: '🗣', label: '듀오링고 30분' },
    ]
  }
];

const MEAL_TYPES = [
  { key: 'breakfast', label: '아침', emoji: '🌅' },
  { key: 'lunch', label: '점심', emoji: '☀️' },
  { key: 'dinner', label: '저녁', emoji: '🌙' },
  { key: 'snack', label: '간식', emoji: '🍎' },
];

const REPEAT_TYPES = [
  { key: 'daily', label: '매일' },
  { key: 'weekdays', label: '주중' },
  { key: 'weekends', label: '주말' },
  { key: 'weekly', label: '매주' },
  { key: 'biweekly', label: '격주' },
  { key: 'everyOtherDay', label: '격일' },
  { key: 'monthly', label: '매월' },
];

let data = {};
let _currentUsername = ''; // localStorage 키 분리용

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function parseDateKey(dateKey) {
  const p = dateKey.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function getStorageKey() {
  return _currentUsername ? `planner_v4_${_currentUsername}` : STORAGE_KEY;
}

// XSS 방지: HTML 이스케이프 유틸
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadData() {
  // 유저명 가져오기 (localStorage 키 분리용)
  try {
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const me = await meRes.json();
      _currentUsername = me.username || '';
      const navUser = document.getElementById('nav-username');
      if (navUser && _currentUsername) navUser.textContent = '👤 ' + _currentUsername;
    }
  } catch {}

  let loaded = false;
  try {
    const res = await fetch('/api/data');
    if (res.status === 401) {
      window.location.href = '/login.html';
      return Promise.reject(new Error('인증 필요'));
    }
    if (res.ok) {
      const serverData = await res.json();
      if (!serverData.sections) {
        data = {
          sections: JSON.parse(JSON.stringify(SECTIONS_DEFAULT)),
          memos: {},
          mealPlans: {},
          completions: {},
          dailyRecords: {},
        };
      } else {
        data = serverData;
      }
      loaded = true;
    } else {
      throw new Error('서버 응답 오류');
    }
  } catch (e) {
    if (e.message === '인증 필요') throw e;
    // 서버 불가 시 localStorage 폴백 (유저별 키)
    const raw = localStorage.getItem(getStorageKey());
    if (raw) {
      data = JSON.parse(raw);
    } else {
      data = {
        sections: JSON.parse(JSON.stringify(SECTIONS_DEFAULT)),
        memos: {},
        mealPlans: {},
        completions: {},
        dailyRecords: {},
      };
    }
  }

  // 필드 가드 (수정이 있을 때만 saveData)
  let modified = false;
  if (!data.memos) { data.memos = {}; modified = true; }
  if (!data.mealPlans) { data.mealPlans = {}; modified = true; }
  if (!data.completions) { data.completions = {}; modified = true; }
  if (!data.dailyRecords) { data.dailyRecords = {}; modified = true; }
  if (!data.mealChecks) { data.mealChecks = {}; modified = true; }
  if (!data.mealTimes) { data.mealTimes = {}; modified = true; }
  if (!data.weights) { data.weights = {}; modified = true; }
  if (!data.sections) { data.sections = []; modified = true; }
  if (!data.todos) { data.todos = {}; modified = true; }
  data.sections.forEach((sec, idx) => {
    if (!sec.color) { sec.color = SECTION_COLORS[idx % SECTION_COLORS.length]; modified = true; }
  });
  if (modified) saveData();
}


let _saveTimeout = null;
function saveData() {
  const json = JSON.stringify(data);
  // localStorage 캐시 (오프라인 폴백용, 유저별 키)
  try { localStorage.setItem(getStorageKey(), json); } catch (e) {}
  // 서버 저장 (300ms 디바운스)
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => {
    fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    }).then(res => {
      if (res.status === 401) window.location.href = '/login.html';
      if (!res.ok) showStorageWarning();
    }).catch(() => showStorageWarning());
  }, 300);
}

function showStorageWarning() {
  const el = document.getElementById('storage-warning');
  if (el) el.style.display = 'block';
}

// === 섹션 상태 판별 ===
function getSectionStatus(section) {
  const todayParts = todayKey().split('-').map(Number);
  const today = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const startParts = section.startDate.split('-').map(Number);
  const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  if (start > today) return 'upcoming';
  if (section.endDate) {
    const endParts = section.endDate.split('-').map(Number);
    const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
    if (end < today) return 'ended';
  }
  return 'active';
}

// === 반복 스케줄 판별 ===
function isSectionOnDate(section, dateKey) {
  const parts = dateKey.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const startParts = section.startDate.split('-').map(Number);
  const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  if (date < startDate) return false;
  if (section.endDate) {
    const endParts = section.endDate.split('-').map(Number);
    const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2]);
    if (date > endDate) return false;
  }

  const dow = date.getDay();
  switch (section.repeat) {
    case 'daily': return true;
    case 'weekly': return dow === section.repeatDay;
    case 'monthly': return date.getDate() === section.repeatDay;
    case 'biweekly': {
      const diffDays = Math.round((date - startDate) / 86400000);
      return dow === section.repeatDay && Math.floor(diffDays / 7) % 2 === 0;
    }
    case 'everyOtherDay': {
      const diffDays = Math.round((date - startDate) / 86400000);
      return diffDays % 2 === 0;
    }
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekends': return dow === 0 || dow === 6;
    default: return false;
  }
}

function getSectionsForDate(dateKey) {
  return data.sections.filter(s => isSectionOnDate(s, dateKey));
}

// === 항목별 날짜 필터링 ===
function isItemOnDate(item, section, dateKey) {
  const parts = dateKey.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);

  const itemStart = item.startDate || item.addedDate || section.startDate;
  const startParts = itemStart.split('-').map(Number);
  if (date < new Date(startParts[0], startParts[1] - 1, startParts[2])) return false;

  if (item.endDate) {
    const endParts = item.endDate.split('-').map(Number);
    if (date > new Date(endParts[0], endParts[1] - 1, endParts[2])) return false;
  }
  return true;
}

function getItemsForDate(section, dateKey) {
  return section.items.filter(item => isItemOnDate(item, section, dateKey));
}

function getRepeatLabel(section) {
  const dayNames = ['일','월','화','수','목','금','토'];
  switch (section.repeat) {
    case 'daily': return '매일';
    case 'weekdays': return '주중';
    case 'weekends': return '주말';
    case 'weekly': return `매주 ${dayNames[section.repeatDay]}요일`;
    case 'biweekly': return `격주 ${dayNames[section.repeatDay]}요일`;
    case 'everyOtherDay': return '격일';
    case 'monthly': return `매월 ${section.repeatDay}일`;
    default: return '';
  }
}

function formatDateRange(section) {
  const fmt = (dk) => {
    const p = dk.split('-').map(Number);
    return `${p[1]}/${p[2]}`;
  };
  const start = fmt(section.startDate);
  const end = section.endDate ? fmt(section.endDate) : '~';
  return `${start} - ${end}`;
}

// === 완료 상태 (날짜별) ===
function isCompleted(dateKey, itemId) {
  return !!(data.completions[dateKey] && data.completions[dateKey][itemId]);
}

function toggleComplete(dateKey, itemId) {
  if (!data.completions[dateKey]) data.completions[dateKey] = {};
  data.completions[dateKey][itemId] = !data.completions[dateKey][itemId];
  saveData();
}

function getCompletionStats(dateKey) {
  const sections = getSectionsForDate(dateKey);
  let total = 0, done = 0;
  sections.forEach(sec => {
    getItemsForDate(sec, dateKey).forEach(item => {
      total++;
      if (isCompleted(dateKey, item.id)) done++;
    });
  });
  return { total, done, pct: total > 0 ? Math.round(done / total * 100) : 0 };
}

// === 섹션 관리 ===
function addSection(title, color, repeat, repeatDay, startDate, endDate) {
  const section = {
    id: 's' + Date.now(),
    title: title,
    color: color || SECTION_COLORS[data.sections.length % SECTION_COLORS.length],
    repeat: repeat,
    repeatDay: repeatDay,
    startDate: startDate || todayKey(),
    endDate: endDate || null,
    items: [],
  };
  data.sections.push(section);
  saveData();
  return section;
}

function updateSection(sectionId, updates) {
  const sec = data.sections.find(s => s.id === sectionId);
  if (!sec) return;
  if (updates.title) sec.title = updates.title;
  if (updates.color) sec.color = updates.color;
  if (updates.repeat !== undefined) sec.repeat = updates.repeat;
  if (updates.repeatDay !== undefined) sec.repeatDay = updates.repeatDay;
  if (updates.startDate !== undefined) sec.startDate = updates.startDate;
  if (updates.endDate !== undefined) sec.endDate = updates.endDate;
  saveData();
}

function removeSection(sectionId) {
  data.sections = data.sections.filter(s => s.id !== sectionId);
  saveData();
}

// "습관 종료": 기존 섹션에 endDate=오늘 (오늘까지 표시, 내일부터 종료)
function removeSectionFuture(sectionId) {
  const sec = data.sections.find(s => s.id === sectionId);
  if (!sec) return;
  sec.endDate = todayKey();
  saveData();
}

function addItemToSection(sectionId, emoji, label, startDate, endDate) {
  const sec = data.sections.find(s => s.id === sectionId);
  if (!sec) return;
  const item = { id: 'i' + Date.now(), emoji: emoji || '📌', label, addedDate: todayKey(), startDate: startDate || todayKey() };
  if (endDate) item.endDate = endDate;
  sec.items.push(item);
  saveData();
}

function removeItemFromSection(sectionId, itemId) {
  const sec = data.sections.find(s => s.id === sectionId);
  if (!sec) return;
  sec.items = sec.items.filter(i => i.id !== itemId);
  saveData();
}

function endItem(sectionId, itemId) {
  const sec = data.sections.find(s => s.id === sectionId);
  if (!sec) return;
  const item = sec.items.find(i => i.id === itemId);
  if (!item) return;
  item.endDate = todayKey();
  saveData();
}

function updateItem(sectionId, itemId, emoji, label, startDate, endDate) {
  const sec = data.sections.find(s => s.id === sectionId);
  if (!sec) return;
  const item = sec.items.find(i => i.id === itemId);
  if (!item) return;
  item.emoji = emoji;
  item.label = label;
  if (startDate !== undefined) item.startDate = startDate;
  if (endDate !== undefined) item.endDate = endDate;
  if (endDate === null) delete item.endDate;
  saveData();
}

// === 할 일 (날짜별) ===
function addTodo(dateKey, text) {
  if (!data.todos[dateKey]) data.todos[dateKey] = [];
  data.todos[dateKey].push({ id: 't' + Date.now(), text: text, done: false });
  saveData();
}

function toggleTodo(dateKey, todoId) {
  if (!data.todos[dateKey]) return;
  const todo = data.todos[dateKey].find(t => t.id === todoId);
  if (todo) { todo.done = !todo.done; saveData(); }
}

function removeTodo(dateKey, todoId) {
  if (!data.todos[dateKey]) return;
  data.todos[dateKey] = data.todos[dateKey].filter(t => t.id !== todoId);
  saveData();
}

function getTodos(dateKey) {
  return (data.todos && data.todos[dateKey]) || [];
}

// === 일일 기록 (스냅샷 저장) ===
function saveDailySnapshot(dateKey) {
  if (!dateKey) return;
  const sections = getSectionsForDate(dateKey);
  const record = { checklist: {}, meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
  sections.forEach(sec => {
    getItemsForDate(sec, dateKey).forEach(item => {
      record.checklist[item.id] = {
        section: sec.title,
        color: sec.color,
        emoji: item.emoji,
        label: item.label,
        done: isCompleted(dateKey, item.id),
      };
    });
  });
  if (data.dailyRecords[dateKey] && data.dailyRecords[dateKey].meals) {
    record.meals = data.dailyRecords[dateKey].meals;
  }
  data.dailyRecords[dateKey] = record;
  saveData();
}

function getDailyRecord(dateKey) {
  return data.dailyRecords[dateKey] || null;
}

// === 식단 계획 ===
function getMealPlan(dateKey) {
  return data.mealPlans[dateKey] || { breakfast: [], lunch: [], dinner: [], snack: [] };
}

function addMealItem(dateKey, mealType, item) {
  if (!data.mealPlans[dateKey]) {
    data.mealPlans[dateKey] = { breakfast: [], lunch: [], dinner: [], snack: [] };
  }
  data.mealPlans[dateKey][mealType].push(item);
  saveData();
}

function reorderMealItem(dateKey, mealType, fromIdx, toIdx) {
  if (!data.mealPlans[dateKey] || !data.mealPlans[dateKey][mealType]) return;
  const arr = data.mealPlans[dateKey][mealType];
  const moved = arr.splice(fromIdx, 1)[0];
  const adj = toIdx > fromIdx ? toIdx - 1 : toIdx;
  arr.splice(adj, 0, moved);
  saveData();
}

function removeMealItem(dateKey, mealType, index) {
  if (data.mealPlans[dateKey] && data.mealPlans[dateKey][mealType]) {
    data.mealPlans[dateKey][mealType].splice(index, 1);
    saveData();
  }
}

function isMealChecked(dateKey, mealType, index) {
  const plan = getMealPlan(dateKey);
  const food = plan[mealType] && plan[mealType][index];
  if (!food) return false;
  const actual = getMealActual(dateKey);
  return (actual[mealType] || []).includes(food);
}

function toggleMealCheck(dateKey, mealType, index) {
  const plan = getMealPlan(dateKey);
  const food = plan[mealType] && plan[mealType][index];
  if (!food) return;
  toggleMealActual(dateKey, mealType, food);
}

function hasMealPlan(dateKey) {
  const plan = data.mealPlans[dateKey];
  if (!plan) return false;
  return plan.breakfast.length > 0 || plan.lunch.length > 0 || plan.dinner.length > 0 || plan.snack.length > 0;
}

// === 식단 실행 기록 ===
function getMealActual(dateKey) {
  const record = data.dailyRecords[dateKey];
  if (record && record.meals) return record.meals;
  return { breakfast: [], lunch: [], dinner: [], snack: [] };
}

function toggleMealActual(dateKey, mealType, foodItem) {
  if (!data.dailyRecords[dateKey]) {
    data.dailyRecords[dateKey] = { checklist: {}, meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
  }
  const meals = data.dailyRecords[dateKey].meals;
  if (!meals[mealType]) meals[mealType] = [];
  const idx = meals[mealType].indexOf(foodItem);
  if (idx >= 0) {
    meals[mealType].splice(idx, 1);
  } else {
    meals[mealType].push(foodItem);
  }
  saveData();
}

// === JSON 내보내기 / 가져오기 ===
function exportToJSON() {
  saveDailySnapshot(todayKey());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const d = new Date();
  a.download = `planner_backup_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported.sections) {
          reject(new Error('올바른 플래너 데이터가 아닙니다.'));
          return;
        }
        data = imported;
        if (!data.memos) data.memos = {};
        if (!data.mealPlans) data.mealPlans = {};
        if (!data.completions) data.completions = {};
        if (!data.dailyRecords) data.dailyRecords = {};
        if (!data.mealTimes) data.mealTimes = {};
        if (!data.weights) data.weights = {};
        if (!data.todos) data.todos = {};
        saveData();
        resolve();
      } catch (err) {
        reject(new Error('JSON 파일을 읽을 수 없습니다.'));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsText(file);
  });
}

// === 식단 시간 관리 ===
function getMealTime(dateKey, mealType) {
  if (!data.mealTimes[dateKey]) return '';
  return data.mealTimes[dateKey][mealType] || '';
}

function saveMealTime(dateKey, mealType, time) {
  if (!data.mealTimes[dateKey]) data.mealTimes[dateKey] = {};
  data.mealTimes[dateKey][mealType] = time;
  saveData();
}

// === 몸무게 관리 ===
function getWeight(dateKey) {
  return data.weights[dateKey] || '';
}

function saveWeight(dateKey, value) {
  if (value === '' || value === null) {
    delete data.weights[dateKey];
  } else {
    data.weights[dateKey] = parseFloat(value);
  }
  saveData();
}

function getTargetWeight() {
  return data.targetWeight || '';
}

function saveTargetWeightData(value) {
  if (value === '' || value === null) {
    delete data.targetWeight;
  } else {
    data.targetWeight = parseFloat(value);
  }
  saveData();
}

// === 섹션별 날짜 범위 통계 (차트용) ===
function getSectionStatsForDateRange(sectionTitle, sectionColor, endDateKey, days) {
  if (!days) days = 7;
  const endDate = parseDateKey(endDateKey);
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const dk = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    const dateLabel = `${d.getMonth()+1}/${d.getDate()}`;

    const sections = getSectionsForDate(dk);
    const matched = sections.find(s => s.title === sectionTitle && s.color === sectionColor);

    if (!matched) {
      result.push({ dateKey: dk, dateLabel: dateLabel, itemCount: 0, doneCount: 0, pct: 0, active: false });
      continue;
    }

    const items = getItemsForDate(matched, dk);
    let doneCount = 0;
    items.forEach(item => { if (isCompleted(dk, item.id)) doneCount++; });

    result.push({
      dateKey: dk,
      dateLabel: dateLabel,
      itemCount: items.length,
      doneCount: doneCount,
      pct: items.length > 0 ? Math.round(doneCount / items.length * 100) : 0,
      active: true,
    });
  }
  return result;
}
