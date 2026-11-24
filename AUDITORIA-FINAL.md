# Auditoria da base V6 — revisão 2026-11-24

| Área | Código | Diagnóstico | Impacto | Prioridade | Situação |
|---|---|---|---|---|---|
| Login | public/academy.js, authScreen/start | API indisponível escondia todo o formulário | Bloqueio de acesso e diagnóstico | Alta | Corrigido visualmente; backend depende de servidor ativo |
| Navegação | public/academy.js, groups | Titan AI e Minha Inteligência Artificial tinham entradas separadas | Redundância | Média | Configuração removida do menu, rota preservada |
| Marca | public/academy.js brand; public/icon.svg | Marca antiga genérica | Identidade inconsistente | Média | Emblema Crimson novo |
| Cache | public/sw.js | Cache poderia manter interface antiga | Tela desatualizada | Alta | Nome de cache atualizado |
| Segurança | server/access-keys.js | Keys de uso único com hash scrypt, papéis no servidor | Acesso controlado | Alta | Preservado; requer auditoria completa de autorização |
| IA | server.js, geração de chat | Limite genérico por conta, sem configuração por papel | Regra de negócio incompleta | Alta | Pendente |
| Conteúdo | server/curriculum.js | 7.232 aulas sem revisão individual demonstrada | Risco pedagógico | Alta | Pendente; não declarar conteúdo revisado |

A revisão não equivale a certificação de segurança, acessibilidade ou produção.
