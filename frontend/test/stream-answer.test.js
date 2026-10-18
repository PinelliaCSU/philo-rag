// 复现 P4：把一条长回答按真实后端的格式（CRLF + 标题 + 列表）走完整条流式链路，
// 断言「定型后的正文包含最后一句」——截断会在这里直接失败。
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';

const LAST = '这是回答的最后一句，用来验证流式输出没有丢字。';

function longAnswer(paragraphs = 12) {
  const parts = [];
  for (let i = 1; i <= paragraphs; i += 1) {
    parts.push('### 第 ' + i + ' 节\r\n- 要点甲' + i + '\r\n- 要点乙' + i + '\r\n');
    parts.push('正文段落 ' + i + '：' + '字'.repeat(120) + '。\r\n');
  }
  parts.push('## 收束\r\n' + LAST + '\r\n');
  return parts.join('\r\n');
}

const ANSWER_CRLF = longAnswer();
const ANSWER_LF = ANSWER_CRLF.replace(/\r\n/g, '\n');

function sseStream(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode('data: ' + JSON.stringify(e) + '\n\n'));
      controller.close();
    },
  });
}

function okJson(data) {
  return Promise.resolve({ ok: true, json: async () => data, text: async () => JSON.stringify(data) });
}

let target;
let component;
let currentAnswer = ANSWER_CRLF;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  target = document.getElementById('app');

  vi.stubGlobal('fetch', vi.fn((url) => {
    const u = String(url);
    if (u.includes('/api/starmap')) return okJson({ version: 1, nodes: [], edges: [], axes: [], seed: 1 });
    if (u.includes('/api/concepts')) return okJson([]);
    if (u.includes('/api/units')) return okJson([]);
    if (u.includes('/api/facets')) return okJson({});
    if (u.includes('/api/stats')) return okJson({ axes: {} });
    if (u.includes('/api/ask_stream')) {
      // 两种换行都要测：模板后端给 CRLF，流式/云端给 LF
      const answer = currentAnswer;
      const events = [
        { type: 'meta', strategy: 'theme', citations: [{ n: 1, chunk_id: 'c1', citation: '《哲学大纲》· 1-1' }], conversation_id: 'c1' },
        ...answer.split(/(?<=\n)/).map((text) => ({ type: 'delta', text })),
        { type: 'done', answer, citations: [{ n: 1, chunk_id: 'c1', citation: '《哲学大纲》· 1-1' }] },
      ];
      return Promise.resolve({ ok: true, body: sseStream(events) });
    }
    return okJson({});
  }));
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
});

async function askLong() {
  component = mount(App, { target });
  flushSync();
  const textarea = target.querySelector('.input-line textarea');
  textarea.value = '马克思在体系中的位置';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();
  // 流式泵每帧 2–6 字 + 定型等 1.2s；给足时间
  await new Promise((resolve) => setTimeout(resolve, 4000));
  flushSync();
  return target.querySelector('.md');
}

describe('流式输出与背景联动（P3）', () => {
  it('流式期间每个提交批次都会给星图发一次脉冲', async () => {
    // 先挂载（StarField 会注册真实的星图通道），再换成探针，最后才提问
    component = mount(App, { target });
    flushSync();
    const { attachStar } = await import('../src/lib/store.svelte.js');
    const flash = vi.fn();
    attachStar({ flash });

    const textarea = target.querySelector('.input-line textarea');
    textarea.value = '马克思在体系中的位置';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(flash.mock.calls.length).toBeGreaterThan(3);
    expect(flash.mock.calls[0][0]).toBeGreaterThan(0);   // 参数是本批次字数
  });
});

describe('长回答流式输出（P4）', () => {
  for (const [label, sample] of [['CRLF', ANSWER_CRLF], ['LF', ANSWER_LF]]) {
    it(label + ' 回答定型后包含最后一句，且没有被截断', async () => {
      currentAnswer = sample;
      const body = await askLong();
      expect(body).toBeTruthy();
      const text = body.textContent.replace(/\s+/g, '');
      expect(text).toContain(LAST.replace(/\s+/g, ''));
      for (const i of [1, 6, 12]) expect(text).toContain('要点甲' + i);
      // 粗校验：正文规模与源稿同量级（允许标点/空白差异）
      expect(text.length).toBeGreaterThan(sample.replace(/\s+/g, '').length * 0.9);
    });
  }
});
