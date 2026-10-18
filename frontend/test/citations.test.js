import { describe, expect, it } from 'vitest';
import {
  annotateCitations, citationIndex, replaceCitationTokens, shortSource,
} from '../src/lib/citations.js';

const CITE = '⟦cite:';

describe('句子映射', () => {
  it('把句末引用搬到句号的后面', () => {
    const { text } = annotateCitations('大他者是象征秩序的位置。[1] 它并不指某个具体的人。');
    expect(text).toBe('大他者是象征秩序的位置。⟦cite:1⟧ 它并不指某个具体的人。');
  });

  it('同一句里的多个引用先去重再聚合成一个占位符', () => {
    const { text } = annotateCitations('主体是被划杠的。[3][1][3]');
    expect(text).toBe('主体是被划杠的。⟦cite:1,3⟧');
    expect(text.includes(CITE + '1,3⟧')).toBe(true);
  });

  it('只出现在段末的引用挂到最后一句，并标 data-scope="paragraph"', () => {
    const { text } = annotateCitations('第一句。第二句。[2]');
    expect(text.endsWith('⟦cite:2|p⟧')).toBe(true);
    const html = replaceCitationTokens('<p>' + text + '</p>', [{ n: 2, citation: '哲学大纲 · 3-2' }]);
    expect(html).toContain('data-scope="paragraph"');
  });

  it('代码块与行内代码里的方括号不动', () => {
    const source = [
      '前文。',
      '',
      '```js',
      'const x = arr[1];',
      '```',
      '',
      '行内 `a[2]` 也不算引用。',
    ].join('\n');
    const { text } = annotateCitations(source);
    expect(text.includes('arr[1]')).toBe(true);
    expect(text.includes('a[2]')).toBe(true);
    expect(text.includes(CITE)).toBe(false);
  });

  it('流式阶段不给未收尾的半句插点', () => {
    const { text } = annotateCitations('这是一句还没写完的[1]', { finishedOnly: true });
    expect(text.includes(CITE)).toBe(false);
    expect(text.includes('[1]')).toBe(false);
  });
});

describe('占位符 → 圆点按钮', () => {
  it('多引用聚合成一个点，并给出「N 条来源」', () => {
    const html = replaceCitationTokens('<p>句子。⟦cite:1,3⟧</p>', [
      { n: 1, citation: '哲学大纲 · 1-1' },
      { n: 3, citation: '哲学大纲 · 2-2' },
    ]);
    expect(html).toContain('class="cite-dot"');
    expect(html).toContain('data-cites="1,3"');
    expect(html).toContain('aria-label="来源：2 条来源"');
  });

  it('单引用用短来源名做 aria-label', () => {
    const html = replaceCitationTokens('⟦cite:2⟧', [{ n: 2, citation: '哲学大纲 · 3-2 · 第 12 页' }]);
    expect(html).toContain('aria-label="来源：哲学大纲 · 3-2"');
  });

  it('引用索引同时认 n 与 evidence_id', () => {
    const map = citationIndex([{ n: 1 }, { evidence_id: 'E01' }]);
    expect(map.has('1')).toBe(true);
    expect(map.has('E01')).toBe(true);
  });

  it('缺字段时短名不炸', () => {
    expect(shortSource(null)).toBe('来源');
    expect(shortSource({})).toBe('来源');
  });
});
