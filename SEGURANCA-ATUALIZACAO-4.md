# Auditoria e atualização 4

## Corrigido
- Cadastro com chave de criador agora mantém o papel `creator` no banco. Antes era convertido incorretamente em `admin`.
- Chaves privilegiadas de instalação inseridas apenas como hashes scrypt (nenhum segredo em código-fonte).
- A Central de Keys emite somente chaves de aluno, evitando escalonamento de privilégios pelo formulário administrativo.
- Endpoints POST da central exigem Origin exata e Content-Type application/json.
- A V6 original, cursos, progresso, editor, pet e Titan AI foram preservados.

## Recomendações pendentes
- RBAC com sessão autenticada para gerenciar chaves, substituindo o segredo compartilhado de emissão.
- Testes de OAuth e SMTP com serviços reais; cookies Secure em HTTPS.
- A central guarda cópia cifrada da chave do aluno para recuperação; chave de cifragem deve ser persistente e isolada do segredo de administração.
- A chave de criador deve ser recuperável por procedimento administrativo local e nunca concedida a terceiros.
- Implementar limites de IA no servidor e auditoria de conteúdo.
- Auditar revogação de privilégios já consumidos e migração de usuários anteriores.

## Funcionamento
Chaves privilegiadas fornecidas separadamente ao responsável pela instalação. São de uso único para criação da conta na Academia. Depois, o login é feito pela conta cadastrada.
