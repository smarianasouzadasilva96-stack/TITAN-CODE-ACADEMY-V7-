# Code Studio V6

O estúdio vem do editor V4 do repositório irmão `Titan-Code-ultimat` na revisão `a0745bd`. Preserva múltiplos projetos e arquivos, modelos, destaque de sintaxe, numeração, atalhos, busca no arquivo, importação, ZIP e recuperação de backup, com integração à conta e ao histórico da Titan AI.

No celular, alterne entre **Código**, **Prévia** e **Console**. Abra **Arquivos** para trocar de documento ou criar um arquivo. No desktop, arraste a divisória da prévia ou focalize a divisória e use as setas. O console pode ser recolhido. Use `Esc` para sair da prévia em tela cheia e `Esc` seguido de `Tab` para sair do editor pelo teclado.

## Dados locais e migração

O modo **Abrir editor local** mantém o formato `titan-code:projects:v3` no navegador. Quando o editor e os dados antigos compartilham a mesma origem, o botão **Importar projetos locais**, em configurações, pode copiar projetos para a conta autenticada após confirmação.

Entre origens diferentes, exporte o backup JSON no editor antigo e use **Importar backup** no novo editor. A importação cria IDs novos e preserva projetos já existentes. O editor mantém as edições pendentes em armazenamento local separado por ID de conta e remove as cópias pendentes após sincronizar. Se outro dispositivo modificar o projeto, exporte a cópia pendente em ZIP antes de resolver o conflito.

O console exibe mensagens da prévia web e, quando habilitado, o resultado do executor. Use a busca no explorador para localizar caminhos e trechos de código. No editor, use `Ctrl+F` para buscar e substituir, `Ctrl+Espaço` para sugestões, `Ctrl+S` para salvar e `Ctrl+Z` para desfazer. A formatação usa indentação de dois espaços para JSON e oferece normalização de espaços para outros arquivos. **Titan AI** oferece explicação de código e de erros, testes, documentação e propostas de vários arquivos. Revise os diffs e confirme a aplicação. As propostas verificam a versão atual dos arquivos antes de escrever.

## Execução

A prévia web roda no navegador do usuário em um frame com origem isolada e política de conteúdo restrita. Ela suporta DOM, HTML, CSS e JavaScript. Os limites do executor remoto se aplicam às execuções remotas, enquanto a prévia usa os recursos do navegador. A prévia e o editor local continuam disponíveis offline quando os arquivos estáticos estão no cache.

O executor opcional roda arquivos JavaScript ou Python de projetos autenticados em contêineres Docker separados. Para habilitar, configure `TITAN_RUNNER_SOCKET` com o caminho do socket Docker rootless e `TITAN_RUNNER_NODE_IMAGE` ou `TITAN_RUNNER_PYTHON_IMAGE` com imagens confiáveis fixadas por digest. Prepare as imagens no host antes da configuração. As imagens devem conter `timeout` do GNU e o runtime escolhido. Use um daemon dedicado com seccomp ativo, cgroups v2 e delegação de CPU, memória, swap e PIDs. O serviço verifica se os limites são suportados antes de aceitar execução.

Cada execução usa rede desabilitada, filesystem raiz somente leitura, usuário sem privilégios, capacidades removidas, 128 MB de memória, meia CPU, 24 PIDs, tempo de cerca de seis segundos e saída de até 32 KB. Apenas o código do arquivo ativo segue por stdin. O servidor mantém até quatro execuções simultâneas no total e uma por conta. O serviço em Render e o uso normal em Termux funcionam com o executor desabilitado.
