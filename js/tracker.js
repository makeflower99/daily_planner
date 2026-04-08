// ===== 일일 기록 (계획 vs 완료 비교) 모듈 =====

let trackerDate = null;
let chartDays = 7;
let chartMode = {};  // secTitle → 'items' | 'achievement'

function initTracker() {
  trackerDate = todayKey();
}

function setChartDays(days) {
  chartDays = days;
  renderTracker();
}

function changeTrackerDate(dir) {
  const parts = trackerDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + dir);
  trackerDate = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  renderTracker();
}

// ===== 통계 데이터 수집 =====
function buildTrackerStats(dateKey) {
  const sections = getSectionsForDate(dateKey);
  let checkTotal = 0, checkDone = 0;
  const checklistRows = [];

  sections.forEach(sec => {
    getItemsForDate(sec, dateKey).forEach(item => {
      checkTotal++;
      const isDone = isCompleted(dateKey, item.id);
      if (isDone) checkDone++;
      checklistRows.push({ section: sec.title, color: sec.color, secId: sec.id, item, isDone });
    });
  });

  // 과거 날짜: dailyRecords 스냅샷도 확인
  if (sections.length === 0 && dateKey !== todayKey()) {
    const record = getDailyRecord(dateKey);
    if (record && record.checklist) {
      Object.keys(record.checklist).forEach(id => {
        const r = record.checklist[id];
        checkTotal++;
        if (r.done) checkDone++;
        checklistRows.push({
          section: r.section,
          color: r.color || '#7C5CFC',
          item: { id, emoji: r.emoji, label: r.label },
          isDone: r.done,
          archived: true,
        });
      });
    }
  }

  // 식단 데이터
  const mealPlan = getMealPlan(dateKey);
  const mealActual = getMealActual(dateKey);
  let mealTotal = 0, mealDone = 0;
  MEAL_TYPES.forEach(mt => {
    const planned = mealPlan[mt.key] || [];
    const actual = mealActual[mt.key] || [];
    mealTotal += planned.length;
    mealDone += planned.filter(f => actual.includes(f)).length;
  });

  const allTotal = checkTotal + mealTotal;
  const allDone = checkDone + mealDone;
  const allPct = allTotal > 0 ? Math.round(allDone / allTotal * 100) : 0;
  const checkPct = checkTotal > 0 ? Math.round(checkDone / checkTotal * 100) : 0;
  const mealPct = mealTotal > 0 ? Math.round(mealDone / mealTotal * 100) : 0;

  let hasMealData = false;
  MEAL_TYPES.forEach(mt => { if ((mealPlan[mt.key] || []).length > 0) hasMealData = true; });

  const html = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-val" style="color:var(--accent)">${allPct}%</div><div class="stat-label">전체 달성률</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--accent2)">${checkPct}%</div><div class="stat-label">루틴 달성률</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--accent3)">${mealPct}%</div><div class="stat-label">식단 달성률</div></div>
    </div>
  `;

  return { html, checklistRows, mealPlan, mealActual, hasMealData };
}

// ===== 체크리스트 비교 테이블 =====
function buildChecklistTable(checklistRows, dateKey) {
  if (checklistRows.length === 0) return '';

  let html = `<div class="tracker-section-title">✅ 체크리스트</div>`;
  html += `<table class="tracker-table"><thead><tr>
    <th>카테고리</th><th>항목</th><th>계획</th><th>실행</th><th>상태</th>
  </tr></thead><tbody>`;

  checklistRows.forEach(row => {
    const canToggle = !row.archived ? `onclick="trackerToggleCheck('${dateKey}','${row.item.id}')"` : '';
    const checkedStyle = row.isDone ? `background:${row.color};border-color:${row.color}` : '';
    html += `<tr>
      <td style="font-size:12px"><span class="section-color-dot" style="background:${row.color};margin-right:6px"></span><span style="color:${row.color}">${row.section}</span></td>
      <td>${row.item.emoji} ${row.item.label}</td>
      <td style="text-align:center;color:${row.color}">✓</td>
      <td style="text-align:center">
        <button class="tracker-check ${row.isDone ? 'checked' : ''}" style="${checkedStyle}" ${canToggle}>${CHECK_SVG_SM}</button>
      </td>
      <td style="text-align:center" class="${row.isDone ? 'status-done' : 'status-miss'}">${row.isDone ? '✅' : '❌'}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

// ===== 식단 비교 테이블 =====
function buildMealTable(mealPlan, mealActual, dateKey) {
  let hasMealData = false;
  MEAL_TYPES.forEach(mt => { if ((mealPlan[mt.key] || []).length > 0) hasMealData = true; });
  if (!hasMealData) return '';

  let html = `<div class="tracker-section-title meal-title">🍽️ 식단</div>`;
  html += `<table class="tracker-table tracker-meal"><thead><tr>
    <th>끼니</th><th>계획한 식단</th><th>실행</th><th>상태</th>
  </tr></thead><tbody>`;

  MEAL_TYPES.forEach(mt => {
    const planned = mealPlan[mt.key] || [];
    const actual = mealActual[mt.key] || [];
    planned.forEach(food => {
      const isDone = actual.includes(food);
      html += `<tr>
        <td style="color:var(--accent3);font-size:12px;font-weight:500">${mt.emoji} ${mt.label}</td>
        <td>${food}</td>
        <td style="text-align:center">
          <button class="tracker-check ${isDone ? 'checked' : ''}" onclick="trackerToggleMeal('${dateKey}','${mt.key}','${food.replace(/'/g, "\\'")}')">${CHECK_SVG_SM}</button>
        </td>
        <td style="text-align:center" class="${isDone ? 'status-done' : 'status-miss'}">${isDone ? '✅' : '❌'}</td>
      </tr>`;
    });
  });
  html += `</tbody></table>`;
  return html;
}

// ===== 할 일 섹션 =====
function buildTrackerTodos(dateKey) {
  const todos = getTodos(dateKey);
  if (todos.length === 0) return '';

  const todoDone = todos.filter(t => t.done).length;
  const todoPct = Math.round(todoDone / todos.length * 100);

  let html = `<div class="tracker-section-title">📝 할 일 <span style="font-size:12px;font-weight:400;color:var(--text3)">${todoDone}/${todos.length} (${todoPct}%)</span></div>`;
  html += `<table class="tracker-table"><thead><tr><th>할 일</th><th style="width:60px;text-align:center">상태</th></tr></thead><tbody>`;
  todos.forEach(todo => {
    const checkedStyle = todo.done ? 'background:var(--accent2);border-color:var(--accent2)' : '';
    html += `<tr>
      <td>${escapeHtml(todo.text)}</td>
      <td style="text-align:center">
        <button class="tracker-check ${todo.done ? 'checked' : ''}" style="${checkedStyle}" onclick="trackerToggleTodo('${dateKey}','${todo.id}')">${CHECK_SVG}</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

// ===== 메인 렌더러 =====
function renderTracker() {
  const d = parseDate(trackerDate);
  const parts = trackerDate.split('-').map(Number);
  document.getElementById('tracker-date-label').textContent =
    `${parts[0]}년 ${MONTH_NAMES[parts[1]-1]} ${parts[2]}일 (${DAY_NAMES[d.getDay()]})`;

  const container = document.getElementById('tracker-content');
  const stats = buildTrackerStats(trackerDate);
  let html = stats.html;

  html += buildChecklistTable(stats.checklistRows, trackerDate);
  html += buildMealTable(stats.mealPlan, stats.mealActual, trackerDate);

  if (stats.checklistRows.length === 0 && !stats.hasMealData) {
    html += `<div class="empty-hint">이 날짜에 기록된 데이터가 없습니다.</div>`;
  }

  html += buildTrackerTodos(trackerDate);

  const evolutions = computeSectionEvolution(trackerDate);
  html += renderEvolutionHTML(evolutions);

  container.innerHTML = html;
}

function computeSectionEvolution(dateKey) {
  const sections = getSectionsForDate(dateKey);
  const targetDate = parseDateKey(dateKey);

  return sections.map(sec => {
    const secStart = sec.startDate || dateKey;

    // 해당 날짜에 활성인 항목만 필터링
    const visibleItems = getItemsForDate(sec, dateKey);
    const itemDates = visibleItems.map(item => ({
      item,
      date: item.addedDate || secStart
    }));

    // 섹션 시작 시점의 항목 수 (startDate 이전 또는 같은 날 추가된 항목)
    const startItems = itemDates.filter(d => parseDateKey(d.date) <= parseDateKey(secStart));

    // 현재(trackerDate) 시점의 항목 수
    const currentItems = itemDates.filter(d => parseDateKey(d.date) <= targetDate);

    let done = 0;
    currentItems.forEach(d => {
      if (isCompleted(dateKey, d.item.id)) done++;
    });

    // 추가 시점별 그룹핑 (타임라인용)
    const dateGroups = {};
    itemDates.forEach(d => {
      if (!dateGroups[d.date]) dateGroups[d.date] = 0;
      dateGroups[d.date]++;
    });
    const timeline = Object.entries(dateGroups)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => parseDateKey(a.date) - parseDateKey(b.date));

    return {
      title: sec.title,
      color: sec.color,
      startCount: startItems.length,
      currentCount: currentItems.length,
      added: currentItems.length - startItems.length,
      achievementPct: currentItems.length > 0 ? Math.round(done / currentItems.length * 100) : 0,
      timeline,
    };
  });
}

function toggleChartMode(secTitle) {
  chartMode[secTitle] = chartMode[secTitle] === 'achievement' ? 'items' : 'achievement';
  renderTracker();
}

function buildItemCountChart(rangeData, color) {
  const W = 320, H = 180;
  const LEFT = 38, RIGHT = 16, TOP = 15, BOTTOM = 30;
  const chartW = W - LEFT - RIGHT;
  const chartH = H - TOP - BOTTOM;
  const days = rangeData.length;
  if (days === 0) return '';

  const barW = Math.floor(chartW / days);
  const maxItems = Math.max(...rangeData.map(d => d.itemCount), 1);
  const itemScale = maxItems <= 3 ? maxItems + 1 : Math.ceil(maxItems * 1.2);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="evo-chart" xmlns="http://www.w3.org/2000/svg">`;

  // 수평 격자선 + Y축 라벨
  [0, itemScale].forEach(val => {
    const y = TOP + chartH - (val / itemScale) * chartH;
    svg += `<line x1="${LEFT}" y1="${y}" x2="${W - RIGHT}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" />`;
    svg += `<text x="${LEFT - 4}" y="${y + 3}" text-anchor="end" fill="var(--text3)" font-size="9">${val}</text>`;
  });
  if (itemScale > 2) {
    const mid = Math.round(itemScale / 2);
    const y = TOP + chartH - (mid / itemScale) * chartH;
    svg += `<line x1="${LEFT}" y1="${y}" x2="${W - RIGHT}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" />`;
    svg += `<text x="${LEFT - 4}" y="${y + 3}" text-anchor="end" fill="var(--text3)" font-size="9">${mid}</text>`;
  }

  // 꺾은선 그래프
  const linePoints = [];
  rangeData.forEach((d, i) => {
    const cx = LEFT + i * barW + barW / 2;
    // X축 라벨
    svg += `<text x="${cx}" y="${TOP + chartH + 14}" text-anchor="middle" fill="var(--text3)" font-size="9">${d.dateLabel}</text>`;
    if (d.active) {
      const cy = TOP + chartH - (d.itemCount / itemScale) * chartH;
      linePoints.push({ x: cx, y: cy, count: d.itemCount });
    }
  });

  if (linePoints.length > 1) {
    const pointsStr = linePoints.map(p => `${p.x},${p.y}`).join(' ');
    svg += `<polyline points="${pointsStr}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
  }
  linePoints.forEach(p => {
    svg += `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" stroke="var(--card)" stroke-width="1.5" />`;
    svg += `<text x="${p.x}" y="${p.y - 7}" text-anchor="middle" fill="${color}" font-size="8" font-weight="600">${p.count}</text>`;
  });

  svg += '</svg>';
  return svg;
}

function buildAchievementChart(rangeData, color) {
  const W = 320, H = 180;
  const LEFT = 38, RIGHT = 16, TOP = 15, BOTTOM = 30;
  const chartW = W - LEFT - RIGHT;
  const chartH = H - TOP - BOTTOM;
  const days = rangeData.length;
  if (days === 0) return '';

  const barW = Math.floor(chartW / days);
  const barInner = Math.max(barW - 8, 6);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="evo-chart" xmlns="http://www.w3.org/2000/svg">`;

  // 수평 격자선 + Y축 라벨
  [0, 50, 100].forEach(pct => {
    const y = TOP + chartH - (pct / 100) * chartH;
    svg += `<line x1="${LEFT}" y1="${y}" x2="${W - RIGHT}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" />`;
    svg += `<text x="${LEFT - 4}" y="${y + 3}" text-anchor="end" fill="var(--text3)" font-size="9">${pct}%</text>`;
  });

  // 막대그래프
  rangeData.forEach((d, i) => {
    const x = LEFT + i * barW + (barW - barInner) / 2;
    const barH = d.active ? (d.pct / 100) * chartH : 0;
    const y = TOP + chartH - barH;

    if (d.active) {
      svg += `<rect x="${x}" y="${y}" width="${barInner}" height="${barH}" rx="3" fill="${color}" opacity="0.65" />`;
      if (d.pct > 0) {
        svg += `<text x="${x + barInner / 2}" y="${y - 3}" text-anchor="middle" fill="var(--text3)" font-size="8">${d.pct}</text>`;
      }
    } else {
      svg += `<rect x="${x}" y="${TOP}" width="${barInner}" height="${chartH}" rx="3" fill="var(--border)" opacity="0.2" />`;
    }

    const labelX = LEFT + i * barW + barW / 2;
    svg += `<text x="${labelX}" y="${TOP + chartH + 14}" text-anchor="middle" fill="var(--text3)" font-size="9">${d.dateLabel}</text>`;
  });

  svg += '</svg>';
  return svg;
}

function generateChartFeedback(rangeData, sectionEvo) {
  const activeDays = rangeData.filter(d => d.active);
  let achievementMsg, countMsg;

  // 달성률 피드백
  if (activeDays.length === 0) {
    achievementMsg = '이 기간에 기록된 데이터가 없어요';
  } else {
    const pcts = activeDays.map(d => d.pct);
    const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    const minPct = Math.min(...pcts);

    if (avg >= 80 && minPct >= 60) {
      achievementMsg = `꾸준히 높은 달성률! 💪`;
    } else if (avg >= 80) {
      achievementMsg = `달성률이 높지만 들쭉날쭉해요. 꾸준함을 목표로! 📊`;
    } else if (avg >= 50) {
      achievementMsg = `절반 이상 달성! 조금만 더 힘내봐요 🔥`;
    } else {
      // 상승 추세 확인 (후반 평균 > 전반 평균)
      const half = Math.floor(pcts.length / 2);
      if (half > 0) {
        const firstHalf = pcts.slice(0, half).reduce((a, b) => a + b, 0) / half;
        const secondHalf = pcts.slice(half).reduce((a, b) => a + b, 0) / (pcts.length - half);
        if (secondHalf > firstHalf + 5) {
          achievementMsg = `점점 좋아지고 있어요! 이 기세를 유지하세요 📈`;
        } else {
          achievementMsg = `작은 것부터 시작해봐요. 하나씩 체크하면 돼요 🌱`;
        }
      } else {
        achievementMsg = `작은 것부터 시작해봐요. 하나씩 체크하면 돼요 🌱`;
      }
    }
  }

  // 개수 변화 피드백
  const added = sectionEvo.added;
  if (added >= 3) {
    countMsg = `새로운 습관 ${added}개 추가! 성장하고 있어요 ✨`;
  } else if (added >= 1) {
    countMsg = `습관이 ${added}개 늘었어요! 꾸준히 관리해봐요 🌿`;
  } else if (added === 0) {
    countMsg = `${sectionEvo.currentCount}개의 습관을 안정적으로 유지 중이에요 👍`;
  } else {
    countMsg = `습관을 정리했네요. 집중력이 올라갈 거예요 🎯`;
  }

  return { achievementMsg, countMsg };
}

function renderEvolutionHTML(evolutions) {
  if (evolutions.length === 0) return '';

  const dayOptions = [7, 14, 30];
  let html = `<div class="evo-header">
    <div class="tracker-section-title">📈 습관 변화</div>
    <div class="evo-period-selector">${dayOptions.map(d =>
      `<button class="evo-period-btn${chartDays === d ? ' active' : ''}" onclick="setChartDays(${d})">${d}일</button>`
    ).join('')}</div>
  </div>`;

  evolutions.forEach(evo => {
    const mode = chartMode[evo.title] || 'items';
    const rangeData = getSectionStatsForDateRange(evo.title, evo.color, trackerDate, chartDays);
    const chartSvg = mode === 'items'
      ? buildItemCountChart(rangeData, evo.color)
      : buildAchievementChart(rangeData, evo.color);
    const feedback = generateChartFeedback(rangeData, evo);
    const chartLabel = mode === 'items' ? '항목 수 변화' : '달성률 변화';
    const nextLabel = mode === 'items' ? '달성률' : '항목 수';

    html += `<div class="evo-card">
      <div class="evo-section-name" style="color:${evo.color}">${escapeHtml(evo.title)}</div>
      <div class="evo-chart-header">
        <span class="evo-chart-label">${chartLabel}</span>
        <button class="evo-chart-toggle" onclick="toggleChartMode('${escapeHtml(evo.title)}')" title="${nextLabel} 보기">▶</button>
      </div>
      <div class="evo-chart-container">${chartSvg}</div>
      <div class="evo-feedback">
        <div class="evo-feedback-achievement">${feedback.achievementMsg}</div>
        <div class="evo-feedback-count">${feedback.countMsg}</div>
      </div>
    </div>`;
  });

  return html;
}

function trackerToggleCheck(dateKey, itemId) {
  toggleComplete(dateKey, itemId);
  saveDailySnapshot(dateKey);
  renderTracker();
  if (dateKey === todayKey()) renderChecklist();
}

function trackerToggleMeal(dateKey, mealType, food) {
  toggleMealActual(dateKey, mealType, food);
  renderTracker();
}

function trackerToggleTodo(dateKey, todoId) {
  toggleTodo(dateKey, todoId);
  renderTracker();
  if (dateKey === todayKey()) renderTodos(dateKey);
}
