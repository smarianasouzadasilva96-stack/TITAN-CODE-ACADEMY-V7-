import { art, initials } from './academy.js';
import { petArtwork } from './pet-art.js';
import { get, navigate, state, write } from './client.js';
import { action, busy, codeBlock, download, el, empty, field, formatDate, icon, input, link, notify, panel, select, submit, title } from './ui.js';

const blockHead = (label, control) => el('div', { class: 'panel-head' }, el('h2', { text: label }), control);
const badge = (label, glyph) => el('span', { class: 'pill' }, glyph && icon(glyph, 13), label);
const progress = (value, max, label) => el('progress', { value, max: max || 1, 'aria-label': label });
const mark = course => el('div', { class: 'course-mark', text: course.mark });
const editorUrl = id => './editor.html' + (id ? '?project=' + encodeURIComponent(id) : '');

const tracks = [['','Todas as trilhas'],['web','Desenvolvimento web'],['fundamentos','Fundamentos'],['sistemas','Sistemas e aplicativos'],['dados','Dados']];
function petCard(pet, xp) {
  const card = panel(blockHead('Meu pet', link('Abrir', '#pet', 'quiet')), petArtwork(pet),
    el('div', { class: 'pet-name' }, el('h3', { text: pet.name }), el('p', { class: 'description', text: pet.label })),
    progress(xp, pet.next || xp || 1, 'XP do pet'),
    el('p', { class: 'description', text: pet.next ? (pet.next - xp) + ' XP para evoluir' : 'Evolução especial alcançada' }));
  card.classList.add('pet-card');
  return card;
}
function metric(label, value, glyph, color) {
  const card = panel(el('div', { class: 'metric-icon ' + color }, icon(glyph, 18)), el('div', {},
    el('strong', { text: String(value) }), el('small', { text: label })));
  card.classList.add('stat');
  return card;
}
function rows(records, glyph, name, href) {
  return records.map(row => el('div', { class: 'data-row' }, icon(glyph, 16),
    el('span', { class: 'truncate', text: name(row) }), link('Abrir', href(row), 'quiet', 'chevron')));
}

export async function dashboard() {
  const data = await get('dashboard');
  const current = data.courses.find(course => course.id === data.progress[0]?.course && course.completed < course.total)
    || data.courses.find(course => course.completed > 0 && course.completed < course.total)
    || data.courses.find(course => course.completed === 0);
  const first = state.user.name.includes('@') ? 'Estudante' : state.user.name.trim().split(/\s+/)[0].slice(0, 35);
  const connection = data.connection;
  const shared = (name, list, glyph, destination, open, blank) => panel(
    blockHead(name, link('Ver todos', destination, 'quiet')),
    list.length ? rows(list.slice(0, 3), glyph, item => item.name || item.title, open) : empty(blank, glyph));
  const mission = (label, value, max) => el('div', { class: 'mission' }, el('div', { class: 'row spread' },
    el('strong', { text: label }), badge(Math.min(value, max) + ' de ' + max, value >= max ? 'check' : 'target')),
    progress(value, max, label));
  return el('div', {},
    el('div', { class: 'row spread dashboard-title' }, el('div', {},
      el('h1', { text: 'Hoje, seu próximo passo' }),
      el('p', { text: 'Olá, ' + first + '. Escolha uma atividade no seu ritmo.' })),
      link('Meu plano', '#planner', 'secondary', 'clock')),
    el('section', { class: 'hero' }, art(), el('div', { class: 'hero-copy' },
      el('span', { class: 'label', text: current ? 'Curso atual' : 'Cursos' }),
      el('h2', { text: current?.title || 'Escolha sua próxima trilha' }),
      el('p', { text: current?.description || 'Explore o catálogo de programação.' }),
      current && progress(current.completed, current.total, 'Progresso em ' + current.title),
      current && el('small', { text: current.completed + ' de ' + current.total + ' lições concluídas · Faltam ' + (Math.min(current.total, Math.ceil((current.completed+1)/10)*10)-current.completed) + ' para o próximo marco de 10 aulas' }),
      el('div', { class: 'row' },
        link(current?.completed ? 'Continuar estudando' : 'Começar a estudar', current ? '#courses/' + current.id : '#courses', 'primary', 'courses'),
        link('Abrir editor', editorUrl(), 'secondary', 'code')))),
    el('section', { class: 'stats', 'aria-label': 'Estatísticas de aprendizado' },
      metric('XP acumulado', data.xp, 'bolt', 'cyan'), metric('Seu nível', data.level, 'target', ''),
      metric('Sequência de estudo', data.streak + (data.streak === 1 ? ' dia' : ' dias'), 'flame', 'gold'),
      metric('Lições concluídas', data.progress.length, 'courses', 'green')),
    el('div', { class: 'dashboard-columns' },
      el('div', { class: 'stack' },
        el('div', { class: 'grid two' },
          shared('Projetos recentes', data.projects, 'folder', '#projects', row => editorUrl(row.id), 'Crie ou importe seu primeiro projeto.'),
          shared('Conversas recentes', data.chats, 'chat', '#chat', row => '#chat/' + row.id, 'Suas conversas aparecerão aqui.')),
        panel(blockHead('Missões', link('Conquistas', '#achievements', 'quiet')),
          mission('Concluir uma lição hoje', data.daily, 1), mission('Concluir lições nesta semana', data.week, data.goal)),
        panel(blockHead('Atalhos'), el('div', { class: 'row quick-links' }, link('Projetos', '#projects', 'secondary', 'folder'),
          link('Memória e documentos', '#memory', 'secondary', 'memory'), link('Professores', '#tutor', 'secondary', 'spark')))),
      el('div', { class: 'stack' },
        panel(blockHead('Titan AI', badge(connection?.state === 'connected' ? 'Conectada' : 'Configuração', connection?.state === 'connected' ? 'check' : 'spark')),
          el('p', { class: 'provider-model', text: connection ? connection.modelName : 'Escolha um provedor e um modelo.' }),
          el('div', { class: 'row section-space' }, link(connection ? 'Conversar' : 'Configurar IA', connection ? '#chat' : '#ai', 'secondary', 'chat'))),
        petCard(data.pet, data.xp))));
}

export async function catalog(id) {
  if (id) return coursePage(id);
  const courses = await get('courses');
  const cards = el('div', { class: 'grid three' });
  const status = el('p', { class: 'description', role: 'status' });
  const query = input('filter', { type: 'search', placeholder: 'HTML, Python, SQL…' });
  const track = select('track', tracks, '');
  const activity = select('progress', [['','Qualquer progresso'],['started','Em andamento'],['complete','Concluídos'],['available','Para começar']], '');
  const stateFor = course => course.total > 0 && course.completed === course.total ? 'complete' : course.completed ? 'started' : 'available';
  const labels = { started: 'Em andamento', complete: 'Concluído', available: 'Para começar' };
  function draw() {
    const needle = query.value.trim().toLocaleLowerCase();
    const selected = courses.filter(course => (!track.value || course.track === track.value) &&
      (!activity.value || stateFor(course) === activity.value) &&
      (course.title + ' ' + course.description).toLocaleLowerCase().includes(needle));
    status.textContent = selected.length + ' cursos · ' + selected.reduce((sum,c)=>sum+c.total,0).toLocaleString('pt-BR') + ' lições e oficinas';
    cards.replaceChildren(...(selected.length ? selected.map(course => {
      const card = panel(el('div', { class: 'row spread' }, mark(course), badge(labels[stateFor(course)])),
        el('h2', { text: course.title }), el('p', { text: course.description }),
        el('small', { text: tracks.find(([id]) => id === course.track)?.[1] || 'Fundamentos' }),
        progress(course.completed, course.total, 'Progresso em ' + course.title),
        el('small', { text: course.completed + ' de ' + course.total + ' lições' }),
        link('Abrir curso', '#courses/' + course.id, 'secondary'));
      card.classList.add('course-card');
      card.dataset.track = course.track;
      return card;
    }) : [empty('Nenhum curso corresponde aos filtros.', 'search')]));
  }
  query.addEventListener('input', draw);
  for (const control of [track, activity]) control.addEventListener('change', draw);
  draw();
  return el('div', {}, title('Cursos', 'Escolha uma trilha e acompanhe o progresso em cada linguagem.'),
    el('div', { class: 'toolbar' }, field('Buscar curso', query), field('Trilha', track), field('Progresso', activity)),
    el('div', { class: 'stack' }, status, cards));
}

async function coursePage(key) {
  const [id, lessonId] = key.split('/');
  const course = await get('courses/' + encodeURIComponent(id));
  const lessons = course.modules.flatMap(module => module.lessons);
  if (!lessons.length) return el('div', {}, title(course.title, course.description),
    panel(empty('As lições desta trilha ainda não foram publicadas.', 'courses'), link('Voltar aos cursos', '#courses', 'secondary')));
  const current = lessons.find(lesson => lesson.id === lessonId) ||
    lessons.find(lesson => !course.completed.find(record => record.lesson === lesson.id)) || lessons[0];
  const outstanding = el('div', { class: 'stack' });
  const lesson = el('article');
  function refreshLessonList() {
    outstanding.replaceChildren(...course.modules.map(module => el('details', { class: 'panel lesson-module', open: module.lessons.some(l=>l.id===current.id) ? true : null }, el('summary', { class: 'section-head', text: module.title + ' · ' + module.lessons.filter(l=>course.completed.some(r=>r.lesson===l.id)).length + '/' + module.lessons.length }),
      module.lessons.map(item => {
        const done = course.completed.some(row => row.lesson === item.id);
        return el('a', { class: 'nav-item', href: '#courses/' + id + '/' + item.id, 'aria-current': item.id === current.id ? 'page' : null },
          icon(done ? 'check' : item.kind === 'project' ? 'code' : 'courses', 16), item.title);
      }))));
  }
  const lastReview = course.reviews.find(row => row.lesson === current.id);
  const evaluation = el('p', { role: 'status', class: lastReview?.correct ? 'success' : '' });
  if (lastReview) evaluation.textContent = lastReview.attempts + ' tentativa(s) · Última em ' + formatDate(lastReview.updated) + '. ' + (lastReview.correct ? current.review : '');
  const form = el('form', { class: 'form-grid' },
    current.kind === 'project' && field('Como você testou sua solução?', el('textarea', { name: 'reflection', required: true, minlength: 20, maxlength: 4000, rows: 3 }, lastReview?.reflection || '')),
    el('h3', { text: current.question }),
    current.options.map((value, index) => el('label', { class: 'question-option' },
      input('answer', { type: 'radio', required: true, value: index }), el('span', { text: value }))),
    submit('Enviar resposta'), evaluation);
  busy(form, async data => {
    const result = await write('courses/' + id + '/' + current.id, 'POST', { answer: Number(data.answer), reflection: data.reflection });
    evaluation.textContent = (result.correct ? 'Resposta correta. ' + (result.xp ? '+' + result.xp + ' XP. ' : '') : 'Tente novamente. ') + result.review;
    evaluation.className = result.correct ? 'success' : 'error-text';
    if (result.correct && !course.completed.some(row => row.lesson === current.id)) {
      const updated = await get('courses/' + id);
      course.completed = updated.completed; course.certificate = updated.certificate;
      refreshLessonList(); refreshCertificate();
      if (result.xp) notify('Lição concluída. +' + result.xp + ' XP');
    }
  });
  const cert = el('div');
  function refreshCertificate() {
    if (!course.certificate) { cert.replaceChildren(); return; }
    const { name, course: title, issued } = course.certificate;
    cert.replaceChildren(panel(el('h3', { text: 'Certificado interno' }), el('p', { text: name + ' · ' + title + ' · ' + formatDate(issued) }),
      action('Baixar certificado', () => download('titan-certificado-' + id + '.txt',
        'TITAN CODE ACADEMY\nCertificado interno de conclusão\n\n' + name + '\n' + title + '\n' + formatDate(issued) + '\n', 'text/plain'))));
  }
  lesson.className = 'stack';
  lesson.append(panel(el('div', { class: 'lesson-block' }, el('div', { class: 'row spread' }, el('h2', { text: current.title }), badge(current.xp + ' XP', 'bolt')),
    el('p', { text: current.explanation }), codeBlock(current.example, course.title), el('h3', { text: current.kind === 'project' ? 'Desafio de projeto' : 'Exercício' }),
    el('p', { text: current.exercise }), el('div', { class: 'row' }, lessons.indexOf(current)>0 && link('Anterior', '#courses/'+id+'/'+lessons[lessons.indexOf(current)-1].id, 'secondary'), lessons.indexOf(current)<lessons.length-1 && link('Próxima', '#courses/'+id+'/'+lessons[lessons.indexOf(current)+1].id, 'secondary'), link('Praticar no editor', editorUrl(), 'secondary', 'code'),
      action('Pedir ajuda à Titan AI', async event => {
        const button = event.currentTarget; button.disabled = true;
        try {
          const chat = await write('chats', 'POST', { title: course.title + ' · ' + current.title, mode: 'study' });
          sessionStorage.setItem('titan-tutor:' + chat.id, 'Estou estudando ' + course.title + '. Explique ' + current.title + ' e me ajude a começar este exercício: ' + current.exercise);
          navigate('chat', chat.id);
        } catch (error) { notify(error.message, true); }
        finally { button.disabled = false; }
      }, { icon: 'spark' })))), panel(form), cert);
  refreshLessonList(); refreshCertificate();
  return el('div', {}, title(course.title, course.description, link('Todos os cursos', '#courses', 'secondary', 'courses')),
    el('div', { class: 'dashboard-columns' }, lesson, outstanding));
}
