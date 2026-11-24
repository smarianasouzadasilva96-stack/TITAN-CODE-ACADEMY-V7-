import { setTheme } from './theme.js';
import { api, get, navigate, state, write } from './client.js';
import { action, busy, copy, el, empty, field, icon, input, link, modal, notify, panel, submit, title } from './ui.js';

const app = document.getElementById('app');
const accountRoutes = new Set(['register','recover','login','key']);
const modules = {
  trail: ['Minha trilha', 'courses', './study-tools.js', 'trail'],
  practice: ['Laboratório de prática', 'code', './study-tools.js', 'practice'],
  missions: ['Missões', 'target', './study-tools.js', 'missions'],
  tutor: ['Professores', 'spark', './teachers-ui.js', 'teachersPage'],
  flashcards: ['Flashcards', 'file', './study-tools.js', 'flashcards'],
  review: ['Revisão', 'clock', './study-tools.js', 'review'],
  glossary: ['Glossário', 'courses', './study-tools.js', 'glossary'],
  progress: ['Meu progresso', 'bolt', './study-tools.js', 'progressPage'],
  favorites: ['Favoritos', 'spark', './study-tools.js', 'favorites'],
  notes: ['Anotações', 'file', './study-tools.js', 'notes'],

  dashboard: ['Hoje', 'dashboard', './learning-ui.js', 'dashboard'],
  courses: ['Cursos', 'courses', './learning-ui.js', 'catalog'],
  editor: ['Editor', 'code', null, './editor.html'],
  projects: ['Projetos', 'folder', './projects-ui.js', 'projectList'],
  chat: ['Titan AI', 'chat', './chat-ui.js', 'chatPage'],
  pet: ['Meu pet · Lumio', 'pet', './pet-ui.js', 'petPage'],
  achievements: ['Conquistas', 'target', './pet-ui.js', 'achievementsPage'],
  ai: ['Minha Inteligência Artificial', 'spark', './settings-ui.js', 'aiSetup'],
  preferences: ['Perfil e configurações', 'settings', './settings-ui.js', 'preferences'],
  memory: ['Memória e documentos', 'memory', './memory-ui.js', 'memoryPage'],
  lightning: ['Desafios relâmpago', 'bolt', './extensions.js', 'lightning'],
  planner: ['Meu plano de estudos', 'clock', './extensions.js', 'planner'],
  journal: ['Diário de erros', 'file', './extensions.js', 'journal'],
  concepts: ['Mapa de conceitos', 'courses', './extensions.js', 'concepts'],
  careers: ['Caminhos de carreira', 'target', './extensions.js', 'careers'],
  studentkeys: ['Minhas chaves', 'shield', './student-keys-ui.js', 'studentKeys'],
  admin: ['Administração', 'shield', './settings-ui.js', 'adminPage']
};
const mainRoutes = ['dashboard','trail','practice','chat','review','progress','preferences'];
const groups = [['Principal','dashboard','trail','practice','chat','review','progress','preferences'], ['Mais','courses','editor','projects','missions','tutor','pet','achievements','flashcards','glossary','favorites','notes','lightning','planner','journal','concepts','careers','memory','studentkeys','admin']];
const mobileLabels = { dashboard: 'Hoje', preferences: 'Perfil' };
const mobileQuery = matchMedia('(max-width: 767px)');
let revision = 0;
let shell;
export const initials = () => state.user?.name.trim().split(/\s+/).slice(0, 2)
  .map(part => [...part][0]?.toUpperCase()).join('') || 'T';

export function applyTheme() { setTheme(state.user?.preferences); }
function brand() {
  return el('a', { class: 'brand', href: '#dashboard', 'aria-label': 'TITAN CODE ACADEMY' },
    el('span', { class: 'brand-mark' }, el('img', { src: './titan-emblem.webp', alt: '', width: 42, height: 42, decoding: 'async' })),
    el('div', { class: 'brand-name' }, el('strong', { text: 'TITAN CODE' }), el('small', { text: 'ACADEMY · CRIMSON' })));
}
export function art() { return el('div', { class: 'hero-art', 'aria-hidden': 'true' }); }
function navItem(route, compact = false) {
  const [label, glyph, file, to] = modules[route];
  const text = compact ? mobileLabels[route] || label : label;
  return el('a', { class: 'nav-item', href: file ? '#' + route : to, 'data-route': route, title: text, 'aria-label': text },
    icon(glyph, 19), el('span', { class: 'nav-text', text }));
}
export function recoveryCode(value) {
  const dialog = modal('Código de recuperação', el('div', {},
    el('p', { text: 'Guarde este código em um local seguro. Ele permite recuperar sua conta uma vez.' }),
    el('code', { class: 'recovery-code', text: value }),
    el('div', { class: 'row dialog-actions' }, action('Copiar código', () => copy(value), { kind: 'primary' }))));
  dialog.addEventListener('close', () => dialog.replaceChildren(), { once: true });
}
function authScreen(route) {
  shell = null;
  const recover = route === 'recover';
  const keyMode = route === 'key';
  const register = route === 'register';
  const heading = keyMode ? 'Ativar chave TITAN' : recover ? 'Recuperar acesso' : register ? 'Criar conta' : 'Entre na sua conta';
  const form = el('form', { class: 'form-grid' },
    (keyMode || register) && field('Nome', input('name', { required: true, maxlength: 70, autocomplete: 'name', placeholder: 'Seu nome' })),
    field('E-mail', input('email', { required: true, type: 'email', maxlength: 254, autocomplete: 'email', placeholder: 'voce@exemplo.com' })),
    keyMode && field('Chave de acesso', input('key', { required: true, maxlength: 120, autocomplete: 'off', placeholder: 'TITAN-STUDENT-...' })),
    recover && field('Código de recuperação', input('recovery', { required: true, type: 'password', maxlength: 70, autocomplete: 'off' })),
    field(recover ? 'Nova senha' : keyMode ? 'Senha (somente para primeira ativação)' : 'Senha', input('password', { required: !keyMode, type: 'password', minlength: 12, maxlength: 128, autocomplete: recover || register || keyMode ? 'new-password' : 'current-password', placeholder: 'Mínimo de 12 caracteres' })),
    submit(keyMode ? 'Ativar e entrar' : recover ? 'Redefinir senha' : register ? 'Criar conta' : 'Entrar'));
  busy(form, async data => {
    const endpoint = keyMode ? 'key' : recover ? 'recover' : register ? 'register' : 'login';
    const result = await write('auth/' + endpoint, 'POST', data);
    Object.assign(state, { user: result.user, csrf: result.csrf, offline: false });
    applyTheme(); navigate(register ? 'ai' : 'dashboard');
    if (result.recovery) recoveryCode(result.recovery);
  });

  app.replaceChildren(el('div', { class: 'auth-layout' },
    el('section', { class: 'auth-art' }, brand(), art(), el('div', { class: 'auth-caption' },
      el('h1', { text: 'Aprenda código. Crie com IA.' }),
      el('p', { text: 'Seus cursos, projetos e progresso permanecem na sua conta.' }))),
    el('main', { class: 'auth-main', id: 'main', tabindex: -1 }, el('div', { class: 'auth-box' },
      el('h2', { text: heading }),
      el('p', { text: keyMode ? 'Alunos com conta podem entrar usando sua chave pessoal sem senha. Para criar conta com chave emitida, informe uma senha.' : 'Acesse suas aulas, projetos e conversas.' }),
      el('div', { class: 'titan-access-roles', 'aria-label': 'Tipos de acesso' },
        el('span', { text: 'Aluno · Cursos e Titan AI' }),
        el('span', { text: 'Administrador · Painel e IA ilimitada' }),
        el('span', { text: 'Criador · Controle completo' })),
      state.offline && el('div', { class: 'notice', role: 'alert', text: 'Não foi possível confirmar a conexão. Verifique o servidor e tente novamente.' }),
      form,
      state.offline && action('Verificar conexão', start, { kind: 'secondary' }),
      el('div', { class: 'row auth-links' },
        keyMode || recover || register ? link('Voltar para entrar', '#login', 'quiet') : link('Ativar chave', '#key', 'secondary'),
        !keyMode && !recover && !register && link('Recuperar senha', '#recover', 'quiet'),
        !keyMode && !recover && !register && link('Criar conta tradicional', '#register', 'quiet'),
        link('Editor local', './editor.html?local=1', 'quiet', 'code'))))));
}

async function logout() {
  try {
    await write('auth/logout', 'POST');
    Object.assign(state, { user: null, csrf: null });
    applyTheme(); navigate('login');
  } catch (error) { notify(error.message, true); }
}
function searchDialog() {
  const result = el('div', { class: 'stack', 'aria-live': 'polite' });
  const box = input('search', { type: 'search', maxlength: 160, placeholder: 'Aulas, projetos e conversas' });
  let pending;
  let position = 0;
  box.addEventListener('input', () => {
    clearTimeout(pending);
    const seq = ++position;
    pending = setTimeout(async () => {
      const query = box.value.trim();
      if (!query) { result.replaceChildren(); return; }
      try {
        const [courses, projects, chats] = await Promise.all([get('courses'), get('projects'), get('chats?q=' + encodeURIComponent(query))]);
        if (seq !== position || !box.isConnected) return;
        const hits = [
          ...courses.filter(row => (row.title + row.description).toLowerCase().includes(query.toLowerCase())).map(row => [row.title, '#courses/' + row.id, 'courses']),
          ...projects.filter(row => row.name.toLowerCase().includes(query.toLowerCase())).map(row => [row.name, './editor.html?project=' + row.id, 'folder']),
          ...chats.map(row => [row.title, '#chat/' + row.id, 'chat'])
        ];
        result.replaceChildren(...(hits.length ? hits.slice(0, 10).map(([label, href, glyph]) =>
          el('a', { class: 'nav-item', href, onclick: () => document.getElementById('dialog').close() }, icon(glyph, 17), label))
          : [empty('Nenhum resultado.', 'search')]));
      } catch (error) { if (seq === position) notify(error.message, true); }
    }, 220);
  });
  modal('Buscar na academia', el('div', { class: 'form-grid' }, field('Pesquisa', box), result));
  box.focus();
}
function makeShell() {
  let compact = false;
  try { compact = localStorage.getItem('titan-v6-navigation') === 'compact'; } catch {}
  const layout = el('div', { class: 'layout' + (compact ? ' compact' : '') });
  const main = el('main', { id: 'main', tabindex: -1 });
  const crumb = el('span', { class: 'crumb' });
  const overlay = el('button', { type: 'button', class: 'shell-overlay', hidden: true, 'aria-label': 'Fechar menu' });
  const rail = action('', () => {
    compact = layout.classList.toggle('compact');
    rail.setAttribute('aria-expanded', String(!compact));
    try { localStorage.setItem('titan-v6-navigation', compact ? 'compact' : 'expanded'); } catch {}
  }, { kind: 'icon-button rail-toggle', icon: 'panel', title: 'Recolher ou expandir navegação' });
  rail.setAttribute('aria-controls', 'sidebar');
  rail.setAttribute('aria-expanded', String(!compact));
  const close = action('', () => drawer(false, true), { kind: 'icon-button drawer-close', icon: 'x', title: 'Fechar menu' });
  const extraOpen = (() => {
    const current = location.hash.slice(1).split('/')[0];
    if (groups[1].slice(1).includes(current)) return true;
    try { return localStorage.getItem('titan-more-open') === 'yes'; } catch { return false; }
  })();
  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Navegação da academia' },
    el('div', { class: 'sidebar-head' }, brand(), rail, close),
    el('nav', { 'aria-label': 'Menu principal' }, groups.map(([label, ...items]) => label === 'Mais' ?
      el('details', { class: 'more-menu', ...(extraOpen ? { open: true } : {}) },
        el('summary', { class: 'nav-label', text: 'Mais ferramentas' }),
        el('div', { class: 'more-links' }, items.filter(id => id !== 'admin' || state.user.role === 'admin' || state.user.role === 'creator').map(id => navItem(id)))) :
      el('div', { class: 'main-links' }, el('div', { class: 'nav-label', text: label }), items.map(id => navItem(id))))),
    el('div', { class: 'nav-foot sidebar-user' },
      el('div', { class: 'avatar', text: initials(), 'aria-hidden': 'true' }),
      el('div', { class: 'sidebar-name truncate' }, el('strong', { text: state.user.name.includes('@') ? 'Estudante' : state.user.name }),
        el('small', { text: state.user.role === 'creator' ? 'Criador' : state.user.role === 'admin' ? 'Administrador' : 'Estudante' })),
      action('', logout, { kind: 'icon-button', icon: 'logout', title: 'Sair' })));
  const menu = action('', () => drawer(!sidebar.classList.contains('open')), { kind: 'icon-button mobile-menu', icon: 'menu', title: 'Menu' });
  menu.setAttribute('aria-controls', 'sidebar');
  menu.setAttribute('aria-expanded', 'false');
  const workspace = el('div', { class: 'workspace' }, el('header', { class: 'topbar' }, menu, crumb,
    el('button', { type: 'button', class: 'button secondary search-trigger', 'aria-label': 'Buscar', onclick: searchDialog },
      icon('search', 17), el('span', { text: 'Buscar na academia' })),
    el('a', { class: 'avatar account-link', href: '#preferences', 'aria-label': 'Minha conta', text: initials() })), main);
  const mobile = el('nav', { class: 'mobile-nav', 'aria-label': 'Navegação rápida' }, ['dashboard','trail','practice','chat','preferences'].map(id => navItem(id, true)));
  function drawer(open, focus = false) {
    open = open && mobileQuery.matches;
    sidebar.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    overlay.hidden = !open;
    workspace.inert = mobile.inert = open;
    if (open) close.focus();
    else if (focus) menu.focus();
  }
  sidebar.querySelector('.more-menu')?.addEventListener('toggle', event => { try { localStorage.setItem('titan-more-open', event.target.open ? 'yes' : 'no'); } catch {} });
  sidebar.addEventListener('keydown', event => { if (event.key === 'Escape') drawer(false, true); });
  sidebar.addEventListener('click', event => {
    if (event.target.closest('a') && sidebar.classList.contains('open')) drawer(false, true);
  });
  overlay.addEventListener('click', () => drawer(false, true));
  layout.append(sidebar, overlay, workspace, mobile);
  app.replaceChildren(layout);
  shell = { sidebar, crumb, main, drawer, user: state.user.id, name: state.user.name };
}
async function render() {
  const turn = ++revision;
  const [raw, ...rest] = location.hash.slice(1).split('/');
  const route = Object.hasOwn(modules, raw) && (raw !== 'admin' || ['admin','creator'].includes(state.user?.role)) ? raw : 'dashboard';
  if (route === 'editor' && state.user) { location.assign('./editor.html'); return; }
  let id;
  try { id = decodeURIComponent(rest.join('/')); } catch { id = ''; }
  if (!state.user) { authScreen(accountRoutes.has(raw) ? raw : 'login'); return; }
  if (!shell || shell.user !== state.user.id || shell.name !== state.user.name) makeShell();
  shell.crumb.textContent = modules[route][0];
  const changedView = shell.main.dataset.view !== route;
  if (groups[1].slice(1).includes(route)) shell.sidebar.querySelector('.more-menu')?.setAttribute('open', '');
  shell.main.dataset.view = route;
  shell.drawer(false);
  for (const link of app.querySelectorAll('[data-route]')) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const place = shell.main;
  place.setAttribute('aria-busy', 'true');
  place.replaceChildren(el('div', { class: 'skeleton', 'aria-label': 'Carregando conteúdo' }));
  try {
    const [,, file, name] = modules[route];
    const view = await import(file);
    const content = await view[name](id);
    if (turn !== revision) return;
    place.replaceChildren(state.notice ? el('p', { class: 'notice', text: state.notice }) : '', el('div', { class: 'route-content' }, content));
    place.removeAttribute('aria-busy');
    if (changedView) window.scrollTo(0, 0);
  } catch (error) {
    if (turn !== revision) return;
    place.removeAttribute('aria-busy');
    if (error.status === 401 || error.code === 'account_changed') { await start(); return; }
    place.replaceChildren(title('Não foi possível abrir esta página'), panel(empty(error.message, 'help'), action('Tentar novamente', render)));
  }
}
async function start() {
  try {
    const session = await api('status', { signal: AbortSignal.timeout(9000) });
    Object.assign(state, { user: session.user, csrf: session.csrf, notice: session.notice, offline: false });
  } catch { Object.assign(state, { user: null, csrf: null, offline: true }); }
  applyTheme();
  await render();
}
mobileQuery.addEventListener('change', () => shell?.drawer(false));
window.addEventListener('hashchange', () => { if (location.hash !== '#main') render(); });
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); document.getElementById('main')?.focus(); });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && state.user) {
    event.preventDefault(); searchDialog();
  }
});
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => {});
start();
