# CHANGELOG — TITAN CODE ACADEMY V6

## 2026-11-24 — Refinamento incremental
- Mantida a base V6, banco e arquitetura de cursos, editor e Titan AI.
- Identidade visual Crimson: emblema exclusivo no cabeçalho, novo ícone SVG e CSS responsivo.
- Eliminada duplicação de Minha Inteligência Artificial no menu; a tela continua disponível por rota existente.
- Tela de login mantém os campos visíveis quando a API não responde, exibindo aviso e reconexão.
- Tempo de verificação inicial da API aumentado para 9 segundos.
- Service Worker versionado novamente e com novos recursos estáticos em cache.
- Adicionados testes automatizados de navegação e identidade visual.

## Não concluído nesta revisão
- OAuth Google: requer configuração de credenciais e fluxo OIDC no backend.
- Revisão individual do catálogo de milhares de aulas.
- Lighthouse real em dispositivo e testes ponta a ponta com servidor instalado.
- Limites de IA por papel e sincronização entre dispositivos.
