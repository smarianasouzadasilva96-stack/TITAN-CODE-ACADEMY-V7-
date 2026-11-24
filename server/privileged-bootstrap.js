// Chaves de instalação: somente hashes, nunca os valores originais.
// A instalação insere registros apenas se ainda não existirem.
export function seedPrivilegedKeys(db) {
  const privileged = [
    { role: 'admin', hash: 'f5c25d3aa96bb3c5d4b549ab7a822e2c2347fc01c2ed9e590b0580f29ba89a81bf48e03603d01734320ad33c45f76123d08f627a3952ac57b69ca53fcff3335b', id: '176aaf85-20df-4d26-a198-e6153df3804c', suffix: 'eSrD' },
    { role: 'creator', hash: '4444db2c1ccaaa8a01ee0472a73f530d2d691f607d8b799d79e1a98456b19d9ab4cef95ae3f1dd9c4bcb87052d180d28bab10bfe2bd10699a2578f5945bc644f', id: 'd2064cbb-1333-4b90-bbe8-f3a5a3c11e08', suffix: 'CI2U' },
  ];
  const insert = db.prepare(`INSERT OR IGNORE INTO access_keys
    (id,hash,suffix,role,issued,issued_by) VALUES (?,?,?,?,?,?)`);
  for (const item of privileged) insert.run(item.id,item.hash,item.suffix,item.role,Date.now(),'initial-bootstrap');
}
