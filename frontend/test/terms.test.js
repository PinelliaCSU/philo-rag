import { describe, expect, it } from 'vitest';
import { buildTermIndex, findTerms, indexFromConcepts, topTerms } from '../src/lib/terms.js';

describe('术语匹配', () => {
  const index = buildTermIndex([
    { name: '道', aliases: ['DAO'] },
    { name: '道德', aliases: [] },
    { name: '大他者', aliases: ['大彼者', 'big Other'] },
  ]);

  it('单字别名不参与视觉点亮', () => {
    const withSingle = buildTermIndex([{ name: '理', aliases: ['道'] }]);
    expect(withSingle.some((e) => e.term === '道')).toBe(false);
  });

  it('长别名优先：存在者整体不会被拆成两次命中', () => {
    const longIndex = buildTermIndex([
      { name: '存在', aliases: [] },
      { name: '存在者整体', aliases: [] },
    ]);
    const hits = findTerms('存在者整体不是一个存在者。', longIndex);
    expect(hits[0].name).toBe('存在者整体');
    expect(hits.filter((h) => h.name === '存在').length).toBe(1);
  });

  it('重叠词只保留不重叠的那一份', () => {
    const hits = findTerms('大他者与道德', index);
    const names = hits.map((h) => h.name);
    expect(names).toContain('大他者');
    expect(names).toContain('道德');
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i].start).toBeGreaterThanOrEqual(hits[i - 1].end);
    }
  });

  it('一次回答最多 8 个直接命中，按首次出现顺序去重', () => {
    const names = Array.from({ length: 12 }, (_, i) => '概念' + i);
    const many = buildTermIndex(names.map((n) => ({ name: n, aliases: [] })));
    const hits = findTerms(names.join('、') + '、概念0', many);
    expect(topTerms(hits, 8).length).toBe(8);
    expect(topTerms(hits, 8)[0]).toBe('概念0');
  });

  it('indexFromConcepts 接受 /api/concepts 的形状', () => {
    const idx = indexFromConcepts([{ name: '大他者', aliases: ['大彼者'] }]);
    expect(findTerms('大彼者', idx)[0].name).toBe('大他者');
  });
});
