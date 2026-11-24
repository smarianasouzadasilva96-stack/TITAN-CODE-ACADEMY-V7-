import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const root=new URL('../public/',import.meta.url);
const [html,js,css,tokens]=await Promise.all([
  readFile(new URL('editor.html',root),'utf8'),
  readFile(new URL('app.js',root),'utf8'),
  readFile(new URL('styles.css',root),'utf8'),
  readFile(new URL('tokens.css',root),'utf8')
]);

test('enhanced editor JavaScript parses without execution',()=>{
  assert.doesNotThrow(()=>new Script(js));
});
test('file search is accessible and its controls are wired',()=>{
  for(const id of ['findBar','findInput','findCount','findCodeBtn','findPrevBtn','findNextBtn','findCloseBtn']){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(js,new RegExp("['\\\"]"+id+"['\\\"]"));
  }
  assert.match(html,/role="search"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(js,/function findNext\(/);
  assert.match(js,/function updateFindCount\(/);
  assert.match(js,/e\.key\.toLowerCase\(\)==='f'/);
});
test('backup restore preserves existing projects and rejects invalid archives',()=>{
  assert.match(html,/id="restoreBackupBtn"/);
  assert.match(html,/id="restoreBackupInput"[^>]*accept="\.json,application\/json"/);
  assert.match(js,/function restoreBackup\(/);
  assert.match(js,/data\.projects\.every\(p=>validateProject\(p\)/);
  assert.match(js,/const combined=\[\.\.\.projects,\.\.\.restored\]/);
  assert.match(js,/safeLocalSet\(storageKey,JSON\.stringify\(combined\)\)/);
});
test('import is bounded, staged and preserves reduced motion',()=>{
  assert.match(js,/file\.size > 1500000/);
  assert.match(js,/selected\.length > 250/);
  assert.match(js,/selected\.reduce\(/);
  assert.match(js,/for \(const file of selected\) /);
  assert.match(js,/validateFiles\(staged\)/);
  assert.match(js,/activeProject\(\) !== project/);
  assert.match(tokens,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/\.find-bar\[hidden\]/);
});
test('studio navigation retains overlay synchronization',()=>{
  assert.match(js,/function syncBackdrop\(\)/);
  assert.match(js,/function setPage[\s\S]*?toggleFiles\(false\);[\s\S]*?syncBackdrop\(\)/);
  assert.match(js,/function toggleAi\(open\)[^\n]*syncBackdrop\(\)/);
  assert.match(js,/\$\('menuToggle'\)\.addEventListener\('click',[\s\S]*?syncBackdrop\(\)/);
  assert.match(html,/id="toggleFiles"[^>]*aria-controls="filesPane"/);
});
