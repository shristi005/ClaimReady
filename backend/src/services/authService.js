// Offline accounts: scrypt-hashed passwords, random session tokens (only their hash is stored),
// idle + absolute session expiry, and a temporary lock after repeated wrong passwords.
const crypto = require('crypto');
const { promisify } = require('util');
const { getDb } = require('../db');
const env = require('../config/env');
const { HttpError } = require('../utils/httpError');

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nowIso = () => new Date().toISOString();
const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();
const DUMMY = { hash: '00'.repeat(KEYLEN), salt: 'dummy-salt' };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, KEYLEN)).toString('hex');
  return { hash, salt };
}

async function verifyPassword(password, hash, salt) {
  const got = await scrypt(password, salt, KEYLEN);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function createSession(userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = inMinutes(env.sessionIdleMinutes);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso()); // tidy old sessions
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(sha256(token), userId, nowIso(), expiresAt);
  return { token, expiresAt };
}

async function register(email, password) {
  const db = getDb();
  const clean = email.trim().toLowerCase();
  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  try {
    db.prepare('INSERT INTO users (id, email, password_hash, password_salt) VALUES (?,?,?,?)').run(id, clean, hash, salt);
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    throw e;
  }
  return createSession(id);
}

async function login(email, password) {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!u) {
    await verifyPassword(password, DUMMY.hash, DUMMY.salt); // same work whether or not the account exists
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  if (u.locked_until && u.locked_until > nowIso()) {
    const mins = Math.max(1, Math.ceil((Date.parse(u.locked_until) - Date.now()) / 60000));
    throw new HttpError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  if (!(await verifyPassword(password, u.password_hash, u.password_salt))) {
    const fails = u.failed_attempts + 1;
    if (fails >= MAX_FAILS) db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(inMinutes(LOCK_MINUTES), u.id);
    else db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(fails, u.id);
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(u.id);
  return createSession(u.id);
}

// Returns { user, membership } or null. Slides the idle expiry, never past the absolute limit.
function getSession(token) {
  if (!token || token.length > 200) return null;
  const db = getDb();
  const h = sha256(token);
  const s = db.prepare('SELECT s.*, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(h);
  if (!s) return null;
  const now = Date.now();
  const hardLimit = Date.parse(s.created_at) + env.sessionMaxHours * 3600000;
  if (Date.parse(s.expires_at) < now || hardLimit < now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(h);
    return null;
  }
  const slid = new Date(Math.min(now + env.sessionIdleMinutes * 60000, hardLimit)).toISOString();
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(slid, h);
  const m = db.prepare(
    'SELECT m.org_id, m.role, m.full_name, o.name AS org_name FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ?'
  ).get(s.user_id);
  return { user: { id: s.user_id, email: s.email }, membership: m || null };
}

const destroySession = (token) => getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));

function destroyUserSessions(userId, exceptToken = null) {
  const keep = exceptToken ? sha256(exceptToken) : '';
  getDb().prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, keep);
}

async function changePassword(userId, current, newPassword, currentToken) {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u || !(await verifyPassword(current, u.password_hash, u.password_salt))) {
    throw new HttpError(400, 'Your current password is incorrect.');
  }
  const { hash, salt } = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, userId);
  destroyUserSessions(userId, currentToken); // sign out every other device
}

// Offline replacement for "reset by email": an admin sets a temporary password.
async function adminSetPassword(userId, newPassword) {
  const { hash, salt } = await hashPassword(newPassword);
  getDb().prepare('UPDATE users SET password_hash = ?, password_salt = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(hash, salt, userId);
  destroyUserSessions(userId);
}

module.exports = { register, login, getSession, destroySession, destroyUserSessions, changePassword, adminSetPassword, hashPassword, verifyPassword };
