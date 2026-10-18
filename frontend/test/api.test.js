import { describe, expect, it, vi } from 'vitest';
import { streamAsk } from '../src/lib/api.js';

/** 把若干段 SSE 文本做成一个 ReadableStream，用来验证分帧逻辑。 */
function streamOf(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function stubFetch(chunks) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, body: streamOf(chunks) })));
}

describe('SSE 消费（fetch + ReadableStream）', () => {
  it('按 meta → delta… → done 的顺序派发', async () => {
    stubFetch([
      'data: {"type":"meta","citations":[{"n":1}]}\n\n',
      'data: {"type":"delta","text":"第一"}\n\n',
      'data: {"type":"delta","text":"段"}\n\n',
      'data: {"type":"done","answer":"第一段","citations":[]}\n\n',
    ]);
    const seen = [];
    let meta = null;
    let final = null;
    await streamAsk({ question: '什么是字头？', strategy: 'point', conversationId: 'c1' }, {
      onMeta: (e) => { seen.push('meta'); meta = e; },
      onDelta: (t) => { seen.push('delta:' + t); },
      onDone: (e) => { seen.push('done'); final = e; },
      onError: (d) => { seen.push('error:' + d); },
    });
    expect(seen).toEqual(['meta', 'delta:第一', 'delta:段', 'done']);
    expect(meta.citations).toHaveLength(1);
    expect(final.answer).toBe('第一段');
  });

  it('一帧被拆成两段网络分片也能拼回来', async () => {
    stubFetch(['data: {"type":"delta","text":"拆', '开"}\n\n', 'data: {"type":"done","answer":"拆开"}\n\n']);
    const deltas = [];
    let answer = '';
    await streamAsk({ question: 'q', strategy: 'auto' }, {
      onDelta: (t) => deltas.push(t),
      onDone: (e) => { answer = e.answer; },
    });
    expect(deltas).toEqual(['拆开']);
    expect(answer).toBe('拆开');
  });

  it('错误事件交给 onError，坏帧被跳过', async () => {
    stubFetch(['data: not-json\n\n', 'data: {"type":"error","detail":"这次没有接通"}\n\n']);
    const errors = [];
    await streamAsk({ question: 'q', strategy: 'auto' }, {
      onError: (d) => errors.push(d),
    });
    expect(errors).toEqual(['这次没有接通']);
  });

  it('请求体带上 conversation_id 与 strategy', async () => {
    stubFetch(['data: {"type":"done","answer":""}\n\n']);
    await streamAsk({ question: '追问', strategy: 'theme', conversationId: 'abc' }, {});
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      question: '追问', strategy: 'theme', conversation_id: 'abc',
    });
  });
});
