import { readdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = ['server.js'];
for (const directory of ['server', 'public', 'scripts']) {
  for (const name of await readdir(new URL('../' + directory + '/', import.meta.url))) {
    if (/\.(js|mjs)$/.test(name)) files.push(directory + '/' + name);
  }
}
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
for (const entry of manifest.icons) {
  if (!(await stat('public/' + entry.src)).isFile()) throw new Error('Ícone do manifesto ausente.');
}
console.log('Build verificado. Os arquivos estáticos em public/ estão prontos para servir.');
