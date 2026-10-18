// 术语匹配：只认标准名与多字符别名。
//
// 单字符别名（「道」「理」这类）一旦参与匹配，几乎每个句子里都有它——
// 词典层早就有同样的守卫（lexicon 的 guard），视觉层沿用同一套判断。

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
/** 在已渲染的正文里标出术语命中（只标每个词首次出现），供星图连线与悬停使用。
 *  在 DOM 文本节点上做，而不是在 Markdown 文本上插标记——插标记会影响标题与列表识别。 */
export function markTermHits(root, names, index) {
  if (!root || !names || !names.length) return 0;
  const wanted = new Set(names);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest('.cite-dot, code, .term-hit')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  let marked = 0;
  for (const node of textNodes) {
    if (!marked === 0 && marked >= names.length) break;
    const hits = findTerms(node.nodeValue, index).filter((h) => wanted.has(h.name));
    if (!hits.length) continue;
    const seen = new Set();
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const hit of hits) {
      if (seen.has(hit.name)) continue;     // 每个词只标第一次出现
      seen.add(hit.name);
      frag.append(node.nodeValue.slice(cursor, hit.start));
      const span = document.createElement('span');
      span.className = 'term-hit';
      span.dataset.term = hit.name;
      span.textContent = node.nodeValue.slice(hit.start, hit.end);
      frag.append(span);
      cursor = hit.end;
      marked += 1;
    }
    frag.append(node.nodeValue.slice(cursor));
    node.replaceWith(frag);
  }
  return marked;
}
