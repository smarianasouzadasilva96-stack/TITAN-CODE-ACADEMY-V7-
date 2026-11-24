import { write } from './client.js';
import { el, action, panel, notify, copy } from './ui.js';
export function studentKeys() {
  const output = el('div', { class: 'stack', 'aria-live': 'polite' });
  const generate = action('Gerar minha chave de recuperação', async () => {
    try {
      const result = await write('auth/student-key', 'POST', {});
      output.replaceChildren(
        el('p', { text: 'Chave pessoal válida por 24 horas e utilizável uma única vez. Guarde-a agora; não será exibida novamente.' }),
        el('code', { class: 'recovery-code', text: result.key }),
        action('Copiar chave', () => copy(result.key), { kind: 'secondary' }));
    } catch (error) { notify(error.message, true); }
  }, { kind: 'primary' });
  return el('div', { class: 'stack' },
    el('h1', { text: 'Minhas chaves de segurança' }),
    el('p', { text: 'Apenas alunos autenticados podem gerar uma chave pessoal. A chave não cria contas de terceiros nem concede permissões administrativas.' }),
    panel('Chave pessoal de recuperação', generate, output),
    el('p', { text: 'Sua senha e seu código de recuperação da conta continuam sendo os métodos de acesso. Esta chave é uma credencial adicional de uso único.' }));
}
