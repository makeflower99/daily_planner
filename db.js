const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// DB 경로: OneDrive 외부에 저장 (동기화 충돌 방지)
const DB_DIR = process.env.DB_DIR || '/data';
const DB_PATH = path.join(DB_DIR, 'planner.db');

// 디렉토리 생성
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL 모드: 읽기/쓰기 동시성 향상
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_data (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// 유저 조회
function findUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findUserById(id) {
  return db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(id);
}

// 유저 생성 (트랜잭션으로 원자성 보장)
const createUser = db.transaction((username, passwordHash, isAdmin = false) => {
  const result = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)').run(username, passwordHash, isAdmin ? 1 : 0);
  db.prepare('INSERT INTO user_data (user_id, data) VALUES (?, ?)').run(result.lastInsertRowid, '{}');
  return result.lastInsertRowid;
});

// 유저 데이터 로드 (corrupt JSON 방어)
function getUserData(userId) {
  const row = db.prepare('SELECT data FROM user_data WHERE user_id = ?').get(userId);
  if (!row) return {};
  try {
    return JSON.parse(row.data);
  } catch (e) {
    console.error(`[DB] 유저 ${userId} 데이터 파싱 실패 (빈 데이터 반환):`, e.message);
    return {};
  }
}

// 유저 데이터 저장
function saveUserData(userId, data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  db.prepare(
    'INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(user_id) DO UPDATE SET data = ?, updated_at = datetime(\'now\')'
  ).run(userId, json, json);
}

module.exports = { db, findUser, findUserById, createUser, getUserData, saveUserData };
