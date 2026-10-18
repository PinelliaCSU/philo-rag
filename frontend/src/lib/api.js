// 唯一出网口：所有 HTTP 与 SSE 都从这里走，组件不直接 fetch。

const BASE = '';

async function getJSON(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + path);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).detail || '';
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(detail || 'HTTP ' + res.status + ' ' + path);
  }
  return res.json();
}

export const api = {
  stats: () => getJSON('/api/stats'),
  facets: () => getJSON('/api/facets'),
  units: () => getJSON('/api/units'),
  unit: (code, limit = 200) => getJSON('/api/unit', { code, limit }),
  concepts: () => getJSON('/api/concepts'),
  concept: (term) => getJSON('/api/concept', { term }),
  compare: (a, b) => getJSON('/api/compare', { a, b }),
  term: (term) => getJSON('/api/term', { term }),
  quote: (params) => getJSON('/api/quote', params),
  context: (chunkId) => getJSON('/api/context', { chunk_id: chunkId }),
  starmap: () => getJSON('/api/starmap'),
  ask: (body) => postJSON('/api/ask', body),
};

/**
 * SSE：用 fetch + ReadableStream 消费 meta → delta… → done。
 * EventSource 只能 GET，带不了 POST body 里的 conversation_id 与 strategy。
 */
export async function streamAsk({ question, strategy = 'auto', conversationId = null }, handlers) {
  const body = { question, strategy };
  if (conversationId) body.conversation_id = conversationId;

  const res = await fetch(BASE + '/api/ask_stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error('流式接口没有响应');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (event) => {
    if (!event || !event.type) return;
    if (event.type === 'meta') handlers.onMeta && handlers.onMeta(event);
    else if (event.type === 'delta') handlers.onDelta && handlers.onDelta(event.text || '');
    else if (event.type === 'done') handlers.onDone && handlers.onDone(event);
    else if (event.type === 'error') handlers.onError && handlers.onError(event.detail || '生成失败');
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          dispatch(JSON.parse(payload));
        } catch {
          /* 坏帧跳过，不影响后续事件 */
        }
      }
    }
  }
  handlers.onClose && handlers.onClose();
}
