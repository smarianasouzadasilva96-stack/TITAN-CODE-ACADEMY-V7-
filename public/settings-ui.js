import { applyTheme, initials, recoveryCode } from './academy.js';
import { api, get, navigate, state, write } from './client.js';
import { action, busy, confirmAction, el, empty, field, formatDate, icon, input, link, modal, notify, panel, select, submit, title, values } from './ui.js';

const head = (label, extra) => el('div', { class: 'panel-head' }, el('h2', { text: label }), extra);
const checkline = (label, name, checked) => el('label', { class: 'checkline' }, input(name, { type: 'checkbox', checked }), label);
const providers = [['openrouter','OpenRouter'],['ollama-cloud','Ollama Cloud'],['ollama-local','Ollama local'],['custom','Endpoint compatível']];
const states = { connected: 'Conectada', authentication: 'Erro de autenticação', model_unavailable: 'Modelo indisponível',
  unavailable: 'Indisponível', network: 'Erro de conexão', provider_limit: 'Limite atingido', blocked_endpoint: 'Endpoint bloqueado' };
const statusLabel = state => states[state] || 'Verificação pendente';

export async function aiSetup() {
  const info = await get('ai');
  const saved = info.connection;
  const provider = select('provider', providers, saved?.provider || 'openrouter');
  const key = input('key', { type: 'password', autocomplete: 'off', maxlength: 2048,
    placeholder: saved?.hasKey ? 'Chave cadastrada' : 'Cole sua chave do provedor' });
  const endpoint = select('endpoint', [['','Selecione um endpoint aprovado'], ...info.customEndpoints.map(url => [url,url])], saved?.endpoint || '');
  const endpointField = field('Endpoint', endpoint, 'Endereços HTTPS aprovados pelo operador.');
  const keyHelp = el('small');
  const models = select('model', [[saved?.model || '',saved?.modelName || saved?.model || 'Consulte os modelos disponíveis']], saved?.model || '');
  const storage = select('mode', [['session','Somente nesta sessão'], ...(info.canPersist || saved?.mode === 'persistent' ? [['persistent','Manter nos próximos acessos']] : [])], saved?.mode || (info.canPersist ? 'persistent' : 'session'));
  const feedback = el('p', { role: 'status', class: 'description' });
  const form = el('form', { class: 'form-grid', autocomplete: 'off' });
  const show = action('Mostrar', () => {
    const next = key.type === 'password';
    key.type = next ? 'text' : 'password'; show.textContent = next ? 'Ocultar' : 'Mostrar';
    show.setAttribute('aria-pressed', String(next));
  });
  show.setAttribute('aria-pressed', 'false');
  const save = submit('Salvar configuração');
  let modelCatalog = [];
  const step = el('div', { class: 'step-list', 'aria-label': 'Configuração' });
  function steps(index) {
    step.replaceChildren(...['Provedor','Chave','Modelo','Testar geração','Salvar','Conversar'].map((label, pos) =>
      el('span', { class: pos === index ? 'active' : '', 'aria-current': pos === index ? 'step' : null, text: label })));
  }
  function setFeedback(message, type = '') {
    feedback.textContent = message;
    feedback.className = 'description ' + type;
  }
  function showProvider() {
    endpointField.hidden = provider.value !== 'custom';
    const local = provider.value === 'ollama-local';
    const same = saved?.provider === provider.value && (provider.value !== 'custom' || saved.endpoint === endpoint.value);
    key.placeholder = same && saved.hasKey ? 'Chave cadastrada' : local || provider.value === 'custom' ? 'Chave opcional' : 'Cole sua chave do provedor';
    keyHelp.textContent = local ? info.localEnabled ? 'A instância local é definida pelo operador.' : 'O operador ainda precisa habilitar o Ollama local.' :
      same && saved?.hasKey ? 'Deixe o campo em branco para manter a credencial atual. Preencha para substituí-la.' :
      provider.value === 'custom' ? 'O endpoint pode exigir uma chave.' : 'A credencial fica associada à sua conta.';
  }
  function reset() {
    modelCatalog = [];
    models.replaceChildren(el('option', { value: '', text: 'Consulte os modelos disponíveis' }));
    save.disabled = true; setFeedback(''); steps(1); showProvider();
  }
  const load = action('Consultar modelos', event => check(event.currentTarget, false), { icon: 'search' });
  const test = action('Testar conexão', event => check(event.currentTarget, true), { icon: 'link', disabled: !saved });
  async function check(button, selectCurrent) {
    if (load.disabled || test.dataset.busy === '1') return;
    const request = values(form);
    const revision = [provider.value, endpoint.value, key.value];
    button.disabled = true; test.dataset.busy = '1';
    setFeedback('Consultando o provedor…'); steps(3);
    try {
      const result = await write('ai/test', 'POST', request);
      if (!revision.every((value, i) => value === [provider.value, endpoint.value, key.value][i])) return;
      const previous = request.model;
      modelCatalog = result.models;
      if (!modelCatalog.length) throw new Error('O provedor não disponibilizou modelos.');
      const labels = new Map(result.catalog?.map(item => [item.id,item.name]) || []);
      models.replaceChildren(...modelCatalog.map(id => el('option', { value: id, text: labels.get(id) || id })));
      models.value = modelCatalog.includes(previous) ? previous : result.suggested || modelCatalog[0];
      save.disabled = false;
      steps(selectCurrent && result.modelAvailable ? 4 : 2);
      setFeedback(selectCurrent && result.modelAvailable ? 'Conexão verificada. O provedor disponibiliza este modelo.' :
        modelCatalog.length + ' modelo(s) encontrados. ' + (result.suggested ? 'Sugestão: ' + result.suggested + '.' : 'Escolha um modelo disponível.'), 'success');
    } catch (error) {
      setFeedback(error.message, 'error-text');
      if (!saved || !models.value) save.disabled = true;
    } finally {
      button.disabled = false;
      test.disabled = !models.value;
      delete test.dataset.busy;
    }
  }
  for (const control of [provider, endpoint]) control.addEventListener('change', () => { key.value = ''; reset(); test.disabled = true; });
  key.addEventListener('input', () => { reset(); test.disabled = true; });
  models.addEventListener('change', () => { steps(3); test.disabled = false; });
  showProvider(); steps(saved ? 5 : 0);
  save.disabled = !saved;
  if (!info.canPersist) storage.value = 'session';
  const probe = action('Testar geração', async event => {
    const button = event.currentTarget;
    const request = values(form);
    if (!request.model) { setFeedback('Selecione um modelo para testar.', 'error-text'); return; }
    button.disabled = true;
    steps(3);
    setFeedback('Enviando uma mensagem de teste ao modelo…');
    try {
      const result = await api('ai/probe', { method: 'POST', data: request, signal: AbortSignal.timeout(190000) });
      steps(4);
      setFeedback(result.modelName + ' enviou uma resposta de ' + result.characters + ' caractere(s). Você pode salvar a configuração.', 'success');
    } catch (error) { setFeedback(error.message, 'error-text'); }
    finally { button.disabled = false; }
  }, { icon: 'send' });
  form.append(field('Provedor', provider), endpointField, field('Chave API', el('div', { class: 'input-row' }, key, show)), keyHelp,
    actionRow(load), field('Modelo', models, 'As opções vêm do catálogo do provedor.'),
    field('Armazenamento', storage, info.canPersist ? 'A opção persistente usa criptografia no servidor.' : 'A criptografia persistente requer a chave mestra do servidor.'),
    actionRow(test, probe, save), feedback);
  busy(form, async request => {
    try {
      await write('ai', 'PUT', request);
      key.value = '';
      notify('Configuração salva.');
      navigate('ai');
    } catch (error) { setFeedback(error.message, 'error-text'); }
  });
  const usage = el('p', { class: 'description', role: 'status' });
  const connected = saved && panel(head('Conexão atual', el('span', { class: 'pill' }, el('i', { class: 'dot' + (saved.state === 'connected' ? '' : ' dim') }), statusLabel(saved.state))),
    el('div', { class: 'stack' }, el('strong', { class: 'provider-model', text: saved.modelName || saved.model }), el('p', { text: providers.find(([id]) => id === saved.provider)[1] + ' · ' + (saved.mode === 'session' ? 'Somente nesta sessão' : 'Persistente') }),
      el('small', { text: 'Último teste em ' + formatDate(saved.tested) }), el('p', { text: saved.hasKey ? 'Chave cadastrada' : 'Sem chave' }),
      actionRow(link('Iniciar conversa', '#chat', 'primary', 'chat'),
        action('Testar geração no chat', async event => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const chat = await write('chats', 'POST', { title: 'Teste de geração da Titan AI', mode: 'general' });
            state.generationProbe = chat.id;
            navigate('chat', chat.id);
          } catch (error) { notify(error.message, true); }
          finally { button.disabled = false; }
        }, { icon: 'send' }),
        action('Verificar configuração salva', async event => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const result = await write('ai/test', 'POST', { saved: true });
            notify(result.modelAvailable ? 'Conexão verificada.' : 'O modelo deixou de estar disponível.', !result.modelAvailable);
          } catch (error) { notify(error.message, true); }
          finally { button.disabled = false; navigate('ai'); }
        }),
        saved.provider === 'openrouter' && action('Consultar uso', async event => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const result = await get('ai/usage');
            const usd = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(value);
            const window = {daily:'diária',weekly:'semanal',monthly:'mensal'}[result.reset];
            usage.textContent = [
              result.free && 'Chave do plano gratuito',
              result.usage != null && 'Uso · ' + usd(result.usage),
              result.limit != null && 'Limite · ' + usd(result.limit),
              result.remaining != null && 'Restante · ' + usd(result.remaining),
              window && 'Renovação ' + window
            ].filter(Boolean).join(' · ') || 'O provedor não informou limites para esta chave.';
          } catch (error) { usage.textContent = error.message; }
          finally { button.disabled = false; }
        }, { icon: 'bolt' }),
        action('Desconectar e excluir', () => confirmAction('Desconectar provedor', 'A configuração e sua chave serão removidas desta conta.',
          'Excluir configuração', async () => { await write('ai', 'DELETE'); notify('Provedor desconectado.'); navigate('ai'); }), { kind: 'danger' })), usage));
  return el('div', {}, title('Minha Inteligência Artificial', 'Escolha um provedor e use sua própria configuração na Titan AI.'),
    el('div', { class: 'dashboard-columns' }, panel(head(saved ? 'Editar configuração' : 'Configurar provedor'), step, form),
      connected || panel(head('Conexão atual'), empty('Nenhum provedor configurado.', 'spark'))));
}
const actionRow = (...children) => el('div', { class: 'row' }, children);
export async function preferences() {
  const sessions = await get('auth/sessions');
  const settings = state.user.preferences;
  let profile = { name: state.user.name, theme: settings.theme || 'dark', accent: settings.accent || '#00bfff',
    motion: settings.motion !== false, style: settings.style || 'balanced', goal: settings.goal || 3,
    memory: settings.memory === true, documents: settings.documents !== false, retention: settings.retention || 0 };
  let pending = Promise.resolve();
  function save(fields) {
    const next = pending.then(() => saveFields(fields));
    pending = next.catch(() => {});
    return next;
  }
  async function saveFields(fields) {
    const merged = { ...profile, ...fields };
    state.user = await write('profile', 'PATCH', merged);
    profile = { ...merged, name: state.user.name };
    applyTheme(); notify('Preferências salvas.');
    if (fields.name != null) navigate('preferences');
  }
  const form = (controls, callback) => busy(el('form', { class: 'form-grid' }, controls, submit('Salvar')), callback);
  function section(id, heading, ...body) {
    const group = panel(head(heading), body);
    group.id = 'profile-' + id;
    return group;
  }
  const mail = state.user.email?.split('@');
  const masked = mail?.length === 2 ? (mail[0][0] || '') + '•••@' + mail[1] : 'Conta cadastrada';
  const sections = [
    section('profile', 'Perfil', el('div', { class: 'row section-head' },
      el('span', { class: 'avatar', text: initials(), 'aria-hidden': 'true' }),
      el('div', {}, el('strong', { text: state.user.name }), el('p', { class: 'description', text: masked }))),
      form(field('Nome de exibição', input('name', { required: true, maxlength: 70, value: profile.name })), save)),
    section('appearance', 'Aparência', form([
      field('Tema', select('theme', [['dark','Crimson'],['light','Claro'],['amoled','AMOLED'],['forest','Floresta'],['ocean','Oceano'],['sunset','Pôr do sol'],['lavender','Lavanda']], profile.theme)),
      field('Cor de destaque RGB', input('accent', { type: 'color', value: profile.accent })),
      checkline('Animar elementos da interface', 'motion', profile.motion)
    ], data => save({ ...data, motion: data.motion === 'on' }))),
    section('ai', 'Preferências da IA', form([
      field('Estilo de resposta', select('style', [['balanced','Equilibrado'],['short','Curto'],['detailed','Detalhado']], profile.style)),
      field('Meta semanal em lições', input('goal', { required: true, type: 'number', min: 1, max: 30, value: profile.goal }))
    ], data => save({ ...data, goal: Number(data.goal) }))),
    section('privacy', 'Privacidade', form([
      checkline('Permitir memória em conversas selecionadas', 'memory', profile.memory),
      checkline('Permitir recuperação de documentos e arquivos de projeto', 'documents', profile.documents),
      el('p', { class: 'description', text: 'Trechos recuperados e anexos da conversa podem ser enviados ao provedor de IA escolhido.' }),
      field('Retenção de conversas inativas e preferências', select('retention',
        [['0','Até a exclusão manual'],['30','30 dias'],['90','90 dias'],['365','1 ano']], String(profile.retention)))
    ], data => save({ memory: data.memory === 'on', documents: data.documents === 'on', retention: Number(data.retention) })),
    link('Gerenciar memória e documentos', '#memory', 'quiet', 'memory')),
    section('security', 'Segurança', el('p', { text: 'Revise os dispositivos conectados e gerencie seu código de recuperação.' }),
      action('Sair desta conta', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try { await write('auth/logout', 'POST'); state.user = null; state.csrf = null; navigate('login'); }
        catch (error) { notify(error.message, true); button.disabled = false; }
      }, { icon: 'logout' })),
    section('sessions', 'Sessões', sessions.map(session => el('div', { class: 'data-row' },
      el('span', {}, session.current ? 'Sessão atual' : 'Outra sessão', el('br'),
        el('small', { text: 'Último acesso em ' + formatDate(session.seen) })),
      action('Encerrar', () => confirmAction('Encerrar sessão', 'Confirme a desconexão desta sessão.', 'Encerrar sessão', async () => {
        await write('auth/sessions/' + session.id, 'DELETE');
        if (session.current) { state.user = null; state.csrf = null; navigate('login'); }
        else navigate('preferences');
      }), { kind: 'quiet' })))),
    section('export', 'Exportação de dados', el('p', { text: 'Baixe seus dados e seu histórico no formato NDJSON.' }),
      el('a', { class: 'button secondary section-space', href: './api/export?account=' + state.user.id, download: 'titan-meus-dados.ndjson' },
        icon('download', 18), 'Exportar meus dados')),
    section('recovery', 'Recuperação de acesso', el('p', { text: 'Guarde seu código para recuperar a conta se esquecer sua senha.' }),
      action('Gerar novo código de recuperação', () => confirmAction('Gerar novo código', 'O novo código substitui o anterior.', 'Gerar código', async () => {
        const result = await write('auth/recovery', 'POST');
        setTimeout(() => recoveryCode(result.recovery), 100);
      })))
  ];
  const sectionsNav = [['profile','Perfil'],['appearance','Aparência'],['ai','Preferências da IA'],['privacy','Privacidade'],
    ['security','Segurança'],['sessions','Sessões'],['export','Exportação'],['recovery','Recuperação']];
  return el('div', {}, title('Perfil e configurações', 'Gerencie sua conta, a privacidade e a experiência de uso.'),
    el('nav', { class: 'account-nav', 'aria-label': 'Seções do perfil' }, sectionsNav.map(([id,label]) =>
      action(label, () => document.getElementById('profile-' + id)?.scrollIntoView({ block: 'start' }), { kind: 'secondary' }))),
    el('div', { class: 'grid two account-sections' }, sections));
}
export async function adminPage() {
  const data = await get('admin');
  const settings = el('form', { class: 'form-grid' }, field('Aviso da plataforma', input('notice', { value: data.settings.notice || '', maxlength: 300 })),
    checkline('Fechar novos cadastros', 'closed', data.settings.closed), submit('Salvar configuração'));
  busy(settings, async values => {
    await write('admin/settings', 'PATCH', { notice: values.notice, closed: values.closed === 'on' }); notify('Configuração salva.'); navigate('admin');
  });
  function edit(course) {
    const lessons = course.data.modules.flatMap(module => module.lessons);
    const lesson = select('lesson', [['','Somente informações do curso'], ...lessons.map(row => [row.id,row.title])], '');
    const lessonForm = el('div', { class: 'form-grid', hidden: true }, field('Explicação', el('textarea', { name: 'explanation', maxlength: 8000 })),
      field('Exemplo', el('textarea', { name: 'example', maxlength: 12000 })), field('Exercício', el('textarea', { name: 'exercise', maxlength: 4000 })));
    const form = el('form', { class: 'form-grid' }, field('Título', input('title', { required: true, maxlength: 70, value: course.data.title })),
      field('Descrição', input('description', { required: true, maxlength: 240, value: course.data.description })), checkline('Publicado', 'published', course.published === 1),
      field('Editar conteúdo', lesson), lessonForm, submit('Salvar curso'));
    lesson.addEventListener('change', () => {
      const row = lessons.find(item => item.id === lesson.value);
      lessonForm.hidden = !row;
      for (const key of ['explanation','example','exercise']) { form.elements[key].value = row?.[key] || ''; form.elements[key].required = !!row; }
    });
    const dialog = modal('Editar curso', form);
    busy(form, async data => {
      await write('admin/courses/' + course.id, 'PATCH', { ...data, lesson: data.lesson || null, published: data.published === 'on' });
      dialog.close(); notify('Curso atualizado.'); navigate('admin');
    });
  }
  const users = await get('admin/users');
  const accountRows = users.map(person => {
    const controls = [];
    const execute = (label, command, reason = '') => action(label, async () => {
      if (!window.confirm('Confirma ' + label.toLowerCase() + ' para ' + person.name + '?')) return;
      try { await write('admin/users/action', 'POST', { id: person.id, action: command, reason }); notify('Ação registrada.'); navigate('admin'); }
      catch (error) { notify(error.message, 'error'); }
    }, { kind: 'quiet' });
    if (person.role !== 'creator' && person.id !== state.user.id) {
      controls.push(execute('Encerrar sessões', 'logout'));
      if (data.role === 'creator') {
        if (person.role === 'student') controls.push(execute('Promover a admin', 'promote'));
        if (person.role === 'admin') controls.push(execute('Retirar admin', 'demote'));
        if (!person.banned) controls.push(action('Bloquear', async () => {
          const reason = prompt('Motivo do bloqueio (mínimo 5 caracteres):');
          if (!reason || reason.trim().length < 5) return;
          await write('admin/users/action', 'POST', { id: person.id, action: 'ban', reason: reason.trim() });
          notify('Conta bloqueada.'); navigate('admin');
        }, { kind: 'quiet' }));
        else controls.push(execute('Desbloquear', 'unban', 'Revisão do criador'));
      }
    }
    return el('div', { class: 'data-row' }, el('span', { text: person.name + ' · ' + person.email + ' · ' + person.role + (person.banned ? ' · BLOQUEADO' : '') }), ...controls);
  });
  const indicators = [['Usuários',data.users],['Ativos em 24 horas',data.active],['Latência média',data.averageMs + ' ms'],['Memória',data.memoryMB + ' MB']];
  return el('div', {}, title('Administração', 'Acompanhe a operação e gerencie conteúdo da academia.'),
    el('div', { class: 'stats' }, indicators.map(([label,value]) => panel(el('strong', { text: String(value) }), el('p', { text: label })))),
    el('div', { class: 'grid two' },
      el('div', { class: 'stack' }, panel(head('Configurações gerais'), data.role === 'creator' ? settings : el('p', { text: 'Configurações globais reservadas ao criador.' })), panel(head('Saúde do servidor'),
        el('p', { text: 'Banco de dados operacional · servidor ativo há ' + Math.floor(data.uptime / 60) + ' min' }),
        el('p', { text: data.requests + ' requisições desde a inicialização.' }),
        Object.entries(data.errors).map(([code,count]) => el('p', { text: (code === 'streaming' ? 'Falhas de streaming' : 'HTTP ' + code) + ' · ' + count }))),
      panel(head('Auditoria administrativa'), data.audit.length ? data.audit.map(entry =>
        el('p', { text: formatDate(entry.date) + ' · ' + entry.action + ' · ' + entry.target + ' · ' + entry.actor })) : empty('Nenhuma ação registrada.', 'shield'))),
      panel(head('Gestão de usuários'), accountRows), panel(head('Gestão de cursos'), data.courses.map(course => el('div', { class: 'data-row' },
        el('span', { text: course.data.title + (course.published ? '' : ' · Oculto') }), action('Editar', () => edit(course), { kind: 'quiet' }))))));
}
