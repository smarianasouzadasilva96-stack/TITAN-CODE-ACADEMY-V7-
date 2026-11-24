import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const read = name => readFile(new URL('../public/'+name, import.meta.url), 'utf8');
test('seven primary routes and no duplicate AI settings entry', async () => {
 const js=await read('academy.js');
 assert.match(js,/const mainRoutes = \['dashboard','trail','practice','chat','review','progress','preferences'\]/);
 const more=js.match(/const groups = (.*);/)[1];
 assert.doesNotMatch(more,/'ai'/);
 assert.match(js,/Verificar conexão/);
 assert.match(js,/titan-emblem\.webp/);
});
test('updated branding assets and cache version',async()=>{
 assert.ok((await stat(new URL('../public/titan-emblem.webp',import.meta.url))).size>1000);
 assert.match(await read('sw.js'),/stabilized-20261124/);
 assert.match(await read('icon.svg'),/f44970/);
});
