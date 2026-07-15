// ========================================
// フロントエンド層(ブラウザで動くJavaScript)
// バックエンドのAPIを fetch で呼び出して、画面を作る。
// ========================================

const taskForm = document.getElementById("task-form");
const taskList = document.getElementById("task-list");
const emptyMessage = document.getElementById("empty-message");
const routineCheckbox = document.getElementById("input-routine");
const intervalLabel = document.getElementById("routine-interval-label");

// 「ルーティンにする」にチェックしたときだけ間隔の選択を表示する
routineCheckbox.addEventListener("change", () => {
  intervalLabel.classList.toggle("hidden", !routineCheckbox.checked);
});

// 読み込んだタスク一覧を覚えておく(リスト表示とカレンダー表示の両方で使う)
let allTasks = [];

// ---------- タスク一覧を読み込んで表示する ----------
async function loadTasks() {
  const res = await fetch("/api/tasks");
  const tasks = await res.json();
  allTasks = tasks;

  taskList.innerHTML = "";
  emptyMessage.classList.toggle("hidden", tasks.length > 0);

  // 親タスク(parent_id が無いもの)を先に並べ、その下にサブタスクを表示する
  const parents = tasks.filter((t) => !t.parent_id);
  for (const parent of parents) {
    taskList.appendChild(createTaskElement(parent, false));
    const subtasks = tasks.filter((t) => t.parent_id === parent.id);
    for (const sub of subtasks) {
      taskList.appendChild(createTaskElement(sub, true));
    }
  }

  // カレンダー表示も最新の状態に描き直す
  renderCalendar();
}

// ---------- タスク1件分のHTML要素を作る ----------
function createTaskElement(task, isSubtask) {
  const li = document.createElement("li");
  li.className = "task-item" + (isSubtask ? " subtask" : "") + (task.done ? " done" : "");
  li.style.borderLeftColor = timeColor(task.estimated_minutes);

  // --- 1行目: チェックボックス・タスク名・バッジ・カウントダウン ---
  const main = document.createElement("div");
  main.className = "task-main";

  // 完了チェックボックス
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = !!task.done;
  checkbox.addEventListener("change", () => toggleTask(task));
  main.appendChild(checkbox);

  // タスク名(所要時間もあわせて表示)
  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title + (task.estimated_minutes ? `(${minutesText(task.estimated_minutes)})` : "");
  main.appendChild(title);

  // ルーティンバッジ
  if (task.routine_interval_days) {
    main.appendChild(makeBadge("🔁 " + intervalText(task.routine_interval_days), "badge-routine"));
  }

  // 優先順位バッジ
  const priorityInfo = { 1: ["高", "badge-high"], 2: ["中", "badge-medium"], 3: ["低", "badge-low"] };
  const [pText, pClass] = priorityInfo[task.priority] || priorityInfo[2];
  main.appendChild(makeBadge(pText, pClass));

  // 締め切りカウントダウン
  if (task.deadline) {
    main.appendChild(makeCountdown(task.deadline, task.deadline_time));
  }

  li.appendChild(main);

  // --- 2行目: 操作ボタン ---
  const buttons = document.createElement("div");
  buttons.className = "task-buttons";

  // サブタスク追加ボタン(親タスクだけに付ける)
  if (!isSubtask) {
    const subBtn = document.createElement("button");
    subBtn.textContent = "+ 小分けタスク";
    subBtn.addEventListener("click", () => showSubtaskForm(li, task.id));
    buttons.appendChild(subBtn);
  }

  // 削除ボタン
  const delBtn = document.createElement("button");
  delBtn.className = "btn-delete";
  delBtn.textContent = "削除";
  delBtn.addEventListener("click", () => deleteTask(task));
  buttons.appendChild(delBtn);

  li.appendChild(buttons);
  return li;
}

// 優先順位などの小さいバッジを作る
function makeBadge(text, className) {
  const span = document.createElement("span");
  span.className = "badge " + className;
  span.textContent = text;
  return span;
}

// 「あと何日」のカウントダウン表示を作る(時刻付きなら時刻も表示する)
function makeCountdown(deadline, deadlineTime) {
  const span = document.createElement("span");
  span.className = "countdown";

  // 今日の0時と締め切り日の差を日数で計算する
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline + "T00:00:00");
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    span.textContent = `⚠️ ${-diffDays}日超過`;
    span.classList.add("overdue");
  } else if (diffDays === 0) {
    // 締め切りが今日の場合、時刻付きなら「もう過ぎたか」まで判定する
    if (deadlineTime && new Date() > new Date(`${deadline}T${deadlineTime}:00`)) {
      span.textContent = `⚠️ ${deadlineTime}を過ぎました`;
      span.classList.add("overdue");
    } else {
      span.textContent = deadlineTime ? `🔥 今日の${deadlineTime}まで!` : "🔥 今日まで!";
      span.classList.add("today");
    }
  } else {
    span.textContent = `あと${diffDays}日` + (deadlineTime ? `(${deadlineTime}まで)` : "");
    if (diffDays <= 3) span.classList.add("soon");
  }
  return span;
}

// 所要時間に応じた色を返す(タスク左端の色分け)
function timeColor(minutes) {
  if (!minutes) return "#a0aec0";      // 未設定: 灰色
  if (minutes <= 30) return "#48bb78"; // 30分以内: 緑
  if (minutes <= 120) return "#ecc94b"; // 1〜2時間: 黄
  return "#e53e3e";                    // 2時間超: 赤
}

// 所要時間を「30分」「2時間」のような表示にする
function minutesText(minutes) {
  if (minutes < 60) return `${minutes}分`;
  if (minutes >= 240) return "4時間以上";
  return `${minutes / 60}時間`;
}

// ルーティンの間隔を文字にする
function intervalText(days) {
  if (days === 1) return "毎日";
  if (days === 7) return "毎週";
  if (days === 30) return "毎月";
  return `${days}日ごと`;
}

// ---------- タスクを追加する ----------
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault(); // ページが再読み込みされるのを防ぐ

  const deadline = document.getElementById("input-deadline").value || null;
  const deadlineTime = document.getElementById("input-deadline-time").value || null;

  // 時刻だけ入力して日にちが空、はダメ(いつの13:00かわからないため)
  if (deadlineTime && !deadline) {
    alert("時刻だけの締め切りは設定できません。日にちも選んでください。");
    return;
  }

  const body = {
    title: document.getElementById("input-title").value,
    deadline: deadline,
    deadline_time: deadlineTime,
    priority: Number(document.getElementById("input-priority").value),
    estimated_minutes: Number(document.getElementById("input-minutes").value) || null,
    routine_interval_days: routineCheckbox.checked
      ? Number(document.getElementById("input-interval").value)
      : null,
  };

  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    taskForm.reset();
    intervalLabel.classList.add("hidden");
    loadTasks();
  } else {
    const data = await res.json();
    alert(data.error || "追加に失敗しました");
  }
});

// ---------- 完了/未完了を切り替える ----------
async function toggleTask(task) {
  const res = await fetch(`/api/tasks/${task.id}/toggle`, { method: "PUT" });
  const data = await res.json();

  // ルーティンタスクを完了すると、次回分が自動で追加される
  if (data.nextTask) {
    alert(`ルーティンなので次回分を自動で追加しました:\n「${data.nextTask.title}」(締め切り: ${data.nextTask.deadline})`);
  }
  loadTasks();
}

// ---------- タスクを削除する ----------
async function deleteTask(task) {
  if (!confirm(`「${task.title}」を削除しますか?\n(小分けタスクも一緒に消えます)`)) return;
  await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
  loadTasks();
}

// ---------- サブタスク追加フォームを表示/非表示する ----------
function showSubtaskForm(parentLi, parentId) {
  // すでにフォームが開いていたら閉じる(ボタンをもう一度押すとしまえる)
  const existingForm = parentLi.querySelector(".subtask-form");
  if (existingForm) {
    existingForm.remove();
    return;
  }

  const form = document.createElement("form");
  form.className = "subtask-form";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "小分けタスク名を入力";
  form.appendChild(input);

  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = "追加";
  form.appendChild(btn);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.value, parent_id: parentId }),
    });
    loadTasks();
  });

  parentLi.appendChild(form);
  input.focus();
}

// ========================================
// カレンダー表示
// ========================================
const listView = document.getElementById("list-view");
const calendarView = document.getElementById("calendar-view");
const btnListView = document.getElementById("btn-list-view");
const btnCalendarView = document.getElementById("btn-calendar-view");
const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");

// 今どの月を表示しているか(最初は今月)
const now = new Date();
let calYear = now.getFullYear();
let calMonth = now.getMonth(); // 0=1月, 11=12月

// クリックで選択中の日付 (YYYY-MM-DD)。何も選んでいないときは null
let selectedDate = null;

// ---------- リスト/カレンダーの切り替え ----------
btnListView.addEventListener("click", () => switchView("list"));
btnCalendarView.addEventListener("click", () => switchView("calendar"));

function switchView(view) {
  const isCalendar = view === "calendar";
  listView.classList.toggle("hidden", isCalendar);
  calendarView.classList.toggle("hidden", !isCalendar);
  btnListView.classList.toggle("active", !isCalendar);
  btnCalendarView.classList.toggle("active", isCalendar);
}

// ---------- 前の月・次の月ボタン ----------
document.getElementById("btn-prev-month").addEventListener("click", () => moveMonth(-1));
document.getElementById("btn-next-month").addEventListener("click", () => moveMonth(1));

function moveMonth(diff) {
  calMonth += diff;
  // 12月の次は翌年1月、1月の前は前年12月になるように調整する
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

// ---------- カレンダーを描画する ----------
function renderCalendar() {
  calendarTitle.textContent = `${calYear}年${calMonth + 1}月`;
  calendarGrid.innerHTML = "";

  // 曜日の見出し(日〜土)
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  weekdays.forEach((day, i) => {
    const cell = document.createElement("div");
    cell.className = "cal-weekday";
    if (i === 0) cell.classList.add("cal-sunday");
    if (i === 6) cell.classList.add("cal-saturday");
    cell.textContent = day;
    calendarGrid.appendChild(cell);
  });

  const firstWeekday = new Date(calYear, calMonth, 1).getDay(); // 1日の曜日
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate(); // その月の日数

  // 1日より前の空白マス
  for (let i = 0; i < firstWeekday; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-day empty";
    calendarGrid.appendChild(cell);
  }

  // 今日の日付(YYYY-MM-DD)。「今日」のマスを目立たせるのに使う
  const todayStr = dateToString(new Date());

  // 1日〜月末までのマスを作る
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "cal-day";

    const dateStr = dateToString(new Date(calYear, calMonth, day));
    if (dateStr === todayStr) cell.classList.add("today");
    if (dateStr === selectedDate) cell.classList.add("selected");

    // マスをクリックするとその日のタスク一覧を表示する
    cell.addEventListener("click", () => selectDay(dateStr));

    const weekday = (firstWeekday + day - 1) % 7;
    if (weekday === 0) cell.classList.add("cal-sunday");
    if (weekday === 6) cell.classList.add("cal-saturday");

    const number = document.createElement("div");
    number.className = "day-number";
    number.textContent = day;
    cell.appendChild(number);

    // この日が締め切りのタスクをマスの中に表示する
    const dayTasks = allTasks.filter((t) => t.deadline === dateStr);
    for (const task of dayTasks) {
      const chip = document.createElement("span");
      chip.className = "cal-task" + (task.done ? " done" : "");
      chip.style.background = timeColor(task.estimated_minutes);
      // 時刻付きの締め切りなら「13:00 タスク名」のように表示する
      chip.textContent = (task.deadline_time ? task.deadline_time + " " : "") + task.title;
      chip.title = chip.textContent; // マウスを乗せると全文が見える
      cell.appendChild(chip);
    }

    calendarGrid.appendChild(cell);
  }

  // 選択中の日のタスク一覧も最新の状態に描き直す
  renderDayPanel();
}

// ---------- クリックした日のタスク一覧 ----------
const dayPanel = document.getElementById("day-panel");
const dayPanelTitle = document.getElementById("day-panel-title");
const dayTaskList = document.getElementById("day-task-list");
const dayPanelEmpty = document.getElementById("day-panel-empty");

// 日付マスをクリックしたときの処理
function selectDay(dateStr) {
  // 同じ日をもう一度クリックしたら選択を解除して一覧をしまう
  selectedDate = selectedDate === dateStr ? null : dateStr;
  renderCalendar();
}

// 選択中の日のタスク一覧を表示する
function renderDayPanel() {
  if (!selectedDate) {
    dayPanel.classList.add("hidden");
    return;
  }
  dayPanel.classList.remove("hidden");

  // "2026-07-20" → 「7月20日のタスク」のような見出しにする
  const [, month, day] = selectedDate.split("-");
  dayPanelTitle.textContent = `${Number(month)}月${Number(day)}日のタスク`;

  // その日が締め切りのタスクを、リスト表示と同じ形式で表示する
  const dayTasks = allTasks.filter((t) => t.deadline === selectedDate);
  dayTaskList.innerHTML = "";
  dayPanelEmpty.classList.toggle("hidden", dayTasks.length > 0);
  for (const task of dayTasks) {
    dayTaskList.appendChild(createTaskElement(task, false));
  }
}

// Date を "YYYY-MM-DD" の文字列にする
function dateToString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ページを開いたら最初に一覧を読み込む
loadTasks();
