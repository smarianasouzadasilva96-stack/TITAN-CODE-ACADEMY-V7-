import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const account = readFileSync(new URL('../server/accounts.js', import.meta.url), 'utf8');
test('criador e administrador têm políticas separadas', () => {
 assert.match(server, /\['admin','creator'\]\.includes\(user\.role\)/);
 assert.match(server, /Somente o criador gerencia administradores/);
 assert.match(server, /Somente o criador pode bloquear contas/);
 assert.match(server, /target\.role === 'creator'/);
 assert.match(account, /row\.banned/);
});
