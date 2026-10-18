// 术语匹配与「术语注解」。
//
// 注解必须由渲染产出，而不是渲染之后去改 DOM：
//   · {@html} 块归 Svelte 所有，块一旦重新求值（引用/点亮/文本变化）整块被替换，
//     注入进去的 span 会随之消失，而补标的 $effect 又不会重跑 → 成段丢注解；
//   · 所以这里改成和「引用点」同一套做法：先在文本层插哨兵 ⟦t:名称⟧…⟦/t⟧，
//     走完 Markdown 之后再换成 <span class="term-hit" data-term="…">。

import { protectSegments } from './citations.js';

export function buildTermIndex(concepts) {
  const entries = [];
  for (const concept of concepts || []) {
    const name = String(concept.name || '').trim();
    if (!name) continue;
    entries.push({ term: name, name, alias: false });
    for (const alias of concept.aliases || []) {
      const a = String(alias || '').trim();
      // 单字别名不参与视觉点亮；两字以上才值得在正文上打点
      if (a.length < 2 || a === name) continue;
      entries.push({ term: a, name, alias: true });
    }
  }
  // 长词优先：先吃掉「存在者整体」，就不会再被「存在」重复命中
  entries.sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term));
  return entries;
}

/** 在文本里找出所有不重叠的术语命中，返回 [{ name, start, end }]。 */
export function findTerms(text, index) {
  const source = String(text || '');
  const taken = new Array(source.length).fill(false);
  const hits = [];
  for (const entry of index) {
    let from = 0;
    for (;;) {
      const at = source.indexOf(entry.term, from);
      if (at < 0) break;
      from = at + entry.term.length;
      let free = true;
      for (let i = at; i < at + entry.term.length; i += 1) {
        if (taken[i]) { free = false; break; }
      }
      if (!free) continue;
      for (let i = at; i < at + entry.term.length; i += 1) taken[i] = true;
      hits.push({ name: entry.name, term: entry.term, start: at, end: at + entry.term.length });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** 一次回答最多点亮 8 个直接命中：去重后按首次出现顺序截断。 */
export function topTerms(hits, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    if (seen.has(hit.name)) continue;
    seen.add(hit.name);
    out.push(hit.name);
    if (out.length >= limit) break;
  }
  return out;
}

/** 归一化概念列表（/api/concepts → 匹配索引）。 */
export function indexFromConcepts(list) {
  return buildTermIndex((list || []).map((c) => ({ name: c.name, aliases: c.aliases || [] })));
}

// 哨兵：⟦t:名称⟧命中文本⟦/t⟧。名称里的哨兵字符会被剔除，避免自伤。
const OPEN = '⟦t:';
const CLOSE = '⟧';
const TOKEN = /⟦t:([^⟧]+)⟧([\s\S]*?)⟦\/t⟧/g;

/**
 * 给命中的术语插哨兵（只标 names 里的词，每个块内每词只标第一次出现）。
 * 保护代码块 / 行内代码 / 链接：它们里面的文字不算「正文术语」。
 */
export function annotateTerms(text, names, index) {
  const source = String(text == null ? '' : text);
  const wanted = new Set(names || []);
  if (!source || !wanted.size || !index || !index.length) return source;

  const { text: guarded, restore } = protectSegments(source);
  const hits = findTerms(guarded, index).filter((hit) => wanted.has(hit.name));
  if (!hits.length) return source;

  const seen = new Set();
  let out = '';
  let cursor = 0;
  for (const hit of hits) {
    if (seen.has(hit.name)) continue;
    seen.add(hit.name);
    out += guarded.slice(cursor, hit.start)
      + OPEN + hit.name + CLOSE
      + guarded.slice(hit.start, hit.end)
      + '⟦/t⟧';
    cursor = hit.end;
  }
  out += guarded.slice(cursor);
  return restore(out);
}

/** 哨兵 → 可点击的术语注解（第 5 步，与引用点同一层）。 */
export function replaceTermTokens(html) {
  return String(html || '').replace(TOKEN, (_, name, inner) =>
    '<span class="term-hit" data-term="' + escapeAttr(name) + '">' + inner + '</span>');
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
