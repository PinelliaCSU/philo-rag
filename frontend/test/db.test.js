import { describe, expect, it } from 'vitest';
import {
  HISTORY_MAX, buildExportJson, buildFavoritesMarkdown, planLegacyMigration, planTrim,
} from '../src/lib/db.js';

describe('旧 localStorage 迁移', () => {
  it('笔记 → citations，旧批注进 legacyAnnotation', () => {
    const plan = planLegacyMigration({
      notes: [{ chunk_id: 'c1', citation: '哲学大纲 · 1-1', text: '原文', note: '当时的批注', ts: 11 }],
    });
    expect(plan.citations).toHaveLength(1);
    expect(plan.citations[0].legacyAnnotation).toBe('当时的批注');
    expect(plan.citations[0].snippet).toBe('原文');
    expect(plan.citations[0].pinned).toBe(0);
    expect(plan.citations[0].createdAt).toBe(11);
  });

  it('历史条目 → answers，缺 answer 的丢弃', () => {
    const plan = planLegacyMigration({
      answers: [
        { id: 'a1', question: '问', answer: '答', ts: 5, pinned: true },
        { id: 'a2', answer: '' },
      ],
    });
    expect(plan.answers).toHaveLength(1);
    expect(plan.answers[0].pinned).toBe(1);
  });

  it('阅读位置原样带出；坏数据降级为 null', () => {
    expect(planLegacyMigration({ readPos: { code: '1-1', scrollTop: 120 } }).readPos.code).toBe('1-1');
    expect(planLegacyMigration({ readPos: 42 }).readPos).toBe(null);
  });
});

describe('历史裁剪', () => {
  const rows = Array.from({ length: 205 }, (_, i) => ({
    id: 'a' + i,
    createdAt: i,
    pinned: i === 0 ? 1 : 0,
  }));

  it('超出上限时先丢最早的未收藏条目', () => {
    const victims = planTrim(rows, HISTORY_MAX);
    expect(victims).toHaveLength(5);
    expect(victims.includes('a0')).toBe(false);   // 收藏的最早条目留到最后
    expect(victims).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  it('没超上限就不裁', () => {
    expect(planTrim(rows.slice(0, 10), HISTORY_MAX)).toEqual([]);
  });
});

describe('导出', () => {
  it('JSON 含全部 answers / citations / litNodes，不依赖收藏', () => {
    const payload = buildExportJson({
      answers: [{ id: 'a1' }],
      citations: [{ id: 'c1' }],
      litNodes: [{ name: '大他者' }],
    });
    expect(Object.keys(payload).sort()).toEqual(['answers', 'citations', 'exportedAt', 'litNodes', 'meta']);
    expect(payload.answers[0].id).toBe('a1');
  });

  it('Markdown 只导出被收藏的对象，旧批注只读出现', () => {
    const markdown = buildFavoritesMarkdown({
      favorites: [
        { id: 1, type: 'question', refId: '什么是字头？', title: '什么是字头？' },
        { id: 2, type: 'answer', refId: 'a1' },
        { id: 3, type: 'citation', refId: 'c1' },
        { id: 4, type: 'concept', refId: '大他者' },
      ],
      answers: [{ id: 'a1', question: '什么是字头？', answer: '字头是四位编号的首位。', litNodes: ['字头'] }],
      citations: [{ id: 'c1', citation: '哲学大纲 · 1-1', snippet: '原文', legacyAnnotation: '旧批注' }],
      concepts: [{ name: '大他者', definition: '象征秩序的位置' }],
    });
    expect(markdown).toContain('# 星匣导出');
    expect(markdown).toContain('## 问题');
    expect(markdown).toContain('## 回答');
    expect(markdown).toContain('批注：旧批注');
    expect(markdown).toContain('大他者：象征秩序的位置');
    expect(markdown.includes('第二段不该出现') ).toBe(false);
  });
});
