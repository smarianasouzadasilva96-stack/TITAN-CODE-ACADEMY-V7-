# Central de Chaves TITAN — atualização incremental

A Academia V6 continua em `127.0.0.1:3000`; a central em `127.0.0.1:3016`. Ambas usam o mesmo banco configurado em `server/db.js`.

## Configuração

No Termux, na pasta do projeto:

```sh
export TITAN_KEY_SITE_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))')"
export TITAN_KEY_ORIGIN=http://127.0.0.1:3016
export SMTP_HOST=smtp.seu-provedor.com
export SMTP_PORT=465
export SMTP_USER=seu-usuario-smtp
export SMTP_PASSWORD=sua-senha-de-app-smtp
export SMTP_FROM=contato@seudominio.com
node key-site.js
```

O SMTP requer conexão TLS na porta 465, com usuário e senha do serviço de e-mail. **Não inclua credenciais reais no ZIP.** Use um serviço de e-mail transacional e domínio autorizado para entregabilidade.

Para ativar o Google, registre um aplicativo Web no Google Cloud Console, configure a URI de redirecionamento **exata** `http://127.0.0.1:3016/oauth/google/callback` e configure:

```sh
export GOOGLE_CLIENT_ID='ID fornecido pelo Google'
export GOOGLE_CLIENT_SECRET='segredo fornecido pelo Google'
```

O fluxo utiliza Authorization Code + PKCE S256, state de uso único vinculado ao navegador e endpoint OIDC userinfo com e-mail verificado. Para publicar na internet, use HTTPS, configure `TITAN_KEY_ORIGIN` com a origem pública exata e adapte a publicação à configuração de proxy HTTPS. A central, por padrão, escuta apenas `127.0.0.1`.

## Fluxo

1. Administrador acessa a central, informa o segredo e emite uma chave para um e-mail específico.
2. O destinatário entra com Google ou recebe um código de 8 dígitos por e-mail. O código expira em 15 minutos, é de uso único e admite até cinco tentativas.
3. Após autenticar, o destinatário consulta a chave individual. O texto da chave fica cifrado em repouso com AES-256-GCM, e sua verificação na Academia continua usando o hash original.
4. No primeiro cadastro da Academia, a chave é consumida. Para entrar novamente, o aluno usa a senha de sua conta da Academia. A central mostra o status de uso.

**A chave não é uma senha reutilizável da Academia.** Ela serve para autorizar o primeiro cadastro, preservando o mecanismo de chave única da V6. Para autenticação Google/e-mail diretamente na Academia, é necessária uma etapa adicional de integração do sistema de sessões da Academia.

## Recomendações prioritárias

- Não disponibilizar o segredo administrativo para alunos. Na versão atual, a emissão ainda é protegida por segredo; o próximo passo é RBAC com sessão de administrador e auditoria.
- Separar chave de emissão administrativa do segredo de cifragem em uma futura rotação, com migração de dados cifrados.
- Restringir revogação de chave de criador a recuperação autorizada e preservar auditoria.
- Não anunciar login Google como operacional até configurar as credenciais OAuth e testar com o domínio final.
- Fazer backup da base antes de atualizar e testar cadastro, consumo e revogação com contas de teste.
