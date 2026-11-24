# Atualização 3 — Central de chaves

- Nova interface Crimson com emblema vetorial.
- Login Google OAuth 2.0/OIDC com PKCE e state vinculado ao navegador (requer credenciais).
- Login por código enviado por e-mail via SMTP TLS (requer servidor SMTP).
- Código de oito dígitos, validade de 15 minutos, hash e limite de tentativas.
- Sessões próprias da central com cookie HttpOnly e SameSite=Strict.
- Chave individual atribuída ao e-mail e recuperável na central após autenticação.
- Criptografia AES-256-GCM do texto recuperável e hash de verificação original na Academia.
- Acesso administrativo de emissão/listagem, sem exibir chaves na lista.

Pendências: integração de Google/e-mail ao login da Academia; RBAC do painel; testes de entrega SMTP e OAuth em provedor real; testes de integração completos; auditoria de conteúdo e migração.
