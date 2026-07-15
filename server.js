// ========================================
// バックエンド層(APIサーバー)
// Express でフロントエンドからのリクエストを受け取り、
// データベース(db.js)を読み書きして結果を返す。
// ========================================
const express = require("express");
const os = require("os");
const db = require("./db");

const app = express();
const PORT = 3000;

app.use(express.json()); // JSON形式のリクエストを受け取れるようにする

// public フォルダの中身(画面)をそのまま配信する
// ※ Cache-Control: no-store を付けて、ブラウザに古いファイルを
//   キャッシュ(一時保存)させない。開発中の「修正したのに反映されない」を防ぐため
app.use(
  express.static("public", {
    setHeaders: (res) => res.set("Cache-Control", "no-store"),
  })
);

// ---------- タスク一覧を返す ----------
// GET /api/tasks
app.get("/api/tasks", (req, res) => {
  const tasks = db
    // 締め切りが近い順に並べる。同じ日なら時刻が早い順(時刻なしはその日の最後扱い)、
    // それも同じなら優先順位の高い順
    .prepare(`
      SELECT * FROM tasks
      ORDER BY deadline IS NULL, deadline ASC,
               COALESCE(deadline_time, '99:99') ASC,
               priority ASC
    `)
    .all();
  res.json(tasks);
});

// ---------- タスクを追加する ----------
// POST /api/tasks
app.post("/api/tasks", (req, res) => {
  const { title, deadline, deadline_time, priority, estimated_minutes, parent_id, routine_interval_days } = req.body;

  // タスク名が空のときはエラーを返す
  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "タスク名を入力してください" });
  }

  const result = db
    .prepare(`
      INSERT INTO tasks (title, deadline, deadline_time, priority, estimated_minutes, parent_id, routine_interval_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      title.trim(),
      deadline || null,
      deadline_time || null, // 時刻は未設定でもOK(日にちだけの締め切り)
      priority || 2,
      estimated_minutes || null,
      parent_id || null,
      routine_interval_days || null
    );

  const newTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(newTask);
});

// ---------- タスクの完了/未完了を切り替える ----------
// PUT /api/tasks/:id/toggle
app.put("/api/tasks/:id/toggle", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "タスクが見つかりません" });
  }

  const newDone = task.done ? 0 : 1;
  db.prepare("UPDATE tasks SET done = ? WHERE id = ?").run(newDone, task.id);

  // ルーティンタスクを「完了」にしたときは、次回分を自動で追加する
  let nextTask = null;
  if (newDone === 1 && task.routine_interval_days) {
    const nextDeadline = addDays(task.deadline, task.routine_interval_days);
    const result = db
      .prepare(`
        INSERT INTO tasks (title, deadline, deadline_time, priority, estimated_minutes, routine_interval_days)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(task.title, nextDeadline, task.deadline_time, task.priority, task.estimated_minutes, task.routine_interval_days);
    nextTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid);
  }

  res.json({ done: newDone, nextTask });
});

// ---------- タスクを削除する ----------
// DELETE /api/tasks/:id
app.delete("/api/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "タスクが見つかりません" });
  }

  // 親タスクを消すときは、そのサブタスクも一緒に消す
  db.prepare("DELETE FROM tasks WHERE id = ? OR parent_id = ?").run(task.id, task.id);
  res.json({ deleted: true });
});

// 日付文字列(YYYY-MM-DD)に日数を足すヘルパー関数
// 締め切りが未設定のルーティンは「今日+間隔」を次の締め切りにする
function addDays(dateStr, days) {
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

// サーバーを起動する(0.0.0.0 = 同じWi-Fi内の他のデバイスからもアクセス可能)
app.listen(PORT, "0.0.0.0", () => {
  console.log("タスク管理アプリを起動しました!");
  console.log(`  このPCから:      http://localhost:${PORT}`);
  // 他のデバイス用に、このPCのIPアドレスも表示する
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`  他のデバイスから: http://${net.address}:${PORT}`);
      }
    }
  }
});
