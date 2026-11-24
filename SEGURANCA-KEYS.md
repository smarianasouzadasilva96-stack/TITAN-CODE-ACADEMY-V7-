# Chaves TITAN — atualização de segurança

- Google OAuth foi retirado da interface de login. A aplicação mantém login por e-mail/senha e ativação por chave emitida.
- A emissão pública anônima de chaves foi **deliberadamente evitada**: permitiria criar contas ilimitadas e contornar bloqueios. Alunos autenticados podem emitir uma chave pessoal de recuperação por 24 horas, com uso único, na aba **Minhas chaves**.
- O servidor armazena somente hash scrypt de cada chave, e a chave é exibida apenas no momento da emissão.
- Chaves de administrador/criador anteriormente publicadas no chat não são mais inseridas automaticamente em instalações novas. Para gerar novas chaves privilegiadas, use `node scripts/gerar-chave-privilegiada.mjs admin` ou `creator` no terminal local, em ambiente privado.
- Não publique as chaves privilegiadas, o banco SQLite nem o arquivo .env. Para instalação já existente, revogue no banco as chaves antigas ainda não usadas.
- A chave pessoal permite entrar na conta existente por e-mail e chave, uma vez, sem senha. O login por senha e recuperação permanece intacto.
- O recurso não substitui autenticação de e-mail verificado. Cadastro tradicional permanece disponível na V6; habilitar confirmação real por e-mail requer serviço SMTP configurado.

- As duas chaves privilegiadas divulgadas anteriormente são revogadas automaticamente se ainda não foram usadas.
