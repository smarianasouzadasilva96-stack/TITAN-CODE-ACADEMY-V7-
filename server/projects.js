import { transaction } from './db.js';
import { fail, text } from './security.js';

export function projectId(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,100}$/.test(value)) throw fail(400, 'Identificador inválido.');
  return value;
}

function filename(name) {
  return /^[\w./ -]{1,130}$/.test(name) && name.split('/').every(part =>
    part && part.trim() === part && !['.', '__proto__', 'prototype', 'constructor'].includes(part)) && !name.includes('..');
}
const shape = row => ({ id: row.id, name: row.name, active: row.active, files: JSON.parse(row.files), updated: row.updated, version: row.version });

function validateProject(value) {
  const name = text(value?.name, 80, 'Nome do projeto');
  const { files, active } = value;
  if (!files || typeof files !== 'object' || Array.isArray(files) || typeof active !== 'string' || !Object.hasOwn(files, active)) throw fail(400, 'Arquivos inválidos.');
  const entries = Object.entries(files);
  if (entries.length > 250 || entries.some(([path, code]) => !filename(path) || typeof code !== 'string' || code.length > 1500000)) {
    throw fail(400, 'Limites de arquivos do projeto excedidos ou caminho inválido.');
  }
  const serialized = JSON.stringify(files);
  if (Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw fail(413, 'Armazenamento por projeto limitado a 4 MB.');
  return { name, active, serialized };
}

export function projects(db) {
  function item(owner, id) {
    const row = db.prepare('SELECT * FROM projects WHERE owner=? AND id=?').get(owner, projectId(id));
    if (!row) throw fail(404, 'Projeto não encontrado.');
    return shape(row);
  }
  function put(owner, id, value) {
    projectId(id);
    const { name, active, serialized } = validateProject(value);
    const { version } = value;
    const now = Date.now();
    return transaction(db, () => {
      const current = db.prepare('SELECT * FROM projects WHERE owner=? AND id=?').get(owner, id);
      if (current) {
        if (current.name === name && current.files === serialized) {
          if (version === current.version && active !== current.active) {
            db.prepare('UPDATE projects SET active=? WHERE owner=? AND id=?').run(active, owner, id);
            current.active = active;
          }
          return shape(current);
        }
        if (version !== current.version) throw fail(409, 'Este projeto foi alterado em outro dispositivo. Exporte a cópia local antes de recarregar.', 'project_conflict');
        db.prepare('INSERT INTO project_versions VALUES (?, ?, ?, ?, ?, ?, ?)').run(owner, id, current.version, current.updated, current.name, current.active, current.files);
        db.prepare('DELETE FROM project_versions WHERE owner=? AND project=? AND version<=?').run(owner, id, current.version - 10);
        db.prepare('UPDATE projects SET name=?, active=?, files=?, updated=?, version=version+1 WHERE owner=? AND id=?')
          .run(name, active, serialized, now, owner, id);
      } else {
        if (version) throw fail(409, 'O projeto foi excluído em outro dispositivo.', 'project_conflict');
        if (db.prepare('SELECT count(*) AS n FROM projects WHERE owner=?').get(owner).n >= 100) throw fail(409, 'Limite de 100 projetos.');
        db.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, 1)').run(owner, id, name, active, serialized, now);
      }
      return item(owner, id);
    });
  }
  return {
    list(owner) {
      return db.prepare('SELECT id,name,active,updated,version FROM projects WHERE owner=? ORDER BY updated DESC').all(owner);
    },
    read: item, put,
    importMany(owner, entries) {
      if (!Array.isArray(entries) || !entries.length || entries.length > 100) throw fail(400, 'Escolha de 1 a 100 projetos.');
      const projects = entries.map(entry => ({ ...validateProject(entry), id: projectId(entry.id) }));
      if (new Set(projects.map(project => project.id)).size !== projects.length) throw fail(400, 'O backup contém projetos duplicados.');
      return transaction(db, () => {
        const lookup = db.prepare('SELECT name,active,files FROM projects WHERE owner=? AND id=?');
        const newProjects = projects.filter(project => {
          const current = lookup.get(owner, project.id);
          if (!current) return true;
          if (current.name !== project.name || current.active !== project.active || current.files !== project.serialized) {
            throw fail(409, 'Um projeto da importação já foi editado.');
          }
          return false;
        });
        const count = db.prepare('SELECT count(*) AS n FROM projects WHERE owner=?').get(owner).n;
        if (count + newProjects.length > 100) throw fail(409, 'Limite de 100 projetos.');
        const insert = db.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, 1)');
        const now = Date.now();
        for (const { id, name, active, serialized } of newProjects) insert.run(owner, id, name, active, serialized, now);
        return { count: projects.length };
      });
    },
    remove(owner, id, data) {
      if (data.confirm !== true) throw fail(400, 'Confirme a exclusão do projeto.');
      const { version } = item(owner, id);
      if (version !== data.version) throw fail(409, 'O projeto mudou. Atualize antes de excluir.');
      transaction(db, () => {
        db.prepare('UPDATE chats SET project=NULL WHERE owner=? AND project=?').run(owner, id);
        db.prepare('UPDATE documents SET project=NULL WHERE owner=? AND project=?').run(owner, id);
        db.prepare('DELETE FROM projects WHERE owner=? AND id=?').run(owner, id);
      });
    },
    versions(owner, id) {
      item(owner, id);
      return db.prepare('SELECT version,updated,name FROM project_versions WHERE owner=? AND project=? ORDER BY version DESC').all(owner, id);
    },
    version(owner, id, version) {
      const row = db.prepare('SELECT project AS id, version, updated, name, active, files FROM project_versions WHERE owner=? AND project=? AND version=?')
        .get(owner, projectId(id), version);
      if (!row) throw fail(404, 'Versão não encontrada.');
      return shape(row);
    }
  };
}
