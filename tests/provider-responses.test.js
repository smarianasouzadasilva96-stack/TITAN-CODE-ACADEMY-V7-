import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { providerClient } from '../server/providers.js';
import { chatEvents } from '../public/chat-stream.js';

const secret = 'test-secret-not-a-provider-key';
const prompt = [{ role: 'user', content: 'Responda somente: OK' }];
const abort = () => new AbortController().signal;

function fixture(body, { type = 'application/x-ndjson', status = 200, provider = 'ollama-cloud', timeout } = {}) {
  const calls = [];
  const logs = [];
  const client = providerClient({ timeout, diagnostic: entry => logs.push(entry), request: async (setting, path, request) => {
    calls.push({ ...request, path, endpoint: setting.endpoint });
    return Object.assign(Readable.from((Array.isArray(body) ? body : [body]).map(part => Buffer.from(part))),
      { headers: { 'content-type': type }, statusCode: status });
  } });
  const config = client.config({ provider, model: 'kimi-k2.7-code', key: secret });
  return { calls, logs, stream: options => client.generate(config, prompt, abort(), options) };
}

async function collect(iterable) {
  const parts = [];
  for await (const part of iterable) parts.push(part);
  return parts;
}

test('Ollama Cloud usa o endpoint oficial e separa raciocínio do texto NDJSON', async () => {
  const utf8 = Buffer.from('{"message":{"content":"Olá "},"done":false}\r\n');
  const at = utf8.indexOf(Buffer.from('á')) + 1;
  const { calls, logs, stream } = fixture([
    '\n{"message":{"thinking":"raciocínio separado","content":false},"done":false}\n',
    'false\n{"message":{"thinking":"mais raciocínio"},"done":false}\n',
    utf8.subarray(0, at), utf8.subarray(at),
    '{"message":{"content":"Titan"},"done":true,"done_reason":"stop"}'
  ]);
  let reasoning = 0;
  assert.deepEqual(await collect(stream({ onReasoning: () => reasoning++ })), ['Olá ', 'Titan']);
  assert.equal(reasoning, 1);
  assert.equal(calls[0].endpoint, 'https://ollama.com');
  assert.equal(calls[0].path, '/api/chat');
  assert.deepEqual(calls[0].data, { model: 'kimi-k2.7-code', messages: prompt, stream: true });
  assert.equal(logs[0].protocol, 'ndjson');
  assert.equal(logs[0].reasoning, true);
  assert.equal(logs[0].textChars, 9);
  assert.doesNotMatch(JSON.stringify(logs), /test-secret|raciocínio separado|Responda somente/);
});

test('classifica SSE por estrutura mesmo sem o tipo correto e aceita deltas OpenAI', async () => {
  const { logs, stream } = fixture([
    ': keep-alive\r\n\r\n',
    'event: message\r\ndata: {"choices":[\r\ndata: {"index":0,"delta":{"reasoning_content":"privado"}}]}\r\n\r\n',
    'data: {"choices":[{"index":0,"delta":{"content":[{"type":"thinking","text":"privado"},{"type":"text","text":"O"}]}}]}\n\n',
    'data: {"choices":[{"index":0,"delta":{"content":"K"},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n'
  ], { type: 'application/json' });
  assert.deepEqual(await collect(stream()), ['O', 'K']);
  assert.equal(logs[0].protocol, 'sse');
});

test('aceita JSON completo do Ollama, JSON de compatibilidade e resposta alternativa a stream', async () => {
  const native = fixture(JSON.stringify({ message: { content: 'OK', thinking: 'privado' }, done: true }, null, 2),
    { type: 'application/json' });
  assert.deepEqual(await collect(native.stream({ stream: false })), ['OK']);
  assert.equal(native.calls[0].data.stream, false);
  assert.equal(native.logs[0].protocol, 'json');
  const compatible = fixture('{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}',
    { type: 'application/json', provider: 'openrouter' });
  assert.deepEqual(await collect(compatible.stream({ stream: false })), ['OK']);
  assert.equal(compatible.calls[0].path, '/chat/completions');
  const fallback = fixture('{"message":{"content":"OK"}}', { type: 'application/json' });
  assert.deepEqual(await collect(fallback.stream()), ['OK']);
  assert.equal(fallback.calls[0].data.stream, true);
});

test('distingue texto literal de booleanos e detecta término sem texto', async () => {
  const literal = fixture('{"message":{"content":"false"},"done":true}');
  assert.deepEqual(await collect(literal.stream()), ['false']);
  for (const [body, expected] of [
    ['{"message":{"content":false},"done":true}', 'empty_response'],
    ['{"message":{"content":" \t"},"done":true}', 'invalid_response'],
    [JSON.stringify({ message: { content: ' \t' }, done: true }), 'empty_response'],
    ['{"message":{"thinking":"pensamento","content":""},"done":true}', 'reasoning_only'],
    ['{"message":{"thinking":"pensamento"},"done":true,"done_reason":"length"}', 'length_without_text']
  ]) {
    await assert.rejects(collect(fixture(body).stream()), { code: expected });
  }
});

test('sinaliza resposta truncada ou malformada e conserva o texto parcial entregue', async () => {
  for (const [tail, code] of [['','incomplete'], ['{"invalid"', 'invalid_response']]) {
    const { stream } = fixture('{"message":{"content":"texto parcial"},"done":false}\n' + tail);
    const generation = stream();
    assert.deepEqual(await generation.next(), { done: false, value: 'texto parcial' });
    await assert.rejects(generation.next(), { code });
  }
  await assert.rejects(collect(fixture('', { type: 'application/json' }).stream()), { code: 'empty_response' });
});

test('classifica falhas HTTP e eventos de erro sem repetir conteúdo do provedor', async () => {
  const http = fixture(JSON.stringify({ error: 'context length exceeded: ' + secret }), { status: 400, type: 'application/json' });
  await assert.rejects(collect(http.stream()), error => error.code === 'provider_context' && !error.message.includes(secret));
  assert.equal(http.logs[0].httpStatus, 400);
  assert.doesNotMatch(JSON.stringify(http.logs), /test-secret/);
  const event = fixture('event: error\ndata: {"error":{"message":"quota exhausted","metadata":"' + secret + '","code":402}}\n\n',
    { type: 'text/event-stream' });
  await assert.rejects(collect(event.stream()), error => error.code === 'provider_quota' && !error.message.includes(secret));
  assert.doesNotMatch(JSON.stringify(event.logs), /test-secret/);
});

test('leitor de chat mantém UTF-8 parcial e ignora delta booleano no streaming ou no fallback', async () => {
  const payload = Buffer.from('false\n{"type":"delta","text":false}\n{"type":"delta","text":"Olá"}\n{"type":"done","status":"done"}');
  const offset = payload.indexOf(Buffer.from('á')) + 1;
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(payload.subarray(0, offset)); controller.enqueue(payload.subarray(offset)); controller.close();
  } }));
  const expected = [{ type: 'delta', text: 'Olá' }, { type: 'done', status: 'done' }];
  assert.deepEqual(await collect(chatEvents(response)), expected);
  assert.deepEqual(await collect(chatEvents({ text: async () => payload.toString() })), expected);
  await assert.rejects(collect(chatEvents(new Response('{"type":"delta","text":"parcial"}'))), /antes da confirmação/);
  await assert.rejects(collect(chatEvents(new Response('evento inválido'))), /evento de chat inválido/);
});
