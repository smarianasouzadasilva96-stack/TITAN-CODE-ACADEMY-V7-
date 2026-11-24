import { fail } from './security.js';
import { modelName } from './providers.js';

const identity = (owner, config) => [owner, config.provider, config.endpoint, config.model];
const visible = (row, mode) => row && ({
  provider: row.provider, endpoint: row.provider === 'custom' ? row.endpoint : '',
  model: row.model, modelName: row.model_name || modelName(row.model), mode, hasKey: Boolean(row.sealed || row.key), tested: row.tested, state: row.state
});

export function credentials(db, vault, client, canPersist) {
  const temporary = new Map();
  const stored = owner => db.prepare('SELECT * FROM credentials WHERE owner=?').get(owner);
  const selected = session => temporary.get(session.id) || stored(session.user.id);
  const clearTemporary = owner => {
    for (const [id, config] of temporary) if (config.owner === owner) temporary.delete(id);
  };
  function load(session, row) {
    const key = row.key || (row.sealed ? vault.open(row.sealed, identity(session.user.id, row)) : '');
    const config = client.config({ ...row, key });
    if (config.endpoint !== row.endpoint) throw fail(409, 'O endpoint mudou. Configure o provedor novamente.');
    return config;
  }
  function input(session, data) {
    const candidate = client.config(data);
    const row = selected(session);
    if (!candidate.key && row && row.provider === candidate.provider && row.endpoint === candidate.endpoint) {
      candidate.key = load(session, row).key;
    }
    return candidate;
  }
  const busy = new Set();
  async function guarded(session, callback) {
    const owner = session.user.id;
    if (busy.has(owner) || busy.size >= 24) throw fail(429, 'Aguarde o teste em andamento.');
    busy.add(owner);
    try { return await callback(); }
    finally { busy.delete(owner); }
  }
  function check(session, config, signal) {
    return guarded(session, async () => {
      const found = await client.models(config, signal);
      return { ...found, modelAvailable: found.models.includes(config.model), tested: Date.now() };
    });
  }
  return {
    info(session) {
      return {
        connection: visible(selected(session), temporary.has(session.id) ? 'session' : 'persistent') || null,
        localEnabled: client.localEnabled, customEndpoints: client.customEndpoints, canPersist
      };
    },
    async test(session, data, signal) {
      if (!data.saved) return check(session, input(session, data), signal);
      const row = selected(session);
      if (!row) throw fail(404, 'Configure um provedor primeiro.');
      const wasTemporary = temporary.has(session.id);
      const update = state => {
        if (row === temporary.get(session.id)) Object.assign(row, { tested: Date.now(), state });
        else if (!wasTemporary) db.prepare('UPDATE credentials SET tested=?, state=? WHERE owner=? AND tested=? AND provider=? AND endpoint=? AND model=?')
          .run(Date.now(), state, session.user.id, row.tested, row.provider, row.endpoint, row.model);
      };
      try {
        const result = await check(session, load(session, row), signal);
        update(result.modelAvailable ? 'connected' : 'model_unavailable');
        return result;
      } catch (error) {
        if (error.name !== 'AbortError') update(error.code || 'unavailable');
        throw error;
      }
    },
    async probe(session, data, signal) {
      const config = data.saved === true ? this.use(session) : input(session, data);
      if (!config.model) throw fail(400, 'Selecione um modelo antes de testar a geração.');
      return guarded(session, async () => {
        let length = 0;
        for await (const part of client.generate(config, [{ role: 'user', content: 'Responda somente: OK' }], signal, { stream: false })) {
          length += part.length;
        }
        return { tested: Date.now(), model: config.model, modelName: modelName(config.model), characters: length };
      });
    },
    async usage(session, data, signal) {
      return guarded(session, () => client.usage(this.use(session), signal));
    },
    async save(session, data, signal) {
      const owner = session.user.id;
      const config = input(session, data);
      if (!config.model) throw fail(400, 'Selecione um modelo do catálogo.');
      const result = await check(session, config, signal);
      if (!result.modelAvailable) throw fail(409, 'O modelo escolhido não foi encontrado neste provedor.', 'model_unavailable');
      if (!db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?').get(session.id, Date.now())) throw fail(401, 'Sessão encerrada.');
      const { tested } = result;
      const friendly = result.catalog.find(item => item.id === config.model)?.name || modelName(config.model);
      if (config.mode === 'session') {
        db.prepare('DELETE FROM credentials WHERE owner=?').run(owner);
        clearTemporary(owner);
        temporary.set(session.id, { ...config, owner, tested, model_name: friendly, state: 'connected' });
        return visible(temporary.get(session.id), 'session');
      }
      const sealed = config.key ? vault.seal(config.key, identity(owner, config)) : null;
      db.prepare(`INSERT INTO credentials(owner,provider,endpoint,model,sealed,tested,state,model_name) VALUES (?,?,?,?,?,?,'connected',?)
        ON CONFLICT(owner) DO UPDATE SET provider=excluded.provider, endpoint=excluded.endpoint, model=excluded.model,
        sealed=excluded.sealed, tested=excluded.tested, state=excluded.state, model_name=excluded.model_name`)
        .run(owner, config.provider, config.endpoint, config.model, sealed, tested, friendly);
      clearTemporary(owner);
      return visible(stored(owner), 'persistent');
    },
    use(session) {
      const row = selected(session);
      if (!row) throw fail(409, 'Configure sua IA antes de iniciar uma conversa.', 'configuration_required');
      return load(session, row);
    },
    clear(session) {
      if (busy.has(session.user.id)) throw fail(409, 'Aguarde o teste de conexão em andamento.');
      db.prepare('DELETE FROM credentials WHERE owner=?').run(session.user.id);
      clearTemporary(session.user.id);
    },
    revoke(id) { temporary.delete(id); }
  };
}
