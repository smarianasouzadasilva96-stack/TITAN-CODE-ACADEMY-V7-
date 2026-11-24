import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SQLite = await import('node:sqlite').then(module => module.DatabaseSync).catch(async () => {
  try { return (await import('better-sqlite3')).default; }
  catch { throw new Error('No Node.js 20, instale a dependência opcional better-sqlite3 ou use Node.js 22.13+.'); }
});

const migrations = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin','creator')), recovery TEXT NOT NULL,
    preferences TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, seen INTEGER NOT NULL
  );
  CREATE INDEX sessions_owner ON sessions(owner, expires);
  CREATE INDEX sessions_expiry ON sessions(expires);
  CREATE TABLE credentials (
    owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, endpoint TEXT NOT NULL, model TEXT NOT NULL, sealed TEXT,
    tested INTEGER NOT NULL, state TEXT NOT NULL
  );
  CREATE TABLE projects (
    owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL, name TEXT NOT NULL, active TEXT NOT NULL, files TEXT NOT NULL,
    updated INTEGER NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(owner, id)
  );
  CREATE INDEX projects_recent ON projects(owner, updated DESC);
  CREATE TABLE project_versions (
    owner TEXT NOT NULL, project TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL,
    name TEXT NOT NULL, active TEXT NOT NULL, files TEXT NOT NULL, PRIMARY KEY (owner, project, version),
    FOREIGN KEY(owner, project) REFERENCES projects(owner, id) ON DELETE CASCADE
  );
  CREATE TABLE chats (
    owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
    title TEXT NOT NULL, mode TEXT NOT NULL, project TEXT, pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, summary TEXT, summary_at INTEGER NOT NULL DEFAULT 0,
    memory INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner,id)
  );
  CREATE INDEX chats_recent ON chats(owner, archived, pinned DESC, updated DESC);
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, chat TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')), content TEXT NOT NULL,
    attachments TEXT, status TEXT NOT NULL, created INTEGER NOT NULL,
    FOREIGN KEY(owner,chat) REFERENCES chats(owner,id) ON DELETE CASCADE
  );
  CREATE INDEX messages_chat ON messages(owner,chat,id);
  CREATE TABLE memories (
    owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
    content TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(owner,id)
  );
  CREATE TABLE documents (
    owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
    project TEXT, name TEXT NOT NULL, content TEXT NOT NULL, created INTEGER NOT NULL,
    PRIMARY KEY(owner,id), FOREIGN KEY (owner,project) REFERENCES projects(owner,id) ON DELETE CASCADE
  );
  CREATE INDEX documents_project ON documents(owner,project,created DESC);
  CREATE TABLE courses (
    id TEXT PRIMARY KEY, data TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL
  );
  CREATE TABLE progress (
    owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course TEXT NOT NULL REFERENCES courses(id), lesson TEXT NOT NULL, xp INTEGER NOT NULL, completed INTEGER NOT NULL,
    PRIMARY KEY(owner,course,lesson)
  );
  CREATE INDEX progress_dates ON progress(owner,completed DESC);
  CREATE TABLE pets (
    owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL DEFAULT 'Byte',
    accessory TEXT NOT NULL DEFAULT 'none'
  );
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY, actor TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
    target TEXT NOT NULL, date INTEGER NOT NULL
  );
  CREATE TABLE platform_settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
  INSERT INTO platform_settings VALUES (1, '{}');
  `,
  `
  CREATE TABLE reviews (
    owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course TEXT NOT NULL REFERENCES courses(id), lesson TEXT NOT NULL,
    attempts INTEGER NOT NULL, correct INTEGER NOT NULL, reflection TEXT NOT NULL, updated INTEGER NOT NULL,
    PRIMARY KEY(owner,course,lesson)
  );
  `,
  `
  ALTER TABLE messages ADD COLUMN error TEXT;
  `,
  `
  ALTER TABLE documents ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
  ALTER TABLE credentials ADD COLUMN model_name TEXT;
  `,
  `
  ALTER TABLE users ADD COLUMN banned INTEGER;
  ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT '';
  `
];

export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function openDatabase(filename = process.env.TITAN_DB || 'data/tutan.sqlite') {
  if (filename !== ':memory:') {
    filename = resolve(filename);
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  }
  const db = new SQLite(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;');
  transaction(db, () => {
    const current = Number(db.prepare('PRAGMA user_version').get().user_version);
    if (current > migrations.length) throw new Error('Banco criado por uma versão mais recente.');
    for (let index = current; index < migrations.length; index++) {
      db.exec(migrations[index]);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    }
  });
  return db;
}
