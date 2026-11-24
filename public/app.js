(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const legacyStorage = 'titan-code:projects:v3';
  let storageKey = legacyStorage, settingsKey = 'titan-code:settings:v3', activeKey = 'titan-code:active:v3';
  let account = null, syncTimer, syncing = false, rescheduleSync = false;
  const dirty = new Set(), editorChats = new Map(), localHistory = new Map();
  const localMode = new URLSearchParams(location.search).get('local') === '1';
  const edits = new Map();
  const smallStudio = matchMedia('(max-width: 960px)');
  let setTheme;
  let renderedPreview;
  let leaveEditor = false;
  let projects = [], activeId = '', status = null, currentPage = 'studio';
  let savingTimer = null, previewTimer = null, chatBusy = false;
  let dialogCallback = null;
  let settings = { theme:'dark', autoPreview:true };
  let highlightFrame = 0;

  const templates = {
    web: {
      'index.html': `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Meu projeto TITAN</title>\n</head>\n<body>\n  <main class="container">\n    <div class="badge">✦ Feito no TITAN CODE</div>\n    <h1>Seu próximo grande projeto começa aqui.</h1>\n    <p>Edite o HTML, o CSS e o JavaScript para criar algo único.</p>\n    <button id="hello">Começar agora →</button>\n    <p id="feedback"></p>\n  </main>\n  <script src="script.js"><\/script>\n</body>\n</html>`,
      'style.css': `:root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }\n* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #28215c, #080d1b 68%); color: white; }\n.container { padding: 38px; width: min(580px, 100%); text-align: center; }\n.badge { display: inline-block; padding: 9px 15px; border: 1px solid #7259bf; background: #2e225f; color: #d6c7ff; border-radius: 99px; font-size: 12px; }\nh1 { font-size: clamp(29px, 5vw, 48px); line-height: 1.1; letter-spacing: -2px; }\np { color: #b0bad1; line-height: 1.75; }\nbutton { padding: 14px 21px; background: #9069f5; border: 0; border-radius: 9px; color: white; font-weight: 750; cursor: pointer; }\n#feedback { color: #a6efcd; }`,
      'script.js': `const button = document.querySelector('#hello');\nbutton?.addEventListener('click', () => {\n  document.querySelector('#feedback').textContent = 'Pronto! Agora é com você. 🚀';\n});`
    },
    landing: {
      'index.html': `<!doctype html>\n<html lang="pt-BR">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nova marca</title></head>\n<body>\n<nav><strong>ORBIT ✦</strong><a href="#sobre">Sobre</a><a href="#contato">Contato</a></nav>\n<section class="hero"><span class="label">IDEIAS QUE VIRAM REALIDADE</span><h1>Crie o futuro.<br><em>Hoje.</em></h1><p>Um espaço para seus próximos grandes projetos e ideias.</p><a class="cta" href="#contato">Vamos começar →</a></section>\n<section id="sobre"><h2>Feito para impressionar.</h2><p>Personalize esta página com suas cores, textos e imagens.</p></section>\n<footer id="contato">Feito com TITAN CODE · 2026</footer>\n</body></html>`,
      'style.css': `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:system-ui,Arial,sans-serif;background:#0a1021;color:#fff}nav{display:flex;align-items:center;gap:21px;padding:23px 7%;border-bottom:1px solid #273149}nav strong{font-size:22px;margin-right:auto;color:#aa8aff}nav a{color:#b2bad0;text-decoration:none;font-size:13px}.hero{padding:110px 7% 120px;background:radial-gradient(circle at 85% 5%,#46357b,transparent 55%)}.label{color:#b2a3ff;font-size:11px;letter-spacing:3px}.hero h1{font-size:clamp(50px,9vw,104px);line-height:1;letter-spacing:-4px;margin:23px 0}.hero em{color:#9c83ff;font-style:normal}.hero p{color:#aebbd2;font-size:18px;line-height:1.6}.cta{display:inline-block;margin-top:23px;padding:15px 23px;color:white;background:#7e61e5;text-decoration:none;border-radius:9px;font-weight:700}#sobre{padding:95px 7%;background:#111a31}#sobre h2{font-size:33px}#sobre p,footer{color:#a8b4cb}footer{padding:28px 7%;font-size:12px}`
    },
    luau: {
      'main.luau': `-- Script inicial de Luau para Roblox Studio\n-- Cole em um Script no Roblox Studio para testar.\n\nlocal Players = game:GetService("Players")\n\nlocal function cumprimentar(jogador)\n    print("Bem-vindo(a), " .. jogador.Name .. "!")\nend\n\nPlayers.PlayerAdded:Connect(cumprimentar)\n\n-- Dica: Luau é editado aqui, mas executado no Roblox Studio.`,
      'README.md': `# Meu projeto Luau\n\nUse o TITAN CODE para escrever seu script e exportar os arquivos.\nPara executar Luau, abra o Roblox Studio; a prévia web não o executa.`
    },
    python: {
      'main.py': `# Projeto Python criado com TITAN CODE\n\ndef saudacao(nome: str) -> str:\n    return f"Olá, {nome}! Seu projeto está pronto."\n\nif __name__ == "__main__":\n    print(saudacao("desenvolvedor"))\n`,
      'README.md': `# Projeto Python\n\nEdite aqui e exporte os arquivos.\nPara executar Python, use um ambiente com Python instalado.`
    }
  };

  function uid(){ return 'p-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8); }
  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function makeProject(name='Meu primeiro projeto',type='web') {
    const files=clone(templates[type]||templates.web);
    return {id:uid(),name,files,active:Object.keys(files)[0],updated:Date.now()};
  }
  function validateProject(obj) {
    return !!(obj && typeof obj.id==='string' && typeof obj.name==='string' && obj.name.length<=80 && obj.files && typeof obj.files==='object' && !Array.isArray(obj.files) && Object.entries(obj.files).length<=250 && Object.entries(obj.files).every(([name,code])=>legacyFilename(name) && typeof code==='string' && code.length<1500000));
  }
  function legacyFilename(name) {
    return /^[\w./ -]{1,130}$/.test(name) && !name.startsWith('/') && !name.endsWith('/') && !name.includes('..') &&
      !name.split('/').some(part => ['__proto__','prototype','constructor'].includes(part));
  }
  function validFilename(name) {
    return typeof name === 'string' && /^[\w./ -]{1,130}$/.test(name) && !name.includes('..') &&
      name.split('/').every(part => part && part.trim() === part && !['.', '__proto__','prototype','constructor'].includes(part));
  }
  function safeLocalGet(key){try{return localStorage.getItem(key);}catch{return null;}}
  function safeLocalSet(key,data){try{localStorage.setItem(key,data);return true;}catch{toast('O armazenamento está indisponível ou cheio. Exporte seu projeto.','error');return false;}}
  async function initialize() {
    if (!localMode) {
      const info = await refreshStatus();
      if (info && !info.authenticated) { location.replace('./#login'); return; }
      account = info?.user || null;
      if (account) { storageKey += ':' + account.id; settingsKey += ':' + account.id; activeKey += ':' + account.id; }
    }
    try { const stored=JSON.parse(safeLocalGet(storageKey)||'[]'); projects=Array.isArray(stored)?stored.filter(validateProject).slice(0,100):[]; } catch { projects=[]; }
    if (account) {
      for (const row of projects) dirty.add(row.id);
      const cached = new Map(projects.map(row => [row.id, row]));
      try {
        for (const row of await request('projects')) if (!cached.has(row.id)) projects.push(row);
      } catch (error) { toast(error.message, 'error'); }
      $('importLegacyBtn').hidden = !safeLocalGet(legacyStorage);
    }
    if (!projects.length) {
      projects = [makeProject()];
      if (account) dirty.add(projects[0].id);
    }
    let saved = {};
    try { saved = JSON.parse(safeLocalGet(settingsKey) || '{}') || {}; } catch {}
    settings = { ...settings, ...account?.preferences, ...saved };
    ({ setTheme } = await import('./theme.js'));
    setTheme(settings);
    const wanted = new URLSearchParams(location.search).get('project') || safeLocalGet(activeKey);
    activeId = projects.some(p => p.id === wanted) ? wanted : projects[0].id;
    await loadProject(activeId);
    $('autoPreviewCheck').checked = Boolean(settings.autoPreview);
    if (!account) save(true);
    else {
      persist();
      $('saveStatus').textContent = dirty.has(activeId) ? 'Sincronizando…' : 'Sincronizado';
      queueSync();
    }
    bindEvents();
    renderAll();
    const params = new URLSearchParams(location.search);
    if (params.get('versions') === '1') openVersions();
    if (params.get('import') === '1') {
      if (smallStudio.matches) toggleFiles(true);
      else $('importFilesBtn').focus();
    }
    if (localMode) refreshStatus();
    registerOffline();
  }
  const activeProject = () => projects.find(p=>p.id===activeId) || projects[0];
  const activeName = () => activeProject()?.active || '';
  function persist() {
    const local = account ? projects.filter(p => dirty.has(p.id)) : projects;
    const ok = safeLocalSet(storageKey, JSON.stringify(local));
    safeLocalSet(activeKey, activeId);
    return ok;
  }
  async function request(path, method = 'GET', data, streaming = false) {
    const response = await fetch('./api/' + path, { method, cache: 'no-store', credentials: 'same-origin',
      headers: { ...(account && { 'X-Titan-Account': account.id }),
        ...(method !== 'GET' && { 'Content-Type': 'application/json', 'X-CSRF-Token': status?.csrf || '' }) },
      body: method === 'GET' ? undefined : JSON.stringify(data || {}), signal: AbortSignal.timeout(streaming ? 195000 : 16000) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error(error.error || 'Sem conexão com o servidor.'), { status: response.status, code: error.code });
    }
    return streaming ? response : response.json();
  }
  async function loadProject(id) {
    const index = projects.findIndex(p => p.id === id);
    const current = projects[index];
    if (current && !current.files) projects[index] = await request('projects/' + encodeURIComponent(id));
  }
  async function openProject(id) {
    if (activeId === id) { setPage('studio'); return; }
    if (savingTimer) save(true);
    try {
      await loadProject(id);
      activeId = id;
      const saved = persist();
      $('saveStatus').textContent = !saved ? 'Erro ao salvar' : !account ? 'Salvo automaticamente' :
        dirty.has(id) ? 'Cópia local pendente' : 'Sincronizado';
      renderAll(); setPage('studio');
    } catch (error) { toast(error.message, 'error'); }
  }
  function queueSync() {
    if (!account || !dirty.size) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncProjects, 650);
  }
  async function syncProjects() {
    if (!account) return;
    if (syncing) { rescheduleSync = true; return; }
    syncing = true;
    let retry = false;
    try {
      for (const id of [...dirty]) {
        const project = projects.find(row => row.id === id);
        if (!project?.files) { dirty.delete(id); continue; }
        const snapshot = JSON.stringify(project);
        try {
          const server = await request('projects/' + encodeURIComponent(id), 'PUT', JSON.parse(snapshot));
          if (JSON.stringify(project) === snapshot) dirty.delete(id);
          else retry = true;
          project.version = server.version;
          persist();
        } catch (error) {
          if (id === activeId) $('saveStatus').textContent = error.code === 'project_conflict' ? 'Conflito · exporte uma cópia' : 'Cópia local pendente';
          if (error.status === 401 || error.code === 'account_changed') break;
          if (error.code === 'project_conflict') toast(error.message, 'error');
        }
      }
      if (!dirty.has(activeId)) $('saveStatus').textContent = 'Sincronizado';
    } finally {
      syncing = false;
      if (retry || rescheduleSync) { rescheduleSync = false; queueSync(); }
    }
  }
  function save(silent=false) {
    clearTimeout(savingTimer); savingTimer = null;
    const project = activeProject();
    if (project) {
      project.updated = Date.now();
      if (account) dirty.add(project.id);
      else {
        const versions = localHistory.get(project.id) || [];
        if (versions.length === 0 || JSON.stringify(versions[0].files) !== JSON.stringify(project.files)) {
          localHistory.set(project.id, [clone(project), ...versions].slice(0, 8));
        }
      }
    }
    const ok = persist(); queueSync();
    if ($('saveStatus')) $('saveStatus').textContent = ok ? (account ? 'Sincronizando…' : 'Salvo automaticamente') : 'Erro ao salvar';
    if (!silent && $('editorStatus')) $('editorStatus').textContent = ok ? 'Salvo neste dispositivo' : 'Armazenamento indisponível';
  }
  function scheduleSave() {
    $('saveStatus').textContent='Salvando...'; $('editorStatus').textContent='Editando';
    clearTimeout(savingTimer); savingTimer=setTimeout(()=>save(),420);
  }
  function ext(name){return (name.split('.').pop()||'txt').toLowerCase();}
  const langNames={kt:'Kotlin',php:'PHP',go:'Go',rs:'Rust',html:'HTML',css:'CSS',js:'JavaScript',ts:'TypeScript',json:'JSON',md:'Markdown',py:'Python',lua:'Lua',luau:'Luau',txt:'Texto',sql:'SQL',java:'Java',cpp:'C++',c:'C',cs:'C#',sh:'Shell',xml:'XML',svg:'SVG'};
  function fileIcon(name){const e=ext(name);return {html:'◇',css:'#',js:'JS',ts:'TS',json:'{}',py:'Py',lua:'Lu',luau:'Lu',md:'M↓',sql:'DB'}[e]||'<> '}
  function renderAll(){renderProjectHeader();renderFiles();renderEditor();renderProjects();runPreview();updateChatContext();}
  function renderProjectHeader(){const p=activeProject();$('projectHeading').textContent=p.name;$('folderName').textContent=p.name.toUpperCase();$('fileCount').textContent=`${Object.keys(p.files).length} arquivos`;}
  function renderFiles(){
    const p=activeProject(),list=$('fileList'),tabs=$('codeTabs');list.replaceChildren();tabs.replaceChildren();
    const query = $('projectSearch').value.trim().toLowerCase();
    for(const name of Object.keys(p.files)) {
      const f=document.createElement('button');f.className='file-entry'+(name===p.active?' selected':'');f.type='button'; f.title=name;
      const i=document.createElement('span');i.className='file-symbol '+ext(name);i.textContent=fileIcon(name);
      const text=document.createElement('span');text.className='file-name';text.textContent=name;f.append(i,text);f.addEventListener('click',()=>{ selectFile(name); if (smallStudio.matches) toggleFiles(false, $('codeEditor')); });
      if (!query || name.toLowerCase().includes(query) || p.files[name].slice(0, 130000).toLowerCase().includes(query)) list.append(f);
      const tab=document.createElement('button');tab.className='file-tab'+(name===p.active?' active':'');tab.type='button';const s=document.createElement('span');s.className='file-symbol '+ext(name);s.textContent=fileIcon(name);const label=document.createElement('span');label.textContent=name;tab.append(s,label);tab.addEventListener('click',()=>selectFile(name));tabs.append(tab);
    }
  }
  function selectFile(name){const p=activeProject();if(!Object.hasOwn(p.files,name))return;saveEditor();p.active=name;renderFiles();renderEditor();updateChatContext();save(true);}
  function saveEditor(){const p=activeProject();if(p?.active && Object.hasOwn(p.files,p.active))p.files[p.active]=$('codeEditor').value;}
  function renderEditor(){$('suggestions').hidden=true;if(highlightFrame)cancelAnimationFrame(highlightFrame);highlightFrame=0;const p=activeProject();$('codeEditor').value=p.files[p.active]||'';$('languageName').textContent=langNames[ext(p.active)]||'Texto';$('chatFileName').textContent=p.active;$('sandboxRun').hidden=!status?.runner?.includes(ext(p.active));highlight();updateCursor();updateUndo();}
  function escapeHTML(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function highlight(){
    const src=$('codeEditor').value;const pre=$('syntaxView');
    if(src.length>130000){pre.textContent=src+'\n';const lines=1+(src.match(/\n/g)||[]).length;$('lineNumbers').textContent=Array.from({length:Math.min(20000,lines)},(_,j)=>j+1).join('\n');$('lineCount').textContent=`${lines} linhas`;return;}
    const keyword=/\b(?:const|let|var|function|return|if|else|for|while|class|import|from|export|default|new|true|false|null|undefined|async|await|try|catch|finally|throw|print|local|then|end|repeat|until|do|def|None|True|False|self|public|private|static|void|int|string|echo|SELECT|FROM|WHERE|INSERT|INTO|CREATE|TABLE)\b/;
    const rx=/(<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[A-Za-z][\w:-]*|\b(?:const|let|var|function|return|if|else|for|while|class|import|from|export|default|new|true|false|null|undefined|async|await|try|catch|finally|throw|print|local|then|end|repeat|until|do|def|None|True|False|self|public|private|static|void|int|string|echo|SELECT|FROM|WHERE|INSERT|INTO|CREATE|TABLE)\b|\b\d+(?:\.\d+)?\b)/g;
    let result='',i=0,m;let tokens=0;
    while((m=rx.exec(src))!==null && tokens++<4500){ result+=escapeHTML(src.slice(i,m.index));const x=m[0];let cls='tok-num';if(x.startsWith('/*')||x.startsWith('//')||x.startsWith('#')||x.startsWith('<!--'))cls='tok-comment';else if(['"',"'",'`'].includes(x[0]))cls='tok-string';else if(x.startsWith('<'))cls='tok-tag';else if(keyword.test(x))cls='tok-key';result+=`<span class="${cls}">${escapeHTML(x)}</span>`;i=rx.lastIndex; }
    result+=escapeHTML(src.slice(i));pre.innerHTML=result+'\n';
    const lines=src.split('\n').length;$('lineNumbers').textContent=Array.from({length:Math.min(20000,lines)},(_,j)=>j+1).join('\n');$('lineCount').textContent=`${lines} linha${lines===1?'':'s'}`;
    pre.scrollTop=$('codeEditor').scrollTop;pre.scrollLeft=$('codeEditor').scrollLeft;
  }
  function updateCursor(){const editor=$('codeEditor'),index=editor.selectionStart;const before=editor.value.slice(0,index),lines=before.split('\n');$('cursorPos').textContent=`Ln ${lines.length}, Col ${lines.at(-1).length+1}`;}
  function scheduleHighlight(){if(highlightFrame)cancelAnimationFrame(highlightFrame);highlightFrame=requestAnimationFrame(()=>{highlightFrame=0;highlight();});}
  const editKey = () => activeProject().id + ':' + activeName();
  function updateUndo() {
    const history = edits.get(editKey());
    $('undoBtn').disabled = !history?.undo.length;
    $('redoBtn').disabled = !history?.redo.length;
  }
  function rememberChange(old, changed, typed) {
    if (old === changed || old.length > 120000 || changed.length > 120000) return;
    const key = editKey();
    const history = edits.get(key) || { undo: [], redo: [], last: 0 };
    const time = performance.now();
    if (!typed || !history.undo.length || time - history.last > 450) {
      history.undo.push(old);
      history.undo = history.undo.slice(-14);
    }
    history.last = typed ? time : 0;
    history.redo = [];
    edits.delete(key);
    edits.set(key, history);
    if (edits.size > 6) edits.delete(edits.keys().next().value);
  }
  function applyUndo(revert) {
    const history = edits.get(editKey());
    const source = history?.[revert ? 'undo' : 'redo'];
    if (!source?.length) return;
    const editor = $('codeEditor');
    history[revert ? 'redo' : 'undo'].push(editor.value);
    history.last = 0;
    editor.value = source.pop();
    onEditorChange(null, false);
    editor.focus();
  }
  function onEditorChange(event, track = true) {
    $('suggestions').hidden = true;
    const project = activeProject();
    const changed = $('codeEditor').value;
    if (track) rememberChange(project.files[project.active], changed, event?.inputType === 'insertText');
    project.files[project.active] = changed;
    scheduleHighlight();
    updateCursor();
    updateFindCount();
    updateUndo();
    scheduleSave();
    if (settings.autoPreview) { clearTimeout(previewTimer); previewTimer = setTimeout(runPreview, 620); }
  }
  function getFindMatches(){
    const q=$('findInput').value.toLocaleLowerCase('pt-BR');
    if(!q)return [];
    const source=$('codeEditor').value.toLocaleLowerCase('pt-BR'),hits=[];
    let pos=0;
    while((pos=source.indexOf(q,pos))!==-1&&hits.length<2000){hits.push(pos);pos+=Math.max(1,q.length);}
    return hits;
  }
  function updateFindCount(){
    if($('findBar').hidden)return;
    const hits=getFindMatches(),pos=$('codeEditor').selectionStart;
    const active=hits.indexOf(pos);
    $('findCount').textContent=hits.length?`${active<0?'–':active+1} de ${hits.length}`:'0 resultados';
  }
  function findNext(direction=1,reset=false){
    const hits=getFindMatches(),ed=$('codeEditor');
    if(!hits.length){updateFindCount();return;}
    const from=reset?(direction>0?-1:ed.value.length+1):(direction>0?ed.selectionEnd:ed.selectionStart);
    let idx=direction>0?hits.findIndex(x=>x>=from):hits.findLastIndex(x=>x<from);
    if(idx<0)idx=direction>0?0:hits.length-1;
    if(document.activeElement!==$('findInput'))ed.focus();ed.setSelectionRange(hits[idx],hits[idx]+$('findInput').value.length);
    updateCursor();updateFindCount();
  }
  function openFind(){
    $('findBar').hidden=false;
    const ed=$('codeEditor'),selected=ed.value.slice(ed.selectionStart,ed.selectionEnd);
    if(selected&&!selected.includes('\n')&&selected.length<=120)$('findInput').value=selected;
    $('findInput').focus();$('findInput').select();updateFindCount();
  }
  function closeFind(){$('findBar').hidden=true;$('codeEditor').focus();}
  function onEditorKeydown(e){
    if (e.key === 'Escape') { leaveEditor = true; return; }
    if (e.key === 'Tab' && leaveEditor) { leaveEditor = false; return; }
    leaveEditor = false;
    if ((e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase()) && $('codeEditor').value.length <= 120000) {
      e.preventDefault(); applyUndo(e.key.toLowerCase() === 'z' && !e.shiftKey); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'Space') { e.preventDefault(); suggest(); return; }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      const editor = $('codeEditor');
      const left = editor.value.slice(0, editor.selectionStart);
      const line = left.slice(left.lastIndexOf('\n') + 1);
      const indent = line.match(/^\s*/)[0] + (/[{:[]\s*$/.test(line) ? '  ' : '');
      if (indent) { e.preventDefault(); editor.setRangeText('\n' + indent, editor.selectionStart, editor.selectionEnd, 'end'); onEditorChange(); }
    }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();openFind();return;}
    if(e.key==='Tab'){e.preventDefault();const ed=$('codeEditor'),start=ed.selectionStart,end=ed.selectionEnd;
      if(e.shiftKey){const prefix=ed.value.slice(0,start);const lineStart=prefix.lastIndexOf('\n')+1;if(ed.value.slice(lineStart,lineStart+2)==='  '){ed.setRangeText('',lineStart,lineStart+2,'end');}}else{ed.setRangeText('  ',start,end,'end');}onEditorChange();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();toast('Projeto salvo.');}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('runCodeBtn').click();}
  }
  function replaceCode() {
    if (!$('findInput').value) return;
    const editor = $('codeEditor');
    if (editor.value.slice(editor.selectionStart, editor.selectionEnd).toLowerCase() !== $('findInput').value.toLowerCase()) { findNext(); return; }
    editor.setRangeText($('replacementInput').value, editor.selectionStart, editor.selectionEnd, 'end');
    onEditorChange();
    findNext();
  }
  function formatCode() {
    const editor = $('codeEditor');
    if (ext(activeName()) === 'json') {
      try { editor.value = JSON.stringify(JSON.parse(editor.value), null, 2) + '\n'; }
      catch { return toast('Corrija o JSON antes de formatar.', 'error'); }
    } else {
      if (!window.confirm('Remover espaços no fim das linhas e normalizar a última quebra de linha?')) return;
      editor.value = editor.value.replace(/[\t ]+$/gm, '').trimEnd() + '\n';
    }
    onEditorChange(); editor.focus();
  }
  function suggest() {
    const editor = $('codeEditor'), area = $('suggestions'), cursor = editor.selectionStart;
    const prefix = editor.value.slice(Math.max(0, cursor - 100), cursor).match(/[A-Za-z_][\w]*$/)?.[0] || '';
    const common = {
      js: 'const let function return document console querySelector addEventListener async await import export',
      ts: 'const let function return interface type class implements async await import export',
      py: 'def class for range print return import from else elif None True False',
      html: 'main section article header footer figure figcaption button nav input label',
      css: 'display position color background margin padding border grid flex gap',
      sql: 'SELECT FROM WHERE COUNT GROUP HAVING ORDER INSERT UPDATE CREATE'
    }[ext(activeName())] || 'class function return import for while print';
    const existing = editor.value.slice(0, 60000).match(/[A-Za-z_][\w]{1,60}/g) || [];
    const choices = [...new Set([...common.split(' '), ...existing])].filter(word => word.startsWith(prefix) && word !== prefix).slice(0, 7);
    area.replaceChildren();
    area.hidden = !choices.length;
    if (!choices.length) return toast('Nenhuma sugestão para o trecho atual.');
    for (const word of choices) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'mini-button'; button.textContent = word;
      button.onclick = () => { editor.setRangeText(word, cursor - prefix.length, cursor, 'end'); onEditorChange(); editor.focus(); };
      area.append(button);
    }
    area.firstElementChild.focus();
  }
  function patch(path, before, after) {
    if (before === after) return '';
    const split = value => value.match(/[^\n]*\n|[^\n]+$/g) || [];
    const oldLines = split(before), newLines = split(after);
    let prefix = 0, suffix = 0;
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
    while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix &&
      oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]) suffix++;
    const start = Math.max(0, prefix - 3);
    const removed = oldLines.slice(prefix, oldLines.length - suffix);
    const added = newLines.slice(prefix, newLines.length - suffix);
    const upper = oldLines.slice(start, prefix);
    const lower = oldLines.slice(oldLines.length - suffix, oldLines.length - suffix + 3);
    const range = changes => {
      const size = changes.length + upper.length + lower.length;
      return (size ? start + 1 : start) + ',' + size;
    };
    const prefixed = (lines, mark) => lines.map(line => mark + line + (line.endsWith('\n') ? '' : '\n\\ No newline at end of file\n')).join('');
    return '--- a/' + path + '\n+++ b/' + path + '\n@@ -' + range(removed) + ' +' + range(added) + ' @@\n' +
      prefixed(upper, ' ') + prefixed(removed, '-') + prefixed(added, '+') + prefixed(lower, ' ');
  }
  function showPatch(title, path, before, after, apply) {
    const container = $('versionList');
    const label = document.createElement('h3'); label.textContent = title;
    const view = $('versionDiff');
    const diff = patch(path, before, after);
    view.textContent = !diff ? 'O conteúdo deste arquivo é idêntico.' : diff.length <= 160000 ? diff : diff.slice(0, 160000) + '\n… baixe o diff completo';
    const button = document.createElement('button');
    button.className = 'button button-primary'; button.textContent = 'Aplicar alteração';
    button.onclick = () => { apply(); $('versionsDialog').close(); };
    const exportButton = document.createElement('button');
    exportButton.className = 'button button-outline'; exportButton.textContent = 'Exportar diferenças';
    exportButton.disabled = !diff;
    exportButton.onclick = () => downloadBlob(diff, 'titan-alteracoes.diff', 'text/plain');
    container.replaceChildren(label, exportButton, button);
    if (!$('versionsDialog').open) $('versionsDialog').showModal();
  }
  async function openVersions() {
    const project = activeProject(), file = project.active;
    const list = $('versionList'), view = $('versionDiff');
    list.textContent = 'Consultando versões…'; view.textContent = '';
    $('versionsDialog').showModal();
    try {
      const rows = account && project.version ? await request('projects/' + project.id + '/versions') : (localHistory.get(project.id) || []).slice(1);
      list.textContent = rows.length ? '' : 'Este projeto ainda não tem versões anteriores.';
      for (const row of rows) {
        const button = document.createElement('button'); button.className = 'button button-outline';
        button.textContent = (row.version ? 'v' + row.version + ' · ' : '') + new Date(row.updated).toLocaleString('pt-BR');
        button.onclick = async () => {
          try {
            const snapshot = row.files ? row : await request('projects/' + project.id + '/versions/' + row.version);
            const original = snapshot.files[file] || '';
            showPatch('Versão anterior de ' + file, file, project.files[file], original, () => {
              if (!window.confirm('Restaurar todo o projeto para esta versão anterior?')) return;
              project.name = snapshot.name;
              project.files = clone(snapshot.files);
              project.active = snapshot.active;
              save(); renderAll(); toast('Versão restaurada.');
            });
          } catch (error) { toast(error.message, 'error'); }
        };
        list.append(button);
      }
    } catch (error) { list.textContent = error.message; }
  }
  function runPreview(force = false){
    if (!$('previewPane').getClientRects().length) return;
    const project = activeProject(), files = project.files;
    const names = Object.keys(files);
    const htmlName = names.find(file => ext(file) === 'html');
    const css = names.filter(file => ext(file) === 'css').map(file => files[file]).join('\n');
    const js = names.filter(file => ext(file) === 'js').map(file => files[file]).join('\n');
    const canPreview = Boolean(htmlName || css || js);
    $('previewEmpty').hidden = canPreview;
    $('previewFrame').hidden = !canPreview;
    if (!canPreview) { renderedPreview = undefined; $('previewFrame').removeAttribute('srcdoc'); $('previewMeta').textContent = 'Somente edição'; return; }
    const security = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; form-action 'none'; base-uri 'none'">`;
    const connector = '<script>(() => { const report = (kind, values) => { try { parent.postMessage({titanPreview:true,kind,text:values.map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" ").slice(0,1000)},"*") } catch {} }; for (const level of ["log","info","warn","error"]) { const old = console[level]; console[level] = (...args) => { report(level,args); old.apply(console,args) }; } addEventListener("error", e => report("error",[e.message])); })()<\/script>';
    let html = htmlName ? files[htmlName] : '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>';
    const style = '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>';
    const script = '<script>' + js.replace(/<\/script/gi, '<\\/script') + '<\/script>';
    html = html.replace(/^\s*<!doctype[^>]*>/i, '');
    html = html.replace(/<script\s+src=["']([^"'<>]+)["']\s*>\s*<\/script>/gi, (tag, path) =>
      Object.hasOwn(files, path.replace(/^\.\//, '')) && ext(path) === 'js' ? '' : tag);
    if (/<\/head\s*>/i.test(html)) html = html.replace(/<\/head\s*>/i, () => style + '</head>');
    else html = style + html;
    if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, () => script + '</body>');
    else html += script;
    if (new Blob([html]).size > 4 * 1024 * 1024) { toast('Prévia excede 4 MB.', 'error'); return; }
    if (force !== true && renderedPreview === html) return;
    renderedPreview = html;
    $('previewConsole').textContent = '';
    $('previewFrame').srcdoc = '<!doctype html>' + security + connector + html;
    $('previewMeta').textContent = [htmlName && 'HTML', css && 'CSS', js && 'JS'].filter(Boolean).join(' · ');
    $('editorStatus').textContent = 'Prévia pronta';
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== $('previewFrame')?.contentWindow || event.origin !== 'null' ||
        data?.titanPreview !== true || typeof data.text !== 'string' || !['log','info','warn','error'].includes(data.kind)) return;
    const output = $('previewConsole');
    if (output.textContent.length > 9000) return;
    output.textContent += '[' + data.kind + '] ' + data.text.slice(0, 1000) + '\n';
  });
  async function runSandbox(event) {
    const button = event.currentTarget;
    const project = activeProject();
    saveEditor();
    if (!project.version) return toast('Sincronize o projeto antes de executar.', 'error');
    button.disabled = true;
    const console = $('previewConsole');
    console.textContent = 'Executando em ambiente isolado…';
    try {
      const data = await request('projects/' + project.id + '/run', 'POST', { file: project.active, content: project.files[project.active] });
      const labels = { done: 'Concluído', failed: 'Código terminou com erro', cancelled: 'Interrompido', timeout: 'Tempo limite atingido', output_limit: 'Limite de saída atingido' };
      console.textContent = [labels[data.status], data.output, data.error].filter(Boolean).join('\n');
    } catch (error) { console.textContent = error.message; }
    finally { button.disabled = false; }
  }
  function toast(message,type='info'){const node=document.createElement('div');node.className='toast'+(type==='error'?' error':'');node.textContent=message;$('toastStack').append(node);setTimeout(()=>node.remove(),3500);}
  function syncBackdrop() {
    const menu = $('sidebar').classList.contains('open');
    const ai = $('aiDrawer').classList.contains('open');
    const files = smallStudio.matches && $('filesPane').classList.contains('open');
    $('backdrop').hidden = !(menu || ai || files);
    $('menuToggle').setAttribute('aria-expanded', String(menu));
    document.querySelector('.main-area').inert = menu || ai;
  }
  function setPage(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(node => node.classList.toggle('active', node.id === page + 'Page'));
    document.querySelectorAll('.nav-link').forEach(node => node.classList.toggle('active', node.dataset.page === page));
    $('breadcrumb').textContent = { studio: 'Estúdio', projects: 'Meus projetos', ai: 'Titan AI', diagnostics: 'Diagnóstico', settings: 'Configurações' }[page] || 'Estúdio';
    $('sidebar').classList.remove('open');
    toggleFiles(false);
    syncBackdrop();
    if (page === 'studio') runPreview();
    if (page === 'projects') renderProjects();
    if (page === 'diagnostics') runDiagnostics();
    if (page === 'ai') refreshStatus();
  }
  function toggleFiles(open, focus) {
    $('filesPane').classList.toggle('open', open && smallStudio.matches);
    $('toggleFiles').setAttribute('aria-expanded', String(open && smallStudio.matches));
    syncBackdrop();
    if (open && smallStudio.matches) $('closeFiles').focus();
    else focus?.focus();
  }
  function studioTab(tab) {
    const layout = $('workspaceLayout');
    layout.classList.toggle('show-preview', tab === 'Preview');
    layout.classList.toggle('show-console', tab === 'Console');
    for (const id of ['Editor', 'Preview', 'Console']) {
      const button = $('mobile' + id + 'Tab');
      button.classList.toggle('selected', id === tab);
      button.setAttribute('aria-pressed', String(id === tab));
    }
    if (tab === 'Preview') requestAnimationFrame(() => runPreview());
    if (tab === 'Console') $('consolePane').open = true;
  }
  function fullPreview(open = !$('previewPane').classList.contains('fullscreen')) {
    $('previewPane').classList.toggle('fullscreen', open);
    $('expandPreviewBtn').setAttribute('aria-pressed', String(open));
    if (open) requestAnimationFrame(() => runPreview());
  }
  function previewWidth(width) {
    const value = Math.round(Math.max(24, Math.min(48, width)));
    $('workspaceLayout').style.setProperty('--preview-width', value + '%');
    $('previewResize').setAttribute('aria-valuenow', value);
  }
  function renderProjects() {
    const grid = $('projectsGrid'); grid.replaceChildren();
    for (const project of projects) {
      const card = document.createElement('article'); card.className = 'project-card';
      const icon = document.createElement('div'); icon.className = 'project-card-icon'; icon.textContent = '◫';
      const heading = document.createElement('h3'); heading.textContent = project.name;
      const info = document.createElement('p'); info.textContent = 'Atualizado ' + new Date(project.updated).toLocaleDateString('pt-BR');
      const actions = document.createElement('div'); actions.className = 'project-card-actions';
      const open = document.createElement('button'); open.textContent = 'Abrir projeto'; open.onclick = () => openProject(project.id);
      const rename = document.createElement('button'); rename.textContent = 'Renomear'; rename.onclick = async () => {
        try { await loadProject(project.id); }
        catch (error) { toast(error.message, 'error'); return; }
        askDialog({ title: 'Renomear projeto', value: project.name, button: 'Salvar' }, name => {
          if (!name.trim()) return;
          const current = projects.find(row => row.id === project.id);
          current.name = name.trim();
          if (account) dirty.add(current.id);
          persist(); queueSync(); renderAll();
        });
      };
      const download = document.createElement('button'); download.textContent = 'ZIP'; download.onclick = async () => {
        try { await loadProject(project.id); exportZip(projects.find(row => row.id === project.id)); }
        catch (error) { toast(error.message, 'error'); }
      };
      const remove = document.createElement('button'); remove.textContent = 'Excluir'; remove.className = 'danger'; remove.onclick = async () => {
        if (projects.length === 1) return toast('Crie outro projeto antes de excluir o último.', 'error');
        if (!window.confirm('Excluir o projeto "' + project.name + '"?')) return;
        if (syncing) return toast('Aguarde a sincronização e tente novamente.', 'error');
        try {
          if (activeId === project.id) await loadProject(projects.find(row => row.id !== project.id).id);
          const current = projects.find(row => row.id === project.id);
          if (account && current.version) await request('projects/' + current.id, 'DELETE', { confirm: true, version: current.version });
          dirty.delete(project.id);
          projects = projects.filter(row => row.id !== project.id);
          if (activeId === project.id) activeId = projects[0].id;
          persist(); renderAll(); toast('Projeto excluído.');
        } catch (error) { toast(error.message, 'error'); }
      };
      actions.append(open, rename, download, remove); card.append(icon, heading, info, actions); grid.append(card);
    }
  }
  function askDialog({title,description,label='Nome',placeholder='',value='',button='Criar',secret=false},callback){dialogCallback=callback;$('dialogTitle').textContent=title;$('dialogDescription').textContent=description || '';$('dialogLabel').textContent=label;$('dialogInput').value=value;$('dialogInput').type=secret?'password':'text';$('dialogInput').placeholder=placeholder;$('dialogSubmit').textContent=button;$('genericDialog').showModal();setTimeout(()=>$('dialogInput').focus(),30);}
  function createProject(){if(projects.length>=100){toast('Limite de 100 projetos. Exporte um backup antes de criar mais.','error');return;}askDialog({title:'Criar novo projeto',description:'Dê um nome ao seu novo workspace. Você poderá escolher um modelo depois.',label:'Nome do projeto',placeholder:'Ex.: meu-app',button:'Criar projeto'},name=>{if(!name.trim())return;const p=makeProject(name.trim());projects.unshift(p);activeId=p.id;save();renderAll();setPage('studio');toast('Projeto criado!');});}
  function addFile(){askDialog({title:'Adicionar arquivo',description:'Crie um novo arquivo para o projeto. Exemplos: main.py, style.css, app.js, README.md.',label:'Nome e extensão',placeholder:'main.py',button:'Criar arquivo'},name=>{name=name.trim();if(!validFilename(name)){toast('Use um nome de arquivo válido, sem caminhos suspeitos.','error');return;}const p=activeProject();if(Object.hasOwn(p.files,name)){toast('Já existe um arquivo com esse nome.','error');return;}if(Object.keys(p.files).length>=250){toast('Limite de 250 arquivos por projeto.','error');return;}p.files[name]='';p.active=name;save();renderAll();toast('Arquivo criado.');});}
  function renameFile(){const p=activeProject(),old=p.active;askDialog({title:'Renomear arquivo',description:'Informe o novo nome do arquivo, mantendo a extensão desejada.',label:'Novo nome',value:old,button:'Renomear'},name=>{name=name.trim();if(!validFilename(name)|| (name!==old && name in p.files)){toast('Nome inválido ou já utilizado.','error');return;}const updated={};for(const [k,v] of Object.entries(p.files))updated[k===old?name:k]=v;p.files=updated;p.active=name;save();renderAll();});}
  function removeFile(){const p=activeProject();if(Object.keys(p.files).length===1){toast('O projeto deve ter pelo menos um arquivo.','error');return;}if(!window.confirm(`Excluir ${p.active}?`))return;delete p.files[p.active];p.active=Object.keys(p.files)[0];save();renderAll();toast('Arquivo excluído.');}
  function applyTemplate(type){if(!templates[type])return;if(!window.confirm('Substituir todos os arquivos do projeto atual pelo modelo escolhido? Exporte um backup antes, se necessário.'))return;const p=activeProject();p.files=clone(templates[type]);p.active=Object.keys(p.files)[0];save();renderAll();$('templateDialog').close();setPage('studio');toast('Modelo aplicado com sucesso.');}
  function downloadBlob(content,filename,type){const blob=content instanceof Blob?content:new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
  async function exportZip(project = activeProject()) {
    saveEditor();
    try {
      const { zipFiles, slug } = await import('./project-archive.js');
      downloadBlob(zipFiles(project.files), slug(project.name) + '.zip', 'application/zip');
      toast('ZIP exportado.');
    } catch (error) { toast(error.message, 'error'); }
  }
  async function exportBackup() {
    saveEditor();
    try {
      let total = 0;
      for (const project of projects) {
        await loadProject(project.id);
        const loaded = projects.find(row => row.id === project.id);
        total += new Blob([JSON.stringify(loaded)]).size;
        if (total > 12000000) throw new Error('Backup acima de 12 MB. Exporte projetos individualmente em ZIP.');
      }
      downloadBlob(JSON.stringify({version:3,exportedAt:new Date().toISOString(),projects}), 'titan-code-backup.json', 'application/json');
      toast('Backup exportado.');
    } catch (error) { toast(error.message, 'error'); }
  }
  async function restoreBackup(event){
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    if(file.size>12000000){toast('Backup excede 12 MB.','error');return;}
    try{
      const data=JSON.parse(await file.text());
      if(data?.version!==3||!Array.isArray(data.projects)||!data.projects.length||data.projects.length>100||!data.projects.every(p=>validateProject(p)&&Object.hasOwn(p.files,p.active))){
        toast('Arquivo de backup inválido ou incompatível.','error');return;
      }
      if(projects.length+data.projects.length>100){toast('Limite de 100 projetos. Exporte seu backup e libere espaço.','error');return;}
      importProjects(data.projects);
    }catch{toast('Falha na importação. Selecione um backup JSON válido do TITAN CODE.','error');}
  }
  function importProjects(original) {
    if (!original.length || projects.length + original.length > 100) return toast('Nenhum projeto disponível ou limite de 100 projetos.', 'error');
    const restored = original.map(project => ({
      id: uid(), name: project.name.slice(0, 65) + ' (importado)', files: clone(project.files),
      active: project.active, updated: Date.now()
    }));
    const combined=[...projects,...restored];
    if (!account && !safeLocalSet(storageKey,JSON.stringify(combined))) return;
    projects = combined;
    if (account) for (const row of restored) dirty.add(row.id);
    activeId = restored[0].id; persist(); queueSync(); renderAll(); setPage('projects');
    toast(restored.length + ' projeto(s) restaurado(s).');
  }
  function importLegacy() {
    if (!window.confirm('Copiar os projetos locais deste navegador para sua conta atual?')) return;
    try {
      const legacy = JSON.parse(safeLocalGet(legacyStorage) || '[]');
      const valid = legacy.filter(project => validateProject(project) && Object.hasOwn(project.files, project.active));
      importProjects(valid);
    } catch { toast('Projetos locais inválidos.', 'error'); }
  }
  async function importFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;
    const project = activeProject();
    try {
      if (selected.length > 250 || selected.some(file => !validFilename(file.name) || file.size > 1500000) ||
          selected.reduce((bytes, file) => bytes + file.size, 0) > 4 * 1024 * 1024) {
        throw new Error('Selecione até 250 arquivos válidos, com até 1,5 MB por arquivo e 4 MB no total.');
      }
      const overlap = selected.filter(file => Object.hasOwn(project.files, file.name));
      if (overlap.length && !window.confirm('Substituir ' + overlap.length + ' arquivo(s) existentes neste projeto?')) return;
      const original = JSON.stringify(project.files);
      const staged = { ...project.files };
      for (const file of selected) {
        const content = await file.text();
        if (content.includes('\0')) throw new Error('Importe somente arquivos de texto.');
        staged[file.name] = content;
      }
      const { validateFiles } = await import('./project-archive.js');
      validateFiles(staged);
      if (activeProject() !== project || JSON.stringify(project.files) !== original) {
        throw new Error('O projeto mudou durante a importação. Selecione os arquivos novamente.');
      }
      project.files = staged;
      project.active = selected[0].name;
      save(); renderAll(); toast(selected.length + ' arquivo(s) importado(s).');
    } catch (error) { toast(error.message || 'Falha ao ler os arquivos.', 'error'); }
  }
  function toggleTheme() {
    settings.theme = { dark: 'light', light: 'amoled', amoled: 'dark' }[settings.theme] || 'dark';
    setTheme(settings);
    safeLocalSet(settingsKey, JSON.stringify(settings));
  }
  async function refreshStatus() {
    let data = null;
    if (!localMode) {
      try {
        const response = await fetch('./api/status', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (response.ok) data = await response.json();
      } catch {}
    }
    if (account && data && data.user?.id !== account.id) { persist(); location.replace('./editor.html'); return null; }
    status = data;
    const flag = $('cloudStatus');
    flag.classList.toggle('is-offline', !data);
    flag.lastElementChild.textContent = data ? 'Servidor online' : 'Editor local';
    $('footerConn').textContent = data?.authenticated ? 'Conta conectada' : 'Modo local';
    $('aiHeadStatus').textContent = data?.aiConfigured ? 'Modelo: ' + (data.modelName || data.model) : 'IA ainda não configurada';
    $('settingsAiState').textContent = data?.aiConfigured ? 'Modelo ativo: ' + (data.modelName || data.model) : 'Configure sua conexão em Minha Inteligência Artificial.';
    $('authStateText').textContent = data?.user ? data.user.name : 'Editor local';
    $('loginSettingsBtn').textContent = data?.authenticated ? 'Minha conta' : 'Entrar';
    return data;
  }
  function login() { location.href = status?.authenticated ? './#preferences' : './#login'; }
  function toggleAi(open){$('aiDrawer').classList.toggle('open',open);$('aiDrawer').setAttribute('aria-hidden',String(!open));syncBackdrop(); if(open) {$('chatInput').focus();refreshStatus();}}
  function updateChatContext(){$('chatFileName').textContent=activeName();}
  async function reviewGeneratedFiles(target, files) {
    const project = activeProject();
    if (project.id !== target.id) return toast('Abra o projeto de origem da sugestão.', 'error');
    try {
      const { validateFiles } = await import('./project-archive.js');
      validateFiles(files);
      const merged = validateFiles({ ...project.files, ...files });
      const original = JSON.stringify(project.files);
      const paths = Object.keys(files);
      const controls = $('versionList');
      const view = $('versionDiff');
      const heading = document.createElement('h3');
      heading.textContent = 'Arquivos propostos para ' + project.name;
      const list = document.createElement('select');
      list.setAttribute('aria-label', 'Arquivo para revisar');
      for (const path of paths) {
        const option = document.createElement('option');
        option.value = path;
        option.textContent = (Object.hasOwn(project.files, path) ? 'Alterar · ' : 'Criar · ') + path;
        list.append(option);
      }
      const show = () => { view.textContent = patch(list.value, project.files[list.value] || '', files[list.value]) || 'Conteúdo igual à versão atual.'; };
      list.addEventListener('change', show);
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'button button-primary';
      apply.textContent = 'Aplicar ' + paths.length + ' arquivo(s)';
      apply.onclick = () => {
        if (activeProject() !== project || JSON.stringify(project.files) !== original) {
          return toast('O projeto mudou. Reabra a revisão para comparar novamente.', 'error');
        }
        if (!window.confirm('Aplicar os arquivos revisados ao projeto?')) return;
        project.files = merged;
        project.active = paths[0];
        save(); renderAll(); $('versionsDialog').close();
        toast('Arquivos aplicados ao projeto.');
      };
      controls.replaceChildren(heading, list, apply);
      show();
      $('versionsDialog').showModal();
    } catch (error) { toast(error.message, 'error'); }
  }
  function appendMessage(role, text, target) {
    const wrap = document.createElement('div'); wrap.className = 'chat-message ' + role;
    const speaker = document.createElement('div'); speaker.className = 'speaker';
    speaker.textContent = { user: 'VOCÊ', error: 'ERRO', tool: 'DOCUMENTOS RECUPERADOS' }[role] || 'TITAN AI';
    const bubble = document.createElement('div'); bubble.className = 'chat-bubble'; bubble.textContent = text;
    wrap.append(speaker, bubble);
    if (role === 'assistant' && target) {
      if (/```json\s/i.test(text)) {
        const proposal = document.createElement('button');
        proposal.type = 'button';
        proposal.className = 'button button-outline';
        proposal.textContent = 'Revisar arquivos propostos';
        proposal.onclick = async () => {
          try {
            const { draftFiles } = await import('./project-archive.js');
            await reviewGeneratedFiles(target, draftFiles(text));
          } catch (error) { toast(error.message, 'error'); }
        };
        wrap.append(proposal);
      }
      const match = text.match(/```(?:[\w#+-]+)?\s*\n([\s\S]*?)```/);
      if (match) {
        const actions = document.createElement('div'); actions.className = 'chat-code-actions';
        const insert = document.createElement('button'); insert.textContent = '↧ Revisar alteração';
        insert.onclick = () => {
          const project = activeProject();
          if (project.id !== target.id || project.active !== target.path) return toast('Abra o arquivo original da sugestão.', 'error');
          const changed = match[1].trimEnd();
          showPatch('Sugestão da Titan AI', target.path, project.files[project.active], changed, () => {
            if (!window.confirm('Substituir o conteúdo atual de ' + target.path + '?')) return;
            $('codeEditor').value = changed; onEditorChange(); runPreview(); toast('Código inserido.');
          });
        };
        const copy = document.createElement('button'); copy.textContent = '⧉ Copiar código'; copy.onclick = () => copyText(match[1]);
        const create = document.createElement('button'); create.textContent = '+ Salvar como arquivo';
        create.onclick = () => {
          const project = activeProject();
          if (project.id !== target.id) return toast('Abra o projeto de origem da sugestão.', 'error');
          askDialog({ title: 'Salvar sugestão como arquivo', label: 'Nome e extensão', button: 'Criar arquivo' }, value => {
            const name = value.trim();
            if (!validFilename(name) || Object.hasOwn(project.files, name)) return toast('Use um nome válido que não exista no projeto.', 'error');
            if (Object.keys(project.files).length >= 250) return toast('Limite de 250 arquivos por projeto.', 'error');
            project.files[name] = match[1];
            project.active = name;
            save(); renderAll(); toast('Arquivo criado.');
          });
        };
        actions.append(insert, create, copy); wrap.append(actions);
      }
    }
    $('chatMessages').append(wrap); $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    return wrap;
  }
  function copyText(text){navigator.clipboard?.writeText(text).then(()=>toast('Copiado!')).catch(()=>fallbackCopy(text))||fallbackCopy(text);}
  function fallbackCopy(text){const tmp=document.createElement('textarea');tmp.value=text;document.body.append(tmp);tmp.select();try{document.execCommand('copy');toast('Copiado!');}catch{toast('Copie manualmente.','error');}tmp.remove();}
  async function sendChat(prompt) {
    const content = (prompt || $('chatInput').value).trim();
    if (!content || chatBusy) return;
    const info = await refreshStatus();
    if (chatBusy) return;
    if (!info?.authenticated || !account) return toast('Entre na academia para usar a Titan AI.', 'error');
    if (!info.aiConfigured) { location.href = './#ai'; return; }
    chatBusy = true; $('sendChatBtn').disabled = true;
    const project = activeProject();
    const target = { id: project.id, path: project.active };
    const attachment = { name: project.active, content: project.files[project.active].slice(0, 16000) };
    $('chatMessages').querySelector('.chat-welcome')?.remove();
    appendMessage('user', content);
    const pending = appendMessage('assistant', 'Analisando seu código…');
    let text = '';
    try {
      let id = editorChats.get(project.id);
      if (!id) {
        const row = await request('chats', 'POST', { title: ('Editor · ' + project.name).slice(0, 100), mode: 'code',
          ...(project.version && { project: project.id }) });
        editorChats.set(project.id, row.id); id = row.id;
      }
      $('editorChatLink').href = './#chat/' + id;
      $('editorChatLink').hidden = false;
      const response = await request('chats/' + id + '/generate', 'POST', { content, attachments: [attachment] }, true);
      $('chatInput').value = '';
      const { chatEvents } = await import('./chat-stream.js');
      let failure = '';
      let finished;
      for await (const item of chatEvents(response)) {
        if (item.type === 'reasoning') pending.lastElementChild.textContent = 'O modelo está preparando a resposta…';
        if (item.type === 'delta') {
          text += item.text;
          pending.lastElementChild.textContent = text;
        }
        if (item.type === 'error') failure = item.message;
        if (item.type === 'tool') appendMessage('tool', item.sources.join(', '));
        if (item.type === 'done') finished = item.status;
      }
      pending.remove();
      if (text.trim()) appendMessage('assistant', text, finished === 'done' ? target : undefined);
      if (failure) appendMessage('error', failure);
      else if (finished === 'cancelled') appendMessage('error', 'Geração interrompida.');
      else if (!text.trim()) appendMessage('error', 'O modelo concluiu sem uma resposta final.');
    } catch (error) {
      pending.remove();
      if (text.trim()) appendMessage('assistant', text);
      appendMessage('error', error.message);
    }
    finally { chatBusy = false; $('sendChatBtn').disabled = false; }
  }
  async function runDiagnostics(){const list=$('diagnosticList');list.replaceChildren();const checks=[];
    let storageOK=false;try{localStorage.setItem('titan:test','1');storageOK=localStorage.getItem('titan:test')==='1';localStorage.removeItem('titan:test');}catch{}
    checks.push(['Armazenamento do navegador',storageOK,storageOK?'Leitura e gravação disponíveis.':'Dados locais podem não ser salvos.']);
    const s=await refreshStatus();checks.push(['Servidor do TITAN',!!s,s?'API online e respondendo.':'Sem API. O editor continua funcionando localmente.']);
    checks.push(['Autenticação',!s || !s.authRequired || s.authenticated,!s?'Exige conexão para verificar.':s.authenticated?'Sessão autenticada.':s.authRequired?'Entre em sua conta TITAN.':'Não é necessária no ambiente atual.']);
    checks.push(['Motor de inteligência artificial',!!s?.aiConfigured,s?.aiConfigured?`Modelo configurado: ${s.model}`:'Configure um provedor em Minha Inteligência Artificial.']);
    checks.push(['Integridade do projeto',validateProject(activeProject()),`${Object.keys(activeProject().files).length} arquivo(s) no projeto.`]);
    const hasWeb=Object.keys(activeProject().files).some(x=>['html','css','js'].includes(ext(x)));checks.push(['Prévia web',hasWeb,hasWeb?'HTML/CSS/JS encontrados.':'Somente linguagens externas; prévia web desativada.']);
    for(const [label,ok,description] of checks){const item=document.createElement('div');item.className='diagnostic-item';const icon=document.createElement('span');icon.className='test-icon'+(ok?'':' warn');icon.textContent=ok?'✓':'!';const content=document.createElement('div');const heading=document.createElement('strong');heading.textContent=label;const text=document.createElement('p');text.textContent=description;content.append(heading,text);item.append(icon,content);list.append(item);}
  }
  async function registerOffline(){if('serviceWorker' in navigator && window.isSecureContext){try{await navigator.serviceWorker.register('./sw.js');}catch{}}}
  function bindEvents(){
    const handle = $('previewResize');
    const savePreviewWidth = () => safeLocalSet('titan-v6-preview-width', handle.getAttribute('aria-valuenow'));
    previewWidth(Number(safeLocalGet('titan-v6-preview-width')) || 32);
    handle.addEventListener('pointerdown', event => handle.setPointerCapture(event.pointerId));
    handle.addEventListener('pointermove', event => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const bounds = $('workspaceLayout').getBoundingClientRect();
      previewWidth(100 * (bounds.right - event.clientX) / bounds.width);
    });
    handle.addEventListener('lostpointercapture', savePreviewWidth);
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      previewWidth(Number(handle.getAttribute('aria-valuenow')) + (event.key === 'ArrowLeft' ? 2 : -2));
      savePreviewWidth();
    });
    $('toggleFiles').addEventListener('click', () => toggleFiles(!$('filesPane').classList.contains('open')));
    $('closeFiles').addEventListener('click', () => toggleFiles(false, $('toggleFiles')));
    smallStudio.addEventListener('change', () => { toggleFiles(false); fullPreview(false); requestAnimationFrame(() => runPreview()); });
    $('closeStudioMenu').addEventListener('click', () => { $('sidebar').classList.remove('open'); syncBackdrop(); $('menuToggle').focus(); });
    $('togglePreview').addEventListener('click', () => {
      const hidden = $('workspaceLayout').classList.toggle('preview-off');
      $('togglePreview').setAttribute('aria-expanded', String(!hidden));
      if (!hidden) requestAnimationFrame(() => runPreview());
    });
    $('undoBtn').addEventListener('click', () => applyUndo(true));
    $('redoBtn').addEventListener('click', () => applyUndo(false));
    $('clearConsole').addEventListener('click', () => { $('previewConsole').textContent = ''; });
    $('explainConsole').addEventListener('click', () => {
      const output = $('previewConsole').textContent.trim();
      if (!output) return toast('O console ainda não tem mensagens.', 'error');
      toggleAi(true);
      sendChat('Explique as mensagens do console e proponha correções.\n' + output.slice(0, 7000));
    });
    document.querySelectorAll('[data-page]').forEach(x=>x.addEventListener('click',()=>{const page=x.dataset.page;setPage(page);if(page==='ai')toggleAi(true);}));
    document.querySelectorAll('[data-action="new-project"]').forEach(x=>x.addEventListener('click',createProject));$('newProjectTop').addEventListener('click',createProject);
    $('addFileBtn').addEventListener('click',addFile);$('addFileInlineBtn').addEventListener('click',addFile);$('renameFileBtn').addEventListener('click',renameFile);$('removeFileBtn').addEventListener('click',removeFile);
    $('templateBtn').addEventListener('click',()=>$('templateDialog').showModal());$('templateClose').addEventListener('click',()=>$('templateDialog').close());document.querySelectorAll('[data-template]').forEach(x=>x.addEventListener('click',()=>applyTemplate(x.dataset.template)));
    $('importFilesBtn').addEventListener('click',()=>$('importFilesInput').click());$('importFilesInput').addEventListener('change',importFiles);
    $('codeEditor').addEventListener('input',onEditorChange);
    let searchTimer;
    $('projectSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderFiles, 130); });
    $('sandboxRun').addEventListener('click', runSandbox);
    $('findCodeBtn').addEventListener('click',openFind);$('findPrevBtn').addEventListener('click',()=>findNext(-1));$('findNextBtn').addEventListener('click',()=>findNext(1));$('findCloseBtn').addEventListener('click',closeFind);
    $('findInput').addEventListener('input',()=>findNext(1,true));$('findInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findNext(e.shiftKey?-1:1);}if(e.key==='Escape'){e.preventDefault();closeFind();}});$('codeEditor').addEventListener('keydown',onEditorKeydown);$('codeEditor').addEventListener('click',updateCursor);$('codeEditor').addEventListener('keyup',updateCursor);
    $('codeEditor').addEventListener('scroll',()=>{$('syntaxView').scrollTop=$('codeEditor').scrollTop;$('syntaxView').scrollLeft=$('codeEditor').scrollLeft;$('lineNumbers').scrollTop=$('codeEditor').scrollTop;});
    $('runCodeBtn').addEventListener('click', () => {
      if (smallStudio.matches) studioTab('Preview');
      else if ($('workspaceLayout').classList.contains('preview-off')) $('togglePreview').click();
      requestAnimationFrame(() => runPreview(true));
    });
    $('refreshPreviewBtn').addEventListener('click', () => runPreview(true));
    $('expandPreviewBtn').addEventListener('click', () => fullPreview());
    $('formatCodeBtn').addEventListener('click', formatCode);
    $('suggestCodeBtn').addEventListener('click', suggest);
    $('replaceCodeBtn').addEventListener('click', replaceCode);
    $('versionsBtn').addEventListener('click', openVersions);
    $('versionsClose').addEventListener('click', () => $('versionsDialog').close());
    $('importLegacyBtn').addEventListener('click', importLegacy);
    $('copyCodeBtn').addEventListener('click',()=>copyText($('codeEditor').value));$('exportBtn').addEventListener('click',()=>exportZip());
    $('mobileEditorTab').addEventListener('click', () => studioTab('Editor'));
    $('mobilePreviewTab').addEventListener('click', () => studioTab('Preview'));
    $('mobileConsoleTab').addEventListener('click', () => studioTab('Console'));
    $('themeToggle').addEventListener('click',toggleTheme);$('themeSettingsBtn').addEventListener('click',toggleTheme);$('autoPreviewCheck').addEventListener('change',e=>{settings.autoPreview=e.target.checked;safeLocalSet(settingsKey,JSON.stringify(settings));});
    $('runDiagnostics').addEventListener('click',runDiagnostics);$('refreshAiStatus').addEventListener('click',refreshStatus);$('backupAllBtn').addEventListener('click',exportBackup);$('restoreBackupBtn').addEventListener('click',()=>$('restoreBackupInput').click());$('restoreBackupInput').addEventListener('change',restoreBackup);
    $('loginSettingsBtn').addEventListener('click',login);$('accountBtn').addEventListener('click',login);
    ['openAiBtn','openChatFull'].forEach(id=>$(id).addEventListener('click',()=>toggleAi(true)));$('closeAiBtn').addEventListener('click',()=>toggleAi(false));$('backdrop').addEventListener('click',()=>{ $('sidebar').classList.remove('open'); toggleAi(false); toggleFiles(false); syncBackdrop(); });
    $('sendChatBtn').addEventListener('click',()=>sendChat());$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}});
    document.querySelectorAll('[data-prompt]').forEach(x=>x.addEventListener('click',()=>sendChat(x.dataset.prompt)));
    $('menuToggle').addEventListener('click',()=>{
      $('sidebar').classList.toggle('open');
      syncBackdrop();
      if ($('sidebar').classList.contains('open')) $('closeStudioMenu').focus();
    });
    $('dialogClose').addEventListener('click',()=>$('genericDialog').close());$('dialogCancel').addEventListener('click',()=>$('genericDialog').close());
    $('dialogForm').addEventListener('submit',e=>{e.preventDefault();const value=$('dialogInput').value.trim();const f=dialogCallback;$('genericDialog').close();dialogCallback=null;if(typeof f==='function')f(value);});
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&currentPage==='studio'&&!$('genericDialog').open&&!$('templateDialog').open){e.preventDefault();openFind();}if(e.key==='Escape'){if($('previewPane').classList.contains('fullscreen')){fullPreview(false);return;}toggleFiles(false);if(!$('findBar').hidden)closeFind();$('sidebar').classList.remove('open');toggleAi(false);syncBackdrop();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();toggleAi(true);}});
  }
  window.addEventListener('pagehide',()=>{if(savingTimer)save(true);});
  window.addEventListener('online', queueSync);
  initialize().catch(error => {
    toast(error.message, 'error');
    const retry = document.createElement('button');
    retry.className = 'button button-primary';
    retry.textContent = 'Tentar novamente';
    retry.onclick = () => location.reload();
    $('studioMain').prepend(retry);
  });
})();
