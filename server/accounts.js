import { redeemStudentRecovery } from './access-keys.js';
import { randomUUID } from 'node:crypto';
import { transaction } from './db.js';
import { day, digest, displayName, equal, fail, passwordHash, profileName, text, token, verifyPassword } from './security.js';

const ttl = 7 * day;
const cookieName = 'tutan_session';
const accountShape = row => ({
  id: row.owner || row.id, email: row.email, name: displayName(row.name), role: row.role,
  preferences: JSON.parse(row.preferences)
});
export function email(value) {
  const address = text(value, 254, 'E-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw fail(400, 'E-mail inválido.');
  return address;
}

export function accounts(db, secure, onRevoke) {
  const credential = req => {
    const raw = (req.headers.cookie || '').match(/(?:^|;\s*)tutan_session=([\w-]{43})(?:;|$)/)?.[1];
    return raw && digest(raw);
  };
  const setCookie = (res, value, age) => res.setHeader('Set-Cookie',
    `${cookieName}=${value}; Max-Age=${age}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
  );
  const revoke = id => {
    onRevoke(id);
    db.prepare('DELETE FROM sessions WHERE id=?').run(id);
  };
  const revokeAll = owner => {
    for (const { id } of db.prepare('SELECT id FROM sessions WHERE owner=?').all(owner)) revoke(id);
  };
  function start(res, user, current) {
    const raw = token();
    const csrf = token();
    const now = Date.now();
    transaction(db, () => {
      if (current) revoke(current);
      for (const { id } of db.prepare('SELECT id FROM sessions WHERE owner=? ORDER BY created DESC LIMIT -1 OFFSET 9').all(user.id)) revoke(id);
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)').run(digest(raw), user.id, csrf, now, now + ttl, now);
    });
    setCookie(res, raw, ttl / 1000);
    return { user: accountShape(user), csrf };
  }
  function password(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw fail(400, 'Use uma senha de 12 a 128 caracteres.');
    return value;
  }
  return {
    get(req) {
      const id = credential(req);
      if (!id) return null;
      const row = db.prepare('SELECT s.*, u.email, u.name, u.role, u.preferences, u.banned FROM sessions s JOIN users u ON u.id=s.owner WHERE s.id=? AND s.expires>?').get(id, Date.now());
      if (!row || row.banned) return null;
      const now = Date.now();
      if (now - row.seen > 300000) db.prepare('UPDATE sessions SET seen=? WHERE id=?').run(now, id);
      return { id, csrf: row.csrf, expires: row.expires, user: accountShape(row) };
    },
    active(session) {
      return Boolean(db.prepare('SELECT 1 FROM sessions WHERE id=? AND owner=? AND expires>?').get(session.id, session.user.id, Date.now()));
    },
    async register(data, res, current) {
      const address = email(data.email);
      const name = profileName(data.name);
      const hash = await passwordHash(password(data.password));
      const recovery = token();
      const id = randomUUID();
      if (db.prepare('SELECT 1 FROM users WHERE email=?').get(address)) throw fail(409, 'E-mail indisponível.');
      db.prepare('INSERT INTO users(id,email,name,password,recovery,created) VALUES (?,?,?,?,?,?)')
        .run(id, address, name, hash, digest(recovery), Date.now());
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      return { ...start(res, user, current), recovery };
    },
    async loginKey(data, res, current, redeem) {
      const address = email(data.email);
      const existing = db.prepare('SELECT * FROM users WHERE email=?').get(address);
      if (existing) {
        if (existing.banned) throw fail(403, 'Conta suspensa.');
        if (existing.role !== 'student' || !redeemStudentRecovery(db, data.key, existing.id))
          throw fail(401, 'Chave pessoal inválida, expirada ou já utilizada.');
        return start(res, existing, current);
      }
      const name = profileName(data.name || address.split('@')[0]);
      const hash = await passwordHash(password(data.password));
      const id = randomUUID();
      // A chave é consumida e a conta criada na mesma transação.
      const user = transaction(db, () => {
        const role = redeem(data.key);
        if (!role) throw fail(401, 'Chave inválida, revogada ou já utilizada.');
        db.prepare('INSERT INTO users(id,email,name,password,recovery,role,created) VALUES (?,?,?,?,?,?,?)')
          .run(id, address, name, hash, digest(token()), role, Date.now());
        return db.prepare('SELECT * FROM users WHERE id=?').get(id);
      });
      return start(res, user, current);
    },
    async login(data, res, current) {
      const address = email(data.email);
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(address);
      if (user?.banned) throw fail(403, 'Conta suspensa. Entre em contato com a administração.');
      if (!await verifyPassword(password(data.password), user?.password)) throw fail(401, 'E-mail ou senha incorretos.');
      if (db.prepare('SELECT password FROM users WHERE id=?').get(user.id)?.password !== user.password) throw fail(401, 'Entre novamente.');
      return start(res, user, current);
    },
    async recover(data, res, current) {
      const address = email(data.email);
      const code = text(data.recovery, 70, 'Código de recuperação');
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(address);
      const hash = await passwordHash(password(data.password));
      const recovery = token();
      if (!equal(user?.recovery, digest(code))) throw fail(401, 'E-mail ou código de recuperação incorretos.');
      transaction(db, () => {
        const updated = db.prepare('UPDATE users SET password=?, recovery=? WHERE id=? AND recovery=?')
          .run(hash, digest(recovery), user.id, user.recovery);
        if (!updated.changes) throw fail(401, 'Código de recuperação expirado.');
        revokeAll(user.id);
      });
      return { ...start(res, user, current), recovery };
    },
    logout(res, session) { revoke(session.id); setCookie(res, '', 0); },
    sessions(session) {
      return db.prepare('SELECT id,created,seen,expires FROM sessions WHERE owner=? AND expires>? ORDER BY seen DESC')
        .all(session.user.id, Date.now()).map(row => ({ ...row, current: row.id === session.id }));
    },
    revoke(session, id, res) {
      if (!db.prepare('SELECT 1 FROM sessions WHERE owner=? AND id=?').get(session.user.id, id)) throw fail(404, 'Sessão não encontrada.');
      revoke(id);
      if (id === session.id) setCookie(res, '', 0);
    },
    prune() {
      for (const { id } of db.prepare('SELECT id FROM sessions WHERE expires<=?').all(Date.now())) revoke(id);
    },
    profile(session, data) {
      const name = profileName(data.name);
      const { theme, accent, motion, memory, retention, style, goal } = data;
      if (!['dark', 'light', 'amoled'].includes(theme) || !/^#[a-f\d]{6}$/i.test(accent || '') ||
          ![30,90,365,0].includes(retention) || ![true,false].includes(memory) ||
          ![true,false].includes(motion) || !Number.isInteger(goal) || goal < 1 || goal > 30 ||
          !['balanced','short','detailed'].includes(style)) throw fail(400, 'Preferências inválidas.');
      const documents = typeof data.documents === 'boolean' ? data.documents : session.user.preferences.documents !== false;
      const preferences = { ...session.user.preferences, theme, accent, motion, memory, retention, style, goal, documents };
      transaction(db, () => {
        db.prepare('UPDATE users SET name=?, preferences=? WHERE id=?').run(name, JSON.stringify(preferences), session.user.id);
        if (!memory) db.prepare('UPDATE chats SET summary=NULL, summary_at=0 WHERE owner=?').run(session.user.id);
      });
      return { ...session.user, name, preferences };
    },
    newRecovery(session) {
      const recovery = token();
      db.prepare('UPDATE users SET recovery=? WHERE id=?').run(digest(recovery), session.user.id);
      return recovery;
    }
  };
}
