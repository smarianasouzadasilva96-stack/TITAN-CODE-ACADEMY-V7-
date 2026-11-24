import { openDatabase } from '../server/db.js';
import { initializeKeys, issueKey } from '../server/access-keys.js';
const role = process.argv[2];
if (!['admin','creator'].includes(role)) {
  console.error('Uso: node scripts/gerar-chave-privilegiada.mjs admin|creator');
  process.exitCode = 2;
} else {
  const db = openDatabase();
  initializeKeys(db);
  const issued = issueKey(db, role, 'local-install');
  console.log('CHAVE DE USO ÚNICO — copie e guarde agora:');
  console.log(issued.key);
  console.log('O banco armazena somente o hash. Não compartilhe esta chave.');
  db.close();
}
