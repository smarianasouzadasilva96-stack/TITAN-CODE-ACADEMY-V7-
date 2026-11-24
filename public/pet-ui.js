import { petArtwork } from './pet-art.js';
import { get, navigate, state, write } from './client.js';
import { busy, el, field, formatDate, icon, input, link, notify, panel, select, submit, title } from './ui.js';

const accessories = { none: 'Sem acessório', star: 'Estrela', crown: 'Coroa' };
const metric = (name, number, max) => el('div', { class: 'mission' },
  el('div', { class: 'row spread' }, el('strong', { text: name }), el('small', { text: Math.min(number, max) + ' de ' + max })),
  el('progress', { value: number, max, 'aria-label': name }));

function achievements(data) {
  return data.achievements.map(row => el('div', { class: 'pet-stage' }, el('div', { class: 'row' },
    icon(row.unlocked ? 'check' : 'target', 18), el('span', { text: row.name })),
    el('span', { class: 'pill', text: row.unlocked ? 'Conquistado' : 'Em progresso' })));
}

export async function petPage() {
  const data = await get('dashboard');
  const pet = data.pet;
  let celebrate = false;
  try {
    const key = 'titan-v6-pet-stage:' + state.user.id;
    celebrate = pet.stage > Number(localStorage.getItem(key) || 0);
    localStorage.setItem(key, pet.stage);
  } catch {}
  const form = el('form', { class: 'form-grid' },
    field('Nome do pet', input('name', { required: true, maxlength: 32, value: pet.name })),
    field('Acessório', select('accessory', pet.accessories.map(key => [key, accessories[key]]), pet.accessory)),
    submit('Salvar pet'));
  busy(form, async values => { await write('pet', 'PATCH', values); notify('Pet atualizado.'); navigate('pet'); });
  const showcase = panel(el('div', { class: 'row spread' }, el('h2', { text: pet.name }), el('span', { class: 'pill', text: pet.label })),
    petArtwork(pet, celebrate),
    metric('Experiência do pet', data.xp, pet.next || data.xp || 1),
    el('p', { role: celebrate ? 'status' : null, text: pet.next ? (pet.next - data.xp) + ' XP para a próxima evolução.' : 'Evolução especial alcançada.' }));
  showcase.classList.add('pet-card');
  return el('div', {}, title('Lumio · seu companheiro de estudos', 'Um personagem original que evolui com suas conquistas, sem perder progresso quando você descansa.', link('Ver conquistas', '#achievements', 'secondary')),
    el('div', { class: 'grid two' }, showcase,
      panel(el('h2', { class: 'section-head', text: 'Personalização' }), form,
        el('p', { class: 'description section-space', text: 'Estrela disponível com 100 XP. Coroa disponível com 380 XP.' }))),
    el('div', { class: 'grid two section-space' }, panel(el('h2', { text: 'Histórico de evolução' }),
      pet.evolution.map(step => el('div', { class: 'pet-stage' }, el('span', { text: step.label }),
        el('small', { text: step.date ? step.xp + ' XP · ' + formatDate(step.date) : 'Início da jornada' })))),
    panel(el('h2', { text: 'Conquistas' }), achievements(data))));
}

export async function achievementsPage() {
  const data = await get('dashboard');
  return el('div', {}, title('Conquistas e missões', 'Revise seus objetivos e as recompensas conquistadas.'),
    el('div', { class: 'grid two' },
      panel(el('h2', { text: 'Conquistas' }), achievements(data)),
      panel(el('h2', { text: 'Missões de estudo' }),
        metric('Diária · concluir uma lição', data.daily, 1),
        metric('Semanal · concluir lições', data.week, data.goal), link('Escolher um curso', '#courses', 'secondary'))));
}
