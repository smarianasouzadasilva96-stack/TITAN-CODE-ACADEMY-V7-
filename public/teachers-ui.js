import {el,panel,title,link,action,notify} from './ui.js';
const teachers = [["nara", "Nara", "Lógica e fundamentos", "Explica conceitos com analogias claras.", "#ff9b72"], ["byte", "Byte", "JavaScript e web", "Transforma dúvidas em pequenos projetos.", "#72c6f9"], ["lumi", "Lumi", "Python e dados", "Ajuda a interpretar resultados e depurar.", "#b59bff"], ["koda", "Koda", "Mobile e Kotlin", "Ensina a construir aplicativos por etapas.", "#8ce0af"], ["zuri", "Zuri", "Carreira e projetos", "Orienta portfólio, testes e boas práticas.", "#ffcf79"]];
const memoryKey = 'titan-teacher-choice';
function selected(){try{return localStorage.getItem(memoryKey)||'nara'}catch{return 'nara'}}
export function teachersPage(){
 const grid=el('div',{class:'teacher-grid'});
 const current=el('p',{class:'description',role:'status',text:'Seu professor atual: '+(teachers.find(t=>t[0]===selected())?.[1]||'Nara')});
 function draw(){grid.replaceChildren(...teachers.map(([id,name,subject,description])=>{
   const active=selected()===id;
   const card=panel(el('img',{class:'teacher-avatar',src:'./characters/'+id+'.svg',alt:'Personagem '+name,loading:'lazy'}),
     el('span',{class:'pill',text:active?'Seu professor':'Professor disponível'}),
     el('h3',{text:name}),el('strong',{text:subject}),el('p',{text:description}),
     action(active?'Selecionado':'Escolher professor',()=>{try{localStorage.setItem(memoryKey,id)}catch{};current.textContent='Seu professor atual: '+name;notify(name+' selecionado para seus estudos.');draw()},{kind:active?'secondary':'primary'}),
     link('Estudar com Titan AI','#chat','secondary','chat'));
   card.classList.add('teacher-card');return card;
 }));}
 draw();return el('div',{class:'stack'},title('Conheça seus professores','Cinco personagens originais para acompanhar diferentes áreas da programação. A Titan AI continua sendo o motor das conversas.'),current,grid,
 panel(el('h2',{text:'Como funcionam os professores?'}),el('p',{text:'Escolher um personagem personaliza sua experiência visual neste navegador. As explicações são oferecidas pela Titan AI, conforme o provedor configurado; não há cinco modelos de IA independentes.'})));
}
