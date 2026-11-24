# Incremento 2 — central de chaves

- Adicionado `key-site.js`, segundo servidor local na porta 3016, protegido por segredo de instalação.
- Adicionado `server/access-keys.js`, com geração criptográfica, hash scrypt, uso único, revogação e listagem mascarada.
- Adicionado `POST /api/auth/key` para criar conta com chave emitida pela central.
- Reutilizadas sessões, CSRF e armazenamento de contas existentes.
- Mantidos os arquivos originais do sistema de aulas, pet, projetos e Titan AI.

## Pendências
- Tela de login por chave no front-end, OAuth Google, envio por e-mail, RBAC de criador, limites por aluno, SSE, editor de conteúdo e auditoria integral.
- Testes de integração completos e migração de papéis para banco legado.
