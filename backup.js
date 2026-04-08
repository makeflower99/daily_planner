const path = require('path');
const fs = require('fs');
const { db } = require('./db');

const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 6시간
const MAX_BACKUPS = 7;

// 백업 디렉토리 생성
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}_${h}-${min}`;
}

function cleanOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('planner_') && f.endsWith('.db'))
    .sort()
    .reverse();

  // 최근 MAX_BACKUPS개만 유지
  for (let i = MAX_BACKUPS; i < files.length; i++) {
    const filePath = path.join(BACKUP_DIR, files[i]);
    fs.unlinkSync(filePath);
    console.log(`[BACKUP] 오래된 백업 삭제: ${files[i]}`);
  }
}

function runBackup() {
  const backupPath = path.join(BACKUP_DIR, `planner_${getTimestamp()}.db`);
  try {
    db.backup(backupPath).then(() => {
      console.log(`[BACKUP] 백업 완료: ${backupPath}`);
      cleanOldBackups();
    }).catch(err => {
      console.error('[BACKUP] 백업 실패:', err.message);
    });
  } catch (err) {
    console.error('[BACKUP] 백업 실패:', err.message);
  }
}

function startBackupSchedule() {
  console.log(`[BACKUP] 자동 백업 시작 (${BACKUP_INTERVAL / 3600000}시간 간격, 최대 ${MAX_BACKUPS}개 보존)`);
  // 서버 시작 직후 1회 백업
  runBackup();
  // 이후 주기적 백업
  setInterval(runBackup, BACKUP_INTERVAL);
}

module.exports = { startBackupSchedule };
