import { get, write } from './client.js';
import { action, busy, confirmAction, download, el, empty, field, formatDate, icon, input, link, modal, notify, panel, select, submit, title } from './ui.js';

const url = id => './editor.html?project=' + encodeURIComponent(id);
const apiPath = id => 'projects/' + encodeURIComponent(id);
const idFor = () => 'p-' + [...crypto.getRandomValues(new Uint8Array(12))].map(byte => byte.toString(16).padStart(2,'0')).join('');
const extension = file => (file?.split('.').at(-1) || 'txt').toLowerCase();
const starter = { 'index.html': '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <title>Meu projeto</title>\n</head>\n<body>\n  <main>\n    <h1>Meu projeto</h1>\n  </main>\n</body>\n</html>\n' };

export async function projectList() {
  let projects = await get('projects');
  const list = el('div', { class: 'grid three' });
  const messages = el('p', { class: 'description', role: 'status' });
  const query = input('q', { type: 'search', placeholder: 'Buscar por nome ou arquivo' });
  const sort = select('sort', [['recent','Mais recentes'],['old','Mais antigos'],['name','Nome de A a Z']], 'recent');
  const language = select('language', [['','Todos os tipos']], '');
  function redraw() {
    const previously = language.value;
    const extensions = [...new Set(projects.map(project => extension(project.active)))].sort();
    language.replaceChildren(el('option', { value: '', text: 'Todos os tipos' }),
      ...extensions.map(ext => el('option', { value: ext, text: ext.toUpperCase() })));
    language.value = extensions.includes(previously) ? previously : '';
    const needle = query.value.trim().toLocaleLowerCase();
    const filtered = projects.filter(project => (!language.value || extension(project.active) === language.value) &&
      (project.name + ' ' + project.active).toLocaleLowerCase().includes(needle));
    filtered.sort((left, right) => sort.value === 'name' ? left.name.localeCompare(right.name) : (left.updated - right.updated) * (sort.value === 'recent' ? -1 : 1));
    messages.textContent = filtered.length + (filtered.length === 1 ? ' projeto' : ' projetos');
    list.replaceChildren(...(filtered.length ? filtered.map(card) : [empty('Crie ou importe um projeto para começar.', 'folder')]));
  }
  async function refresh() { projects = await get('projects'); redraw(); }
  function edit(project) {
    const form = el('form', { class: 'form-grid' }, field('Nome do projeto',
      input('name', { required: true, maxlength: 80, value: project?.name || '' })), submit(project ? 'Salvar nome' : 'Criar projeto'));
    const dialog = modal(project ? 'Renomear projeto' : 'Novo projeto', form);
    busy(form, async ({ name }) => {
      const current = project ? await get(apiPath(project.id)) : { files: starter, active: 'index.html' };
      const saved = await write(apiPath(project?.id || idFor()), 'PUT', { ...current, name });
      dialog.close();
      if (!project) location.assign(url(saved.id));
      else { await refresh(); notify('Projeto renomeado.'); }
    });
  }
  async function perform(event, callback) {
    const button = event.currentTarget;
    button.disabled = true;
    try { await callback(); }
    catch (error) { notify(error.message, true); }
    finally { button.disabled = false; }
  }
  function versions(project) {
    return async event => perform(event, async () => {
      const rows = await get(apiPath(project.id) + '/versions');
      modal('Versões de ' + project.name, el('div', { class: 'stack' }, rows.length ? rows.map(row =>
        el('div', { class: 'data-row' }, el('span', { text: 'V' + row.version + ' · ' + formatDate(row.updated) }),
          action('Baixar', event => perform(event, async () => {
            const data = await get(apiPath(project.id) + '/versions/' + row.version);
            const { zipFiles, slug } = await import('./project-archive.js');
            download(slug(data.name) + '-v' + row.version + '.zip', zipFiles(data.files));
          }), { kind: 'quiet', icon: 'download' }))) : empty('As versões aparecem após salvar alterações.', 'clock'),
        link('Abrir histórico no editor', url(project.id) + '&versions=1', 'secondary', 'clock')));
    });
  }
  function card(project) {
    return panel(el('div', { class: 'document-card' },
      el('div', { class: 'row spread' }, el('div', { class: 'metric-icon cyan' }, icon('folder')),
        el('span', { class: 'pill', text: extension(project.active).toUpperCase() })),
      el('h2', { text: project.name }), el('p', { class: 'description', text: project.active }),
      el('small', { text: 'Atualizado em ' + formatDate(project.updated) }),
      el('div', { class: 'row' }, link('Abrir no editor', url(project.id), 'primary', 'code'),
        action('Versões', versions(project), { icon: 'clock' })),
      el('details', {}, el('summary', { text: 'Mais ações' }),
        el('div', { class: 'row section-space' },
          action('Renomear', () => edit(project)),
          action('Duplicar', event => perform(event, async () => {
            const data = await get(apiPath(project.id));
            await write(apiPath(idFor()), 'PUT', { files: data.files, active: data.active, name: data.name.slice(0, 72) + ' (cópia)' });
            await refresh(); notify('Projeto duplicado.');
          })),
          action('Exportar ZIP', event => perform(event, async () => {
            const data = await get(apiPath(project.id));
            const { zipFiles, slug } = await import('./project-archive.js');
            download(slug(data.name) + '.zip', zipFiles(data.files));
          }), { icon: 'download' }),
          action('Excluir', () => confirmAction('Excluir projeto', 'Confirme a exclusão de ' + project.name + '.', 'Excluir', async () => {
            await write(apiPath(project.id), 'DELETE', { confirm: true, version: project.version });
            await refresh(); notify('Projeto excluído.');
          }), { kind: 'danger' })))));
  }
  function importBackup() {
    const chooser = input('file', { type: 'file', accept: '.json,application/json', required: true });
    let candidates;
    chooser.addEventListener('change', () => { candidates = null; });
    const form = el('form', { class: 'form-grid' }, field('Backup de projetos', chooser, 'Escolha um backup JSON exportado pelo editor.'),
      link('Importar arquivos de código pelo editor', './editor.html?import=1', 'quiet', 'file'), submit('Importar projetos'));
    const dialog = modal('Importar projetos', form);
    busy(form, async () => {
      const file = chooser.files[0];
      if (!file || file.size > 12000000) throw new Error('Escolha um backup JSON de até 12 MB.');
      if (!candidates) {
        let archive;
        try { archive = JSON.parse(await file.text()); } catch { throw new Error('O arquivo não é um backup JSON válido.'); }
        const entries = archive?.projects;
        if (archive?.version !== 3 || !Array.isArray(entries) || !entries.length || entries.length > 100) {
          throw new Error('Backup incompatível ou limite de 100 projetos excedido.');
        }
        const { validateFiles } = await import('./project-archive.js');
        if (chooser.files[0] !== file) throw new Error('O arquivo selecionado mudou. Envie a importação novamente.');
        candidates = entries.map(entry => {
          const files = validateFiles(entry?.files);
          if (typeof entry.name !== 'string' || !entry.name.trim() || !Object.hasOwn(files, entry.active)) throw new Error('Projeto inválido no backup.');
          return { id: idFor(), name: entry.name.trim().slice(0, 80), active: entry.active, files };
        });
      }
      const { count } = await write('projects/import', 'POST', { projects: candidates });
      dialog.close(); await refresh(); notify(count + ' projeto(s) importado(s).');
    });
  }
  query.addEventListener('input', redraw);
  sort.addEventListener('change', redraw);
  language.addEventListener('change', redraw);
  redraw();
  return el('div', {}, title('Projetos', 'Crie, organize e exporte os projetos da sua conta.',
    el('div', { class: 'row' }, action('Importar', importBackup, { icon: 'file' }), action('Novo projeto', () => edit(), { kind: 'primary', icon: 'plus' }))),
    el('div', { class: 'toolbar' }, field('Buscar projeto', query), field('Tipo de arquivo', language), field('Ordenar', sort)),
    el('div', { class: 'stack' }, messages, list));
}
