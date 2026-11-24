import { StringDecoder } from 'node:string_decoder';
import { fail } from './security.js';

const maxFrame = 524288;
const maxResponse = 8 * 1024 * 1024;

export function providerError(status, payload) {
  const error = payload?.error ?? payload;
  const reason = [
    typeof error === 'string' ? error : error?.message,
    error?.code, payload?.code
  ].filter(value => typeof value === 'string').join(' ').slice(0, 1600).toLowerCase();
  const code = [status, error?.status, error?.code, payload?.status, payload?.status_code]
    .find(value => Number.isInteger(value) && value >= 400 && value < 600);
  const failure = (http, text, type) => Object.assign(fail(http, text, type), { providerStatus: code });
  if (code === 401 || code === 403 || /unauthori[sz]ed|invalid_api_key/.test(reason)) {
    return failure(502, 'O provedor recusou a credencial. Confira a chave e as permissões.', 'authentication');
  }
  if (code === 402 || /insufficient[_ ]quota|quota exhausted|payment required|usage limit/.test(reason)) {
    return failure(502, 'O provedor informou que a cota ou o saldo da conta foi atingido. Confira seu plano.', 'provider_quota');
  }
  if (code === 429 || /rate[_ ]limit|too many requests/.test(reason)) {
    return failure(429, 'O provedor atingiu o limite de uso. Tente mais tarde.', 'provider_limit');
  }
  if (code === 404 || /model_not_found|model .{0,120}not found/.test(reason)) {
    return failure(502, 'Endpoint ou modelo não encontrado no provedor.', 'provider_not_found');
  }
  if (/context[_ ]length|context[_ ]window|too many tokens|input is too long/.test(reason)) {
    return failure(502, 'O contexto excedeu o limite aceito pelo modelo. Tente uma mensagem ou conversa menor.', 'provider_context');
  }
  if (code === 400 || code === 422) {
    return failure(502, 'O provedor rejeitou o formato ou os parâmetros da geração (HTTP ' + code + ').', 'provider_request');
  }
  if (status >= 300 && status < 400) return failure(502, 'O provedor respondeu com um redirecionamento.', 'provider_redirect');
  if (code && code >= 500) return failure(502, 'O serviço do provedor está indisponível (HTTP ' + code + ').', 'unavailable');
  return failure(502, code ? 'O provedor interrompeu a geração (HTTP ' + code + ').' : 'O provedor interrompeu a geração.', 'provider_error');
}

export async function readProviderJson(response) {
  let size = 0;
  const parts = [];
  try {
    for await (const chunk of response) {
      size += chunk.length;
      if (size > 16384) return undefined;
      parts.push(chunk);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch { return undefined; }
}

function invalid() {
  return fail(502, 'O provedor enviou uma resposta inválida ou malformada.', 'invalid_response');
}
function tooLarge() {
  return fail(502, 'A resposta do provedor excedeu o limite.', 'output_limit');
}
function parseJson(raw) {
  if (raw === '[DONE]') return raw;
  try { return JSON.parse(raw); }
  catch { throw invalid(); }
}

async function* responseLines(response, signal) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let bytes = 0;
  for await (const chunk of response) {
    signal.throwIfAborted();
    bytes += chunk.length;
    if (bytes > maxResponse) throw tooLarge();
    const decoded = pending + decoder.write(chunk);
    const lines = decoded.split('\n');
    pending = lines.pop();
    if (pending.length > maxFrame) throw tooLarge();
    for (const line of lines) {
      if (line.length > maxFrame) throw tooLarge();
      yield line.replace(/\r$/, '');
    }
  }
  signal.throwIfAborted();
  const tail = pending + decoder.end();
  if (tail) yield tail.replace(/\r$/, '');
}

export async function* providerFrames(response, signal, stats) {
  const type = String(response.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  const declaredNdjson = type === 'application/x-ndjson' || type === 'application/ndjson' || type === 'application/jsonl';
  const jsonResponse = !declaredNdjson && type !== 'text/event-stream';
  let framing;
  let object = '';
  let records = 0;
  let sseEvent = '';
  let sseData = '';
  function event() {
    const eventName = sseEvent;
    const data = sseData.trim();
    sseEvent = '';
    sseData = '';
    if (!data) return null;
    if (eventName === 'error') {
      let details;
      try { details = JSON.parse(data); }
      catch { details = data; }
      throw providerError(undefined, details);
    }
    return { payload: parseJson(data), completeDocument: false };
  }

  for await (const raw of responseLines(response, signal)) {
    const line = framing ? raw : raw.replace(/^\uFEFF/, '');
    if (!framing && !line.trim()) continue;
    if (!framing && /^(?:data:|event:|id:|retry:|:)/.test(line)) {
      framing = 'sse';
      stats.protocol = 'sse';
    }
    if (framing === 'sse') {
      if (line.startsWith('data:')) {
        sseData += line.slice(5).replace(/^ /, '') + '\n';
        if (sseData.length > maxFrame) throw tooLarge();
      } else if (line.startsWith('event:')) {
        sseEvent = line.slice(6).trim();
      } else if (!line.trim()) {
        const frame = event();
        if (frame) yield frame;
      }
      continue;
    }
    if (framing === 'document') {
      object += '\n' + line;
      if (object.length > maxFrame) throw tooLarge();
      continue;
    }
    if (!line.trim()) continue;
    let payload;
    try { payload = parseJson(line.trim()); }
    catch (error) {
      if (framing || declaredNdjson || !/^[{\[]/.test(line.trim())) throw error;
      framing = 'document';
      stats.protocol = 'json';
      object = line;
      continue;
    }
    framing = 'records';
    records++;
    stats.protocol = records === 1 && !declaredNdjson ? 'json' : 'ndjson';
    yield { payload, completeDocument: jsonResponse && records === 1 };
  }
  if (framing === 'document') yield { payload: parseJson(object), completeDocument: true };
  if (framing === 'sse') {
    const frame = event();
    if (frame) yield frame;
  }
}

function content(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.filter(part => ['text', 'output_text'].includes(part?.type) && typeof part.text === 'string')
    .map(part => part.text).join('');
}

function hasReasoning(source) {
  return [source?.thinking, source?.reasoning, source?.reasoning_content].some(value => typeof value === 'string' && value.trim()) ||
    (Array.isArray(source?.reasoning_details) && source.reasoning_details.length > 0) ||
    (Array.isArray(source?.content) && source.content.some(part => ['thinking', 'reasoning_text'].includes(part?.type)));
}

export function responsePart({ payload, completeDocument }) {
  if (payload === '[DONE]') return { finished: true };
  if (payload == null || typeof payload === 'boolean') return {};
  if (typeof payload !== 'object' || Array.isArray(payload)) throw invalid();
  if (payload.error || payload.type === 'error') throw providerError(undefined, payload);
  const choice = Array.isArray(payload.choices) && (payload.choices.find(item => item?.index === 0) || payload.choices[0]);
  const reason = choice?.finish_reason || payload.done_reason;
  if (reason === 'error') throw providerError(undefined, payload);
  if (reason === 'content_filter') throw fail(502, 'O filtro do provedor bloqueou a resposta.', 'provider_filter');
  const delta = choice?.delta;
  const message = choice?.message || payload.message;
  return {
    text: content(delta?.content) || content(message?.content) || content(choice?.text) || content(payload.response),
    reasoning: hasReasoning(delta) || hasReasoning(message) || hasReasoning(payload),
    tools: [delta?.tool_calls, message?.tool_calls].some(value => Array.isArray(value) && value.length),
    reason,
    finished: payload.done === true || (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0),
    completeDocument: completeDocument && payload.done !== false && !delta &&
      (message != null || Object.hasOwn(payload, 'response') || choice?.text != null)
  };
}
