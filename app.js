/* =========================================================
   팀 업무 대시보드
   - 데이터: localStorage (키: team-tasks-v1, team-meetings-v1, team-memos-v1)
   - 업무 구조: { id, title, assignee, status, startDate(YYYY-MM-DD), dueDate(YYYY-MM-DD), memo,
                 planWeek(월요일 YYYY-MM-DD, 드래그로 지정한 주차 — 없으면 착수일 기준), createdAt, updatedAt }
   - 미팅 구조: { id, title, date(YYYY-MM-DD), time(HH:MM 또는 ''), attendees, location, createdAt, updatedAt }
   - 메모 구조: { id, text, category('아이디어'|'논의'|'기타'), createdAt, updatedAt } — 주차와 무관
   - 주차 기준: 월요일 ~ 일요일, 착수일이 속한 주차에 업무가 표시됨 (드래그로 옮기면 planWeek 우선)
     착수한 주가 지나도 미완료이고 마감 전이면 이후 주차에도 계속 표시됨
   ========================================================= */

const STORAGE_KEY = 'team-tasks-v1';
const SEEDED_KEY = 'team-tasks-seeded';
const MEETING_KEY = 'team-meetings-v1';
const MEETING_SEEDED_KEY = 'team-meetings-seeded';
const MEMO_KEY = 'team-memos-v1';
const MEMO_SEEDED_KEY = 'team-memos-seeded';
const MEMO_CATEGORIES = { 아이디어: '💡', 논의: '💬', 기타: '📝' };
const STATUSES = ['예정', '진행중', '완료', '지연'];

const state = {
  tasks: [],
  meetings: [],
  memos: [],
  memoFilter: '',         // '' = 전체
  editingMemoId: null,
  weekOffset: 0,          // 0 = 이번 주, -1 = 지난 주, 1 = 다음 주 ...
  assigneeFilter: '',
  statusFilter: '',
};

/* ---------- 날짜 유틸 (로컬 시간 기준) ---------- */
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() + 6) % 7; // 월요일 = 0
  return addDays(d, -diff);
}

function todayKey() {
  return toKey(new Date());
}

/** 주차의 시작(월)·끝(일) 날짜 키 */
function weekRange(offset) {
  const start = addDays(startOfWeek(new Date()), offset * 7);
  const end = addDays(start, 6);
  return { start, end, startKey: toKey(start), endKey: toKey(end) };
}

/** "2026년 10월 4주차" — 목요일이 속한 달 기준 */
function weekLabel(start) {
  const thursday = addDays(start, 3);
  const weekNo = Math.ceil(thursday.getDate() / 7);
  return `${thursday.getFullYear()}년 ${thursday.getMonth() + 1}월 ${weekNo}주차`;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function formatShort(date) {
  return `${date.getMonth() + 1}.${date.getDate()}(${DAY_NAMES[date.getDay()]})`;
}

function inRange(key, startKey, endKey) {
  return key >= startKey && key <= endKey; // YYYY-MM-DD 문자열은 사전순 비교 가능
}

/* ---------- 저장소 ---------- */
function loadList(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('저장된 데이터를 불러오지 못했습니다.', e);
    return [];
  }
}

function saveList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {
    alert('데이터 저장에 실패했습니다. 브라우저 저장소 설정을 확인해 주세요.');
  }
}

const loadTasks = () => loadList(STORAGE_KEY);
const saveTasks = () => saveList(STORAGE_KEY, state.tasks);
const loadMeetings = () => loadList(MEETING_KEY);
const saveMeetings = () => saveList(MEETING_KEY, state.meetings);
const loadMemos = () => loadList(MEMO_KEY);
const saveMemos = () => saveList(MEMO_KEY, state.memos);

/** 첫 방문 시 사용 예시를 보여주기 위한 샘플 업무 */
function seedIfFirstVisit() {
  try {
    if (localStorage.getItem(SEEDED_KEY) || state.tasks.length) return;
    localStorage.setItem(SEEDED_KEY, '1');
  } catch (e) {
    return;
  }
  const mon = startOfWeek(new Date());
  const day = (n) => toKey(addDays(mon, n));
  const samples = [
    { title: '주간 회의 자료 준비', assignee: '김민지', status: '완료', startDate: day(0), dueDate: day(0), memo: '안건 정리 및 공유 완료' },
    { title: '고객 설문 결과 분석', assignee: '이서준', status: '진행중', startDate: day(0), dueDate: day(3), memo: '응답 120건 중 80건 분류' },
    { title: '신규 서비스 기획안 초안', assignee: '박하은', status: '진행중', startDate: day(1), dueDate: day(4), memo: '' },
    { title: '홈페이지 배너 교체', assignee: '김민지', status: '지연', startDate: day(-3), dueDate: day(2), memo: '디자인 시안 회신 대기 중' },
    { title: '월간 성과 보고서 작성', assignee: '이서준', status: '진행중', startDate: day(2), dueDate: day(11), memo: '이번 주 착수, 다음 주 금요일 마감' },
    { title: '협력사 미팅 일정 조율', assignee: '박하은', status: '예정', startDate: day(7), dueDate: day(10), memo: '' },
    { title: '지난 분기 지표 정리', assignee: '김민지', status: '완료', startDate: day(-7), dueDate: day(-4), memo: '대시보드 반영 완료' },
  ];
  const now = Date.now();
  state.tasks = samples.map((t, i) => ({ id: createId(), createdAt: now + i, updatedAt: now + i, ...t }));
  saveTasks();
}

function seedMeetingsIfFirstVisit() {
  try {
    if (localStorage.getItem(MEETING_SEEDED_KEY) || state.meetings.length) return;
    localStorage.setItem(MEETING_SEEDED_KEY, '1');
  } catch (e) {
    return;
  }
  const mon = startOfWeek(new Date());
  const day = (n) => toKey(addDays(mon, n));
  const samples = [
    { title: '주간 팀 회의', date: day(0), time: '10:00', attendees: '전체', location: '3층 회의실' },
    { title: '협력사 킥오프 미팅', date: day(2), time: '14:00', attendees: '박하은, 이서준', location: 'Zoom' },
    { title: '주간 팀 회의', date: day(7), time: '10:00', attendees: '전체', location: '3층 회의실' },
  ];
  const now = Date.now();
  state.meetings = samples.map((m, i) => ({ id: createId(), createdAt: now + i, updatedAt: now + i, ...m }));
  saveMeetings();
}

function seedMemosIfFirstVisit() {
  try {
    if (localStorage.getItem(MEMO_SEEDED_KEY) || state.memos.length) return;
    localStorage.setItem(MEMO_SEEDED_KEY, '1');
  } catch (e) {
    return;
  }
  const now = Date.now();
  state.memos = [
    { text: '분기 회고를 온라인 설문으로 진행해 보면 어떨까?', category: '아이디어' },
    { text: '다음 주간 회의에서 신규 서비스 일정 재조정 논의', category: '논의' },
  ].map((m, i) => ({ id: createId(), createdAt: now + i, updatedAt: now + i, ...m }));
  saveMemos();
}

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 착수일이 없던 이전 데이터: 등록일(마감일보다 늦으면 마감일)을 착수일로 채움 */
function migrateTasks() {
  let changed = false;
  state.tasks.forEach((t) => {
    if (t.startDate) return;
    const created = toKey(new Date(t.createdAt || Date.now()));
    t.startDate = created < t.dueDate ? created : t.dueDate;
    changed = true;
  });
  if (changed) saveTasks();
}

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const els = {
  weekLabel: $('weekLabel'),
  weekRange: $('weekRange'),
  prevWeekBtn: $('prevWeekBtn'),
  nextWeekBtn: $('nextWeekBtn'),
  thisWeekBtn: $('thisWeekBtn'),
  countProgress: $('countProgress'),
  countDone: $('countDone'),
  countDelayed: $('countDelayed'),
  countNext: $('countNext'),
  nextCardLabel: $('nextCardLabel'),
  countMeeting: $('countMeeting'),
  meetingCardLabel: $('meetingCardLabel'),
  nextMeetingHint: $('nextMeetingHint'),
  scheduleTitle: $('scheduleTitle'),
  weekStrip: $('weekStrip'),
  addMeetingBtn: $('addMeetingBtn'),
  meetingModal: $('meetingModal'),
  meetingModalTitle: $('meetingModalTitle'),
  meetingForm: $('meetingForm'),
  meetingId: $('meetingId'),
  meetingTitle: $('meetingTitle'),
  meetingDate: $('meetingDate'),
  meetingTime: $('meetingTime'),
  meetingAttendees: $('meetingAttendees'),
  meetingLocation: $('meetingLocation'),
  meetingFormError: $('meetingFormError'),
  deleteMeetingBtn: $('deleteMeetingBtn'),
  meetingCancelBtn: $('meetingCancelBtn'),
  memoForm: $('memoForm'),
  memoCategory: $('memoCategory'),
  memoInput: $('memoInput'),
  memoList: $('memoList'),
  memoCount: $('memoCount'),
  memoTabs: document.querySelectorAll('.memo-tab'),
  summaryCards: document.querySelectorAll('.summary-card'),
  assigneeFilter: $('assigneeFilter'),
  statusFilter: $('statusFilter'),
  resetFilterBtn: $('resetFilterBtn'),
  currentBoardTitle: $('currentBoardTitle'),
  currentBoardCount: $('currentBoardCount'),
  currentList: $('currentList'),
  nextBoardTitle: $('nextBoardTitle'),
  nextBoardCount: $('nextBoardCount'),
  nextList: $('nextList'),
  overdueSection: $('overdueSection'),
  overdueCount: $('overdueCount'),
  overdueList: $('overdueList'),
  modal: $('modal'),
  modalTitle: $('modalTitle'),
  form: $('taskForm'),
  taskId: $('taskId'),
  taskTitle: $('taskTitle'),
  taskAssignee: $('taskAssignee'),
  taskStatus: $('taskStatus'),
  taskStart: $('taskStart'),
  taskStartHint: $('taskStartHint'),
  taskDue: $('taskDue'),
  taskMemo: $('taskMemo'),
  formError: $('formError'),
  cancelBtn: $('cancelBtn'),
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- 데이터 조회 ---------- */
function assignees() {
  return [...new Set(state.tasks.map((t) => t.assignee.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko')
  );
}

function matchesAssignee(task) {
  return !state.assigneeFilter || task.assignee === state.assigneeFilter;
}

function matchesFilters(task) {
  return matchesAssignee(task) && (!state.statusFilter || task.status === state.statusFilter);
}

function sortTasks(list) {
  const order = { 지연: 0, 진행중: 1, 예정: 2, 완료: 3 };
  return [...list].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || order[a.status] - order[b.status] || a.createdAt - b.createdAt
  );
}

function sortMeetings(list) {
  // 시간 미정('')은 그날의 맨 뒤로
  return [...list].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99') || a.createdAt - b.createdAt
  );
}

function isOverdue(task) {
  return task.status !== '완료' && task.dueDate < todayKey();
}

/** 업무가 분류되는 주차의 월요일 키: 드래그로 지정한 주차 > 착수일이 속한 주차 */
function taskWeekKey(task) {
  return task.planWeek || toKey(startOfWeek(parseKey(task.startDate)));
}

/** 해당 주차 업무: 그 주에 착수했거나, 이전에 착수해 아직 진행 중(미완료·마감 전)인 업무 */
function inWeekBoard(task, range) {
  const wk = taskWeekKey(task);
  if (wk === range.startKey) return true;
  return wk < range.startKey && task.status !== '완료' && task.dueDate >= range.startKey;
}

/* ---------- 렌더링 ---------- */
function render() {
  const cur = weekRange(state.weekOffset);
  const next = weekRange(state.weekOffset + 1);

  // 주차 정보
  els.weekLabel.textContent = weekLabel(cur.start);
  els.weekRange.textContent = `${formatShort(cur.start)} ~ ${formatShort(cur.end)}`;
  els.thisWeekBtn.hidden = state.weekOffset === 0; // 다른 주차를 볼 때만 표시

  const boardPrefix =
    state.weekOffset === 0 ? '이번 주' : state.weekOffset === -1 ? '지난 주' : weekLabel(cur.start);
  els.currentBoardTitle.textContent = `${boardPrefix} 업무`;
  els.nextBoardTitle.textContent = state.weekOffset === 0 ? '차주 예정 업무' : `${weekLabel(next.start)} 예정 업무`;
  els.scheduleTitle.textContent = `${boardPrefix} 일정`;

  // 주차별 업무 (담당자 필터만 적용 → 요약 카드용)
  // 이번 주: 착수 주차 기준 / 차주 예정: 다음 주에 착수할 업무만
  const weekTasks = state.tasks.filter((t) => inWeekBoard(t, cur) && matchesAssignee(t));
  const nextTasks = state.tasks.filter((t) => taskWeekKey(t) === next.startKey && matchesAssignee(t));

  // 요약 카드
  els.countProgress.textContent = weekTasks.filter((t) => t.status === '진행중').length;
  els.countDone.textContent = weekTasks.filter((t) => t.status === '완료').length;
  els.countDelayed.textContent = weekTasks.filter((t) => t.status === '지연').length;
  els.countNext.textContent = nextTasks.length;
  els.nextCardLabel.textContent = state.weekOffset === 0 ? '차주 예정' : '다음 주 예정';
  renderMeetingCard(cur, boardPrefix);
  els.summaryCards.forEach((card) => {
    const f = card.dataset.filter;
    card.classList.toggle('active', !!f && f === state.statusFilter);
  });

  // 목록 (상태 필터까지 적용)
  const currentShown = sortTasks(weekTasks.filter(matchesFilters));
  const nextShown = sortTasks(nextTasks.filter(matchesFilters));
  renderList(els.currentList, currentShown, '이 주차에 해당하는 업무가 없습니다.');
  renderList(els.nextList, nextShown, '예정된 업무가 없습니다.');
  els.currentBoardCount.textContent = currentShown.length;
  els.nextBoardCount.textContent = nextShown.length;

  // 지난 주차 미완료 업무 (이번 주 보기일 때만)
  const overdue =
    state.weekOffset === 0
      ? sortTasks(state.tasks.filter((t) => t.dueDate < cur.startKey && t.status !== '완료' && matchesFilters(t)))
      : [];
  els.overdueSection.hidden = overdue.length === 0;
  els.overdueCount.textContent = overdue.length;
  renderList(els.overdueList, overdue, '', false);

  // 주간 일정의 마감 표시는 분류와 상관없이 마감일 기준
  const dueThisWeek = state.tasks.filter((t) => inRange(t.dueDate, cur.startKey, cur.endKey) && matchesAssignee(t));
  renderSchedule(cur, dueThisWeek);
  renderMemos();
  renderAssigneeOptions();
}

function renderMeetingCard(cur, boardPrefix) {
  const weekMeetings = sortMeetings(state.meetings.filter((m) => inRange(m.date, cur.startKey, cur.endKey)));
  els.meetingCardLabel.textContent = `${boardPrefix} 미팅`;
  els.countMeeting.textContent = weekMeetings.length;

  // 이번 주를 보고 있으면 '다음 미팅', 다른 주면 그 주의 첫 미팅
  const nowKey = `${todayKey()} ${new Date().toTimeString().slice(0, 5)}`;
  const upcoming =
    state.weekOffset === 0
      ? weekMeetings.find((m) => `${m.date} ${m.time || '23:59'}` >= nowKey)
      : weekMeetings[0];
  if (upcoming) {
    const prefix = state.weekOffset === 0 ? '다음: ' : '';
    els.nextMeetingHint.textContent = `${prefix}${formatShort(parseKey(upcoming.date))} ${upcoming.time || ''} ${upcoming.title}`;
  } else {
    els.nextMeetingHint.textContent = weekMeetings.length ? '이번 주 미팅 종료' : '예정된 미팅 없음';
  }
}

/** 월~일 7칸: 미팅 + 해당 날짜 마감 업무 수 (업무는 담당자 필터 적용) */
function renderSchedule(cur, dueTasksInWeek) {
  const today = todayKey();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(cur.start, i);
    const key = toKey(date);
    const meetings = sortMeetings(state.meetings.filter((m) => m.date === key));
    const dueTasks = dueTasksInWeek.filter((t) => t.dueDate === key);
    const doneCount = dueTasks.filter((t) => t.status === '완료').length;
    const delayed = dueTasks.some((t) => t.status === '지연' || isOverdue(t));

    const classes = ['day'];
    if (key === today) classes.push('is-today');
    if (i >= 5) classes.push('is-weekend');
    if (!meetings.length && !dueTasks.length) classes.push('is-empty');

    const meetingHtml = meetings
      .map((m) => {
        const extra = [m.attendees, m.location].filter(Boolean).join(' · ');
        return `
          <button type="button" class="meeting" data-meeting-id="${escapeHtml(m.id)}" title="클릭하여 수정">
            <span class="meeting-time">📌 ${m.time ? escapeHtml(m.time) : '시간 미정'}</span>
            <span class="meeting-title">${escapeHtml(m.title)}</span>
            ${extra ? `<span class="meeting-extra">${escapeHtml(extra)}</span>` : ''}
          </button>`;
      })
      .join('');

    const dueTitles = escapeHtml(dueTasks.map((t) => `${t.title} (${t.status})`).join('\n'));
    const deadlineHtml = dueTasks.length
      ? `<span class="deadline-chip ${delayed ? 'has-delay' : ''}" title="${dueTitles}">⏰ 마감 ${dueTasks.length}건${
          doneCount ? ` · 완료 ${doneCount}` : ''
        }</span>`
      : '';

    days.push(`
      <li class="${classes.join(' ')}">
        <div class="day-head">
          <span class="day-name">${DAY_NAMES[date.getDay()]}<small>${date.getMonth() + 1}.${date.getDate()}</small>${
            key === today ? ' <small>오늘</small>' : ''
          }</span>
          <button type="button" class="day-add" data-add-date="${key}" aria-label="${formatShort(date)} 미팅 추가" title="미팅 추가">＋</button>
        </div>
        <div class="day-body">${meetingHtml.trim()}</div>
        ${deadlineHtml}
      </li>`);
  }
  els.weekStrip.innerHTML = days.join('');
}

function formatMemoDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderMemos() {
  els.memoCount.textContent = state.memos.length;
  els.memoTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.memoFilter === state.memoFilter));

  // 최신순
  const list = state.memos
    .filter((m) => !state.memoFilter || m.category === state.memoFilter)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!list.length) {
    els.memoList.innerHTML = `<li class="empty">${state.memos.length ? '이 분류에 메모가 없습니다.' : '아직 메모가 없습니다.'}</li>`;
    return;
  }

  els.memoList.innerHTML = list
    .map((m) => {
      const editing = m.id === state.editingMemoId;
      const body = editing
        ? `<input type="text" class="memo-edit" maxlength="200" value="${escapeHtml(m.text)}" aria-label="메모 수정" />`
        : `<p class="memo-text">${MEMO_CATEGORIES[m.category] || '📝'} ${escapeHtml(m.text)}</p>`;
      return `
        <li class="memo memo-${escapeHtml(m.category)}" data-memo-id="${escapeHtml(m.id)}">
          <div class="memo-content">
            ${body}
            <span class="memo-date">${formatMemoDate(m.createdAt)}${m.updatedAt !== m.createdAt ? ' (수정됨)' : ''}</span>
          </div>
          <div class="memo-actions">
            ${editing ? '' : '<button type="button" data-memo-action="edit">수정</button>'}
            <button type="button" class="memo-del" data-memo-action="delete">삭제</button>
          </div>
        </li>`;
    })
    .join('');

  const editInput = els.memoList.querySelector('.memo-edit');
  if (editInput) {
    editInput.focus();
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);
  }
}

function renderList(listEl, tasks, emptyText, draggable = true) {
  if (!tasks.length) {
    listEl.innerHTML = emptyText ? `<li class="empty">${escapeHtml(emptyText)}</li>` : '';
    return;
  }
  listEl.innerHTML = tasks.map((t) => taskTemplate(t, draggable)).join('');
}

function taskTemplate(task, draggable) {
  const due = parseKey(task.dueDate);
  const carried = draggable && taskWeekKey(task) < weekRange(state.weekOffset).startKey;
  const statusOptions = STATUSES.map(
    (s) => `<option value="${s}" ${s === task.status ? 'selected' : ''}>${s}</option>`
  ).join('');
  return `
    <li class="task status-${task.status} ${task.status === '완료' ? 'is-done' : ''}" data-id="${escapeHtml(task.id)}"${
      draggable ? ' draggable="true" title="드래그하여 이번 주 / 차주 예정으로 이동"' : ''
    }>
      <div class="task-top">
        <p class="task-title">${escapeHtml(task.title)}</p>
        <span class="badge">${task.status}</span>
      </div>
      <div class="task-meta">
        <span>👤 ${escapeHtml(task.assignee)}</span>
        <span>🚀 ${formatShort(parseKey(task.startDate))} 착수</span>
        <span>📅 ${formatShort(due)} 마감</span>
        ${carried ? '<span class="badge badge-carried">이전 주 착수</span>' : ''}
        ${isOverdue(task) ? '<span class="badge badge-overdue">기한 초과</span>' : ''}
      </div>
      ${task.memo ? `<p class="task-memo">${escapeHtml(task.memo)}</p>` : ''}
      <div class="task-footer">
        <select data-action="status" aria-label="상태 변경">${statusOptions}</select>
        <div class="task-actions">
          <button type="button" class="btn btn-ghost" data-action="edit">수정</button>
          <button type="button" class="btn btn-ghost btn-danger" data-action="delete">삭제</button>
        </div>
      </div>
    </li>`;
}

function renderAssigneeOptions() {
  const names = assignees();

  // 필터 드롭다운 (선택값 유지)
  if (state.assigneeFilter && !names.includes(state.assigneeFilter)) state.assigneeFilter = '';
  els.assigneeFilter.innerHTML =
    '<option value="">전체</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  els.assigneeFilter.value = state.assigneeFilter;
}

/* ---------- 업무 CRUD ---------- */
/**
 * @param task 수정할 업무 (추가면 null)
 * @param boardOffset 추가할 칸: 0 = 보고 있는 주 칸, 1 = 다음 주(차주 예정) 칸
 */
function openModal(task, boardOffset = 0) {
  els.form.reset();
  els.formError.textContent = '';
  if (task) {
    els.modalTitle.textContent = '업무 수정';
    els.taskId.value = task.id;
    els.taskTitle.value = task.title;
    els.taskAssignee.value = task.assignee;
    els.taskStatus.value = task.status;
    els.taskStart.value = task.startDate;
    els.taskDue.value = task.dueDate;
    els.taskMemo.value = task.memo || '';
  } else {
    const targetOffset = state.weekOffset + boardOffset;
    const boardTitle = (boardOffset ? els.nextBoardTitle : els.currentBoardTitle).textContent;
    els.modalTitle.textContent = `${boardTitle} 추가`;
    els.taskId.value = '';
    els.taskStatus.value = '예정';
    // 착수일: 해당 칸 주차의 월요일 (그 주가 이번 주면 오늘)
    // 마감일: 해당 칸 주차의 금요일 (금요일이 착수일보다 이르면 착수일)
    const { start, startKey, endKey } = weekRange(targetOffset);
    const today = todayKey();
    const startDate = inRange(today, startKey, endKey) ? today : startKey;
    const friday = toKey(addDays(start, 4));
    els.taskStart.value = startDate;
    els.taskDue.value = friday < startDate ? startDate : friday;
  }
  updateStartHint();
  els.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => els.taskTitle.focus(), 0);
}

/** 선택한 착수일 기준으로 어느 칸에 표시되는지 안내 */
function updateStartHint() {
  const value = els.taskStart.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    els.taskStartHint.textContent = '';
    return;
  }
  const viewedStart = weekRange(state.weekOffset).start;
  const diff = Math.round((startOfWeek(parseKey(value)) - viewedStart) / (7 * 24 * 60 * 60 * 1000));
  if (diff === 0) els.taskStartHint.textContent = `→ '${els.currentBoardTitle.textContent}' 칸에 표시됩니다.`;
  else if (diff === 1) els.taskStartHint.textContent = `→ '${els.nextBoardTitle.textContent}' 칸에 표시됩니다.`;
  else els.taskStartHint.textContent = `→ ${weekLabel(startOfWeek(parseKey(value)))} 착수 업무로 표시됩니다.`;
}

function closeModal() {
  els.modal.hidden = true;
  document.body.style.overflow = '';
}

function handleSubmit(e) {
  e.preventDefault();
  const title = els.taskTitle.value.trim();
  const assignee = els.taskAssignee.value.trim();
  const startDate = els.taskStart.value;
  const dueDate = els.taskDue.value;
  const status = els.taskStatus.value;
  const memo = els.taskMemo.value.trim();

  if (!title) return showFormError('업무명을 입력해 주세요.', els.taskTitle);
  if (!assignee) return showFormError('담당자를 입력해 주세요.', els.taskAssignee);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return showFormError('착수일을 선택해 주세요.', els.taskStart);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return showFormError('마감일을 선택해 주세요.', els.taskDue);
  if (dueDate < startDate) return showFormError('마감일은 착수일과 같거나 이후여야 합니다.', els.taskDue);

  const id = els.taskId.value;
  const now = Date.now();
  if (id) {
    const task = state.tasks.find((t) => t.id === id);
    if (task) {
      // 착수일을 바꾸면 드래그로 지정했던 주차는 해제하고 착수일 기준으로 다시 분류
      if (task.startDate !== startDate) delete task.planWeek;
      Object.assign(task, { title, assignee, status, startDate, dueDate, memo, updatedAt: now });
    }
  } else {
    state.tasks.push({ id: createId(), title, assignee, status, startDate, dueDate, memo, createdAt: now, updatedAt: now });
  }
  saveTasks();
  closeModal();
  render();
}

function showFormError(message, field) {
  els.formError.textContent = message;
  field.focus();
}

function deleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (!confirm(`'${task.title}' 업무를 삭제할까요?`)) return;
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
}

function updateStatus(id, status) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task || !STATUSES.includes(status)) return;
  task.status = status;
  task.updatedAt = Date.now();
  saveTasks();
  render();
}

/** 드래그로 업무를 다른 칸(boardOffset 0 = 보고 있는 주, 1 = 차주 예정)으로 이동 */
function moveTaskToBoard(id, boardOffset) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const targetKey = weekRange(state.weekOffset + boardOffset).startKey;
  if (taskWeekKey(task) === targetKey) return;
  // 착수일 주차와 같아지면 지정 해제(자동 분류로 복귀), 아니면 주차 지정
  if (toKey(startOfWeek(parseKey(task.startDate))) === targetKey) delete task.planWeek;
  else task.planWeek = targetKey;
  task.updatedAt = Date.now();
  saveTasks();
  render();
}

/* ---------- 미팅 CRUD ---------- */
function openMeetingModal(meeting, presetDate) {
  els.meetingForm.reset();
  els.meetingFormError.textContent = '';
  if (meeting) {
    els.meetingModalTitle.textContent = '미팅 수정';
    els.meetingId.value = meeting.id;
    els.meetingTitle.value = meeting.title;
    els.meetingDate.value = meeting.date;
    els.meetingTime.value = meeting.time || '';
    els.meetingAttendees.value = meeting.attendees || '';
    els.meetingLocation.value = meeting.location || '';
    els.deleteMeetingBtn.hidden = false;
  } else {
    els.meetingModalTitle.textContent = '미팅 추가';
    els.meetingId.value = '';
    // 날짜 칸의 ＋를 눌렀으면 그 날짜, 아니면 보고 있는 주의 월요일(이번 주라면 오늘)
    els.meetingDate.value = presetDate || (state.weekOffset === 0 ? todayKey() : weekRange(state.weekOffset).startKey);
    els.deleteMeetingBtn.hidden = true;
  }
  els.meetingModal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => els.meetingTitle.focus(), 0);
}

function closeMeetingModal() {
  els.meetingModal.hidden = true;
  document.body.style.overflow = '';
}

function handleMeetingSubmit(e) {
  e.preventDefault();
  const title = els.meetingTitle.value.trim();
  const date = els.meetingDate.value;
  const time = els.meetingTime.value;
  const attendees = els.meetingAttendees.value.trim();
  const location = els.meetingLocation.value.trim();

  const fail = (message, field) => {
    els.meetingFormError.textContent = message;
    field.focus();
  };
  if (!title) return fail('미팅명을 입력해 주세요.', els.meetingTitle);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('날짜를 선택해 주세요.', els.meetingDate);

  const id = els.meetingId.value;
  const now = Date.now();
  if (id) {
    const meeting = state.meetings.find((m) => m.id === id);
    if (meeting) Object.assign(meeting, { title, date, time, attendees, location, updatedAt: now });
  } else {
    state.meetings.push({ id: createId(), title, date, time, attendees, location, createdAt: now, updatedAt: now });
  }
  saveMeetings();
  closeMeetingModal();
  render();
}

function deleteMeeting() {
  const id = els.meetingId.value;
  const meeting = state.meetings.find((m) => m.id === id);
  if (!meeting || !confirm(`'${meeting.title}' 미팅을 삭제할까요?`)) return;
  state.meetings = state.meetings.filter((m) => m.id !== id);
  saveMeetings();
  closeMeetingModal();
  render();
}

/* ---------- 메모 CRUD ---------- */
function addMemo(e) {
  e.preventDefault();
  const text = els.memoInput.value.trim();
  if (!text) return els.memoInput.focus();
  const now = Date.now();
  state.memos.push({ id: createId(), text, category: els.memoCategory.value, createdAt: now, updatedAt: now });
  saveMemos();
  els.memoInput.value = '';
  // 다른 분류 탭을 보고 있었다면 방금 추가한 메모가 보이도록 전환
  if (state.memoFilter && state.memoFilter !== els.memoCategory.value) state.memoFilter = '';
  renderMemos();
  els.memoInput.focus();
}

function commitMemoEdit(id, text) {
  if (state.editingMemoId !== id) return; // Enter 후 blur 등 중복 호출 방지
  state.editingMemoId = null;
  const memo = state.memos.find((m) => m.id === id);
  const trimmed = text.trim();
  if (memo && trimmed && trimmed !== memo.text) {
    memo.text = trimmed;
    memo.updatedAt = Date.now();
    saveMemos();
  }
  renderMemos();
}

function cancelMemoEdit() {
  state.editingMemoId = null;
  renderMemos();
}

function handleMemoAction(e) {
  const target = e.target.closest('[data-memo-action]');
  if (!target) return;
  const id = target.closest('.memo').dataset.memoId;
  const memo = state.memos.find((m) => m.id === id);
  if (!memo) return;

  const action = target.dataset.memoAction;
  if (action === 'edit') {
    state.editingMemoId = id;
    renderMemos();
  } else if (action === 'delete') {
    if (!confirm('이 메모를 삭제할까요?')) return;
    state.memos = state.memos.filter((m) => m.id !== id);
    if (state.editingMemoId === id) state.editingMemoId = null;
    saveMemos();
    renderMemos();
  }
}

/* ---------- 이벤트 ---------- */
function bindEvents() {
  document.querySelectorAll('.board-add').forEach((btn) => {
    btn.addEventListener('click', () => openModal(null, Number(btn.dataset.addOffset)));
  });
  els.taskStart.addEventListener('input', updateStartHint);
  els.taskStart.addEventListener('change', updateStartHint);
  els.cancelBtn.addEventListener('click', closeModal);
  els.form.addEventListener('submit', handleSubmit);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!els.modal.hidden) closeModal();
    if (!els.meetingModal.hidden) closeMeetingModal();
  });

  // 미팅
  els.addMeetingBtn.addEventListener('click', () => openMeetingModal(null));
  els.meetingCancelBtn.addEventListener('click', closeMeetingModal);
  els.meetingForm.addEventListener('submit', handleMeetingSubmit);
  els.deleteMeetingBtn.addEventListener('click', deleteMeeting);
  els.meetingModal.addEventListener('click', (e) => {
    if (e.target === els.meetingModal) closeMeetingModal();
  });
  els.weekStrip.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add-date]');
    if (addBtn) return openMeetingModal(null, addBtn.dataset.addDate);
    const meetingBtn = e.target.closest('[data-meeting-id]');
    if (meetingBtn) openMeetingModal(state.meetings.find((m) => m.id === meetingBtn.dataset.meetingId));
  });

  els.prevWeekBtn.addEventListener('click', () => { state.weekOffset--; render(); });
  els.nextWeekBtn.addEventListener('click', () => { state.weekOffset++; render(); });
  els.thisWeekBtn.addEventListener('click', () => { state.weekOffset = 0; render(); });

  els.assigneeFilter.addEventListener('change', (e) => { state.assigneeFilter = e.target.value; render(); });
  els.statusFilter.addEventListener('change', (e) => { state.statusFilter = e.target.value; render(); });
  els.resetFilterBtn.addEventListener('click', () => {
    state.assigneeFilter = '';
    state.statusFilter = '';
    els.statusFilter.value = '';
    render();
  });

  // 메모장
  els.memoForm.addEventListener('submit', addMemo);
  els.memoList.addEventListener('click', handleMemoAction);
  els.memoList.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('memo-edit')) return;
    const id = e.target.closest('.memo').dataset.memoId;
    if (e.key === 'Enter') {
      e.preventDefault();
      commitMemoEdit(id, e.target.value);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelMemoEdit();
    }
  });
  els.memoList.addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('memo-edit')) return;
    const id = e.target.closest('.memo').dataset.memoId;
    // 같은 메모의 삭제 버튼으로 포커스가 옮겨가면 저장 대신 삭제 처리에 맡김
    const next = e.relatedTarget && e.relatedTarget.closest('.memo');
    if (next && next.dataset.memoId === id && e.relatedTarget.dataset.memoAction === 'delete') return;
    commitMemoEdit(id, e.target.value);
  });
  els.memoTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.memoFilter = tab.dataset.memoFilter;
      renderMemos();
    });
  });

  // 요약 카드 클릭 → 상태 필터 토글 / 차주 예정·미팅 → 해당 영역으로 이동
  els.summaryCards.forEach((card) => {
    card.addEventListener('click', () => {
      if (card.dataset.scroll) {
        $(card.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const f = card.dataset.filter;
      state.statusFilter = state.statusFilter === f ? '' : f;
      els.statusFilter.value = state.statusFilter;
      render();
    });
  });

  // 업무 카드 내 버튼/상태 변경 (이벤트 위임)
  document.querySelectorAll('.task-list').forEach((list) => {
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.closest('.task').dataset.id;
      if (btn.dataset.action === 'edit') openModal(state.tasks.find((t) => t.id === id));
      if (btn.dataset.action === 'delete') deleteTask(id);
    });
    list.addEventListener('change', (e) => {
      if (e.target.dataset.action !== 'status') return;
      updateStatus(e.target.closest('.task').dataset.id, e.target.value);
    });
  });

  // 업무 카드 Drag & Drop: 이번 주 업무 ↔ 차주 예정 업무
  let draggingId = null;
  const dropZones = [
    { list: els.currentList, offset: 0 },
    { list: els.nextList, offset: 1 },
  ];
  const clearDropHighlight = () => dropZones.forEach(({ list }) => list.closest('.board').classList.remove('is-drop-target'));
  dropZones.forEach(({ list, offset }) => {
    const board = list.closest('.board');
    list.addEventListener('dragstart', (e) => {
      const card = e.target.closest && e.target.closest('.task[draggable="true"]');
      if (!card) return;
      draggingId = card.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingId);
      requestAnimationFrame(() => card.classList.add('is-dragging'));
    });
    list.addEventListener('dragend', (e) => {
      draggingId = null;
      if (e.target.classList) e.target.classList.remove('is-dragging');
      clearDropHighlight();
    });
    board.addEventListener('dragover', (e) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      board.classList.add('is-drop-target');
    });
    board.addEventListener('dragleave', (e) => {
      if (!board.contains(e.relatedTarget)) board.classList.remove('is-drop-target');
    });
    board.addEventListener('drop', (e) => {
      if (!draggingId) return;
      e.preventDefault();
      const id = draggingId;
      draggingId = null;
      clearDropHighlight();
      moveTaskToBoard(id, offset);
    });
  });

  // 다른 탭에서 데이터가 바뀌면 동기화
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) state.tasks = loadTasks();
    else if (e.key === MEETING_KEY) state.meetings = loadMeetings();
    else if (e.key === MEMO_KEY) state.memos = loadMemos();
    else return;
    render();
  });
}

/* ---------- 시작 ---------- */
state.tasks = loadTasks();
migrateTasks();
state.meetings = loadMeetings();
state.memos = loadMemos();
seedIfFirstVisit();
seedMeetingsIfFirstVisit();
seedMemosIfFirstVisit();
bindEvents();
render();
