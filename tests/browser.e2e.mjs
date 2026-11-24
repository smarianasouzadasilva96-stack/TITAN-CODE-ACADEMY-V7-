import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { chromium, devices } from 'playwright';
import { createApp } from '../server.js';
import { transport } from '../server/providers.js';

const listen = async server => {
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  return 'http://127.0.0.1:' + server.address().port;
};
const finish = server => new Promise(resolve => server.close(resolve));

test('fluxos de conta, configuração de IA, chat, aprendizado e editor no Chromium', { timeout: 120000 }, async t => {
  const viewports = [320,360,390,412,768,1024,1440];
  let replies = 0;
  const mock = createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'kimi-k2.7-code' }] }));
      return;
    }
    if (request.url === '/models') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: [
        { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA: Nemotron 3 Ultra (free)' },
        { id: 'qwen/qwen3-8b', name: 'Qwen3 8B' }
      ] }));
      return;
    }
    if (request.url === '/key') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: { usage: 0, limit: null, limit_remaining: null, is_free_tier: true } }));
      return;
    }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    if (!payload.stream) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }));
      return;
    }
    const ollama = request.url === '/api/chat';
    response.setHeader('Content-Type', ollama ? 'application/x-ndjson' : 'text/event-stream');
    const packet = (content, reason, thought) => {
      const event = ollama ? { message: { thinking: thought, content }, done: Boolean(reason), done_reason: reason }
        : { choices: [{ delta: { reasoning_content: thought, content }, finish_reason: reason }] };
      return (ollama ? '' : 'data: ') + JSON.stringify(event) + (ollama ? '\n' : '\n\n');
    };
    response.write(packet(false, null, 'texto interno'));
    if (payload.messages.at(-1).content === 'Responda somente: OK') {
      response.end(packet('OK','stop'));
      return;
    }
    if (++replies === 2) {
      response.end(packet(false,'length'));
      return;
    }
    if (replies === 3) {
      response.end(packet('Resposta regenerada','stop'));
      return;
    }
    response.write(packet('Resposta '));
    setTimeout(() => response.end(packet('**do Titan**.', 'stop')), 90);

  });
  const localUrl = await listen(mock);
  const request = transport();
  const app = createApp({ database: ':memory:', master: randomBytes(32), provider: {
    localUrl, request: (setting, path, options) => request({ ...setting, endpoint: localUrl, local: true }, path, options)
  } });
  const base = await listen(app);
  const browser = await chromium.launch({
    executablePath: process.env.TITAN_CHROMIUM || undefined,
    args: ['--no-sandbox','--disable-dev-shm-usage']
  });
  t.after(async () => { await browser.close(); await finish(app); await finish(mock); });
  const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 360, height: 760 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(9500);
  const exceptions = [];
  const browserErrors = [];
  const apiResponses = [];
  page.on('response', response => {
    if (response.url().startsWith(base + '/api/')) apiResponses.push(response.request().method() + ' ' + new URL(response.url()).pathname + ' ' + response.status());
  });
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', error => exceptions.push(error.message));
  const here = path => page.goto(base + path);
  const expectVisible = locator => locator.first().waitFor({ state: 'visible', timeout: 9000 });
  const sweep = async (name, locator) => {
    await expectVisible(locator);
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 860 });
      const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(dimensions[0] <= dimensions[1] + 1, name + ' transborda em ' + width + ' px: ' + dimensions);
      if (process.env.TITAN_SCREENSHOT_DIR) {
        await page.screenshot({ path: process.env.TITAN_SCREENSHOT_DIR + '/titan-' + name + '-' + width + '.png', animations: 'disabled' });
      }
    }
    await page.setViewportSize({ width: 360, height: 760 });
  };
  await here('/');
  await expectVisible(page.getByRole('heading', { name: 'Entre na sua conta' }));
  await page.getByRole('link', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Seu nome').fill('Lara');
  await page.getByLabel('E-mail').fill('lara@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('longo-suficiente-12345');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expectVisible(page.getByRole('heading', { name: 'Código de recuperação' }));
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expectVisible(page.getByRole('heading', { name: 'Minha Inteligência Artificial' }));
  await page.getByLabel('Provedor', { exact: true }).selectOption('ollama-cloud');
  await page.getByLabel('Chave API', { exact: true }).fill('cloud-fixture');
  await page.getByRole('button', { name: 'Consultar modelos', exact: true }).click();
  await expectVisible(page.getByText('Sugestão: qwen3:8b.', { exact: false }));
  assert.equal(await page.getByLabel('Modelo', { exact: true }).inputValue(), 'qwen3:8b');
  await page.getByLabel('Modelo', { exact: true }).selectOption('kimi-k2.7-code');
  await page.getByRole('button', { name: 'Testar conexão', exact: true }).click();
  await expectVisible(page.getByText('O provedor disponibiliza este modelo.', { exact: false }));
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
  await expectVisible(page.getByText('Último teste em', { exact: false }));
  await page.getByRole('button', { name: 'Testar geração no chat', exact: true }).click();
  const log = page.getByRole('log', { name: 'Mensagens' });
  await expectVisible(log.getByText('OK', { exact: true }));
  assert.equal(await log.getByText('false', { exact: true }).count(), 0);
  const literalFalse = await page.locator('.chat-main').evaluate(node => [...node.childNodes].some(child =>
    child.nodeType === Node.TEXT_NODE && child.textContent === 'false'));
  assert.equal(literalFalse, false);
  assert.equal(await log.getByText('texto interno', { exact: true }).count(), 0);
  await here('/#ai');
  await page.getByLabel('Provedor', { exact: true }).selectOption('openrouter');
  await page.getByLabel('Chave API', { exact: true }).fill('openrouter-fixture');
  await page.getByRole('button', { name: 'Consultar modelos', exact: true }).click();
  const nvidia = 'nvidia/nemotron-3-ultra-550b-a55b:free';
  await expectVisible(page.getByText('Sugestão: ' + nvidia + '.', { exact: false }));
  assert.equal(await page.getByLabel('Modelo', { exact: true }).inputValue(), nvidia);
  await page.getByRole('button', { name: 'Testar geração', exact: true }).click();
  await expectVisible(page.getByText('enviou uma resposta de 2 caractere(s)', { exact: false }));
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
  await expectVisible(page.getByText('Último teste em', { exact: false }));
  await page.getByRole('button', { name: 'Consultar uso', exact: true }).click();
  await expectVisible(page.getByText('Chave do plano gratuito', { exact: false }));
  await sweep('provedores', page.getByRole('heading', { name: 'Minha Inteligência Artificial' }));
  await page.getByRole('link', { name: 'Iniciar conversa', exact: true }).click();
  await page.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await page.getByLabel('Título opcional').fill('Meu teste');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar conversa', exact: true }).click();
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Conversas', exact: true }).getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  await page.getByRole('button', { name: 'Selecionar modelo', exact: true }).click();
  assert.equal(await page.getByLabel('Modelo disponível').inputValue(), nvidia);
  await page.getByRole('button', { name: 'Usar modelo', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const composer = page.getByRole('textbox', { name: 'Sua mensagem' });
  await composer.fill('Olá no celular');
  assert.equal(await composer.inputValue(), 'Olá no celular');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  try { await expectVisible(page.getByText('do Titan', { exact: true })); }
  catch (error) { throw new Error(JSON.stringify({ messages: await log.textContent(), body: (await page.locator('main').textContent()).slice(-1300),
    form: await page.locator('form.compose').evaluate(form => [...form.elements].map(node =>
      [node.tagName,node.name,node.value,node.validationMessage,node.disabled])),
    exceptions, browserErrors, apiResponses: apiResponses.slice(-20) }), { cause: error }); }
  await page.reload();
  await expectVisible(page.getByText('Olá no celular', { exact: true }));
  const regenerate = async () => {
    await page.getByRole('button', { name: 'Regenerar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Regenerar', exact: true }).click();
  };
  await regenerate();
  await expectVisible(page.getByText('O modelo atingiu o limite de geração antes de enviar uma resposta final.', { exact: true }));
  await expectVisible(log.getByText('do Titan', { exact: true }));
  await regenerate();
  await expectVisible(log.getByText('Resposta regenerada', { exact: true }));
  await sweep('chat', log);
  await page.getByRole('navigation', { name: 'Navegação rápida' }).getByRole('link', { name: 'Início', exact: true }).click();
  await expectVisible(page.getByRole('heading', { name: 'Olá, Lara.' }));
  await sweep('inicio', page.getByRole('heading', { name: 'Olá, Lara.' }));
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.getByRole('button', { name: 'Recolher ou expandir navegação', exact: true }).click();
  assert.equal(await page.locator('.layout.compact').count(), 1);
  await page.getByRole('button', { name: 'Recolher ou expandir navegação', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 760 });
  await page.getByRole('link', { name: 'Começar a estudar' }).click();
  await page.getByRole('radio', { name: '<main>', exact: true }).check();
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  await expectVisible(page.getByText('Resposta correta. +25 XP.', { exact: false }));
  assert.deepEqual(await page.getByRole('navigation', { name: 'Navegação rápida' }).getByRole('link').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('aria-label'))), ['Início','Cursos','Editor','Titan AI','Perfil']);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Meu pet', exact: true }).click();
  await expectVisible(page.getByText('Nascimento', { exact: true }));
  await page.getByLabel('Nome do pet').fill('Pixel');
  await page.getByRole('button', { name: 'Salvar pet' }).click();
  await expectVisible(page.getByRole('heading', { name: 'Pixel' }));
  await sweep('pet', page.getByRole('heading', { name: 'Pixel' }));
  await here('/#preferences');
  await expectVisible(page.getByRole('heading', { name: 'Perfil e configurações' }));
  assert.equal(await page.getByText('lara@example.com', { exact: true }).count(), 0);
  for (const theme of ['light','amoled','dark']) {
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    await page.locator('#profile-appearance').getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
  }
  await sweep('perfil', page.getByRole('heading', { name: 'Perfil e configurações' }));
  await here('/#memory');
  await page.getByRole('button', { name: 'Adicionar documento', exact: true }).click();
  const documentDialog = page.getByRole('dialog', { name: 'Adicionar documento' });
  await documentDialog.getByLabel('Importar arquivo de texto').setInputFiles({ name: 'notas.md', mimeType: 'text/markdown', buffer: Buffer.from('Conteúdo sobre átomos.') });
  await documentDialog.getByLabel('Título').fill('Notas de aula');
  await documentDialog.getByLabel('Categoria').selectOption('notes');
  await documentDialog.getByRole('button', { name: 'Adicionar documento', exact: true }).click();
  await expectVisible(page.getByRole('heading', { name: 'Notas de aula', exact: true }));
  await page.getByRole('button', { name: 'Visualizar', exact: true }).click();
  const viewDialog = page.getByRole('dialog', { name: 'Notas de aula' });
  await expectVisible(viewDialog.getByText('Conteúdo sobre átomos.', { exact: true }));
  await viewDialog.getByLabel('Categoria').selectOption('reference');
  await viewDialog.getByRole('button', { name: 'Salvar associação', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('Buscar na biblioteca').fill('átomos');
  await page.getByRole('button', { name: 'Buscar no conteúdo', exact: true }).click();
  try { await expectVisible(page.getByRole('heading', { name: 'Trechos encontrados' })); }
  catch (error) { throw new Error(JSON.stringify({ apiResponses: apiResponses.slice(-10),
    alerts: await page.getByRole('alert').allTextContents(), exceptions, browserErrors }), { cause: error }); }
  await expectVisible(page.getByText('Conteúdo sobre átomos.', { exact: true }));
  await page.getByLabel('Buscar na biblioteca').clear();
  await sweep('memoria', page.getByRole('heading', { name: 'Memória e documentos' }));
  await here('/#courses');
  await sweep('cursos', page.getByRole('heading', { name: 'Cursos', exact: true }));
  await here('/#projects');
  await sweep('projetos', page.getByRole('heading', { name: 'Projetos', exact: true }));
  await page.setViewportSize({ width: 360, height: 760 });
  await here('/editor.html');
  const editor = page.getByRole('textbox', { name: 'Editor de código' });
  await expectVisible(editor);
  await page.waitForFunction(() => document.getElementById('codeEditor').value.length > 0);
  await page.getByRole('button', { name: 'Arquivos', exact: true }).click();
  await expectVisible(page.getByRole('region', { name: 'Explorador de arquivos' }));
  await page.getByRole('button', { name: 'Fechar explorador', exact: true }).click();
  const original = await editor.inputValue();
  await editor.fill('<h1>Projeto sincronizado</h1>');
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  assert.equal(await editor.inputValue(), original);
  await page.getByRole('button', { name: 'Refazer', exact: true }).click();
  assert.equal(await editor.inputValue(), '<h1>Projeto sincronizado</h1>');
  await expectVisible(page.getByText('Sincronizado', { exact: true }));
  const projectId = await page.evaluate(async () => (await (await fetch('/api/projects')).json())[0].id);
  await here('/editor.html?project=' + projectId);
  await expectVisible(editor);
  await page.waitForFunction(() => document.getElementById('codeEditor').value === '<h1>Projeto sincronizado</h1>');
  await expectVisible(page.getByText('Sincronizado', { exact: true }));
  assert.equal(await editor.inputValue(), '<h1>Projeto sincronizado</h1>');
  await page.locator('#mobilePreviewTab').click();
  try { await expectVisible(page.frameLocator('#previewFrame').getByRole('heading', { name: 'Projeto sincronizado' })); }
  catch (error) {
    const frame = page.locator('#previewFrame');
    throw new Error(error.message + '\n' + JSON.stringify({ frames: page.frames().map(frame => frame.url()),
      hasSrcdoc: Boolean(await frame.getAttribute('srcdoc')), visible: await frame.isVisible(), browserErrors, exceptions }), { cause: error });
  }
  const [scrollWidth, width] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(scrollWidth <= width + 1, 'editor transborda em dispositivo móvel');
  await page.getByRole('button', { name: 'Prévia em tela cheia', exact: true }).click();
  assert.equal(await page.locator('#previewPane.fullscreen').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('#mobileConsoleTab').click();
  await expectVisible(page.locator('#consolePane[open]'));
  await page.locator('#mobileEditorTab').click();
  await sweep('editor', editor);
  await here('/#projects');
  await page.getByText('Mais ações', { exact: true }).click();
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click();
  const copied = page.locator('.document-card').filter({ has: page.getByRole('heading', { name: /\(cópia\)$/ }) });
  await expectVisible(copied);
  await copied.getByText('Mais ações', { exact: true }).click();
  const download = page.waitForEvent('download');
  await copied.getByRole('button', { name: 'Exportar ZIP', exact: true }).click();
  assert.match((await download).suggestedFilename(), /\.zip$/);
  await copied.getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  await copied.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const importDialog = page.getByRole('dialog', { name: 'Importar projetos' });
  await importDialog.getByLabel('Backup de projetos').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    version: 3, projects: [{ name: 'Do backup V3', active: 'main.js', files: { 'main.js': 'const ok = true;' } }]
  })) });
  await importDialog.getByRole('button', { name: 'Importar projetos', exact: true }).click();
  await expectVisible(page.getByRole('heading', { name: 'Do backup V3' }));
  assert.deepEqual(exceptions, []);

  await here('/editor.html?local=1');
  await expectVisible(editor);
  assert.notEqual(await editor.inputValue(), '<h1>Projeto sincronizado</h1>');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expectVisible(editor);
  await expectVisible(page.getByText('Editor local', { exact: true }));
});
