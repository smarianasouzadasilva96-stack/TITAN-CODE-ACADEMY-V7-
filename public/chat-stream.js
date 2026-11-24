function decode(line) {
  if (!line.trim()) return null;
  let event;
  try { event = JSON.parse(line); }
  catch { throw new Error('O servidor enviou um evento de chat inválido.'); }
  if (!event || typeof event !== 'object') return null;
  switch (event.type) {
    case 'start':
    case 'reasoning':
      return event;
    case 'delta':
      return typeof event.text === 'string' && event.text ? event : null;
    case 'tool':
      return Array.isArray(event.sources) ? { ...event, sources: event.sources.filter(name => typeof name === 'string') } : null;
    case 'error':
      return { ...event, message: typeof event.message === 'string' && event.message
        ? event.message : 'O servidor informou uma falha na geração.' };
    case 'done':
      return ['done', 'cancelled', 'error'].includes(event.status) ? event : null;
    default:
      return null;
  }
}

async function* chunks(response) {
  if (!response.body?.getReader || typeof TextDecoder !== 'function') {
    yield await response.text();
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let eof = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) { eof = true; break; }
      yield decoder.decode(value, { stream: true });
    }
    yield decoder.decode();
  } finally {
    if (!eof) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function* chatEvents(response) {
  let buffer = '';
  for await (const chunk of chunks(response)) {
    const lines = (buffer + chunk).split('\n');
    buffer = lines.pop();
    if (buffer.length > 524288) throw new Error('O servidor enviou um evento de chat muito grande.');
    for (const line of lines) {
      const event = decode(line);
      if (!event) continue;
      yield event;
      if (event.type === 'done') return;
    }
  }
  const last = decode(buffer);
  if (last) yield last;
  if (last?.type !== 'done') throw new Error('A conexão com o chat terminou antes da confirmação da resposta.');
}
