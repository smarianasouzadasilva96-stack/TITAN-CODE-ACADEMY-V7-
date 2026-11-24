# Login único — 2026-11-24
- Removido o portal de keys separado do pacote de distribuição.
- Adicionada rota `#key` no site principal com ativação de chave usando API `/api/auth/key` existente.
- Apresentados três perfis (aluno, administrador, criador), sem expor valores de credenciais.
- Preservado login tradicional e recuperação de conta para não bloquear contas antigas.
- Botão Google presente, porém desativado até implementação OAuth no servidor.
- Ajustes CSS responsivos e atualização de cache do service worker.
- Banco de dados e APIs anteriores preservados.
