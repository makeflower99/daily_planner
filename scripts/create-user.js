const bcrypt = require('bcrypt');
const { findUser, createUser } = require('./db');

const args = process.argv.slice(2);
const isAdmin = args.includes('--admin');
const filtered = args.filter(a => a !== '--admin');

if (filtered.length < 2) {
  console.log('사용법: node create-user.js <아이디> <비밀번호> [--admin]');
  process.exit(1);
}

const [username, password] = filtered;

if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) {
  console.error('아이디는 영문, 숫자, 언더스코어(_)만 사용 가능하며 2~30자여야 합니다.');
  process.exit(1);
}

if (password.length < 4) {
  console.error('비밀번호는 4자 이상이어야 합니다.');
  process.exit(1);
}

if (findUser(username)) {
  console.error(`❌ 이미 존재하는 아이디입니다: ${username}`);
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
const id = createUser(username, hash, isAdmin);
console.log(`✅ 유저 생성 완료: ${username} (ID: ${id}${isAdmin ? ', 관리자' : ''})`);
