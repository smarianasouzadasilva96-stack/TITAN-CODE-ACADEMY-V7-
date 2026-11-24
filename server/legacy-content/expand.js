/** Matriz de oficinas práticas: cada unidade tem objetivo verificável, cenário e avaliação. */
const scenes = [
  ['Cadastro de alunos', 'registre nome, turma e situação de um aluno', 'uma turma com cinco estudantes'],
  ['Controle de estoque', 'organize produtos, quantidades e itens em falta', 'um catálogo de dez itens'],
  ['Agenda de tarefas', 'classifique prioridades e tarefas finalizadas', 'sete atividades com prazos diferentes'],
  ['Boletim escolar', 'apresente notas, média e aprovação', 'quatro notas e a média final'],
  ['Biblioteca digital', 'localize livros por título e categoria', 'uma coleção com oito livros'],
  ['App de hábitos', 'acompanhe metas cumpridas por dia', 'uma sequência de sete dias'],
  ['Loja de jogos', 'calcule preços de itens e totais', 'três produtos com quantidades diferentes'],
  ['Sistema de ingressos', 'valide capacidade, disponibilidade e reservas', 'um evento de vinte lugares'],
  ['Monitor de sensores', 'interprete dados simulados e destaque anomalias', 'cinco leituras numéricas'],
  ['Quiz educativo', 'registre perguntas, respostas e pontuação', 'cinco perguntas de múltipla escolha'],
  ['Lista de compras', 'controle itens, unidades e subtotal', 'seis produtos e seus valores'],
  ['Painel de desempenho', 'produza indicadores e resumos organizados', 'dados simulados de uma semana'],
  ['Gestor de contatos', 'organize pessoas e busque entradas', 'cinco contatos com dados fictícios'],
  ['Planejamento de viagens', 'calcule etapas, custos e status de um roteiro', 'um roteiro de três dias'],
  ['Organizador de arquivos', 'separe nomes por tipo e extensão', 'uma lista de dez arquivos fictícios'],
  ['Jogo de pontuação', 'atualize recordes e eventos de uma rodada', 'três partidas com resultados diversos']
];
const formats = [
  ['Laboratório de aplicação','Faça a primeira implementação do recurso da aula dentro do cenário.'],
  ['Teste e observação','Preveja o resultado antes de executar. Execute duas entradas diferentes e explique os resultados.'],
  ['Casos extremos','Defina um caso padrão, um caso vazio e um caso limite. Anote o comportamento esperado para cada um.'],
  ['Depuração orientada','Altere um valor do exemplo e investigue a mudança no resultado. Restaure o código ao final.'],
  ['Interface de dados','Organize entradas e saídas para que outro estudante consiga reproduzir o comportamento.'],
  ['Refatoração guiada','Separe uma parte repetida ou complexa e simplifique mantendo o mesmo resultado.'],
  ['Documentação de código','Explique o papel de cada estrutura e descreva a entrada, processamento e saída.'],
  ['Validação funcional','Liste três testes objetivos e confira se a implementação atende aos requisitos.'],
  ['Comparação técnica','Compare duas pequenas alternativas e explique qual se comunica melhor.'],
  ['Entrega de projeto','Entregue uma versão pequena, com código, dados de teste e instruções de uso.']
];
const phases=['Fundamentos','Construção','Qualidade','Aplicações','Projeto final'];
const comment = (id, text) => {
  const clean=text.replace(/\*\//g,'');
  if(id==='html')return `<!-- ${clean} -->`;
  if(id==='css')return `/* ${clean} */`;
  if(['sql','lua','luau','haskell'].includes(id))return `-- ${clean}`;
  if(id==='prolog')return `% ${clean}`;
  if(id==='matlab'||id==='octave')return `% ${clean}`;
  if(id==='assembly')return `; ${clean}`;
  if(id==='cobol')return `*> ${clean}`;
  if(id==='fortran')return `! ${clean}`;
  if(id==='racket'||id==='clojure')return `; ${clean}`;
  if(id==='powershell'||id==='python'||id==='bash'||id==='ruby'||id==='perl'||id==='r'||id==='nim'||id==='gdscript'||id==='elixir'||id==='julia')return `# ${clean}`;
  return `// ${clean}`;
};
const one=(base, index, number) => {
  const seed=base.lessons[index%base.lessons.length];
  const offset=Math.floor(index/base.lessons.length);
  const scenario=scenes[(index+number+base.name.length)%scenes.length];
  const format=formats[(offset+index)%formats.length];
  const phase=phases[Math.min(4,Math.floor(index/12))];
  const goal=`${format[1]} No projeto “${scenario[0]}”, seu objetivo é ${scenario[1]}. Use como referência ${scenario[2]}.`;
  const prior=`${seed.explanation} A construção da aula principal “${seed.title}” fornece o ponto de partida técnico.`;
  const title=`${scenario[0]} · ${seed.title} (${format[0]})`;
  const code=`${comment(base.id, `Oficina ${number}: ${scenario[0]} — ${format[0]}`)}\n${seed.code}`;
  return {
    number, title, stage:phase, kind:'laboratorio', minutes:12+((index*3)%13),
    explanation:`${prior}\n\n📌 SITUAÇÃO: ${scenario[0]}. ${goal}\n\n🔍 CRITÉRIO DE CONCLUSÃO: demonstre o exemplo original, altere os dados para o cenário proposto e explique pelo menos uma decisão técnica.`,
    code, question:seed.question, choices:seed.choices, answer:seed.answer,
    challenge:`${goal} Salve a sua versão, apresente duas execuções ou resultados esperados e explique onde o conceito “${seed.title}” foi aplicado.`,
    solution:`EXEMPLO DE PARTIDA (não é a única resposta possível):\n\n${seed.solution}\n\nCHECKLIST DE AUTOAVALIAÇÃO:\n1. Adapte os dados ao cenário “${scenario[0]}”.\n2. Aplique o conceito “${seed.title}”.\n3. Teste pelo menos duas entradas.\n4. Descreva o resultado obtido.`
  };
};
export function expandCatalog(baseCourses, exact=3000){
  const each=Math.floor(exact/baseCourses.length),remainder=exact%baseCourses.length;
  return baseCourses.map((base,i)=>{
    const target=each+(i<remainder?1:0);
    if(base.lessons.length>target)throw Error(`Curso ${base.id} acima da cota`);
    const original=base.lessons.map((l,ix)=>({...l,number:ix+1,stage:'Fundamentos',kind:'aula',minutes:10}));
    const seen=new Set(original.map(x=>x.title));
    const fill=Array.from({length:target-original.length},(_,n)=>{
      const lesson=one(base,n,original.length+n+1);
      if(seen.has(lesson.title))lesson.title+=` · Etapa ${lesson.number}`;
      seen.add(lesson.title);
      return lesson;
    });
    return {...base, lessons:[...original,...fill]};
  });
}
