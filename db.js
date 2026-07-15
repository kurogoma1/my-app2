// ========================================
// データベース層(SQLite)
// tasks.db というファイルにデータを保存する。
// Node.js 標準の node:sqlite を使うので、追加インストールは不要。
// ========================================
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

// データベースファイルを開く(なければ自動で作られる)
const db = new DatabaseSync(path.join(__dirname, "tasks.db"));

// タスクを保存するテーブルを作る(すでにあれば何もしない)
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    title                 TEXT    NOT NULL,           -- タスク名
    deadline              TEXT,                       -- 締め切り (YYYY-MM-DD)
    priority              INTEGER NOT NULL DEFAULT 2, -- 優先順位 1=高 2=中 3=低
    estimated_minutes     INTEGER,                    -- 予想所要時間(分) 色分けに使う
    parent_id             INTEGER,                    -- 親タスクのid(サブタスクのとき)
    routine_interval_days INTEGER,                    -- ルーティンの間隔(日) NULLなら通常タスク
    done                  INTEGER NOT NULL DEFAULT 0, -- 完了フラグ 0=未完了 1=完了
    created_at            TEXT    DEFAULT (datetime('now', 'localtime'))
  )
`);

// 締め切り時刻の列(deadline_time)がまだ無ければ追加する
// ※すでに作られた tasks.db にも列を追加できるようにするための処理
const columns = db.prepare("PRAGMA table_info(tasks)").all();
if (!columns.some((col) => col.name === "deadline_time")) {
  db.exec("ALTER TABLE tasks ADD COLUMN deadline_time TEXT"); // 締め切り時刻 (HH:MM) 未設定ならNULL
}

module.exports = db;
