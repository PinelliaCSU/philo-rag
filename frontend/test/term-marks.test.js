// 术语注解（.term-hit）的三条回归线：
//   ① 定型后必须存在；
//   ② 正文块被重新渲染后必须仍然存在（旧实现是 $effect 里的 DOM 副作用，重渲染即丢）；
//   ③ 流式过程中（done 之前）就应当存在，而不是等 1.2s 定型才出现。
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';

const ANSWER = [
  '## 大他者',
  '大他者是象征秩序里的一个位置。',
  '客体小a 与象征界不是同一层的东西。',
  '最后一句：主体由象征界先行决定。',
].join('\r\n\r\n');

function sse(events) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode('data: ' + JSON.stringify(e) + '\n\n'));
      c.close();
    },
  });
}
const ok = (d) => Promise.resolve({ ok: true, json: async () => d, text: async () => JSON.stringify(d) });

let target;
let component;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  target = document.getElementById('app');
  vi.stubGlobal('fetch', vi.fn((url) => {
    const u = String(url);
    if (u.includes('/api/starmap')) return ok({ version: 1, nodes: [], edges: [], axes: [], seed: 1 });
    if (u.includes('/api/concepts')) {
      return ok([
        { name: '大他者', aliases: [] },
        { name: '象征界', aliases: [] },
        { name: '客体小a', aliases: [] },
        { name: '主体', aliases: [] },
      ]);
    }
    if (u.includes('/api/units')) return ok([]);
    if (u.includes('/api/facets')) return ok({});
    if (u.includes('/api/stats')) return ok({ axes: {} });
    if (u.includes('/api/ask_stream')) {
      return Promise.resolve({
        ok: true,
        body: sse([
          { type: 'meta', strategy: 'point', citations: [{ n: 1, chunk_id: 'c1', citation: '《哲学大纲》· 1-1' }], conversation_id: 'c1' },
          { type: 'delta', text: ANSWER },
          { type: 'done', answer: ANSWER, citations: [{ n: 1, chunk_id: 'c1', citation: '《哲学大纲》· 1-1' }], annotations: [{ concepts: ['大他者', '象征界'] }] },
        ]),
      });
    }
    return ok({});
  }));
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
});

async function submit(waitMs = 3000) {
  component = mount(App, { target });
  flushSync();
  const ta = target.querySelector('.input-line textarea');
  ta.value = '什么是大他者？';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();
  await new Promise((r) => setTimeout(r, waitMs));
  flushSync();
}

const marks = () => [...target.querySelectorAll('.md .term-hit')];

describe('术语注解不消失', () => {
  it('定型后正文里有术语注解，且只标命中集合里的词', async () => {
    await submit();
    const hits = marks();
    expect(hits.length).toBeGreaterThan(0);
    const names = new Set(hits.map((el) => el.dataset.term));
    for (const name of names) expect(['大他者', '象征界', '客体小a', '主体']).toContain(name);
    // 「主体」在第一段没有出现，不应凭空出现注解
    expect(hits.every((el) => el.textContent === el.dataset.term)).toBe(true);
  });

  it('正文块被重新渲染后注解仍在（旧实现会丢）', async () => {
    await submit();
    const before = marks().length;
    expect(before).toBeGreaterThan(0);

    // 触发渲染层重新求值：块文本变化 → {@html} 换成新字符串。
    // 旧实现把 span 注入 DOM（不归 Svelte 管），换 html 时随之丢失且不会补标。
    const { app } = await import('../src/lib/store.svelte.js');
    app.blocks = app.blocks.map((b, i) => (i === 0 ? b + ' ' : b));
    flushSync();

    expect(marks().length).toBe(before);
  });

  it('流式过程中（done 之前）就已有注解', async () => {
    await submit(800);            // 定型要等 1.2s，此刻仍在流式/提交阶段
    const { app } = await import('../src/lib/store.svelte.js');
    expect(app.done).toBe(false);
    expect(marks().length).toBeGreaterThan(0);
  });
});
