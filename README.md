# TITAN CODE ACADEMY V6 — ULTIMATE REBORN

Plataforma multiusuário de aprendizado e projetos com Titan AI, editor web local e sincronizado, progresso educacional e pet. O aplicativo usa Node.js, SQLite e módulos JavaScript servidos diretamente ao navegador.

## Iniciar

Use Node.js 22.13 ou posterior para aproveitar o SQLite integrado. Node.js 20.6 ou posterior da série 20 usa a dependência opcional `better-sqlite3`.

```bash
npm ci --omit=optional                      # Node 22.13+
export TITAN_MASTER_KEY="$(node -p 'require("node:crypto").randomBytes(32).toString("base64")')"
npm run build
npm start
```

Abra `http://127.0.0.1:3000`, crie uma conta e guarde o código de recuperação. Preserve a mesma chave mestra entre reinícios. Em desenvolvimento sem chave mestra, escolha armazenamento de credencial somente durante a sessão.

No Node 20, execute `npm ci --include=optional`. Para carregar um arquivo local criado a partir de [.env.example](.env.example), use `node --env-file=.env server.js`. O arquivo deve ficar fora do Git e com permissão de leitura somente para o usuário que executa o serviço.

### Atualizar da V5 no Termux

Pare o servidor com `Ctrl+C`. Baixe `TITAN-CODE-ACADEMY-V6.zip` na pasta Download e execute `termux-setup-storage` caso ainda precise autorizar o acesso à pasta. Os comandos abaixo usam a pasta e a porta da instalação V5 distribuída anteriormente. Ajuste esses dois valores se a sua instalação usa outros.

```bash
pkg install nodejs unzip
unzip -oq "$HOME/storage/downloads/TITAN-CODE-ACADEMY-V6.zip" -d "$HOME" &&
  bash "$HOME/TITAN-CODE-ACADEMY-V6/scripts/update-termux.sh" "$HOME/titan-v5-3015/TITAN-CODE-ACADEMY-V5" &&
  cd "$HOME/titan-v5-3015/TITAN-CODE-ACADEMY-V5" &&
  HOST=127.0.0.1 PORT=3015 node --env-file=.env server.js
```

Abra `http://127.0.0.1:3015` e recarregue a página. O script salva um snapshot em `backups/pre-v6-*/tutan.sqlite` na instalação V5 antes de copiar o aplicativo. A atualização reaproveita o arquivo `.env`, a origem do navegador e o banco existente. Na primeira inicialização, a migração transacional do SQLite acrescenta a categoria dos documentos e o nome amigável do modelo. As credenciais persistentes continuam protegidas pela chave mestra que a V5 já usava. Preserve o `.env` original, inclusive durante uma restauração.

### Instalação nova no Termux

```bash
pkg update
pkg install nodejs unzip
unzip -oq "$HOME/storage/downloads/TITAN-CODE-ACADEMY-V6.zip" -d "$HOME"
cd "$HOME/TITAN-CODE-ACADEMY-V6"
node --version
npm ci --omit=dev --omit=optional
umask 077
if [ ! -e .env ]; then
  node -e 'console.log("TITAN_MASTER_KEY=" + require("node:crypto").randomBytes(32).toString("base64"))' > .env
fi
node --env-file=.env server.js
```

Execute na pasta `TITAN-CODE-ACADEMY-V6` extraída, dentro do armazenamento privado do Termux. Com Node 20 sem binário SQLite compatível, instale `python`, `make` e `clang` para a compilação nativa da dependência e rode `npm ci --include=optional`. Para acesso pelo mesmo aparelho, mantenha `HOST=127.0.0.1`. O Termux pode encerrar processos em segundo plano conforme as configurações de energia do Android.

## Configurar a Titan AI

Abra **Minha Inteligência Artificial**, escolha o provedor e informe sua chave no formulário do site. Consulte o catálogo e selecione o modelo. **Testar conexão** verifica a disponibilidade do modelo. **Testar geração** envia uma mensagem curta ao modelo selecionado antes de salvar. Depois de salvar, **Testar geração no chat** usa a configuração da conta e registra a resposta em uma conversa de teste. No OpenRouter, **Consultar uso** mostra a utilização e os limites quando o provedor os disponibiliza.

| Provedor | Catálogo | Geração | Configuração |
| --- | --- | --- | --- |
| Ollama Cloud | `https://ollama.com/api/tags` | `/api/chat`, NDJSON | Chave individual |
| OpenRouter | `https://openrouter.ai/api/v1/models` | `/chat/completions`, SSE | Chave individual |
| Ollama local | `/api/tags` | `/api/chat`, NDJSON | `TITAN_OLLAMA_LOCAL_URL` no servidor |
| Compatível | `/models` | `/chat/completions`, SSE | Origens e caminhos HTTPS aprovados em `TITAN_CUSTOM_ENDPOINTS` |

A disponibilidade de `qwen3:8b` e de NVIDIA Nemotron 3 Ultra gratuito (`nvidia/nemotron-3-ultra-550b-a55b:free`) é verificada no catálogo do provedor. Se a instância Ollama rodar na mesma máquina do servidor, um operador pode preparar o modelo com `ollama pull qwen3:8b` e configurar `TITAN_OLLAMA_LOCAL_URL=http://127.0.0.1:11434`. Essa URL aponta para a rede do backend.

Use URLs-base personalizadas separadas por vírgulas, incluindo `/v1` quando exigido. A configuração padrão deixa o provedor personalizado sem endpoints. Para serviços públicos, o servidor valida a URL, resolve todos os endereços, bloqueia IPs não públicos, fixa o IP usado na conexão e rejeita redirecionamentos. Use uma instância Ollama dedicada ao TITAN para o provedor local, com acesso controlado pelo operador.

## Estudar e desenvolver

- A academia inclui dois módulos introdutórios em cada uma das 16 linguagens. Cada trilha inclui lição, exemplo, prática, avaliação, desafio de projeto e certificado interno.
- XP, missões e evolução do pet são calculados a partir de conclusões registradas no servidor. Repetir uma avaliação concluída não aumenta o XP.
- O Code Studio importa arquivos de texto e backups JSON V3, exporta ZIP e oferece prévia HTML/CSS/JS em painel redimensionável ou modo de tela cheia. Projetos sincronizados têm as dez versões anteriores do servidor e proteção contra sobrescrita por outro dispositivo.
- A Titan AI usa o modelo pessoal da conta. Conversas podem selecionar um projeto de contexto, anexar texto, recuperar trechos dos documentos autorizados e incluir memória de preferências. O controle de memória é separado por conta e conversa. O perfil permite desligar a recuperação de contexto de projetos e documentos no chat.
- Conversas e dados pessoais são exportados em NDJSON. Cada linha é um objeto JSON contendo o tipo do registro e seus dados.
- A recuperação de conta usa um código de uso único, gerado no cadastro. O perfil pode gerar um código substituto. A troca de senha pela recuperação encerra as sessões anteriores.

O [guia do editor](EDITOR.md) cobre importação de dados antigos e execução isolada.

## Operar em produção

Configure `NODE_ENV=production`, `TITAN_ORIGIN` com a origem HTTPS exata, `TITAN_MASTER_KEY` em um gerenciador de segredos e `TITAN_DB` em armazenamento persistente. O blueprint [render.yaml](render.yaml) define um serviço com disco persistente. Cadastre a origem real e a chave mestra no provedor ao implantar.

Use uma única instância de Node por banco. O limite de requisições, os trabalhos de streaming e as credenciais temporárias residem no processo. O proxy deve servir HTTPS, desabilitar buffering para respostas de streaming e sobrescrever `X-Forwarded-Proto` e `X-Real-IP`. Habilite `TITAN_TRUST_PROXY=1` somente quando o backend for acessível exclusivamente pelo proxy confiável. Por padrão, apenas peers loopback são confiáveis. Para proxies separados, liste os IPs exatos em `TITAN_PROXY_PEERS`. O blueprint Render usa o valor `private` em rede privada do serviço. Para TLS direto, defina os caminhos `TITAN_TLS_CERT` e `TITAN_TLS_KEY`. O endpoint `/health` checa o banco e funciona para a sonda interna.

| Variável | Uso |
| --- | --- |
| `HOST`, `PORT` | Endereço de escuta e porta, com padrão local `127.0.0.1:3000` |
| `TITAN_ORIGIN` | Origem HTTPS usada na validação CSRF em produção |
| `TITAN_MASTER_KEY` | Chave aleatória de 32 bytes em base64 para AES-256-GCM |
| `TITAN_DB` | Arquivo SQLite, padrão `data/tutan.sqlite` |
| `TITAN_TRUST_PROXY` | Confia nos cabeçalhos sobrescritos pelo proxy HTTPS |
| `TITAN_PROXY_PEERS` | IPs separados por vírgula do proxy autorizado, ou `private` em rede isolada |
| `TITAN_OLLAMA_LOCAL_URL` | URL da instância Ollama administrada pelo operador |
| `TITAN_CUSTOM_ENDPOINTS` | URLs-base HTTPS autorizadas separadas por vírgulas |
| `TITAN_RUNNER_*` | Configuração opcional do executor Docker descrita no guia do editor |

Após o cadastro da conta de operação, execute `npm run admin -- operador@example.com` no servidor autorizado. O painel agrega sessões ativas, erros, latência, saúde do banco e alterações administrativas. Ele permite editar conteúdo, publicar ou ocultar cursos e ajustar avisos e cadastros. As rotas administrativas retornam métricas e conteúdo, sem campos de credenciais.

### Privacidade e retenção

A conta recebe um UUID interno. O banco armazena identificadores de sessões e códigos de recuperação em forma de hash. O endereço IP serve ao limite de autenticação e permanece na memória do processo como HMAC com sal rotativo. As entradas expiram em dez minutos e são removidas na limpeza periódica. Configure a retenção dos logs do proxy conforme sua política de privacidade.

Cada credencial persistente usa um nonce aleatório e autenticação vinculada ao usuário, provedor, endpoint e modelo. A chave mestra fica fora do banco. Uma chave temporária permanece na memória da sessão e é descartada ao sair, revogar a sessão, expirar ou reiniciar o serviço. Exclusões removem a configuração ativa. Cópias de backup anteriores podem conter o ciphertext até expirarem.

No perfil, o titular escolhe por quanto tempo manter conversas inativas e preferências de memória. Há exclusão individual de conversas, memória e documentos, além de exportação. O terminal registra uma linha `[Titan AI]` por geração com provedor, endpoint, protocolo, HTTP, duração, quantidade de caracteres, presença de raciocínio e código de resultado. O registro usa metadados e contagens, sem conteúdo de mensagens, raciocínio ou credenciais.

### Backup, restauração e rotação

```bash
npm run backup -- /caminho/seguro/titan-snapshot.sqlite
```

O comando usa `VACUUM INTO` para produzir um snapshot consistente em um novo arquivo. Agende no host de produção, proteja o destino e defina retenção. Para restaurar, pare o serviço, mova o banco antigo e seus arquivos WAL/SHM para uma área protegida, restaure o snapshot com permissão `0600` e reinicie com a chave mestra correspondente ao backup. Valide `/health`, um login e a configuração de um provedor autorizado.

Faça backup antes de rotacionar. Com o serviço parado, forneça a chave anterior via `TITAN_MASTER_KEY_OLD` e a nova via `TITAN_MASTER_KEY`, ambas pelo ambiente seguro. Execute `npm run rotate-key`. A migração é transacional e aborta por inteiro se uma credencial não puder ser aberta. Remova a variável temporária, reinicie com a chave nova e teste a conexão. Retenha a chave antiga somente durante a vigência dos backups produzidos antes da rotação, separadamente deles.

## Verificação

```bash
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

Defina `TITAN_CHROMIUM=/caminho/para/chromium` para usar um Chromium local. Os testes de provedores usam mocks. O workflow verifica Node 20, Node 24 e fluxos no Chromium e guarda o relatório da execução. O workflow manual de GitHub Pages publica a versão estática e o editor offline. Contas, cursos sincronizados e IA exigem o backend.

O teste de navegador verifica overflow em 320, 360, 390, 412, 768, 1024 e 1440 px. Defina `TITAN_SCREENSHOT_DIR` para gravar uma captura de cada tela testada. A emulação Pixel 5 cobre o layout móvel e o editor offline em Chromium.

### Tamanho dos recursos estáticos

Valores em KiB, comparando a V5 `ec63400` e a V6. A medição soma arquivos únicos de cada tela, com Gzip nos textos superiores a 1 KiB como no servidor. Exclui chamadas de API e cabeçalhos HTTP.

| Recursos | V5 | V6 |
| --- | ---: | ---: |
| Login | 15,1 | 17,1 |
| Dashboard móvel | 19,3 | 22,5 |
| Dashboard desktop com WebP | 19,3 | 30,3 |
| Chat | 20,7 | 23,4 |
| Code Studio | 30,8 | 30,4 |
| Cache inicial da PWA | 62,7 | 48,0 |

As páginas secundárias são carregadas sob demanda. A imagem WebP do dashboard pesa 7,7 KiB e é requisitada apenas a partir de 1024 px. A medição acima é de transferência estática. A latência em aparelhos Android físicos ainda precisa ser medida.

## Central local de chaves (incremento experimental)

A central de chaves usa o mesmo banco SQLite da Academia, em uma porta separada. Execute em terminais diferentes:

```sh
export TITAN_KEY_SITE_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
node key-site.js
# em outro terminal, na mesma pasta:
npm start
```

Abra `http://127.0.0.1:3016` para gerar chaves. Configure um segredo persistente e privado no ambiente; caso contrário, a central reiniciada com outro segredo recusará o anterior. O site principal continua em `http://127.0.0.1:3000`. A API `POST /api/auth/key` aceita `{ "email": "...", "name": "...", "password": "senha com 12+ caracteres", "key": "TITAN-..." }` e cria uma conta vinculada a uma chave válida, consumida uma única vez. Uma conta já existente continua usando seu login anterior.

A função de criador no banco legado ainda usa a permissão `admin` por compatibilidade com a restrição SQLite existente; a separação completa de papéis e a interface de login por chave permanecem pendentes. Não exponha a central diretamente à internet.

## Login único (atualização)

O portal separado de keys foi descontinuado. Execute somente `node server.js` e abra `http://127.0.0.1:3000`.
A tela principal oferece login por e-mail/senha e ativação de uma chave de aluno, administrador ou criador previamente emitida pelo servidor. Chaves são validadas no banco e consumidas uma única vez; não são geradas no navegador. Após ativação, a conta entra por e-mail e senha.
O botão Google está visível, porém desativado até a implementação e configuração de OAuth 2.0/OIDC no servidor. Ele não simula login.
As chaves privilegiadas existentes são preservadas. Nunca inclua valores secretos no repositório ou na interface pública.
