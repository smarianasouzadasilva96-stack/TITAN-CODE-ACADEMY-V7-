import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { once } from 'node:events';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { openDatabase, transaction } from './server/db.js';
import { accounts } from './server/accounts.js';
import { initializeKeys, redeemKey, issueStudentRecovery, redeemStudentRecovery } from './server/access-keys.js';
import { providerClient } from './server/providers.js';
import { credentials } from './server/credentials.js';
import { projects } from './server/projects.js';
import { learning } from './server/learning.js';
import { chats } from './server/chats.js';
import { sandbox } from './server/runner.js';
import { body, checkOrigin, equal, fail, parseMaster, proxyPeer, rateLimiter, text, vault } from './server/security.js';

const zip = promisify(gzip);
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const assetTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp'
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function exportLines(res, filename, rows) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.on('close', abort);
  const iterator = rows[Symbol.iterator]();
  // Valida propriedade da conversa antes de iniciar o download.
  const first = iterator.next();
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform',
    'Content-Disposition': 'attachment; filename="' + filename + '"'
  });
  try {
    for (let next = first; !next.done && !res.destroyed; next = iterator.next()) {
      if (!res.write(JSON.stringify(next.value) + '\n')) await once(res, 'drain', { signal: controller.signal });
    }
  } finally {
    iterator.return?.();
    res.removeListener('close', abort);
  }
  res.end();
}

function headers(res, editor, secure) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${editor ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src ${editor ? "'self' blob:" : "'none'"}; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function staticAssets() {
  const cache = new Map();
  return async (path, req, res) => {
    const file = path === '/' ? 'index.html' : path.slice(1);
    const type = assetTypes[file.slice(file.lastIndexOf('.'))];
    if (!type || !/^[\w.-]+\.[\w]+$/.test(file)) throw fail(404, 'Página não encontrada.');
    if (!cache.has(file)) {
      try {
        const data = await readFile(resolve(publicDir, file));
        const packed = data.length > 1024 && !type.startsWith('image/') ? await zip(data) : null;
        cache.set(file, { data, packed, etag: 'W/"' + createHash('sha256').update(data).digest('base64url') + '"' });
      } catch { throw fail(404, 'Arquivo não encontrado.'); }
    }
    const { data, packed, etag } = cache.get(file);
    const gzipOK = packed && String(req.headers['accept-encoding'] || '').split(',').some(value =>
      /^gzip(?:\s*;\s*q=(?!0(?:\.0*)?$)[\d.]+)?$/i.test(value.trim()));
    const content = gzipOK ? packed : data;
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length, ...(gzipOK ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(req.method === 'HEAD' ? undefined : content);
  };
}

export function createApp(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const expected = options.origin || process.env.TITAN_ORIGIN;
  const master = options.master ?? parseMaster(process.env.TITAN_MASTER_KEY);
  if (production && (!master || !expected || new URL(expected).origin !== expected || !expected.startsWith('https://'))) {
    throw new Error('Em produção, configure TITAN_MASTER_KEY e TITAN_ORIGIN (origem HTTPS exata).');
  }
  const db = options.db || openDatabase(options.database);
  initializeKeys(db);
  // Desativa as duas chaves privilegiadas publicadas em conversa anterior.
  db.prepare(`UPDATE access_keys SET revoked=?,reason=? WHERE id IN (?,?) AND used IS NULL AND revoked IS NULL`)
    .run(Date.now(), 'Rotação de chaves privilegiadas expostas',
      '176aaf85-20df-4d26-a198-e6153df3804c',
      'd2064cbb-1333-4b90-bbe8-f3a5a3c11e08');
  const client = providerClient({
    localUrl: process.env.TITAN_OLLAMA_LOCAL_URL, customEndpoints: process.env.TITAN_CUSTOM_ENDPOINTS,
    ...options.provider
  });
  const keys = credentials(db, vault(master), client, !!master);
  const work = projects(db);
  const runner = options.runner || sandbox();
  const school = learning(db);
  const chat = chats(db, work, keys, client);
  const auth = accounts(db, production, id => { keys.revoke(id); chat.revoke(id); });
  const limit = rateLimiter();
  const staticFile = staticAssets();
  const metrics = { requests: 0, errors: {}, latency: 0 };
  const windows = setInterval(() => {
    try { auth.prune(); limit.prune(); }
    catch { console.error('Falha na limpeza de sessões.'); }
  }, 60000);
  function pruneRetention() {
    for (const row of db.prepare("SELECT id, json_extract(preferences,'$.retention') AS days FROM users WHERE json_extract(preferences,'$.retention') IN (30,90,365)").all()) {
      chat.prune(row.id, row.days);
    }
  }
  const retention = setInterval(() => {
    try { pruneRetention(); }
    catch { console.error('Falha na rotina de retenção.'); }
  }, 3600000);
  retention.unref();
  windows.unref();
  auth.prune();
  pruneRetention();
  let authPending = 0;
  let importsPending = 0;
  const platform = () => JSON.parse(db.prepare('SELECT data FROM platform_settings WHERE id=1').get().data);
  const audit = (actor, action, target) => db.prepare('INSERT INTO audit(actor,action,target,date) VALUES (?,?,?,?)').run(actor, action, target, Date.now());

  async function handle(req, res) {
    const time = performance.now();
    res.on('finish', () => {
      if (!req.url.startsWith('/api/')) return;
      metrics.requests++;
      metrics.latency += performance.now() - time;
      if (res.statusCode >= 400) metrics.errors[res.statusCode] = (metrics.errors[res.statusCode] || 0) + 1;
    });
    const proxy = production && (options.trustProxy ?? process.env.TITAN_TRUST_PROXY === '1') &&
      proxyPeer(req.socket.remoteAddress, options.proxyPeers ?? process.env.TITAN_PROXY_PEERS);
    const secure = production && (req.socket.encrypted || (proxy && req.headers['x-forwarded-proto'] === 'https'));
    try {
      if (!req.url.startsWith('/')) throw fail(400, 'URL inválida.');
      const url = new URL(req.url, 'http://titan.invalid');
      const path = url.pathname;
      const { method } = req;
      headers(res, path === '/editor.html', secure);
      if (method === 'GET' && path === '/health') {
        db.prepare('SELECT 1').get();
        return send(res, 200, { ok: true, service: 'TITAN CODE ACADEMY' });
      }
      if (production && !secure) throw fail(426, 'Use HTTPS para acessar o TITAN.');
      if (!path.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method)) throw fail(405, 'Método não permitido.');
        return await staticFile(path, req, res);
      }
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw fail(405, 'Método não permitido.');
      const session = auth.get(req);
      if (method !== 'GET') checkOrigin(req, expected || `http://${req.headers.host}`);
      const forwarded = req.headers['x-real-ip'];
      const ip = proxy && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : req.socket.remoteAddress || 'unknown';
      const isEntry = method === 'POST' && ['/api/auth/register', '/api/auth/login', '/api/auth/recover'].includes(path);
      if (isEntry) {
        limit(ip, 'auth', 24, 600000);
        if (authPending >= 6) throw fail(429, 'Aguarde alguns instantes e tente de novo.');
        authPending++;
        try {
          const data = await body(req, 4096);
          if (path.endsWith('/register') && platform().closed) throw fail(403, 'Cadastro temporariamente fechado.');
          const action = path.split('/').at(-1);
          const result = await auth[action](data, res, session?.id);
          return send(res, action === 'register' ? 201 : 200, result);
        } finally { authPending--; }
      }
      if (method === 'POST' && path === '/api/auth/key') {
        limit(ip, 'key_login', 8, 600000);
        const data = await body(req, 4096);
        const result = await auth.loginKey(data, res, session?.id, value => redeemKey(db, value, data.email));
        return send(res, 200, result);
      }
      if (method === 'GET' && path === '/api/status') {
        const current = session && keys.info(session).connection;
        return send(res, 200, { version: 6, authenticated: Boolean(session), authRequired: true, aiConfigured: Boolean(current), model: current?.model || null, modelName: current?.modelName || null,
          user: session?.user || null, csrf: session?.csrf || null, runner: session ? runner.languages : [], notice: platform().notice || '' });
      }
      if (!session) throw fail(401, 'Entre em sua conta.');
      const user = session.user;
      const owner = user.id;
      const expectedAccount = req.headers['x-titan-account'] || (/\/export$/.test(path) ? url.searchParams.get('account') : null);
      if (expectedAccount != null && !equal(expectedAccount, owner)) throw fail(409, 'A conta ativa mudou. Abra o TITAN novamente.', 'account_changed');
      if (method !== 'GET' && !equal(req.headers['x-csrf-token'], session.csrf)) throw fail(403, 'Token CSRF ausente ou inválido.');
      limit(owner, 'account', 240);
      const exact = (name, verb = 'GET') => path === '/api/' + name && method === verb;
      const read = async max => {
        const parsed = await body(req, max);
        if (!auth.active(session)) throw fail(401, 'Sessão encerrada.');
        return parsed;
      };
      const reply = (data = { ok: true }, status = 200) => send(res, status, data);
      const route = path.slice(5).split('/');
      const [area, id, operation, version] = route;
      const withId = route.length === 2 && id;
      if (exact('auth/student-key', 'POST')) {
        limit(owner, 'student_key', 3, 86400000);
        try {
          const result = issueStudentRecovery(db, owner);
          audit(owner, 'student.key.issued', 'self');
          return reply(result, 201);
        } catch (error) { throw fail(429, error.message); }
      }
      if (exact('auth/logout', 'POST')) { auth.logout(res, session); return reply(); }
      if (exact('auth/sessions')) return reply(auth.sessions(session));
      if (route.length === 3 && area === 'auth' && id === 'sessions' && method === 'DELETE') {
        auth.revoke(session, operation, res); return reply();
      }
      if (exact('auth/recovery', 'POST')) { limit(owner, 'recovery_code', 4, 900000); return reply({ recovery: auth.newRecovery(session) }); }
      if (exact('profile', 'PATCH')) return reply(auth.profile(session, await read(8192)));
      if (exact('dashboard')) {
        chat.prune(owner, user.preferences.retention);
        return reply({ ...school.overview(owner, user.preferences.goal), projects: work.list(owner).slice(0, 5),
          chats: chat.list(owner).slice(0, 5), courses: school.list(owner), connection: keys.info(session).connection });
      }
      if (exact('ai')) return reply(keys.info(session));
      if (exact('ai/test', 'POST') || exact('ai/probe', 'POST') || exact('ai/usage') || exact('ai', 'PUT')) {
        limit(owner, 'providers', 15);
        const data = method === 'GET' ? {} : await read(8192);
        const action = method === 'PUT' ? 'save' : exact('ai/probe', 'POST') ? 'probe' : exact('ai/usage') ? 'usage' : 'test';
        const controller = new AbortController();
        const onClose = () => controller.abort();
        res.on('close', onClose);
        try {
          const result = await keys[action](session, data, controller.signal);
          if (!auth.active(session)) throw fail(401, 'Sessão encerrada.');
          return reply(result);
        } finally { res.removeListener('close', onClose); }
      }
      if (exact('ai', 'DELETE')) { keys.clear(session); return reply(); }
      if (exact('projects')) return reply(work.list(owner));
      if (exact('projects/import', 'POST')) {
        limit(owner, 'projects_import', 6);
        if (importsPending >= 2) throw fail(503, 'Aguarde as importações em andamento e tente novamente.');
        importsPending++;
        try { return reply(work.importMany(owner, (await read(12400000)).projects)); }
        finally { importsPending--; }
      }
      if (area === 'projects' && id) {
        if (withId && method === 'GET') return reply(work.read(owner, id));
        if (withId && method === 'PUT') return reply(work.put(owner, id, await read(4500000)));
        if (withId && method === 'DELETE') { work.remove(owner, id, await read(1024)); return reply(); }
        if (route.length === 3 && operation === 'run' && method === 'POST') {
          limit(owner, 'runner', 8);
          const project = work.read(owner, id);
          const data = await read(500000);
          if (typeof data.file !== 'string' || !Object.hasOwn(project.files, data.file)) throw fail(404, 'Arquivo não encontrado.');
          const lang = data.file.split('.').at(-1).toLowerCase();
          const controller = new AbortController();
          const onClose = () => controller.abort();
          res.on('close', onClose);
          try { return reply(await runner.run(owner, lang, data.content ?? project.files[data.file], controller.signal)); }
          finally { res.removeListener('close', onClose); }
        }
        if (method === 'GET' && operation === 'versions') {
          if (route.length === 3) return reply(work.versions(owner, id));
          if (route.length === 4 && /^\d{1,10}$/.test(version)) return reply(work.version(owner, id, Number(version)));
        }
      }
      if (exact('chats')) { chat.prune(owner, user.preferences.retention); return reply(chat.list(owner, url.searchParams.get('q'), url.searchParams.get('archived') === '1')); }
      if (exact('chats', 'POST')) return reply(chat.create(owner, await read(4096)), 201);
      if (area === 'chats' && id) {
        if (withId && method === 'GET') {
          chat.prune(owner, user.preferences.retention);
          return reply(chat.read(owner, id, url.searchParams.get('before')));
        }
        if (route.length === 3 && operation === 'export' && method === 'GET') {
          limit(owner, 'export', 10, 600000);
          return await exportLines(res, 'titan-conversa.ndjson', chat.exportChat(owner, id));
        }
        if (withId && method === 'PATCH') return reply(chat.update(owner, id, await read(4096)));
        if (withId && method === 'DELETE') { chat.remove(owner, id); return reply(); }
        if (route.length === 3 && operation === 'cancel' && method === 'POST') { chat.cancel(session, id); return reply(); }
        if (route.length === 3 && operation === 'generate' && method === 'POST') {
          limit(owner, 'chat', 18);
          const status = await chat.generate(session, id, await read(300000), res, () => res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no'
          }));
          if (status === 'error') metrics.errors.streaming = (metrics.errors.streaming || 0) + 1;
          return;
        }
      }
      if (exact('memory')) { chat.prune(owner, user.preferences.retention); return reply(chat.memory(owner)); }
      if (exact('memory', 'DELETE')) { chat.clearMemory(owner); return reply(); }
      if (exact('memory/preferences', 'POST')) { chat.addMemory(owner, await read(4096)); return reply(); }
      if (exact('memory/documents', 'POST')) return reply(chat.addDocument(owner, await read(420000)));
      if (area === 'memory' && id === 'documents' && route.length === 3) {
        if (method === 'GET') return reply(chat.document(owner, operation));
        if (method === 'PATCH') return reply(chat.updateDocument(owner, operation, await read(4096)));
      }
      if (exact('memory/search')) return reply(chat.searchDocuments(owner, url.searchParams.get('q'), url.searchParams.get('project'), url.searchParams.get('category')));
      if (area === 'memory' && ['preferences','documents','summaries'].includes(id) && route.length === 3 && method === 'DELETE') {
        chat.removeMemory(owner, id, operation); return reply();
      }
      if (exact('courses')) return reply(school.list(owner));
      if (area === 'courses' && withId && method === 'GET') return reply(school.course(owner, id));
      if (area === 'courses' && id && operation && route.length === 3 && method === 'POST') {
        return reply(school.submit(owner, id, operation, await read(20000)));
      }
      if (exact('pet', 'PATCH')) return reply(school.pet(owner, await read(4096)));
      if (exact('export')) {
        limit(owner, 'export', 4, 600000);
        chat.prune(owner, user.preferences.retention);
        function* exportAccount() {
          yield { type: 'profile', data: user };
          yield { type: 'learning', data: school.overview(owner, user.preferences.goal) };
          for (const review of school.exportReviews(owner)) yield { type: 'review', data: review };
          for (const project of work.list(owner)) yield { type: 'project', data: work.read(owner, project.id) };
          yield* chat.export(owner);
        }
        return await exportLines(res, 'titan-meus-dados.ndjson', exportAccount());
      }
      if (area === 'admin') {
        if (!['admin','creator'].includes(user.role)) throw fail(403, 'Acesso administrativo necessário.');
        // Permissões aplicadas no servidor. Administradores não gerenciam contas privilegiadas.
        if (exact('admin/users')) {
          const query = url.searchParams.get('q')?.trim().toLowerCase() || '';
          const rows = db.prepare('SELECT id,name,email,role,created,banned FROM users ORDER BY created DESC LIMIT 500').all();
          return reply(rows.filter(row => !query || row.name.toLowerCase().includes(query) || row.email.toLowerCase().includes(query)));
        }
        if (exact('admin/users/action', 'POST')) {
          limit(owner, 'admin_user_action', 20, 600000);
          const data = await read(4096);
          const target = db.prepare('SELECT id,role,email FROM users WHERE id=?').get(data.id);
          if (!target) throw fail(404, 'Conta não encontrada.');
          if (target.id === owner || target.role === 'creator') throw fail(403, 'Conta protegida.');
          if (user.role === 'admin' && target.role !== 'student') throw fail(403, 'Administradores só gerenciam alunos.');
          const command = String(data.action || '');
          if (command === 'ban' || command === 'unban') {
            if (user.role !== 'creator') throw fail(403, 'Somente o criador pode bloquear contas.');
            const reason = text(data.reason, 200, 'Motivo');
            if (command === 'ban' && reason.length < 5) throw fail(400, 'Informe um motivo com pelo menos 5 caracteres.');
            transaction(db, () => {
              db.prepare('UPDATE users SET banned=?,ban_reason=? WHERE id=?').run(command === 'ban' ? Date.now() : null, command === 'ban' ? reason : '', target.id);
              db.prepare('DELETE FROM sessions WHERE owner=?').run(target.id);
              audit(owner, 'user.' + command, target.id + ':' + reason);
            });
            return reply();
          }
          if (command === 'promote' || command === 'demote') {
            if (user.role !== 'creator') throw fail(403, 'Somente o criador gerencia administradores.');
            if (command === 'promote' && target.role !== 'student' || command === 'demote' && target.role !== 'admin') throw fail(409, 'Mudança de papel inválida.');
            transaction(db, () => {
              db.prepare('UPDATE users SET role=? WHERE id=?').run(command === 'promote' ? 'admin' : 'student', target.id);
              db.prepare('DELETE FROM sessions WHERE owner=?').run(target.id);
              audit(owner, 'user.' + command, target.id);
            });
            return reply();
          }
          if (command === 'logout') {
            db.prepare('DELETE FROM sessions WHERE owner=?').run(target.id);
            audit(owner, 'user.sessions.revoked', target.id);
            return reply();
          }
          throw fail(400, 'Ação inválida.');
        }
        if (exact('admin/audit')) {
          if (user.role !== 'creator') throw fail(403, 'Somente o criador consulta a auditoria completa.');
          return reply(db.prepare('SELECT actor,action,target,date FROM audit ORDER BY id DESC LIMIT 300').all());
        }
        if (exact('admin')) {
          return reply({ role: user.role, users: db.prepare('SELECT count(*) AS n FROM users').get().n,
            active: db.prepare('SELECT count(DISTINCT owner) AS n FROM sessions WHERE expires>? AND seen>?').get(Date.now(), Date.now() - 86400000).n,
            uptime: Math.floor(process.uptime()), memoryMB: Math.round(process.memoryUsage().rss / 1048576),
            averageMs: metrics.requests ? Math.round(metrics.latency / metrics.requests) : 0, requests: metrics.requests,
            errors: metrics.errors, settings: platform(), audit: db.prepare('SELECT actor,action,target,date FROM audit ORDER BY id DESC LIMIT 60').all(),
            courses: school.adminList()
          });
        }
        if (exact('admin/settings', 'PATCH')) {
          if (user.role !== 'creator') throw fail(403, 'Somente o criador altera as configurações globais.');
          const data = await read(4096);
          const value = { notice: text(data.notice, 300, 'Aviso', { optional: true }), closed: data.closed === true };
          transaction(db, () => {
            db.prepare('UPDATE platform_settings SET data=? WHERE id=1').run(JSON.stringify(value));
            audit(owner, 'settings.updated', 'platform');
          });
          return reply();
        }
        if (route.length === 3 && id === 'courses' && method === 'PATCH') {
          const data = await read(100000);
          transaction(db, () => {
            school.adminUpdate(operation, data);
            audit(owner, 'course.updated', operation);
          });
          return reply();
        }
      }
      throw fail(404, 'Recurso não encontrado.');
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.end(); return; }
      const status = error.status || (error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 500);
      const message = error.status ? error.message : status === 504 ? 'Tempo limite de conexão atingido.' : 'Erro interno do servidor.';
      if (status === 500) console.error('Falha interna ao processar requisição.', error.code || error.name || 'Error');
      send(res, status, { error: message, ...(error.code && error.status ? { code: error.code } : {}) });
    }
  }

  const server = options.tls ? createHttpsServer(options.tls, handle) : createServer(handle);
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('close', () => { clearInterval(windows); clearInterval(retention); if (!options.db) db.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const files = [process.env.TITAN_TLS_CERT, process.env.TITAN_TLS_KEY];
  if (files.some(Boolean) && !files.every(Boolean)) throw new Error('Configure TITAN_TLS_CERT e TITAN_TLS_KEY em conjunto.');
  const tls = files.every(Boolean) ? { cert: await readFile(files[0]), key: await readFile(files[1]) } : null;
  createApp({ tls }).listen(port, process.env.HOST || (process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1'), () => console.log(`TITAN CODE ACADEMY na porta ${port}`));
}
