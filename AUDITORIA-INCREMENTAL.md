# TITAN CODE ACADEMY V6 — auditoria incremental

## Base inspecionada
Pacote TITAN-CRIMSON.zip, package.json versão 6.0.0, Node >=20.6, ESM. Arquivos existentes preservados. Nenhum dado do usuário foi alterado neste pacote.

## Alterações implementadas
- `public/academy.js`: navegação reorganizada em sete rotas principais (Hoje/Visão geral, Trilha, Laboratório, Titan AI, Revisão, Progresso, Perfil) e menu expansível Mais, com persistência da abertura.
- `public/extensions.js`: novas páginas de Diário de erros (criar, marcar resolvido, reabrir e contar tentativas), Caminhos de carreira (seleção persistida) e Mapa de conceitos (lista navegável).
- `public/styles.css`: estilos responsivos para as novas páginas e foco visível do menu.
- Conteúdo existente, editor, contas, pet, IA e rotas de API mantidos.

## Diagnóstico e prioridades
| Área | Arquivo/linha original | Problema | Impacto | Prioridade |
|---|---|---|---|---|
| Navegação | public/academy.js:31-32 | Itens principais repetidos nos grupos | Ruído visual | Alta |
| Navegação | public/academy.js:7-29 | Muitas rotas sem agrupamento compacto | Descoberta difícil no celular | Alta |
| Identidade | public/academy.js:149-157 | Avatar no menu e no cabeçalho | Redundância visual | Média |
| Perfil | public/academy.js:149-151 | Nome com truncamento por CSS | Identificação pouco clara | Média |
| Progresso | public/learning-ui.js (inspeção pendente) | Próxima ação e marco pouco evidentes nas capturas | Continuidade difícil | Alta |

## Status de validação
`node --check public/academy.js` e `node --check public/extensions.js`: passaram. `npm test`: 7 de 9 entradas passaram; duas suítes não iniciaram por ausência da dependência `ipaddr.js` no ambiente de validação. Não há comprovação de testes completos nem de execução em navegador.

## Pendente — não declarar implementado
Login por Google, chaves de acesso e site de chaves, permissões de criador, administração ao vivo, SSE, auditoria de chaves, migração de dados, validação de conteúdo, novas experiências dependentes de IA, métricas Lighthouse. Exigem integração e testes de servidor; não foram simulados com botões decorativos.

## Instalação no Termux
Extraia em uma pasta nova, mantendo backup da instalação atual. Dentro da pasta: `pkg install nodejs -y`, `npm install --omit=optional`, `npm start`. Configure as variáveis existentes do projeto conforme README antes de expor o servidor. Não copie um banco antigo sobre um novo sem backup.
