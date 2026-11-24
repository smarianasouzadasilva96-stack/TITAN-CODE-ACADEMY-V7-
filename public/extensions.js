import { state } from './client.js';
import { action, el, field, input, panel, title, notify } from './ui.js';

function store(name, fallback) {
  const key = `titan-v6-${state.user?.id || 'local'}-${name}`;
  let value;
  try { value = JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { value = fallback; }
  return { get: () => value, set(next) { value = next; try { localStorage.setItem(key, JSON.stringify(next)); } catch { notify('Armazenamento local indisponível.', true); } } };
}
const heading = (name, description) => title(name, description);
export async function journal() {
  const db = store('error-journal', []);
  const rows = el('div', { class: 'extension-list', 'aria-live': 'polite' });
  const concept = input('concept', { required: true, maxlength: 100, placeholder: 'Ex.: escopo de variáveis' });
  const detail = el('textarea', { rows: 3, maxlength: 1200, required: true, placeholder: 'O que aconteceu? Como corrigir?' });
  function render() {
    rows.replaceChildren(...db.get().map((entry, index) => panel(
      el('h3', { text: entry.concept }), el('p', { text: entry.detail }),
      el('small', { text: `Registrado: ${new Date(entry.date).toLocaleDateString('pt-BR')} · Erros: ${entry.count} · ${entry.solved ? 'Resolvido' : 'Pendente'}` }),
      action(entry.solved ? 'Marcar para revisar' : 'Marcar como resolvido', () => { const all = db.get().slice(); all[index].solved = !all[index].solved; db.set(all); render(); }),
      action('Registrar nova tentativa', () => { const all = db.get().slice(); all[index].count++; all[index].solved = false; db.set(all); render(); })
    )));
    if (!db.get().length) rows.append(el('p', { text: 'Nenhum erro registrado. Anote uma dificuldade para revisar depois.' }));
  }
  const form = el('form', { class: 'form-grid' }, field('Conceito', concept), field('Descrição e correção', detail), el('button', { type: 'submit', class: 'button primary', text: 'Salvar erro' }));
  form.addEventListener('submit', event => { event.preventDefault(); const all = db.get().slice(); all.unshift({ concept: concept.value.trim(), detail: detail.value.trim(), date: new Date().toISOString(), count: 1, solved: false }); db.set(all); form.reset(); render(); });
  render(); return el('div', { class: 'stack' }, heading('Diário de erros', 'Registre dificuldades e acompanhe sua evolução, sem punições.'), panel(form), rows);
}
const paths = [
  ['Front-end', 'HTML → CSS → JavaScript → Acessibilidade → Projeto de interface'],
  ['Back-end', 'JavaScript → Node.js → HTTP → Banco de dados → API'],
  ['Dados', 'Python → Estruturas de dados → SQL → Análise → Projeto de dados'],
  ['Jogos', 'Lógica → Lua/Luau → Eventos → Física → Protótipo jogável'],
  ['Mobile', 'Kotlin → Interfaces → Estado → Persistência → Aplicativo']
];
export async function careers() {
  const saved = store('career-path', '');
  const current = el('p', { 'aria-live': 'polite' });
  const cards = paths.map(([name, sequence]) => panel(el('h3', { text: name }), el('p', { text: sequence }), action('Escolher caminho', () => { saved.set(name); current.textContent = `Caminho selecionado: ${name}`; })));
  current.textContent = saved.get() ? `Caminho selecionado: ${saved.get()}` : 'Escolha um caminho para começar.';
  return el('div', { class: 'stack' }, heading('Caminhos de carreira', 'Explore possibilidades e escolha seu foco. Você pode mudar quando quiser.'), current, el('div', { class: 'extension-grid' }, cards));
}
export async function concepts() {
  const concepts = [
    ['Variáveis', 'Primeiro passo para armazenar valores', 'courses'],
    ['Condições', 'Depende de variáveis e operadores', 'courses'],
    ['Laços', 'Depende de condições e variáveis', 'courses'],
    ['Funções', 'Depende de variáveis e fluxo de controle', 'courses'],
    ['Objetos', 'Depende de variáveis e funções', 'courses']
  ];
  return el('div', { class: 'stack' }, heading('Mapa de conceitos', 'Veja a sequência sugerida e abra o catálogo para estudar.'),
    el('div', { class: 'extension-grid' }, concepts.map(([name, description, route], index) => panel(
      el('small', { text: `Etapa ${index + 1}` }), el('h3', { text: name }), el('p', { text: description }),
      el('a', { class: 'button secondary', href: '#' + route, text: 'Explorar aulas' })))));
}

// Ferramentas offline: os resultados ficam vinculados ao perfil local deste navegador.
const quickQuestions = [
  { concept:'Variáveis', q:'Qual declaração cria uma variável que pode mudar em JavaScript?', answers:['const x = 1','let x = 1','fixed x = 1','static x = 1'], correct:1, explain:'let permite reatribuição; const impede reatribuição do identificador.' },
  { concept:'Condições', q:'Qual operador compara valor e tipo em JavaScript?', answers:['=','==','===','=>'], correct:2, explain:'=== realiza comparação estrita, sem coerção de tipo.' },
  { concept:'Funções', q:'O que uma função pode retornar?', answers:['Somente texto','Somente número','Um valor de qualquer tipo','Sempre undefined'], correct:2, explain:'Funções JavaScript podem retornar valores de qualquer tipo.' },
  { concept:'Arrays', q:'Qual é o primeiro índice de um array JavaScript?', answers:['0','1','-1','2'], correct:0, explain:'Os índices de arrays JavaScript começam em zero.' },
  { concept:'Laços', q:'Qual estrutura repete enquanto uma condição for verdadeira?', answers:['if','switch','while','return'], correct:2, explain:'while verifica a condição antes de cada iteração.' }
];
export async function lightning() {
  const history=store('lightning-history',[]);
  const output=el('div',{class:'stack','aria-live':'polite'});
  const header=heading('Desafios relâmpago','Um conceito por vez, sem cronômetro obrigatório. Funciona offline depois de carregar.');
  let index=0;
  function draw(){
    const q=quickQuestions[index%quickQuestions.length];
    const options=q.answers.map((answer,i)=>action(answer,()=>{
      const right=i===q.correct;
      const all=history.get().slice();all.unshift({concept:q.concept,right,date:new Date().toISOString()});history.set(all.slice(0,500));
      output.replaceChildren(panel(el('h3',{text:right?'Resposta correta!':'Vamos revisar'}),el('p',{text:q.explain}),action('Próximo desafio',()=>{index++;draw()},{kind:'primary'}),action('Abrir cursos',()=>{location.hash='#courses'})));
    }));
    output.replaceChildren(panel(el('small',{text:'Conceito: '+q.concept}),el('h3',{text:q.q}),el('div',{class:'form-grid'},options)));
  }
  draw();return el('div',{class:'stack'},header,el('p',{text:'Tentativas registradas neste navegador: '+history.get().length}),output);
}
export async function planner(){
  const preferences=store('study-plan',{minutes:10,rest:[]});
  const plan=preferences.get();
  const status=el('p',{'aria-live':'polite',text:'Seu plano é flexível. Dias de descanso não geram penalidades.'});
  const choice=el('select',{'aria-label':'Meta diária'},[5,10,15,25].map(n=>el('option',{value:String(n),text:n+' minutos por dia',...(plan.minutes===n?{selected:true}:{})})));
  const days=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const checks=days.map((day,i)=>{
    const check=el('input',{type:'checkbox',...(plan.rest.includes(i)?{checked:true}:{})});
    return el('label',{class:'row study-rest-day'},check,day);
  });
  const save=action('Salvar meu plano',()=>{
    preferences.set({minutes:Number(choice.value),rest:checks.flatMap((label,i)=>label.querySelector('input').checked?[i]:[])});
    status.textContent='Plano salvo neste navegador. Você pode alterá-lo a qualquer momento.';
  },{kind:'primary'});
  return el('div',{class:'stack'},heading('Meu plano de estudos','Organize a rotina sem pressão, prazos artificiais ou punições.'),panel(field('Meta diária',choice),el('h3',{text:'Dias de descanso'}),el('div',{class:'study-days'},checks),save,status),panel(el('h3',{text:'Próxima ação'}),el('p',{text:'Continue uma aula ou escolha um desafio curto.'}),el('a',{class:'button secondary',href:'#trail',text:'Abrir minha trilha'}),el('a',{class:'button secondary',href:'#lightning',text:'Desafio relâmpago'})));
}
