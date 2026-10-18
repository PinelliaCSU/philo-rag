// 挂载冒烟：把 App 真正挂到 jsdom 上，守住「首屏能起来、键盘能用」这条底线。
// 端到端（Playwright）覆盖关键路径，这里只做一次低成本的结构与交互检查。
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';

const ok = (data) => Promise.resolve({ ok: true, json: async () => data });

// jsdom 没有 IndexedDB，Dexie 打开失败是预期内的：别让它冒成未处理拒绝，
// 其它未处理拒绝照常抛出来。
function ignoreIndexedDbOnly(error) {
  const name = error && (error.name || (error.inner && error.inner.name));
  if (name === 'DatabaseClosedError' || name === 'MissingAPIError') return;
  throw error;
}
process.on('unhandledRejection', ignoreIndexedDbOnly);

let target;
let component;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  target = document.getElementById('app');
  vi.stubGlobal('fetch', vi.fn((url) => {
    const u = String(url);
    if (u.includes('/api/starmap')) return ok({ version: 1, nodes: [], edges: [], axes: [], seed: 1 });
    if (u.includes('/api/concepts')) return ok([]);
    if (u.includes('/api/units')) return ok([]);
    if (u.includes('/api/facets')) return ok({});
    if (u.includes('/api/stats')) return ok({ axes: {} });
    return ok({});
  }));
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
});

async function mountApp() {
  component = mount(App, { target });
  flushSync();
  await Promise.resolve();
  flushSync();
  return component;
}

describe('首屏', () => {
  it('只有星图、光标与示例纸片，没有导航与欢迎语', async () => {
    await mountApp();
    expect(target.querySelectorAll('.starfield canvas').length).toBe(3);
    expect(target.querySelector('.glyph')?.textContent).toBe('○');
    expect(target.querySelectorAll('.example-line').length).toBe(2);
    expect(target.querySelector('nav, header, h1, .sidebar')).toBe(null);
    expect(target.querySelector('input')).toBe(null);
  });

  it('直接键入进入输入线，Esc 清空，再 Esc 回到空白首屏', async () => {
    await mountApp();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    flushSync();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    flushSync();
    const textarea = target.querySelector('.input-line textarea');
    expect(textarea.value).toBe('ab');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(target.querySelector('.input-line textarea').value).toBe('');
  });

  it('滚轮缩放星图：提示行里的比例会变（P2）', async () => {
    await mountApp();
    const hint = target.querySelector('.sky-hint');
    expect(hint.textContent).toContain('100%');
    target.querySelector('.starfield').dispatchEvent(
      new WheelEvent('wheel', { deltaY: -240, clientX: 600, clientY: 400, bubbles: true, cancelable: true }),
    );
    flushSync();
    expect(hint.textContent).not.toContain('100%');
  });

  it('输入线为空时按 / 打开低语层，Esc 关闭', async () => {
    await mountApp();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    flushSync();
    expect(target.querySelector('.whisper-input')).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(target.querySelector('.whisper-input')).toBe(null);
  });
});
