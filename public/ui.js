const paths = {
  panel: 'M3 4h18v16H3z M9 4v16',
  terminal: 'M3 5h18v14H3z M7 9l3 3-3 3m6 0h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1',
  file: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
  expand: 'M9 4H4v5 M15 4h5v5 M4 15v5h5 M20 15v5h-5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  download: 'M12 3v12m-4-4 4 4 4-4 M4 15v5h16v-5',
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  courses: 'M12 7v14 M3 4h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v14h-5a4 4 0 0 0-4 3 4 4 0 0 0-4-3H3z',
  code: 'm8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.4-3A8.5 8.5 0 1 1 21 11.5Z M8 12h.01 M12 12h.01 M16 12h.01',
  spark: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z',
  pet: 'M4 15c0-5 4-12 8-12s8 7 8 12a8 8 0 0 1-16 0z M8 13h.01 M16 13h.01 M10 17q2 2 4 0',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M10 2h4l1 3 3-1 2 2-1 3 3 1v4l-3 1 1 3-2 2-3-1-1 3h-4l-1-3-3 1-2-2 1-3-3-1v-4l3-1-1-3 2-2 3 1z',
  shield: 'M12 22c3-1 8-4 8-11V5l-8-3-8 3v6c0 7 5 10 8 11z M9 12l2 2 4-4',
  arrow: 'M4 12h15 M12 5l7 7-7 7',
  chevron: 'm9 18 6-6-6-6',
  bolt: 'M13 2 3 14h8l-1 8 11-12h-8z',
  target: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l9-9 M16 3h5v5',
  folder: 'M3 7V5h6l2 2h10v12H3z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l4 4',
  plus: 'M12 5v14 M5 12h14',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  logout: 'M11 4H4v16h7 M10 12h11 M17 8l4 4-4 4',
  x: 'm6 6 12 12 M18 6 6 18',
  check: 'm4 12 5 5L20 6',
  send: 'M12 19V5 M5 12l7-7 7 7',
  clip: 'm8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',
  flame: 'M12 22a7 7 0 0 0 7-7c0-4-3-7-6-11 0 4-3 5-3 8-2-1-3-2-3-3-4 4-3 13 5 13z',
  link: 'M9 15l6-6 M8 17l-2 2a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0 M16 7l2-2a3 3 0 0 1 4 4l-5 5a3 3 0 0 1-4 0',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9a3 3 0 1 1 4 3l-1 2 M12 17h.01',
  memory: 'M8 3h8v4l3 3v8l-3 3H8l-3-3v-8l3-3z M9 12h6 M9 16h6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1'
};
export function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 1.65, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', paths[name] || paths.spark); svg.append(p);
  return svg;
}
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') { if (typeof value !== 'boolean') node.textContent = value; }
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat(Infinity).filter(value => value != null && typeof value !== 'boolean'));
  return node;
}
export const action = (label, callback, options = {}) =>
  el('button', { type: 'button', class: 'button ' + (options.kind || 'secondary'), onclick: callback,
    title: options.title, 'aria-label': options.title, disabled: options.disabled },
    options.icon && icon(options.icon, 17), label);
export const link = (label, href, kind = 'secondary', glyph) => el('a', { href, class: 'button ' + kind }, glyph && icon(glyph, 17), label);
let formId = 0;
export function field(label, control, help) {
  const id = 'field-' + ++formId;
  const target = control.matches('input, textarea, select') ? control : control.querySelector('input, textarea, select');
  if (target) {
    target.id ||= id;
    target.setAttribute('aria-labelledby', id + '-label');
    if (help) target.setAttribute('aria-describedby', id + '-help');
  }
  return el('label', { class: 'field', for: target?.id }, el('span', { id: id + '-label', text: label }), control,
    help && el('small', { id: id + '-help', text: help }));
}
export const input = (name, extras = {}) => el('input', { name, ...extras });
export const select = (name, choices, value) => el('select', { name }, choices.map(([id, label]) => el('option', { value: id, selected: id === value, text: label })));
export const formatDate = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(value);
export const panel = (...children) => el('section', { class: 'panel' }, ...children);
export const title = (heading, description, controls) => el('header', { class: 'page-title' },
  el('div', {}, el('h1', { text: heading }), description && el('p', { text: description })), controls);
export const empty = (value, glyph = 'spark') => el('div', { class: 'empty' }, icon(glyph, 23), el('p', { text: value }));
export const submit = label => el('button', { type: 'submit', class: 'button primary', text: label });
export const values = form => Object.fromEntries(new FormData(form));
export function notify(message, bad = false) {
  const toast = el('div', { class: 'toast' + (bad ? ' bad' : ''), role: bad ? 'alert' : 'status' }, icon(bad ? 'help' : 'check', 18), message);
  document.getElementById('toasts').append(toast);
  setTimeout(() => toast.remove(), bad ? 6500 : 3500);
}
export function busy(form, callback) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const buttons = [...form.querySelectorAll('button[type=submit]')];
    if (buttons.some(button => button.disabled)) return;
    form.setAttribute('aria-busy', 'true');
    buttons.forEach(button => { button.disabled = true; });
    try { await callback(values(form)); }
    catch (error) { notify(error.message, true); }
    finally { buttons.forEach(button => { button.disabled = false; }); form.removeAttribute('aria-busy'); }
  });
  return form;
}
export function modal(heading, content) {
  const dialog = document.getElementById('dialog');
  dialog.replaceChildren(el('header', { class: 'row spread' }, el('h2', { id: 'dialog-heading', text: heading }),
    action('', () => dialog.close(), { kind: 'icon-button', icon: 'x', title: 'Fechar' })), content);
  dialog.setAttribute('aria-labelledby', 'dialog-heading');
  if (!dialog.open) dialog.showModal();
  return dialog;
}
export function confirmAction(heading, message, label, callback) {
  const dialog = modal(heading, el('div', {},
    el('p', { text: message }),
    el('div', { class: 'row dialog-actions' }, action('Cancelar', () => dialog.close()),
      action(label, async event => {
        event.currentTarget.disabled = true;
        try { await callback(); dialog.close(); }
        catch (error) { notify(error.message, true); }
        finally { event.target.closest('button')?.removeAttribute('disabled'); }
      }, { kind: 'danger' }))));
}
export async function copy(value) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(value);
    else {
      const area = el('textarea', {}, value);
      (document.querySelector('dialog[open]') || document.body).append(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      if (!done) throw new Error();
    }
    notify('Copiado.');
  } catch { notify('Selecione o texto para copiar.', true); }
}
export function download(name, data, type = 'application/json') {
  const href = URL.createObjectURL(data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type }));
  const a = el('a', { href, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}
const syntaxTokens = (/\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+(?:\.\d+)?\b|\b(?:async|await|break|class|const|def|else|except|export|false|for|from|function|if|import|in|let|new|null|raise|return|true|try|var|while|SELECT|WHERE|INSERT|UPDATE|FROM)\b/g);
function codeMarkup(value, language) {
  if (value.length > 12000 || !/[a-z]/i.test(language)) return value;
  const code = document.createDocumentFragment();
  let cursor = 0;
  let count = 0;
  for (const match of value.matchAll(syntaxTokens)) {
    if (++count > 420) break;
    const token = match[0];
    const kind = token.startsWith('//') || token.startsWith('/*') || token.startsWith('#') ? 'comment'
      : ['"', "'"].includes(token[0]) ? 'string' : /^[0-9]/.test(token) ? 'number' : 'key';
    code.append(value.slice(cursor, match.index), el('span', { class: 'code-' + kind, text: token }));
    cursor = match.index + token.length;
  }
  code.append(value.slice(cursor));
  return code;
}
export function codeBlock(value, lang = '') {
  return el('div', { class: 'code-block' }, el('div', { class: 'row spread code-head' }, el('span', { text: lang || 'Código' }),
    action('Copiar', () => copy(value), { kind: 'quiet' })), el('pre', {}, el('code', {}, codeMarkup(value, lang))));
}
function inline(value) {
  return value.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g).map(part => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return el('code', { text: part.slice(1, -1) });
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return el('strong', { text: part.slice(2, -2) });
    const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (match) return el('a', { href: match[2], rel: 'noopener noreferrer', target: '_blank', text: match[1] });
    return part;
  });
}
export function markdown(value) {
  const root = el('div', { class: 'prose' });
  let list;
  for (const chunk of value.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g)) {
    if (!chunk) continue;
    if (chunk.startsWith('```')) {
      const end = chunk.indexOf('\n');
      root.append(codeBlock(chunk.slice(end + 1).replace(/```$/, '').trimEnd(), chunk.slice(3, end).slice(0, 25)));
      list = null;
      continue;
    }
    for (const line of chunk.split('\n')) {
      if (!line.trim()) { list = null; continue; }
      const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/);
      if (item) {
        const type = item[2] ? 'OL' : 'UL';
        if (list?.tagName !== type) { list = el(type.toLowerCase()); root.append(list); }
        list.append(el('li', {}, inline(item[3])));
        continue;
      }
      list = null;
      const heading = line.match(/^(#{1,5})\s+(.*)$/);
      root.append(heading ? el('h' + Math.min(6, heading[1].length + 2), {}, inline(heading[2])) : el('p', {}, inline(line)));
    }
  }
  return root;
}
