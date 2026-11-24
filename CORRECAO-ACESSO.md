# Correção de acesso — V6

## Diagnóstico confirmado
- `public/key-portal.html`: CSS estava inline, mas a CSP do `key-site.js` aceita somente `style-src self`; navegador descartava todo o CSS. Solução: CSS externo em `/key-portal.css` servido pelo Node.
- `public/academy.js`: ao falhar `GET /api/status`, a tela escondia todos os campos e não tinha botão de nova tentativa. Adicionado botão de reconexão e explicação.
- `public/sw.js`: versão do cache alterada para atualizar os assets.

## Causas possíveis da API indisponível
- Servidor da Academia não iniciado ou encerrado; a página pode aparecer do cache do navegador.
- Dependência `ipaddr.js` não instalada: execute `npm install --omit=optional`.
- Node antigo sem `node:sqlite`: use Node 22.13+ ou instale `better-sqlite3` compatível.
- Erro na migração ou na inicialização do banco: veja o log do Termux.

## Comandos
```sh
cd ~/titan-v6
node -v
npm install --omit=optional
HOST=127.0.0.1 PORT=3000 node server.js
```
Em outra sessão:
```sh
cd ~/titan-v6
# Utilize o MESMO TITAN_KEY_SITE_SECRET da instalação anterior
node key-site.js
```
Confirme `http://127.0.0.1:3000/api/status` e `http://127.0.0.1:3016/key-portal.css`.

Atenção: esta correção não implementa credenciais OAuth/SMTP; essas integrações exigem configuração. Não altere os arquivos de dados nem o segredo da Central.
