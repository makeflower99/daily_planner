const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { db, findUser, findUserById, getUserData, saveUserData } = require('./db');
const { startBackupSchedule } = require('./backup');

const CONFIG = {
  SESSION_MAX_AGE: 7 * 24 * 60 * 60 * 1000,   // 7일
  SESSION_CLEANUP_INTERVAL: 900_000,            // 15분
  BODY_SIZE_LIMIT: '1mb',
  DATA_SIZE_LIMIT: 1024 * 1024,                 // 1MB
  GLOBAL_RATE: { windowMs: 60_000, max: 100 },
  LOGIN_RATE: { windowMs: 15 * 60_000, max: 10 },
};

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = process.env.DB_DIR || '/data';

// === 환경변수 검증 ===
if (!process.env.SESSION_SECRET) {
  console.error('[ERROR] SESSION_SECRET 환경변수가 설정되지 않았습니다.');
  console.error('  .env 파일을 생성하거나 환경변수를 직접 설정하세요.');
  process.exit(1);
}

// === Cloudflare Tunnel 프록시 설정 ===
const IS_BEHIND_PROXY = process.env.TRUST_PROXY === '1';
if (IS_BEHIND_PROXY) app.set('trust proxy', 1);

// === better-sqlite3 세션 스토어 ===
const SqliteStore = require('better-sqlite3-session-store')(session);
const sessionDb = require('better-sqlite3')(path.join(DB_DIR, 'sessions.db'));

// === 보안 헤더 ===
app.use(helmet({
  contentSecurityPolicy: false, // 인라인 스크립트 사용으로 비활성화
}));

// === 요청 로깅 ===
app.use(morgan('short'));

// === 바디 파서 ===
app.use(express.json({ limit: CONFIG.BODY_SIZE_LIMIT }));
app.use(express.text({ type: 'text/plain', limit: CONFIG.BODY_SIZE_LIMIT })); // sendBeacon 대응

// === 세션 ===
app.use(session({
  store: new SqliteStore({ client: sessionDb, expired: { clear: true, intervalMs: CONFIG.SESSION_CLEANUP_INTERVAL } }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // Tunnel 뒤에서도 false가 맞음 (Tunnel→Express는 HTTP)
    maxAge: CONFIG.SESSION_MAX_AGE,
  },
}));

// === 인증 미들웨어 ===
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: '로그인이 필요합니다' });
  return res.redirect('/login.html');
}

// === Rate Limiters ===
const rateLimitBase = { standardHeaders: true, legacyHeaders: false };
const globalLimiter = rateLimit({ ...rateLimitBase, ...CONFIG.GLOBAL_RATE, message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' } });
const loginLimiter = rateLimit({ ...rateLimitBase, ...CONFIG.LOGIN_RATE, message: { error: '너무 많은 로그인 시도입니다. 15분 후 다시 시도하세요.' } });
app.use(globalLimiter);

// ========== 인증 불필요 라우트 ==========

// 로그인 페이지
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/login', (req, res) => res.redirect('/login.html'));

// 로그인 API
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요' });

    const user = findUser(username);
    if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });

    // 세션 고정 공격 방지: 새 세션 ID 발급
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: '세션 오류' });
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.save((err) => {
        if (err) return res.status(500).json({ error: '세션 저장 오류' });
        res.json({ username: user.username });
      });
    });
  } catch (err) {
    console.error('[AUTH] 로그인 오류:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  }
});

// 정적 파일 (css, js) - 인증 불필요
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// ========== 여기부터 인증 필요 ==========
app.use(requireAuth);

// 로그아웃
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// 현재 유저 정보
app.get('/api/auth/me', (req, res) => {
  const user = findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: '유저를 찾을 수 없습니다' });
  res.json({ username: user.username, isAdmin: !!user.is_admin });
});

// === 데이터 API ===

// 데이터 로드
app.get('/api/data', (req, res) => {
  const data = getUserData(req.session.userId);
  res.json(data);
});

// 데이터 저장 핸들러 (PUT + POST 공유 — sendBeacon은 POST로 전송)
function handleDataSave(req, res) {
  let body = req.body;
  // sendBeacon은 text/plain으로 보낼 수 있음
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: '잘못된 데이터' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: '잘못된 데이터' });

  // 기본 스키마 검증
  if (body.sections !== undefined && !Array.isArray(body.sections)) {
    return res.status(400).json({ error: '잘못된 데이터 형식' });
  }

  // 크기 제한 검증 (1MB)
  const json = JSON.stringify(body);
  if (json.length > CONFIG.DATA_SIZE_LIMIT) {
    return res.status(413).json({ error: '데이터가 너무 큽니다' });
  }

  saveUserData(req.session.userId, json);
  res.json({ ok: true });
}

app.put('/api/data', handleDataSave);
app.post('/api/data', handleDataSave); // sendBeacon POST 대응

// 메인 페이지 (인증 필요)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// === Graceful Shutdown ===
function shutdown() {
  console.log('\n서버를 종료합니다...');
  try { db.close(); } catch {}
  try { sessionDb.close(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 서버 시작
const BIND_HOST = process.env.BIND_HOST || (process.env.DB_DIR === '/data' ? '0.0.0.0' : '127.0.0.1');
app.listen(PORT, BIND_HOST, () => {
  console.log(`Daily Planner 서버 실행 중: http://localhost:${PORT}`);
  console.log('(로컬 전용 — 외부 접속은 Cloudflare Tunnel을 사용하세요)');
  if (IS_BEHIND_PROXY) console.log('(프록시 모드 활성화)');
  startBackupSchedule();
});
