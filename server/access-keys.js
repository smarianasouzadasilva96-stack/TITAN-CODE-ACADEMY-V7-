import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const keyHash = value => scryptSync(value, 'titan-access-v1', 64).toString('hex');
export function initializeKeys(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS access_keys (
    id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, suffix TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student','admin','creator')),
    issued INTEGER NOT NULL, used INTEGER, revoked INTEGER, issued_by TEXT NOT NULL,
    used_by TEXT, reason TEXT NOT NULL DEFAULT ''
  );`);
}
export function issueKey(db, role, issuer) {
  if (!['student','admin','creator'].includes(role)) throw new Error('Papel inválido');
  const key = `TITAN-${role.toUpperCase()}-${randomBytes(24).toString('base64url')}`;
  const id = randomUUID();
  db.prepare('INSERT INTO access_keys (id,hash,suffix,role,issued,issued_by) VALUES (?,?,?,?,?,?)')
    .run(id, keyHash(key), key.slice(-4), role, Date.now(), issuer);
  return { id, key, role };
}
export function redeemKey(db, value, userId) {
  if (typeof value !== 'string' || value.length > 120 || !/^TITAN-(STUDENT|ADMIN|CREATOR)-[\w-]{32}$/.test(value)) return null;
  const hash = keyHash(value);
  const row = db.prepare('SELECT * FROM access_keys WHERE hash=? AND used IS NULL AND revoked IS NULL').get(hash);
  if (!row || !timingSafeEqual(Buffer.from(hash), Buffer.from(row.hash))) return null;
  const result = db.prepare('UPDATE access_keys SET used=?,used_by=? WHERE id=? AND used IS NULL AND revoked IS NULL')
    .run(Date.now(), userId, row.id);
  return result.changes ? row.role : null;
}
export function listKeys(db) {
  return db.prepare('SELECT id,suffix,role,issued,used,revoked,issued_by,used_by,reason FROM access_keys ORDER BY issued DESC LIMIT 500').all();
}
export function revokeKey(db, id, reason) {
  if (typeof reason !== 'string' || reason.length < 3 || reason.length > 200) return false;
  return db.prepare('UPDATE access_keys SET revoked=?,reason=? WHERE id=? AND revoked IS NULL AND used IS NULL')
    .run(Date.now(), reason, id).changes > 0;
}

// Emissão pessoal: somente para uma sessão autenticada de aluno.
// No máximo uma chave de recuperação ativa por conta; validade de 24 horas.
export function issueStudentRecovery(db, owner) {
  const user = db.prepare('SELECT id,role FROM users WHERE id=?').get(owner);
  if (!user || user.role !== 'student') throw new Error('Disponível somente para alunos.');
  const now = Date.now();
  const existing = db.prepare(`SELECT id FROM access_keys WHERE issued_by=? AND role='student'
    AND used IS NULL AND revoked IS NULL AND issued>?`).get('self:'+owner, now-86400000);
  if (existing) throw new Error('Já existe uma chave ativa. Aguarde 24 horas ou utilize sua chave.');
  const issued = issueKey(db, 'student', 'self:'+owner);
  return { key: issued.key, expires: now+86400000 };
}
export function redeemStudentRecovery(db, value, owner) {
  if (typeof value !== 'string' || !/^TITAN-STUDENT-[\w-]{32}$/.test(value)) return false;
  const hash = keyHash(value);
  const row = db.prepare(`SELECT id FROM access_keys WHERE hash=? AND role='student'
    AND issued_by=? AND used IS NULL AND revoked IS NULL AND issued>?`).get(hash,'self:'+owner,Date.now()-86400000);
  if (!row) return false;
  return db.prepare('UPDATE access_keys SET used=?,used_by=? WHERE id=? AND used IS NULL AND revoked IS NULL')
    .run(Date.now(),owner,row.id).changes===1;
}
