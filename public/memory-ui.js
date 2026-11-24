import { get, navigate, state, write } from './client.js';
import { action, busy, confirmAction, el, empty, field, formatDate, icon, input, link, modal, notify, panel, select, submit, title } from './ui.js';

const categories = [['general','Geral'],['reference','Referências'],['notes','Anotações'],['code','Código']];
const header = (name, control) => el('div', { class: 'panel-head' }, el('h2', { text: name }), control);

export async function memoryPage() {
  const [data, projects] = await Promise.all([get('memory'), get('projects')]);
  const projectChoices = [['','Sem projeto'], ...projects.map(project => [project.id, project.name])];
  const filter = input('query', { type: 'search', maxlength: 140, placeholder: 'Nome do documento ou termo' });
  const category = select('category', [['','Todas as categorias'], ...categories], '');
  const project = select('project', [['','Todos os projetos'], ...projectChoices.slice(1)], '');
  const results = el('div', { class: 'grid three' });
  const hits = el('div', { class: 'stack', 'aria-live': 'polite' });
  const meter = el('span', { class: 'pill' });
  function draw() {
    const query = filter.value.trim().toLocaleLowerCase();
    const documents = data.documents.filter(item => (!query || item.name.toLocaleLowerCase().includes(query)) &&
      (!category.value || item.category === category.value) && (!project.value || item.project === project.value));
    meter.textContent = data.documents.length + ' de 40 documentos';
    results.replaceChildren(...(documents.length ? documents.map(card) : [empty('Importe um documento ou altere os filtros.', 'file')]));
  }
  function card(item) {
    const name = categories.find(([key]) => key === item.category)?.[1] || 'Geral';
    const label = projects.find(row => row.id === item.project)?.name;
    return panel(el('div', { class: 'document-card' },
      el('div', { class: 'row spread' }, icon('file', 23), el('span', { class: 'pill', text: name })),
      el('h3', { text: item.name }),
      el('p', { class: 'description', text: label || 'Sem projeto' }), el('small', { text: formatDate(item.created) }),
      el('div', { class: 'row' }, action('Visualizar', event => view(event, item.id)), remove('documents', item.id))));
  }
  function remove(area, id) {
    return action('Excluir', () => confirmAction('Excluir item', 'Confirme a remoção deste item da sua conta.', 'Excluir', async () => {
      await write('memory/' + area + '/' + id, 'DELETE');
      navigate('memory');
    }), { kind: 'quiet' });
  }
  async function view(event, id) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const item = await get('memory/documents/' + encodeURIComponent(id));
      const edit = el('form', { class: 'form-grid' }, field('Categoria', select('category', categories, item.category)),
        field('Projeto associado', select('project', projectChoices, item.project || '')), submit('Salvar associação'));
      const dialog = modal(item.name, el('div', { class: 'stack' }, el('pre', {
        class: 'form-note', style: 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:40dvh', text: item.content
      }), edit));
      busy(edit, async fields => {
        const updated = await write('memory/documents/' + id, 'PATCH', fields);
        Object.assign(data.documents.find(row => row.id === id), updated);
        dialog.close(); draw(); notify('Associação salva.');
      });
    } catch (error) { notify(error.message, true); }
    finally { button.disabled = false; }
  }
  function importDocument() {
    const form = el('form', { class: 'form-grid' }, field('Importar arquivo de texto', input('file', {
      type: 'file', accept: '.txt,.md,.csv,.json,.html,.css,.js,.py,text/*'
    })), field('Título', input('name', { required: true, maxlength: 120 })),
    field('Texto do documento', el('textarea', { name: 'content', required: true, maxlength: 100000, rows: 6 })),
    field('Categoria', select('category', categories, 'general')),
    field('Projeto associado', select('project', projectChoices, '')), submit('Adicionar documento'));
    const dialog = modal('Adicionar documento', form);
    form.elements.file.addEventListener('change', async () => {
      const file = form.elements.file.files[0];
      form.elements.file.value = '';
      if (!file) return;
      try {
        if (file.size > 400000) throw new Error('O arquivo excede 400 KB.');
        const text = await file.text();
        if (text.includes('\0') || text.length > 100000) throw new Error('Escolha texto com até 100 mil caracteres.');
        form.elements.content.value = text;
        if (!form.elements.name.value) form.elements.name.value = file.name.slice(0, 120);
      } catch (error) { notify(error.message, true); }
    });
    busy(form, async ({ name, content, category, project }) => {
      await write('memory/documents', 'POST', { name, content, category, project });
      dialog.close(); navigate('memory');
    });
  }
  function updateFilters() { hits.replaceChildren(); draw(); }
  filter.addEventListener('input', updateFilters);
  for (const control of [category, project]) control.addEventListener('change', updateFilters);
  const lookup = el('form', { class: 'toolbar' }, field('Buscar na biblioteca', filter), field('Categoria', category), field('Projeto', project), submit('Buscar no conteúdo'));
  busy(lookup, async () => {
    const q = filter.value.trim();
    if (!q) throw new Error('Digite um termo para buscar trechos nos documentos.');
    const scope = { q, project: project.value, category: category.value };
    const found = await get('memory/search?' + new URLSearchParams(scope));
    if (filter.value.trim() !== scope.q || project.value !== scope.project || category.value !== scope.category) return;
    hits.replaceChildren(panel(header('Trechos encontrados'), found.length ? found.map(item =>
      el('article', { class: 'document-card section-space' }, el('strong', { text: item.name }), el('p', { text: item.snippet })))
      : empty('Nenhum trecho corresponde ao termo.', 'search')));
  });
  const preferences = el('form', { class: 'form-grid' }, field('Preferência autorizada',
    input('content', { maxlength: 240, required: true, placeholder: 'Ex.: Prefiro exemplos em Python' })), submit('Adicionar preferência'));
  busy(preferences, async fields => { await write('memory/preferences', 'POST', fields); navigate('memory'); });
  draw();
  const clear = action('Limpar memória', () => confirmAction('Limpar memória', 'Confirme a remoção dos documentos, resumos e preferências.', 'Limpar memória',
    async () => { await write('memory', 'DELETE'); navigate('memory'); }), { kind: 'danger' });
  return el('div', {}, title('Memória e documentos', 'Organize o contexto que você autoriza a Titan AI a usar.',
    el('div', { class: 'row' }, action('Adicionar documento', importDocument, { icon: 'plus', kind: 'primary' }), clear)),
    panel(header('Biblioteca', meter), lookup, hits, results),
    el('div', { class: 'grid two section-space' },
      panel(header('Preferências autorizadas', el('span', { class: 'pill', text: data.preferences.length + ' de 20' })),
        el('p', { class: 'description', text: state.user.preferences.memory ? 'O chat inclui estas preferências quando a memória da conversa está ativa.' : 'Ative a memória no perfil e na conversa para usar estas preferências.' }),
        preferences, data.preferences.map(item => el('div', { class: 'data-row' }, el('span', { text: item.content }), remove('preferences', item.id)))),
      panel(header('Resumos de conversas'), data.summaries.length ? data.summaries.map(item => el('div', { class: 'data-row' },
        el('div', {}, el('h3', { text: item.title }), el('p', { text: item.summary })), remove('summaries', item.id)))
        : empty('Conversas longas com memória ativa geram resumos.', 'memory')),
      link('Configurar privacidade do contexto', '#preferences', 'quiet', 'shield')));
}
