# Atualização de permissões — V6

- Corrigida a autorização de `creator` no servidor para acessar o painel administrativo.
- Adicionada gestão de contas no painel: busca, encerramento de sessões, promoção e rebaixamento de administradores, bloqueio e desbloqueio.
- Administradores podem consultar alunos e encerrar sessões de alunos; editar cursos. Não podem promover, bloquear, desbloquear ou modificar configurações globais.
- Criador pode promover alunos a administradores, rebaixar administradores, bloquear e desbloquear contas não criadoras e alterar configurações globais.
- Contas bloqueadas não autenticam e sessões existentes são invalidadas.
- Migração aditiva de banco de dados: colunas `banned` e `ban_reason`; não substitui os dados existentes.
- Auditoria para alterações de papéis, sessões, bloqueios e configurações.

## Testes
`npm run build`: passou. `node --test tests/curriculum-import.test.js`: passou. `tests/academy.test.js`: não executou integralmente no ambiente de empacotamento por falta de dependências instaladas. Fluxos no Termux precisam ser validados.

## Instalação
Faça backup da pasta e do banco antes de atualizar. Extraia o conteúdo deste ZIP **dentro de** `~/titan-v6`, preservando `data/` e `.env`. Rode `npm install --omit=optional` e `HOST=127.0.0.1 PORT=3000 node server.js`. A migração do banco é automática ao iniciar.

## Limitações
O painel não oferece exclusão definitiva de contas nem alteração de papel do criador. Os limites de IA por usuário e gerenciamento de keys administrativas pelo painel ainda não foram implementados nesta atualização.
