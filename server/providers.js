import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import ipaddr from 'ipaddr.js';
import { fail, text } from './security.js';
import { providerError, providerFrames, readProviderJson, responsePart } from './provider-responses.js';

export const suggestedModel = 'qwen3:8b';
export const nemotronFree = 'nvidia/nemotron-3-ultra-550b-a55b:free';
export function modelName(id) {
  if (id === nemotronFree) return 'NVIDIA Nemotron 3 Ultra (gratuito)';
  if (id === nemotronFree.replace(':free', '')) return 'NVIDIA Nemotron 3 Ultra';
  if (id === suggestedModel) return 'Qwen3 8B';
  return id;
}
const providers = {
  'ollama-cloud': { url: 'https://ollama.com', native: true, key: true },
  openrouter: { url: 'https://openrouter.ai/api/v1', key: true },
  'ollama-local': { native: true },
  custom: {}
};

export function publicIp(address) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast' && (ip.kind() === 'ipv4' || (ip.parts[0] & 0xe000) === 0x2000);
  } catch { return false; }
}

function canonical(raw, local = false) {
  try {
    const url = new URL(raw);
    if ((local ? !['http:', 'https:'].includes(url.protocol) : url.protocol !== 'https:') ||
      url.username || url.password || url.search || url.hash || /[\\]/.test(raw)) throw new Error();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!local && (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.') && !host.includes(':') ||
        (ipaddr.isValid(host) && !publicIp(host)))) throw new Error();
    return url.href.replace(/\/+$/, '');
  } catch { throw fail(400, 'Endereço do provedor recusado. Use um endpoint HTTPS público autorizado.'); }
}

function withAbort(task, signal) {
  if (!signal) return task;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function transport(resolveDns = lookup) {
  return async (config, path, { method = 'GET', data, signal } = {}) => {
    const url = new URL(config.endpoint + path);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let pinned;
    if (!config.local) {
      let addresses;
      try { addresses = await withAbort(resolveDns(host, { all: true, verbatim: true }), signal); }
      catch { signal?.throwIfAborted(); throw fail(502, 'Não foi possível resolver o provedor.', 'network'); }
      signal?.throwIfAborted();
      if (!addresses.length || addresses.some(item => !publicIp(item.address))) {
        throw fail(400, 'O endereço resolvido pelo provedor não é público.', 'blocked_endpoint');
      }
      pinned = addresses[0];
    }
    const payload = data ? JSON.stringify(data) : null;
    const accept = !data?.stream ? 'application/json' : config.native
      ? 'application/x-ndjson, text/event-stream, application/json'
      : 'text/event-stream, application/x-ndjson, application/json';
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const request = client.request(url, {
        method, signal, agent: false, autoSelectFamily: false,
        ...(pinned && { lookup: (_host, _options, done) => done(null, pinned.address, pinned.family) }),
        headers: {
          Accept: accept,
          ...(payload && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
          ...(config.key && { Authorization: 'Bearer ' + config.key })
        }
      }, resolve);
      request.on('error', reject);
      request.end(payload);
    });
  };
}

export function providerClient({ localUrl, customEndpoints = '', request = transport(), timeout,
  diagnostic = event => console.info('[Titan AI]', JSON.stringify(event)) } = {}) {
  const approved = new Set(customEndpoints.split(',').filter(part => part.trim()).map(part => canonical(part.trim())));
  const local = localUrl && canonical(localUrl, true);
  function config(input) {
    if (!Object.hasOwn(providers, input.provider || '')) throw fail(400, 'Provedor inválido.');
    const provider = providers[input.provider];
    let endpoint = provider.url;
    if (input.provider === 'ollama-local') {
      if (!local) throw fail(409, 'O operador ainda precisa habilitar uma instalação Ollama local.');
      endpoint = local;
    }
    if (input.provider === 'custom') {
      endpoint = canonical(text(input.endpoint, 300, 'Endpoint'));
      if (!approved.has(endpoint)) throw fail(400, 'Endpoint personalizado precisa estar na lista aprovada pelo operador.');
    }
    const model = text(input.model, 180, 'Modelo', { optional: true });
    if (model && !/^[\w.:/+@-]+$/.test(model)) throw fail(400, 'Identificador de modelo inválido.');
    const key = text(input.key, 2048, 'Chave', { optional: true });
    if (key && !/^[!-~]+$/.test(key)) throw fail(400, 'Formato de chave inválido.');
    return { provider: input.provider, endpoint, model, key, mode: input.mode === 'session' ? 'session' : 'persistent', native: !!provider.native, needsKey: !!provider.key,
      local: input.provider === 'ollama-local' };
  }
  async function connect(setting, path, init, signal, retry = true) {
    const attempts = retry ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      signal.throwIfAborted();
      let response;
      try { response = await request(setting, path, { ...init, signal }); }
      catch (error) {
        signal.throwIfAborted();
        if (error.status && error.code !== 'network') throw error;
        if (attempt + 1 >= attempts) throw fail(502, 'Não foi possível alcançar o provedor.', 'network');
      }
      if (response) {
        const status = response.statusCode;
        if (status >= 200 && status < 300) return response;
        if (![502, 503, 504].includes(status) || attempt + 1 >= attempts) {
          const details = init.method === 'POST' && status >= 400 ? await readProviderJson(response) : undefined;
          signal.throwIfAborted();
          response.destroy();
          throw providerError(status, details);
        }
        response.destroy();
      }
      await sleep(180 * 2 ** attempt + Math.random() * 120, undefined, { signal });
    }
  }
  function validate(setting) {
    if (setting.needsKey && !setting.key) throw fail(400, 'Informe a chave API deste provedor.');
  }
  return {
    config, customEndpoints: [...approved], localEnabled: !!local,
    async models(setting, abort) {
      validate(setting);
      const signal = AbortSignal.any([abort, AbortSignal.timeout(Math.min(timeout ?? 12000, 12000))]);
      const response = await connect(setting, setting.native ? '/api/tags' : '/models', {}, signal);
      const parts = [];
      let size = 0;
      for await (const chunk of response) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) throw fail(502, 'Catálogo de modelos muito grande.');
        parts.push(chunk);
      }
      let json;
      try { json = JSON.parse(Buffer.concat(parts).toString()); }
      catch { throw fail(502, 'O catálogo de modelos do provedor é inválido.', 'invalid_response'); }
      const source = setting.native ? json.models : json.data;
      if (!Array.isArray(source)) throw fail(502, 'O provedor retornou um catálogo sem modelos.', 'invalid_response');
      const catalog = new Map();
      for (const entry of source) {
        const id = setting.native ? (entry?.name || entry?.model) : entry?.id;
        if (typeof id !== 'string' || !/^[\w.:/+@-]{1,180}$/.test(id) || catalog.has(id)) continue;
        const providedName = !setting.native && typeof entry.name === 'string' ? entry.name.trim().slice(0, 180) : '';
        catalog.set(id, { id, name: modelName(id) === id && providedName ? providedName : modelName(id),
          free: id.endsWith(':free') });
        if (catalog.size >= 2500) break;
      }
      const models = [...catalog.keys()];
      return { models, catalog: [...catalog.values()], suggested: (catalog.has(nemotronFree) ? nemotronFree : null) ||
        models.find(id => id === suggestedModel) || models.find(id => /^qwen\/qwen3-8b(?::[\w-]+)?$/.test(id)) || null };
    },
    async usage(setting, abort) {
      if (setting.provider !== 'openrouter') throw fail(400, 'Este provedor não disponibiliza consulta de uso aqui.');
      validate(setting);
      const signal = AbortSignal.any([abort, AbortSignal.timeout(12000)]);
      const response = await connect(setting, '/key', {}, signal);
      const fields = (await readProviderJson(response))?.data;
      if (!fields || typeof fields !== 'object') throw fail(502, 'O provedor enviou dados de uso inválidos.');
      const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
      return { usage: number(fields.usage), limit: number(fields.limit), remaining: number(fields.limit_remaining),
        reset: ['daily','weekly','monthly'].includes(fields.limit_reset) ? fields.limit_reset : null,
        free: fields.is_free_tier === true };
    },
    async *generate(setting, messages, abort, { stream = true, onReasoning } = {}) {
      validate(setting);
      const started = performance.now();
      const signal = AbortSignal.any([abort, AbortSignal.timeout(timeout ?? (setting.provider === 'ollama-cloud' ? 180000 : 75000))]);
      const path = setting.native ? '/api/chat' : '/chat/completions';
      const data = { model: setting.model, messages, stream };
      // O endpoint Cloud usa os padrões do modelo, inclusive para o orçamento de raciocínio.
      if (setting.native && setting.provider !== 'ollama-cloud') data.options = { temperature: 0.3, num_predict: 3072 };
      if (setting.native && setting.model === suggestedModel) data.think = false;
      if (!setting.native) Object.assign(data, { temperature: 0.3, max_tokens: 3072 });
      const stats = { provider: setting.provider, endpoint: path, stream, protocol: null, httpStatus: null,
        frames: 0, textChars: 0, reasoning: false };
      let response;
      let failure;
      try {
        // Evita duplicar gerações cobradas quando a conexão cai após o envio.
        response = await connect(setting, path, { method: 'POST', data }, signal, false);
        stats.httpStatus = response.statusCode;
        let finished = false;
        let document = false;
        let visibleText = false;
        let tools = false;
        let reason;
        for await (const frame of providerFrames(response, signal, stats)) {
          stats.frames++;
          const part = responsePart(frame);
          if (part.reasoning && !stats.reasoning) {
            stats.reasoning = true;
            await onReasoning?.();
          }
          document ||= Boolean(part.completeDocument);
          tools ||= Boolean(part.tools);
          reason = part.reason || reason;
          if (part.text) {
            stats.textChars += part.text.length;
            if (stats.textChars > 80000) throw fail(502, 'A resposta do provedor excedeu o limite.', 'output_limit');
            visibleText ||= Boolean(part.text.trim());
            yield part.text;
          }
          if (part.finished) { finished = true; break; }
        }
        signal.throwIfAborted();
        if (!finished && !(stats.frames === 1 && document)) {
          if (stats.frames) throw fail(502, 'A conexão terminou antes do fim da resposta.', 'incomplete');
          throw fail(502, 'O provedor encerrou a conexão sem enviar uma resposta.', 'empty_response');
        }
        if (!visibleText) {
          if (reason === 'length' || reason === 'max_tokens') {
            throw fail(502, 'O modelo atingiu o limite de geração antes de enviar uma resposta final.', 'length_without_text');
          }
          if (stats.reasoning) throw fail(502, 'O modelo enviou raciocínio, mas encerrou sem uma resposta final.', 'reasoning_only');
          if (tools) throw fail(502, 'O modelo solicitou uma ferramenta e encerrou sem uma resposta final.', 'tools_only');
          throw fail(502, 'O modelo encerrou a geração sem enviar uma resposta final.', 'empty_response');
        }
      } catch (error) {
        if (abort.aborted) failure = fail(499, 'Geração interrompida.', 'cancelled');
        else if (signal.aborted) failure = fail(504, 'O provedor excedeu o tempo limite de geração.', 'timeout');
        else failure = error.status ? error : fail(502, 'A conexão com o provedor foi interrompida durante a geração.', 'incomplete');
        stats.httpStatus ??= failure.providerStatus ?? null;
        throw failure;
      } finally {
        response?.destroy();
        diagnostic({ ...stats, result: failure?.code || 'done', durationMs: Math.round(performance.now() - started) });
      }
    }
  };
}
