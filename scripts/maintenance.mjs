import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase, transaction } from '../server/db.js';
import { email } from '../server/accounts.js';
import { parseMaster, vault } from '../server/security.js';

const [command, arg] = process.argv.slice(2);
const file = process.env.TITAN_DB || 'data/tutan.sqlite';
if (!existsSync(file)) throw new Error('Banco ausente. Confira TITAN_DB e inicialize o servidor.');
const db = openDatabase(file);
process.umask(0o077);
try {
  if (command === 'backup') {
    if (!arg || existsSync(resolve(arg))) throw new Error('Informe um novo caminho para o backup.');
    const destination = resolve(arg);
    db.prepare('VACUUM INTO ?').run(destination);
    chmodSync(destination, 0o600);
    console.log('Backup SQLite criado.');
  } else if (command === 'rotate-key') {
    const previous = parseMaster(process.env.TITAN_MASTER_KEY_OLD);
    const next = parseMaster(process.env.TITAN_MASTER_KEY);
    if (!previous || !next || previous.equals(next)) throw new Error('Configure as chaves anterior e nova, que devem ser diferentes.');
    const old = vault(previous), replacement = vault(next);
    const n = transaction(db, () => {
      const rows = db.prepare('SELECT owner,provider,endpoint,model,sealed FROM credentials WHERE sealed IS NOT NULL').all();
      const update = db.prepare('UPDATE credentials SET sealed=? WHERE owner=?');
      for (const row of rows) {
        const identity = [row.owner, row.provider, row.endpoint, row.model];
        update.run(replacement.seal(old.open(row.sealed, identity), identity), row.owner);
      }
      return rows.length;
    });
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log('Credenciais rotacionadas: ' + n);
  } else if (command === 'admin') {
    const address = email(arg);
    const row = db.prepare('SELECT id,role FROM users WHERE email=?').get(address);
    if (!row) throw new Error('Cadastre a conta antes de conceder a função.');
    if (row.role !== 'admin') transaction(db, () => {
      db.prepare("UPDATE users SET role='admin' WHERE id=?").run(row.id);
      db.prepare("INSERT INTO audit(actor,action,target,date) VALUES (?,'role.granted.cli',?,?)").run(row.id, row.id, Date.now());
    });
    console.log('Conta com acesso administrativo.');
  } else {
    throw new Error('Use backup, rotate-key ou admin.');
  }
} finally { db.close(); }
