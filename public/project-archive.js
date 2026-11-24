const encoder = new TextEncoder();
  export function slug(s){return (s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,52)||'titan-projeto');}
  function crc32(bytes){let crc=0xFFFFFFFF;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1) ^ (0xEDB88320&(-(crc&1)));}return(crc^0xFFFFFFFF)>>>0;}
  function write16(d,at,v){d.setUint16(at,v,true);}function write32(d,at,v){d.setUint32(at,v>>>0,true);}
  export function zipFiles(files){
    const local=[],central=[];let offset=0;
    const entries=Object.entries(files);
    for(const [name,content] of entries){const fileName=encoder.encode(name),bytes=encoder.encode(content),crc=crc32(bytes);
      const lh=new Uint8Array(30+fileName.length),lv=new DataView(lh.buffer);write32(lv,0,0x04034b50);write16(lv,4,20);write16(lv,6,0x800);write16(lv,8,0);write32(lv,14,crc);write32(lv,18,bytes.length);write32(lv,22,bytes.length);write16(lv,26,fileName.length);lh.set(fileName,30);local.push(lh,bytes);
      const ch=new Uint8Array(46+fileName.length),cv=new DataView(ch.buffer);write32(cv,0,0x02014b50);write16(cv,4,20);write16(cv,6,20);write16(cv,8,0x800);write32(cv,16,crc);write32(cv,20,bytes.length);write32(cv,24,bytes.length);write16(cv,28,fileName.length);write32(cv,42,offset);ch.set(fileName,46);central.push(ch);
      offset+=lh.length+bytes.length;
    }
    const cdSize=central.reduce((x,b)=>x+b.length,0);const end=new Uint8Array(22),v=new DataView(end.buffer);write32(v,0,0x06054b50);write16(v,8,entries.length);write16(v,10,entries.length);write32(v,12,cdSize);write32(v,16,offset);return new Blob([...local,...central,end],{type:'application/zip'});
  }

export function validateFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Arquivos de projeto inválidos.');
  const entries = Object.entries(files);
  if (!entries.length || entries.length > 250 || entries.some(([path, content]) =>
    !/^[\w./ -]{1,130}$/.test(path) || path.includes('..') ||
    path.split('/').some(part => !part || part.trim() !== part || ['.', '__proto__', 'prototype', 'constructor'].includes(part)) ||
    typeof content !== 'string' || content.length > 1500000)) throw new Error('Caminhos ou limites de arquivos inválidos.');
  if (new Blob([JSON.stringify(files)]).size > 4 * 1024 * 1024) throw new Error('O projeto excede 4 MB.');
  return files;
}

export function draftFiles(text) {
  for (const match of text.matchAll(/```json\s*\n([\s\S]*?)```/gi)) {
    let proposal;
    try { proposal = JSON.parse(match[1]); } catch { continue; }
    if (!Array.isArray(proposal?.files) || proposal.files.length > 250) continue;
    const files = Object.create(null);
    for (const file of proposal.files) {
      if (typeof file?.path !== 'string' || typeof file.content !== 'string' || Object.hasOwn(files, file.path)) {
        throw new Error('A proposta contém arquivos inválidos ou repetidos.');
      }
      files[file.path] = file.content;
    }
    return validateFiles(files);
  }
  throw new Error('A resposta não contém uma proposta de arquivos no formato esperado.');
}
