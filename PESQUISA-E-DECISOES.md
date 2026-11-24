# TITAN V6 — Pesquisa e decisões de produto

Base analisada: TITAN-V6-LOGIN-UNICO.zip, projeto Node ESM V6.

## Referência externa
A Sala do Futuro centraliza agenda, tarefas, materiais e progresso e diferencia acesso por perfil. Referências: https://saladofuturo.educacao.sp.gov.br/login-alunos e https://atendimento.educacao.sp.gov.br/knowledgebase/article/SED-08326/pt-br . A TITAN utiliza a ideia de um painel central, sem reproduzir identidade ou telas de terceiros.

## Entregue neste incremento
- Início renomeado Hoje, com próxima aula e marco de dez lições.
- Navegação principal com sete categorias no desktop e cinco atalhos no rodapé mobile; demais rotas preservadas em Mais.
- Desafios relâmpago com perguntas objetivas e feedback explicativo, registro local e sem timer obrigatório.
- Meu plano de estudos com metas de 5, 10, 15 ou 25 minutos e dias de descanso, salvo localmente.
- Identificação correta do papel criador no menu lateral.
- Ajustes de foco, tamanho de toque, quebras de linha e redução de animações.

## Pendências e limites
- Não houve implementação de autenticação Google, SMTP, controle de acesso por chave, SSE, painel administrativo em tempo real, revisão pedagógica de milhares de aulas nem teste Lighthouse.
- Desafios e plano de estudos são armazenados no navegador atual, sem sincronização de contas ou dispositivos.
- O currículo importado inclui material gerado, não se declara revisão humana.
- Não substituir o banco de dados existente: preservar a pasta de dados e o arquivo .env.
