import { chatEvents } from './chat-stream.js';
import { api, get, navigate, state, write } from './client.js';
import { action, busy, confirmAction, copy, el, empty, field, icon, input, link, markdown, modal, notify, panel, select, submit, title } from './ui.js';

const modes = [['general','Conversa geral'],['code','Programação'],['study','Estudos']];
const operations = new Map();

function renderMessage(item, edit) {
  const role = item.role;
  const content = typeof item.content === 'string' && item.content.trim() ? item.content : '';
  if (role === 'tool') return el('article', { class: 'chat-message tool' },
    el('strong', { text: 'Busca em documentos' }), el('p', { text: content }));
  const failed = item.status === 'error';
  const cancelled = item.status === 'cancelled';
  const label = cancelled ? ' · Interrompida' : failed ? ' · Falha na geração' : '';
  const detail = failed ? (typeof item.error === 'string' && item.error || 'A geração anterior falhou. Use Regenerar para tentar novamente.') :
    cancelled && !content ? 'Geração interrompida.' : !content ? 'O modelo concluiu sem uma resposta final.' : '';
  return el('article', { class: 'chat-message ' + role },
    el('span', { class: 'label' + (failed ? ' error-text' : ''), text: (role === 'user' ? 'Você' : 'Titan AI') + label }),
    content && markdown(content),
    detail && el('p', { class: failed ? 'error-text' : 'muted', text: detail }),
    item.attachments?.length ? el('div', { class: 'row' }, item.attachments.map(file => el('span', { class: 'pill' }, icon('clip', 12), file.name))) : '',
    el('div', { class: 'row' },
      content && action('Copiar', () => copy(content), { kind: 'quiet' }),
      role === 'user' && action('Editar', () => edit(item), { kind: 'quiet' })));
}

export async function chatPage(id) {
  const [records, info, chat, projects] = await Promise.all([
    get('chats'), get('ai'), id ? get('chats/' + encodeURIComponent(id)) : null, get('projects')
  ]);
  const list = el('div', { class: 'chat-list' });
  const search = input('q', { type: 'search', maxlength: 160, placeholder: 'Pesquisar conversas', 'aria-label': 'Pesquisar conversas' });
  const archived = input('archived', { type: 'checkbox', checked: chat?.archived === 1 });
  let sequence = 0;
  let debounce;
  function draw(rows) {
    list.replaceChildren(...(rows.length ? rows.map(row => el('a', { href: '#chat/' + row.id, 'aria-current': row.id === id ? 'true' : null,
      text: (row.pinned ? '◆ ' : '') + row.title })) : [empty('Nenhuma conversa.', 'chat')]));
  }
  async function refresh() {
    const call = ++sequence;
    try {
      const result = await get('chats?' + new URLSearchParams({ q: search.value.trim(), archived: archived.checked ? '1' : '0' }));
      if (call === sequence) draw(result);
    } catch (error) { if (call === sequence && list.isConnected) notify(error.message, true); }
  }
  search.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(refresh, 220); });
  archived.addEventListener('change', refresh);
  draw(records);
  if (archived.checked) refresh();

  function create() {
    const form = el('form', { class: 'form-grid' },
      field('Título opcional', input('title', { maxlength: 100, placeholder: 'Nova conversa' })),
      field('Modo', select('mode', modes, 'general')),
      field('Projeto de contexto', select('project', [['','Nenhum'], ...projects.map(row => [row.id,row.name])], '')),
      state.user.preferences.memory && checkMemory(false), submit('Criar conversa'));
    const dialog = modal('Nova conversa', form);
    busy(form, async data => {
      const row = await write('chats', 'POST', { ...data, memory: data.memory === 'on' });
      dialog.close(); navigate('chat', row.id);
    });
  }
  const aside = panel(action('Nova conversa', create, { kind: 'primary', icon: 'plus' }), search,
    el('label', { class: 'checkline' }, archived, 'Arquivadas'), list);
  aside.id = 'chat-history';
  aside.classList.add('chat-sidebar');
  const chatLayout = el('div', { class: 'chat-layout' });
  const history = action('Conversas', () => historyOpen(aside.hidden), { icon: 'panel' });
  history.setAttribute('aria-controls', aside.id);
  function historyOpen(open) {
    aside.hidden = !open;
    history.setAttribute('aria-expanded', String(open));
    chatLayout.classList.toggle('history-off', !open);
  }
  historyOpen(!matchMedia('(max-width: 767px)').matches || !chat);
  const modelLabel = el('span', { class: 'pill provider-model' });
  function connectionLabel() {
    const current = info.connection;
    modelLabel.replaceChildren(el('span', { class: 'dot' + (current.state === 'connected' ? '' : ' dim'), 'aria-hidden': 'true' }),
      current.modelName || current.model, el('span', { class: 'description', text: current.state === 'connected' ? '· Conectada' : '· Verificar conexão' }));
  }
  if (info.connection) connectionLabel();
  async function chooseModel(event) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const current = info.connection;
      const result = await write('ai/test', 'POST', { saved: true });
      const choices = result.catalog?.map(item => [item.id,item.name]) || result.models.map(id => [id,id]);
      const form = el('form', { class: 'form-grid' }, field('Modelo disponível', select('model', choices, current.model)), submit('Usar modelo'));
      const dialog = modal('Selecionar modelo', form);
      busy(form, async ({ model }) => {
        if (!model) throw new Error('Selecione um modelo do catálogo.');
        info.connection = await write('ai', 'PUT', { provider: current.provider, endpoint: current.endpoint, mode: current.mode, model });
        connectionLabel();
        dialog.close();
        notify('Modelo atualizado.');
      });
    } catch (error) { notify(error.message, true); }
    finally { button.disabled = false; }
  }
  const selector = info.connection && action('Selecionar modelo', chooseModel, { icon: 'settings' });
  const main = panel();
  main.classList.add('chat-main');
  if (!chat) {
    main.append(empty('Abra ou crie uma conversa para falar com a Titan AI.', 'chat'), action('Criar conversa', create, { icon: 'plus' }));
    if (!info.connection) main.append(link('Configurar minha IA', '#ai', 'secondary', 'spark'));
  } else {
    const path = 'chats/' + encodeURIComponent(id);
    const log = el('div', { class: 'chat-log', role: 'log', 'aria-label': 'Mensagens' });
    const composer = el('textarea', { name: 'content', rows: 3, required: true, maxlength: 12000, placeholder: 'Escreva sua mensagem…', 'aria-label': 'Sua mensagem' });
    try {
      const key = 'titan-tutor:' + id;
      composer.value = sessionStorage.getItem(key) || '';
      if (composer.value) sessionStorage.removeItem(key);
    } catch {}
    const attached = el('div', { class: 'row', 'aria-live': 'polite' });
    const fileInput = input('file', { type: 'file', hidden: true, multiple: true, accept: '.txt,.md,.csv,.json,.html,.css,.js,.ts,.py,.lua,.luau,.sql,.java,.rs,.go,.xml,text/*' });
    const send = submit('Enviar');
    const stop = action('Interromper', interrupt, { kind: 'danger' });
    const attach = action('Anexar texto', () => fileInput.click(), { icon: 'clip' });
    const regen = action('Regenerar', () => confirmAction('Regenerar resposta', 'A última mensagem será enviada novamente. A resposta atual será substituída se a nova for concluída.', 'Regenerar', () => { generate({ action: 'regenerate' }); }));
    const configButton = action('Opções', settings, { icon: 'settings' });
    const feedback = el('div', { class: 'description muted', 'aria-live': 'polite' });
    const form = el('form', { class: 'compose' }, composer, attached, fileInput,
      el('div', { class: 'row spread' }, el('div', { class: 'row' }, attach, regen), el('div', { class: 'row' }, stop, send)), feedback);
    let files = [];
    let data = chat;
    function hasJob() { return operations.has(id); }
    function updateControls() {
      send.disabled = hasJob() || !info.connection;
      send.hidden = hasJob();
      stop.hidden = !hasJob();
      if (!hasJob()) stop.disabled = false;
      attach.disabled = hasJob();
      composer.disabled = hasJob();
      regen.hidden = !data.messages.some(row => row.role === 'user');
      regen.disabled = hasJob() || !info.connection;
      configButton.disabled = hasJob();
      if (selector) selector.disabled = hasJob();
    }
    function settings() {
      const form = el('form', { class: 'form-grid' },
        field('Nome da conversa', input('title', { required: true, maxlength: 100, value: data.title })),
        field('Modo', select('mode', modes, data.mode)),
        field('Projeto', select('project', [['','Nenhum'], ...projects.map(row => [row.id,row.name])], data.project || '')),
        state.user.preferences.memory && checkMemory(Boolean(data.memory)),
        el('label', { class: 'checkline' }, input('pinned', { type: 'checkbox', checked: Boolean(data.pinned) }), 'Fixar conversa'),
        el('label', { class: 'checkline' }, input('archived', { type: 'checkbox', checked: Boolean(data.archived) }), 'Arquivar conversa'),
        submit('Salvar alterações'));
      const dialog = modal('Opções da conversa', el('div', { class: 'stack' }, form, el('div', { class: 'row' },
        el('a', { class: 'button quiet', href: './api/' + path + '/export?account=' + state.user.id, download: 'titan-conversa.ndjson', text: 'Exportar conversa' }),
        action('Excluir conversa', () => confirmAction('Excluir conversa', 'O histórico será excluído da sua conta.', 'Excluir', async () => {
          await write(path, 'DELETE'); navigate('chat');
        }), { kind: 'danger' }))));
      busy(form, async fields => {
        await write(path, 'PATCH', { ...fields, pinned: fields.pinned === 'on', archived: fields.archived === 'on',
          ...(state.user.preferences.memory && { memory: fields.memory === 'on' }) });
        dialog.close(); navigate('chat', id);
      });
    }
    function edit(item) {
      if (hasJob()) return notify('Aguarde a geração atual.', true);
      if (data.archived || !info.connection) return notify('Desarquive a conversa e configure sua IA para editar.', true);
      const form = el('form', { class: 'form-grid' },
        el('p', { text: 'A edição retomará a conversa neste ponto e substituirá as mensagens seguintes.' }),
        field('Sua mensagem', el('textarea', { name: 'content', required: true, rows: 5, maxlength: 12000 }, item.content)),
        submit('Confirmar e gerar'));
      const dialog = modal('Editar mensagem', form);
      busy(form, async ({ content }) => { dialog.close(); generate({ action: 'edit', message: item.id, content, confirm: true }); });
    }
    function renderLog(scroll = false) {
      log.replaceChildren(data.before ? action('Carregar mensagens anteriores', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const prior = await get(path + '?before=' + data.before);
          data.messages.unshift(...prior.messages);
          data.before = prior.before;
          const beforeHeight = log.scrollHeight;
          renderLog();
          log.scrollTop = log.scrollHeight - beforeHeight;
        } catch (error) { notify(error.message, true); button.disabled = false; }
      }, { kind: 'quiet' }) : '',
      ...(data.messages.length ? data.messages.map(item => renderMessage(item, edit)) : [empty('Envie a primeira mensagem desta conversa.', 'chat')]));
      if (scroll) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
      updateControls();
    }
    function drawFiles() {
      attached.replaceChildren(...files.map((file, index) => el('span', { class: 'pill' }, file.name,
        action('×', () => { files.splice(index, 1); drawFiles(); }, { kind: 'quiet', title: 'Remover ' + file.name }))));
    }
    fileInput.addEventListener('change', async () => {
      const selected = [...fileInput.files];
      fileInput.value = '';
      const permitted = /\.(?:txt|md|csv|json|html|css|js|ts|py|lua|luau|sql|java|rs|go|xml)$/i;
      try {
        if (files.length + selected.length > 4) throw new Error('Anexe até quatro arquivos.');
        if (selected.some(file => file.size > 64000 || file.name.length > 120 || !(permitted.test(file.name) || file.type.startsWith('text/'))))
          throw new Error('Selecione arquivos de texto de até 64 KB.');
        const extracted = await Promise.all(selected.map(async file => ({ name: file.name, content: await file.text() })));
        if (extracted.some(file => file.content.length > 16000 || file.content.includes('\0'))) throw new Error('Os anexos devem ter até 16 mil caracteres de texto.');
        files.push(...extracted); drawFiles();
      } catch (error) { notify(error.message, true); }
    });
    async function interrupt() {
      stop.disabled = true;
      try {
        await write(path + '/cancel', 'POST');
        operations.get(id)?.controller.abort();
      } catch (error) { notify(error.message, true); stop.disabled = false; }
    }
    async function generate(payload) {
      if (hasJob() || !info.connection) return;
      const controller = new AbortController();
      let finishOperation;
      const finished = new Promise(resolve => { finishOperation = resolve; });
      operations.set(id, { controller, finished });
      updateControls();
      feedback.textContent = 'Gerando resposta…';
      const streamText = el('div', { class: 'live-text' });
      const place = el('article', { class: 'chat-message assistant' }, el('span', { class: 'label', text: 'Titan AI' }), streamText);
      if (payload.action === 'send') log.append(renderMessage({ role: 'user', content: payload.content, attachments: payload.attachments }, () => {}));
      log.append(place); log.scrollTop = log.scrollHeight;
      let frame;
      let text = '';
      try {
        const response = await api(path + '/generate', { method: 'POST', data: payload, stream: true, signal: controller.signal });
        if (payload.action === 'send') { composer.value = ''; files = []; drawFiles(); }
        for await (const item of chatEvents(response)) {
          if (item.type === 'reasoning') feedback.textContent = 'O modelo está preparando a resposta…';
          if (item.type === 'delta') {
            if (!text) feedback.textContent = 'Recebendo resposta…';
            text += item.text;
            if (!frame) frame = requestAnimationFrame(() => {
              frame = null;
              streamText.textContent = text;
              if (log.scrollHeight - log.scrollTop - log.clientHeight < 240) log.scrollTop = log.scrollHeight;
            });
          }
          if (item.type === 'tool') log.insertBefore(renderMessage({ role: 'tool', content: item.sources.join(', ') }), place);
          if (item.type === 'error') feedback.textContent = item.message;
          if (item.type === 'done') {
            if (item.status === 'cancelled') feedback.textContent = 'Geração interrompida.';
            else if (item.status === 'done') feedback.textContent = text.trim() ? '' : 'A geração terminou sem texto final.';
          }
        }
      } catch (error) { feedback.textContent = controller.signal.aborted ? 'Geração interrompida.' : error.message; }
      finally {
        if (frame) cancelAnimationFrame(frame);
        operations.delete(id);
        finishOperation();
        if (log.isConnected) {
          try {
            data = await get(path);
            if (data.messages.at(-1)?.error === feedback.textContent) feedback.textContent = '';
            renderLog(true); refresh();
          }
          catch (error) { streamText.textContent = text; notify(error.message, true); updateControls(); }
          if (!composer.disabled) composer.focus();
        }
      }
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const content = composer.value.trim();
      if (content) generate({ action: 'send', content, attachments: [...files] });
    });
    composer.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); }
    });
    main.append(el('div', { class: 'row spread' }, el('div', {}, el('h2', { text: chat.title }), el('small', { text: modes.find(([key]) => key === chat.mode)[1] })),
      configButton), log);
    if (!info.connection) main.append(link('Configurar minha IA', '#ai', 'secondary', 'spark'));
    main.append(chat.archived ? el('p', { class: 'form-note', text: 'Esta conversa está arquivada.' }) : form);
    renderLog(true);
    const pending = operations.get(id);
    if (pending) {
      feedback.textContent = 'Geração em andamento…';
      pending.finished.then(async () => {
        if (!log.isConnected) return;
        feedback.textContent = '';
        try { data = await get(path); renderLog(true); }
        catch (error) { notify(error.message, true); updateControls(); }
      });
    }
    if (state.generationProbe === id) {
      state.generationProbe = null;
      requestAnimationFrame(() => {
        if (log.isConnected) generate({ action: 'send', content: 'Responda somente: OK' });
      });
    }
  }
  chatLayout.append(aside, main);
  const tools = el('div', { class: 'row' }, history, selector,
    info.connection ? modelLabel : link('Configurar minha IA', '#ai', 'secondary', 'spark'));
  return el('div', {}, title('Titan AI', '', tools), chatLayout);
}
function checkMemory(checked) {
  return el('label', { class: 'checkline' }, input('memory', { type: 'checkbox', checked }), 'Usar memória nesta conversa');
}
