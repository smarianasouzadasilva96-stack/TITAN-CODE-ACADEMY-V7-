import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApp } from '../server.js';
import { openDatabase } from '../server/db.js';
import { publicIp, providerClient, transport } from '../server/providers.js';
import { vault } from '../server/security.js';
import { sandbox, runtimeLimits, verifiedEngine } from '../server/runner.js';

async function listen(server) {
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  return 'http://127.0.0.1:' + server.address().port;
}
const close = server => new Promise(resolve => server.close(resolve));
const master = randomBytes(32);
const realTransport = transport();
const password = 'correta-frase-de-teste';

async function setup(t, factory = {}) {
  const calls = [];
  let kimiRequests = 0;
  const provider = createServer(async (req, res) => {
    const url = req.url;
    calls.push({ url, accept: req.headers.accept, authorization: req.headers.authorization });
    if (req.headers.authorization === 'Bearer refused-secret') { res.writeHead(401).end('refused-secret'); return; }
    if (url === '/key') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { usage: 4, limit: 10, limit_remaining: 6, limit_reset: 'monthly', is_free_tier: true, label: 'private-key-label' } }));
      return;
    }
    if (url === '/api/tags' || url === '/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(url === '/api/tags' ? { models: [{ name: 'qwen3:8b' }, { name: 'qwen3:32b' }, { name: 'kimi-k2.7-code' }] } :
        { data: [{ id: 'qwen/qwen3-8b' }, { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA: Nemotron 3 Ultra (free)' }] }));
      return;
    }
    let data = '';
    for await (const chunk of req) data += chunk;
    const request = JSON.parse(data);
    calls.at(-1).data = request;
    if (url === '/chat/completions') {
      if (!request.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {\ndata: "choices":[{"delta":{"content":"Texto "}}]\ndata: }\n\n');
      res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'OpenRouter' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
      return;
    }
    if (request.model === 'kimi-k2.7-code') {
      kimiRequests++;
      if (request.stream === false) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: { thinking: 'private trace', content: 'OK em JSON' }, done: true }, null, 2));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      if (request.messages.at(-1).content === 'Responda sem texto') {
        res.end('{"message":{"content":false},"done":true}\n');
      } else if (kimiRequests === 2) {
        res.end('{"message":{"thinking":"private trace","content":false},"done":true,"done_reason":"length"}\n');
      } else {
        res.write('{"message":{"thinking":"private trace","content":false},"done":false}\n');
        res.end('{"message":{"content":"OK em streaming"},"done":true}\n');
      }
      return;
    }
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    const part = Buffer.from(JSON.stringify({ message: { content: 'Olá ' }, done: false }) + '\n');
    const at = part.indexOf(Buffer.from('á'));
    res.write(part.subarray(0, at + 1));
    await sleep(4);
    res.write(part.subarray(at + 1));
    if (request.messages.at(-1).content.includes('Demore')) {
      const timer = setTimeout(() => res.end('{"message":{"content":"tarde"},"done":true}\n'), 3000);
      res.on('close', () => clearTimeout(timer));
    } else {
      res.end('{"message":{"content":"Titan"},"done":true}\n');
    }
  });
  const backend = await listen(provider);
  const directory = await mkdtemp(join(tmpdir(), 'tutan-test-'));
  const db = openDatabase(join(directory, 'test.sqlite'));
  const app = createApp({ db, master, ...factory, provider: {
    localUrl: backend, customEndpoints: 'https://remote.example/v1',
    request: (setting, path, opts) => realTransport({ ...setting, endpoint: backend, local: true }, path, opts),
    ...factory.provider
  } });
  const base = await listen(app);
  t.after(async () => {
    await close(app); await close(provider); db.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { app, base, backend, calls, db, directory };
}
function browser(base, options = {}) {
  let cookie, csrf, user;
  const origin = options.origin || base;
  async function call(path, method = 'GET', data, headers = {}) {
    const response = await fetch(base + '/api/' + path, { method, headers: {
      ...(options.headers || {}), ...(cookie && { Cookie: cookie }),
      ...(method !== 'GET' && { 'Content-Type': 'application/json', Origin: origin }),
      ...(csrf && { 'X-CSRF-Token': csrf }), ...headers
    }, body: method === 'GET' ? undefined : JSON.stringify(data || {}) });
    const value = response.headers.get('set-cookie');
    if (value) cookie = value.split(';')[0];
    return response;
  }
  async function json(path, method, data, code = 200, headers) {
    const response = await call(path, method, data, headers);
    const value = await response.json();
    assert.equal(response.status, code, JSON.stringify(value));
    if (value.user && value.csrf) { csrf = value.csrf; user = value.user; }
    return value;
  }
  return {
    call, json,
    signUp: (email, name) => json('auth/register', 'POST', { email, name, password }, 201),
    signIn: (email, pw = password) => json('auth/login', 'POST', { email, password: pw }),
    get user() { return user; }, get cookie() { return cookie; }
  };
}
const local = { provider: 'ollama-local', model: 'qwen3:8b', mode: 'persistent' };
const router = { provider: 'openrouter', model: 'qwen/qwen3-8b', mode: 'persistent' };
const project = { name: 'Laboratório', files: { 'index.html': '<main>olá</main>', 'main.js': 'console.log(1)' }, active: 'index.html' };

test('cadastro, login, sessão revogável, recuperação única e CSRF', async t => {
  const { base } = await setup(t);
  const a = browser(base), b = browser(base);
  const created = await a.signUp('aluno@example.com', 'Aluno');
  assert.match(created.user.id, /^[a-f0-9-]{36}$/);
  await a.json('auth/register', 'POST', { email: 'ALUNO@example.com', name: 'Cópia', password }, 409);
  await b.json('auth/login', 'POST', { email: 'aluno@example.com', password: 'uma senha errada' }, 401);
  await b.signIn('aluno@example.com');
  assert.equal((await a.json('auth/sessions')).length, 2);
  await a.json('chats', 'POST', {}, 403, { 'X-CSRF-Token': '' });
  await a.json('chats', 'POST', {}, 403, { Origin: 'https://wrong.example' });
  await a.json('chats', 'POST', {}, 403, { 'Sec-Fetch-Site': 'cross-site' });
  const old = a.cookie;
  await a.json('auth/logout', 'POST');
  await a.json('dashboard', 'GET', null, 401, { Cookie: old });
  const recovered = await a.json('auth/recover', 'POST', { email: 'aluno@example.com', password: 'uma senha nova!', recovery: created.recovery });
  assert.notEqual(recovered.recovery, created.recovery);
  await b.json('dashboard', 'GET', null, 401);
  await b.json('auth/recover', 'POST', { email: 'aluno@example.com', password, recovery: created.recovery }, 401);
  assert.equal((await a.json('auth/sessions')).length, 1);
  await b.signIn('aluno@example.com', 'uma senha nova!');
});

test('produção exige HTTPS e usa cookie Secure', async t => {
  const origin = 'https://titan.example.com';
  const { base } = await setup(t, { production: true, origin, trustProxy: true });
  assert.equal((await fetch(base + '/api/status')).status, 426);
  assert.equal((await fetch(base + '/health')).status, 200);
  const a = browser(base, { origin, headers: { 'X-Forwarded-Proto': 'https' } });
  const response = await a.call('auth/register', 'POST', { name: 'Teste', email: 'test@example.com', password });
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Secure/);
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
});

test('cofre autentica o proprietário e criptografa credenciais com nonce distinto', () => {
  const cipher = vault(master);
  const key = 'teste-para-cofre';
  const id = ['a', 'openrouter', 'https://openrouter.ai/api/v1', 'qwen/qwen3-8b'];
  const one = cipher.seal(key, id);
  assert.notEqual(one, cipher.seal(key, id));
  assert.doesNotMatch(one, /teste-para-cofre/);
  assert.equal(cipher.open(one, id), key);
  assert.throws(() => cipher.open(one, ['b', ...id.slice(1)]), /Credencial indisponível/);
  assert.throws(() => cipher.open((one[0] === 'A' ? 'B' : 'A') + one.slice(1), id), /Credencial indisponível/);
});

test('chaves persistentes, temporárias, troca de provedor e erros de autenticação', async t => {
  const { base, calls, db, directory } = await setup(t);
  const a = browser(base), b = browser(base), other = browser(base);
  await a.signUp('a@example.com', 'Ana'); await b.signUp('b@example.com', 'Bruno');
  const secretA = 'an-auth-secret-A';
  const secretB = 'another-secret-B';
  await a.json('ai', 'PUT', { ...local, model: 'missing', key: secretA }, 409);
  const tags = await a.json('ai/test', 'POST', { ...local, key: secretA });
  assert.equal(tags.suggested, 'qwen3:8b');
  assert.equal(tags.modelAvailable, true);
  const saved = await a.json('ai', 'PUT', { ...local, key: secretA });
  assert.equal(saved.hasKey, true);
  assert.doesNotMatch(JSON.stringify(saved), new RegExp(secretA));
  const row = db.prepare('SELECT sealed FROM credentials WHERE owner=?').get(a.user.id);
  assert.equal(typeof row.sealed, 'string');
  for (const filename of await readdir(directory)) assert.equal((await readFile(join(directory, filename))).includes(secretA), false);
  await b.json('ai', 'PUT', { ...router, key: secretB, mode: 'session' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM credentials').get().n, 1);
  await other.signIn('b@example.com');
  assert.equal((await other.json('ai')).connection, null);
  await a.json('auth/logout', 'POST');
  await a.signIn('a@example.com');
  const resumed = (await a.json('ai')).connection;
  assert.equal(resumed.model, 'qwen3:8b');
  await a.json('ai/test', 'POST', { saved: true });
  assert.equal(calls.at(-1).authorization, 'Bearer ' + secretA);
  const error = await a.json('ai/test', 'POST', { ...router, key: 'refused-secret' }, 502);
  assert.equal(error.code, 'authentication');
  assert.doesNotMatch(JSON.stringify(error), /refused-secret/);
  await a.json('ai', 'PUT', { ...router, key: 'new-secret' });
  assert.equal((await a.json('ai')).connection.provider, 'openrouter');
  await b.json('auth/logout', 'POST');
  await b.signIn('b@example.com');
  assert.equal((await b.json('ai')).connection, null);
  await a.json('ai', 'DELETE');
  assert.equal((await a.json('ai')).connection, null);
});

test('SSRF bloqueia IPs privados, IPv6 mapeado, endpoint externo e DNS misto', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.2', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.2', '100.100.100.200', '192.0.2.1']) assert.equal(publicIp(ip), false, ip);
  assert.equal(publicIp('8.8.8.8'), true);
  assert.equal(publicIp('2606:4700:4700::1111'), true);
  const client = providerClient({ customEndpoints: 'https://allowed.example/v1',
    request: transport(async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]) });
  for (const endpoint of ['http://allowed.example/v1','https://not-approved.example/v1','https://127.0.0.1/v1','https://u:p@allowed.example/v1','https://allowed.example/v1?secret=x']) {
    assert.throws(() => client.config({ provider: 'custom', endpoint }), { status: 400 });
  }
  await assert.rejects(client.models(client.config({ provider: 'custom', endpoint: 'https://allowed.example/v1' }), new AbortController().signal), { code: 'blocked_endpoint' });
});

test('streaming NDJSON/SSE, contexto, pesquisa, regeneração e cancelamento', async t => {
  const { base, calls } = await setup(t);
  const a = browser(base), b = browser(base);
  await a.signUp('a@example.com', 'Ana'); await b.signUp('b@example.com', 'Bruno');
  await a.json('ai', 'PUT', { ...local, key: 'key-a' });
  await b.json('ai', 'PUT', { ...router, key: 'key-b' });
  await a.json('projects/lab', 'PUT', project);
  await a.json('memory/documents', 'POST', { name: 'Notas', project: 'lab', content: 'A constante assinatura Solstício vale 42.' });
  const aChat = await a.json('chats', 'POST', { mode: 'code', project: 'lab' }, 201);
  const bChat = await b.json('chats', 'POST', { mode: 'study' }, 201);
  await b.json('chats/' + aChat.id, 'GET', null, 404);
  await b.json('chats/' + aChat.id + '/cancel', 'POST', {}, 404);
  const path = 'chats/' + aChat.id;
  const stream = await a.call(path + '/generate', 'POST', { content: 'Qual a assinatura Solstício?', attachments: [{ name: 'teste.txt', content: 'anexo' }] });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /ndjson/);
  const events = (await stream.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(event => event.type), ['start','tool','delta','delta','done']);
  assert.equal(events.filter(event => event.type === 'delta').map(event => event.text).join(''), 'Olá Titan');
  const upstream = calls.findLast(item => item.url === '/api/chat');
  assert.equal(upstream.authorization, 'Bearer key-a');
  assert.equal(upstream.data.model, 'qwen3:8b');
  assert.match(upstream.data.messages.at(-1).content, /Solstício vale 42/);
  assert.match(upstream.data.messages.at(-1).content, /anexo/);
  const second = await b.call('chats/' + bChat.id + '/generate', 'POST', { content: 'Olá' });
  assert.match(await second.text(), /OpenRouter/);
  assert.equal(calls.at(-1).authorization, 'Bearer key-b');
  assert.equal((await a.json('chats?q=' + encodeURIComponent('Solstício'))).length, 1);
  await a.json(path, 'PATCH', { pinned: true, title: 'Estudos' });
  assert.equal((await a.json(path)).title, 'Estudos');
  const reg = await a.call(path + '/generate', 'POST', { action: 'regenerate' });
  assert.match(await reg.text(), /Titan/);
  assert.equal((await a.json(path)).messages.filter(row => row.role === 'assistant').length, 1);
  const slow = await a.call(path + '/generate', 'POST', { content: 'Demore por favor' });
  const reader = slow.body.getReader();
  assert.equal((await reader.read()).done, false);
  await a.json(path + '/cancel', 'POST');
  let tail = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    tail += Buffer.from(chunk.value).toString();
  }
  assert.match(tail, /cancelled/);
  assert.equal((await a.json(path)).messages.at(-1).status, 'cancelled');
  const inner = await a.json(path);
  const edit = await a.call(path + '/generate', 'POST', { action: 'edit', confirm: true, message: inner.messages[0].id, content: 'Pergunta editada' });
  assert.match(await edit.text(), /Titan/);
  assert.equal((await a.json(path)).messages.filter(row => row.role === 'user').length, 1);
  await a.json(path, 'PATCH', { archived: true });
  assert.equal((await a.json('chats')).length, 0);
  assert.equal((await a.json('chats?archived=1')).length, 1);
  const deniedExport = await b.call(path + '/export');
  assert.equal(deniedExport.status, 404);
  assert.match(await (await a.call(path + '/export')).text(), /Pergunta editada/);
  await a.json(path, 'DELETE');
  await a.json(path, 'GET', null, 404);
});

test('projetos, versões, progresso, XP, pet, memória e administração são isolados', async t => {
  const ran = [];
  const runner = { languages: ['js'], run: async (owner, lang, input) => { ran.push({ owner,lang,input }); return { type: 'tool', status: 'done', output: 'ok' }; } };
  const { base, db } = await setup(t, { runner });
  const a = browser(base), b = browser(base);
  await a.signUp('a@example.com', 'Ana'); await b.signUp('b@example.com', 'Bruno');
  const initial = await a.json('projects/shared-id', 'PUT', project);
  assert.equal(initial.version, 1);
  assert.deepEqual(await b.json('projects'), []);
  await b.json('projects/shared-id', 'GET', null, 404);
  await a.json('projects', 'GET', null, 409, { 'X-Titan-Account': b.user.id });
  await b.json('projects/shared-id/run', 'POST', { file: 'main.js' }, 404);
  await b.json('projects/shared-id', 'DELETE', { confirm: true, version: 1 }, 404);
  const updated = await a.json('projects/shared-id', 'PUT', { ...project, name: 'Atualizado', version: 1 });
  assert.equal(updated.version, 2);
  assert.equal((await a.json('projects/shared-id/versions/1')).name, 'Laboratório');
  await a.json('projects/shared-id', 'PUT', { ...project, version: 1 }, 409);
  assert.equal((await a.json('projects/shared-id/run', 'POST', { file: 'main.js' })).output, 'ok');
  assert.equal(ran[0].owner, a.user.id);
  assert.equal(ran[0].input, project.files['main.js']);
  assert.equal((await a.json('courses')).length, 48);
  const html = await a.json('courses/html');
  assert.equal('correct' in html.modules[0].lessons[0], false);
  assert.equal((await a.json('courses/html/fundamentos', 'POST', { answer: 0 })).xp, 0);
  assert.equal((await a.json('courses/html/fundamentos', 'POST', { answer: 1 })).xp, 25);
  assert.equal((await a.json('courses/html/fundamentos', 'POST', { answer: 1 })).xp, 0);
  const dash = await a.json('dashboard');
  assert.equal(dash.xp, 25); assert.equal(dash.pet.label, 'Nascimento');
  assert.equal((await b.json('dashboard')).pet.label, 'Ovo');
  await a.json('pet', 'PATCH', { name: 'Pixel', accessory: 'crown' }, 400);
  await a.json('pet', 'PATCH', { name: 'Pixel', accessory: 'none' });
  await a.json('courses/html/projeto', 'POST', { answer: 0, reflection: 'Testei dois links de navegação com IDs válidos.' });
  const completed = await a.json('courses/html');
  assert.equal(completed.certificate, null);
  assert.equal(completed.reviews.find(row => row.lesson === 'fundamentos').attempts, 3);
  assert.match(completed.reviews.find(row => row.lesson === 'projeto').reflection, /dois links/);
  await a.json('memory/preferences', 'POST', { content: 'Prefiro exemplos curtos.' });
  await a.json('memory/documents', 'POST', { name: 'Pessoal', project: 'shared-id', content: 'Questão sobre cifrão.' });
  assert.equal((await a.json('memory/search?q=cifr%C3%A3o&project=shared-id')).length, 1);
  assert.equal((await b.json('memory')).documents.length, 0);
  await b.json('memory/search?q=cifr%C3%A3o&project=shared-id', 'GET', null, 404);
  const dump = await a.call('export');
  assert.match(dump.headers.get('content-disposition'), /attachment/);
  assert.match(await dump.text(), /Pessoal/);
  await a.json('memory', 'DELETE');
  assert.deepEqual(await a.json('memory'), { preferences: [], documents: [], summaries: [] });
  await b.json('admin', 'GET', null, 403);
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.user.id);
  await a.json('admin/settings', 'PATCH', { notice: 'Bem-vindos', closed: false });
  const show = await a.json('admin');
  assert.equal(show.users, 2);
  assert.equal(show.audit[0].action, 'settings.updated');
  assert.equal((await b.json('status')).notice, 'Bem-vindos');
  assert.equal((await a.json('dashboard')).pet.name, 'Pixel');
});

test('importação de projetos é atômica, isolada e permite repetir a mesma solicitação', async t => {
  const { base } = await setup(t);
  const a = browser(base), b = browser(base);
  await a.signUp('a@example.com', 'Ana'); await b.signUp('b@example.com', 'Bruno');
  const first = { ...project, id: 'first', active: 'main.js', files: { 'main.js': 'const id = 1;', 'notes.txt': 'notas' } };
  const second = { ...project, id: 'second' };
  await a.json('projects/import', 'POST', { projects: [first, { ...second, active: '../file', files: { '../file': 'texto' } }] }, 400);
  assert.deepEqual(await a.json('projects'), []);
  for (let retry = 0; retry < 2; retry++) {
    assert.deepEqual(await a.json('projects/import', 'POST', { projects: [first, second] }), { count: 2 });
  }
  assert.equal((await a.json('projects')).length, 2);
  await b.json('projects/first', 'GET', null, 404);
  const selected = await a.json('projects/first', 'PUT', { ...first, active: 'notes.txt', version: 1 });
  assert.equal(selected.active, 'notes.txt');
  assert.equal(selected.version, 1);
  assert.equal((await a.json('projects/first')).active, 'notes.txt');
  await a.json('projects/import', 'POST', { projects: [first, { ...second, id: 'third' }] }, 409);
  await a.json('projects/third', 'GET', null, 404);
});

test('reinicialização preserva os dados da conta, a sessão e a configuração criptografada', async t => {
  const { app, base, db, backend } = await setup(t);
  const a = browser(base);
  await a.signUp('a@example.com', 'Ana');
  await a.json('ai', 'PUT', { ...local, key: 'persistent-sample' });
  await a.json('pet', 'PATCH', { name: 'Bit', accessory: 'none' });
  await a.json('courses/html/fundamentos', 'POST', { answer: 1 });
  await a.json('projects/lab', 'PUT', project);
  const restart = createApp({ db, master, provider: { localUrl: backend } });
  const url = await listen(restart);
  t.after(() => close(restart));
  const response = await fetch(url + '/api/dashboard', { headers: { Cookie: a.cookie } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.pet.name, 'Bit');
  assert.equal(data.xp, 25);
  assert.equal(data.projects[0].id, 'lab');
  assert.equal(data.connection.model, 'qwen3:8b');
  assert.equal(app.listening, true);
});

test('sandbox recusa ausência de cgroups e exige execução sem rede com limites', async () => {
  const info = { CgroupVersion: '2', MemoryLimit: true, SwapLimit: true, CPUCfsQuota: true, PidsLimit: true,
    SecurityOptions: ['name=rootless','name=seccomp,profile=builtin'] };
  assert.equal(verifiedEngine(info), true);
  assert.equal(verifiedEngine({ ...info, CPUCfsQuota: false }), false);
  assert.equal(verifiedEngine({ ...info, SecurityOptions: ['name=seccomp,profile=builtin'] }), false);
  for (const arg of ['--network=none','--memory=128m','--cpus=.5','--read-only','--cap-drop=ALL','--pids-limit=24']) assert.ok(runtimeLimits.includes(arg));
  await assert.rejects(sandbox({}).run('user', 'js', 'console.log(1)', new AbortController().signal), { status: 503 });
});

test('artefatos públicos têm compressão, política de conteúdo e cache condicional', async t => {
  const { base } = await setup(t);
  const html = await fetch(base + '/');
  assert.match(await html.text(), /TITAN CODE ACADEMY/);
  assert.doesNotMatch(html.headers.get('content-security-policy'), /script-src[^;]*unsafe-inline/);
  const css = await fetch(base + '/academy.css', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(css.headers.get('content-encoding'), 'gzip');
  assert.ok(Number(css.headers.get('content-length')) < 9000);
  const notModified = await fetch(base + '/academy.css', { headers: { 'If-None-Match': css.headers.get('etag') } });
  assert.equal(notModified.status, 304);
  for (const name of ['/server.js','/data/tutan.sqlite','/%2e%2e/.env', '/package.json']) assert.equal((await fetch(base + name)).status, 404);
});

test('catálogo retenta indisponibilidade e cancela consulta de DNS no timeout', async () => {
  let attempts = 0;
  const client = providerClient({ request: async () => {
    const ok = ++attempts === 3;
    return Object.assign(Readable.from([Buffer.from(ok ? '{"models":[{"name":"qwen3:8b"}]}' : '')]), { statusCode: ok ? 200 : 503 });
  }});
  const signal = new AbortController().signal;
  const models = await client.models(client.config({ provider: 'ollama-cloud', key: 'key-test' }), signal);
  assert.equal(attempts, 3);
  assert.equal(models.suggested, 'qwen3:8b');
  const stalled = providerClient({ timeout: 40, request: transport(() => sleep(150, [{ address: '8.8.8.8', family: 4 }])) });
  await assert.rejects(stalled.models(stalled.config({ provider: 'ollama-cloud', key: 'key-test' }), signal), { name: 'TimeoutError' });
});

test('backup e rotação preservam a credencial e validam a chave anterior', async t => {
  const { base, db, directory } = await setup(t);
  const a = browser(base);
  await a.signUp('a@example.com', 'Ana');
  const secret = 'key-for-encrypted-backup';
  await a.json('ai', 'PUT', { ...local, key: secret });
  const exec = promisify(execFile);
  const next = randomBytes(32);
  const target = join(directory, 'backup.sqlite');
  const env = { ...process.env, TITAN_DB: join(directory, 'test.sqlite'),
    TITAN_MASTER_KEY: next.toString('base64'), TITAN_MASTER_KEY_OLD: master.toString('base64') };
  const run = (...args) => exec(process.execPath, ['scripts/maintenance.mjs', ...args], { env, cwd: new URL('../', import.meta.url) });
  await run('backup', target);
  assert.equal((await readFile(target)).includes(secret), false);
  await assert.rejects(run('backup', target));
  await run('rotate-key');
  const check = (db, key) => {
    const row = db.prepare('SELECT * FROM credentials WHERE owner=?').get(a.user.id);
    return vault(key).open(row.sealed, [row.owner,row.provider,row.endpoint,row.model]);
  };
  assert.equal(check(db, next), secret);
  assert.throws(() => check(db, master), /Credencial indisponível/);
  const backup = openDatabase(target);
  try { assert.equal(check(backup, master), secret); }
  finally { backup.close(); }
});

test('Kimi Cloud gera com e sem streaming, preserva histórico ao regenerar e salva erro seguro', async t => {
  const logs = [];
  const { base, calls } = await setup(t, { provider: { diagnostic: info => logs.push(info) } });
  const a = browser(base);
  await a.signUp('kimi@example.com', 'Kimi');
  const setting = { provider: 'ollama-cloud', model: 'kimi-k2.7-code', key: 'mock-cloud-key' };
  await a.json('ai', 'PUT', setting);
  const chat = await a.json('chats', 'POST', {}, 201);
  const path = 'chats/' + chat.id;
  const stream = async input => (await (await a.call(path + '/generate', 'POST', input)).text()).trim().split('\n').map(JSON.parse);
  const first = await stream({ content: 'Responda somente: OK' });
  assert.deepEqual(first.map(event => event.type), ['start', 'reasoning', 'delta', 'done']);
  assert.equal(first[2].text, 'OK em streaming');
  const original = (await a.json(path)).messages;
  const failure = await stream({ action: 'regenerate' });
  assert.equal(failure.find(event => event.type === 'error').code, 'length_without_text');
  assert.deepEqual((await a.json(path)).messages, original);
  const latest = calls.at(-1);
  assert.equal(latest.url, '/api/chat');
  assert.match(latest.accept, /^application\/x-ndjson/);
  assert.equal(latest.authorization, 'Bearer ' + setting.key);
  assert.deepEqual(latest.data.messages.filter(message => message.role !== 'system'), [{ role: 'user', content: 'Responda somente: OK' }]);
  const complete = await stream({ action: 'regenerate', stream: false });
  assert.equal(calls.at(-1).data.stream, false);
  assert.equal(calls.at(-1).accept, 'application/json');
  assert.equal(complete.find(event => event.type === 'delta').text, 'OK em JSON');
  const after = (await a.json(path)).messages;
  assert.deepEqual(after[0], original[0]);
  assert.equal(after.length, 2);
  assert.equal(after[1].content, 'OK em JSON');
  const empty = await stream({ content: 'Responda sem texto' });
  assert.equal(empty.find(event => event.type === 'error').code, 'empty_response');
  const error = (await a.json(path)).messages.at(-1);
  assert.equal(error.content, '');
  assert.equal(error.status, 'error');
  assert.equal(error.error, empty.find(event => event.type === 'error').message);
  assert.doesNotMatch(JSON.stringify(logs), /private trace|mock-cloud-key|Responda somente/);
});

test('migração de mensagens V5 preserva conversas e registros anteriores', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tutan-chat-upgrade-'));
  const file = join(directory, 'previous.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = openDatabase(file);
  previous.exec(`
    ALTER TABLE messages DROP COLUMN error;
    ALTER TABLE documents DROP COLUMN category;
    ALTER TABLE credentials DROP COLUMN model_name;
    PRAGMA user_version=2;
    INSERT INTO users(id,email,name,password,recovery,created) VALUES
      ('person','person@example.com','Pessoa','test-only','test-only',100);
    INSERT INTO chats(owner,id,title,mode,updated) VALUES ('person','chat','Histórico','general',100);
    INSERT INTO messages(owner,chat,role,content,status,created) VALUES
      ('person','chat','user','Pergunta antiga','done',100),
      ('person','chat','assistant','Resposta antiga','done',101);
  `);
  previous.close();
  const updated = openDatabase(file);
  try {
    assert.equal(updated.prepare('PRAGMA user_version').get().user_version, 4);
    assert.deepEqual(updated.prepare('SELECT content,error FROM messages ORDER BY id').all().map(row => [row.content, row.error]),
      [['Pergunta antiga', null], ['Resposta antiga', null]]);
    assert.equal(updated.prepare("SELECT title FROM chats WHERE id='chat'").get().title, 'Histórico');
  } finally { updated.close(); }
});

test('OpenRouter V6 descobre Nemotron gratuito e testa candidata sem substituir a credencial salva', async t => {
  const diagnostics = [];
  const { base, calls, db } = await setup(t, { provider: { diagnostic: event => diagnostics.push(event) } });
  const a = browser(base), b = browser(base);
  await a.signUp('a-router@example.com', 'Conta A');
  await b.signUp('b-router@example.com', 'Conta B');
  const model = 'nvidia/nemotron-3-ultra-550b-a55b:free';
  await a.json('ai', 'PUT', { ...router, key: 'separate-mock-a' });
  const row = db.prepare('SELECT sealed FROM credentials WHERE owner=?').get(a.user.id);
  const catalog = await a.json('ai/test', 'POST', { saved: true });
  assert.equal(catalog.suggested, model);
  assert.equal(catalog.catalog.find(record => record.id === model).name, 'NVIDIA Nemotron 3 Ultra (gratuito)');
  const probe = await a.json('ai/probe', 'POST', { ...router, model, key: 'draft-test-key' });
  assert.equal(probe.characters, 2);
  assert.equal(calls.at(-1).data.model, model);
  assert.equal(calls.at(-1).data.stream, false);
  assert.equal(calls.at(-1).authorization, 'Bearer draft-test-key');
  assert.deepEqual(db.prepare('SELECT sealed FROM credentials WHERE owner=?').get(a.user.id), row);
  assert.deepEqual((await a.json('ai/usage')), { usage: 4, limit: 10, remaining: 6, reset: 'monthly', free: true });
  assert.equal(calls.at(-1).authorization, 'Bearer separate-mock-a');
  await b.json('ai/probe', 'POST', { saved: true }, 409);
  await b.json('ai/usage', 'GET', null, 409);
  assert.equal((await b.json('ai')).connection, null);
  assert.doesNotMatch(JSON.stringify(diagnostics), /draft-test-key|separate-mock-a|private-key-label/);
});

test('documentos, sessões e exportações são isolados, e exclusão de projeto conserva biblioteca', async t => {
  const { base, db } = await setup(t);
  const a = browser(base), b = browser(base);
  await a.signUp('privacy-a@example.com', 'Conta A');
  await b.signUp('privacy-b@example.com', 'Conta B');
  const sample = { name: 'Laboratório A', active: 'src/app.js', files: { 'src/app.js': 'console.log(1)' } };
  const project = await a.json('projects/lab-a', 'PUT', sample);
  const rejected = JSON.parse('{"name":"Arquivo","active":"../segredo.js","files":{"../segredo.js":"texto"}}');
  await a.json('projects/bad', 'PUT', rejected, 400);
  const document = await a.json('memory/documents', 'POST', { name: 'Privado A', content: 'Metadados identificadores', category: 'code', project: 'lab-a' });
  const doc = 'memory/documents/' + document.id;
  assert.equal((await a.json(doc)).category, 'code');
  await b.json(doc, 'GET', null, 404);
  await b.json(doc, 'PATCH', { category: 'notes' }, 404);
  await b.json('memory/documents', 'POST', { name: 'Falso', content: 'Curto', category: 'code', project: 'lab-a' }, 404);
  assert.equal((await b.json('memory')).documents.length, 0);
  await b.json('projects/lab-a/versions', 'GET', null, 404);
  const link = await a.json('chats', 'POST', { title: 'Privado A', project: 'lab-a' }, 201);
  await b.json('chats/' + link.id + '/export', 'GET', null, 404);
  await b.json('auth/sessions/' + (await a.json('auth/sessions'))[0].id, 'DELETE', {}, 404);
  await a.json('projects/lab-a', 'DELETE', { version: project.version, confirm: true });
  assert.equal((await a.json(doc)).project, null);
  assert.equal((await a.json('chats/' + link.id)).project, null);
  const status = await a.call('status');
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.equal(status.headers.get('access-control-allow-origin'), null);
  db.prepare('UPDATE users SET name=email WHERE id=?').run(a.user.id);
  assert.equal((await a.json('status')).user.name, 'Estudante');
  const response = await b.call('export');
  assert.doesNotMatch(await response.text(), /Metadados identificadores|Privado A/);
});
