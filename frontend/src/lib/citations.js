// 引用映射：把正文里的 [n] 标记搬到句末，变成一颗 3–4px 的圆点。
//
// 为什么必须在文本层做：Markdown 渲染之后 DOM 结构由排版决定，句子边界已经丢失，
// 再想去「把标记挂到它所属句子的末尾」就只能猜。所以顺序是固定的：
//   保护代码/行内代码/链接 → 切句 → 摘出 [n] → 句末插占位符 → Markdown → 占位符换按钮。

const MARKER = /\[(\d{1,3}|E\d{1,3})\]/g;
const PROTOCOL = '\u0000'; // 保护段占位；正文里不可能出现
const TOKEN = /⟦cite:([\dE,]+)(\|p)?⟧/g;

/** 保护代码块 / 行内代码 / Markdown 链接，返回还原函数。 */
export function protectSegments(text) {
  const kept = [];
  const stash = (value) => {
    kept.push(value);
    return PROTOCOL + (kept.length - 1) + PROTOCOL;
  };
  let out = String(text || '');
  out = out.replace(/`{3}[\s\S]*?`{3}/g, stash);       // 围栏代码块
  out = out.replace(/`[^`\n]+`/g, stash);              // 行内代码
  out = out.replace(/\[[^\]]*\]\([^)]*\)/g, stash);       // 链接
  const restore = (value) =>
    value.replace(new RegExp(PROTOCOL + '(\\d+)' + PROTOCOL, 'g'), (_, i) => kept[Number(i)]);
  return { text: out, restore };
}

function splitSentences(paragraph) {
  const out = [];
  const re = /[^。！？；]*[。！？；]|[^。！？；]+$/g;
  let m;
  while ((m = re.exec(paragraph)) !== null) {
    if (m[0].trim().length) out.push(m[0]);
  }
  return out.length ? out : [paragraph];
}

function uniqueIds(markers) {
  const seen = new Set();
  const out = [];
  for (const id of markers) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.sort((a, b) => Number(a.replace(/^E/, '')) - Number(b.replace(/^E/, '')));
}

function idsOf(text) {
  return [...String(text).matchAll(MARKER)].map((m) => m[1]);
}

/**
 * 句子映射：把 [n] 聚合到句末占位符。
 * finishedOnly：流式阶段只给「已经收尾的句子」插点，最后半句等句号到了再说。
 */
export function annotateCitations(source, { finishedOnly = false } = {}) {
  const { text, restore } = protectSegments(source);
  const paragraphs = text.split(/(\n{2,})/);
  let sentenceCount = 0;

  const annotated = paragraphs.map((chunk) => {
    if (/^\n{2,}$/.test(chunk) || !chunk.trim()) return chunk;

    // 段末的标记块：只有当整段不止一句时才按「本段来源」处理
    // （单句段落里的 [n] 属于那句话本身，不是整段引用）
    const trailing = chunk.match(/\s*((?:\[(?:\d{1,3}|E\d{1,3})\]\s*)+)$/);
    let body = chunk;
    let paragraphIds = [];
    if (trailing) {
      body = chunk.slice(0, chunk.length - trailing[0].length);
      paragraphIds = idsOf(trailing[1]);
    }

    const sentences = splitSentences(body).map((sentence) => {
      // 句首的标记属于上一句（它跟在上一句的句号后面）
      const lead = sentence.match(/^(\s*(?:\[(?:\d{1,3}|E\d{1,3})\]\s*)+)/);
      const carry = lead ? idsOf(lead[1]) : [];
      // 标记块后面的那个空格是排版的一部分，摘掉标记后要还回来
      const gap = lead && /\s$/.test(lead[1]) ? ' ' : '';
      const rest = lead ? sentence.slice(lead[1].length) : sentence;
      return { clean: gap + rest.replace(MARKER, ''), ids: uniqueIds(idsOf(rest)), carry };
    });

    // 句首标记回挂到上一句
    for (let i = 1; i < sentences.length; i += 1) {
      if (sentences[i].carry.length) {
        sentences[i - 1].ids = uniqueIds([...sentences[i - 1].ids, ...sentences[i].carry]);
        sentences[i].carry = [];
      }
    }

    const rendered = sentences.map((s, i) => {
      const isLast = i === sentences.length - 1;
      const openEnd = !/[。！？；]\s*$/.test(s.clean.trim()); // 还没收尾的半句
      sentenceCount += 1;
      if (!s.ids.length) return s.clean;
      if (finishedOnly && isLast && openEnd) return s.clean;
      return s.clean + '⟦cite:' + s.ids.join(',') + '⟧';
    });

    if (paragraphIds.length) {
      if (sentences.length === 1) {
        // 单句段落的段末标记就是这句话的来源，按句级处理
        const ids = uniqueIds([...sentences[0].ids, ...paragraphIds]);
        const openEnd = !/[。！？；]\s*$/.test((rendered[0] || '').trim());
        if (!(finishedOnly && openEnd)) rendered[0] = (rendered[0] || '') + '⟦cite:' + ids.join(',') + '⟧';
      } else {
        const lastDone = rendered[rendered.length - 1] || '';
        if (!(finishedOnly && !/[。！？；]\s*$/.test(lastDone.trim()))) {
          rendered[rendered.length - 1] =
            lastDone + '⟦cite:' + uniqueIds(paragraphIds).join(',') + '|p⟧';
        }
      }
    }
    return rendered.join('');
  }).join('');

  return { text: restore(annotated), sentences: sentenceCount };
}

/** 引用点短名：aria-label 与悬停一行都用它，避免整段 citation 文案塞进标签。 */
export function shortSource(entry) {
  if (!entry) return '来源';
  const cite = String(entry.citation || entry.unit_title || '').trim();
  const parts = cite.split('·').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '来源';
  return parts.slice(0, 2).join(' · ');
}

export function citationIndex(citations) {
  const map = new Map();
  for (const entry of citations || []) {
    if (entry == null) continue;
    if (entry.n != null) map.set(String(entry.n), entry);
    if (entry.evidence_id) map.set(String(entry.evidence_id), entry);
  }
  return map;
}

/** 占位符 → 圆点按钮（第 6 步）。ids 命中不到的条目只显示一个无标签的点。 */
export function replaceCitationTokens(html, citations) {
  const map = citationIndex(citations);
  return String(html || '').replace(TOKEN, (_, ids, paragraphScope) => {
    const list = String(ids).split(',').filter(Boolean);
    const first = map.get(list[0]);
    const label = list.length > 1 ? list.length + ' 条来源' : shortSource(first);
    const scope = paragraphScope ? ' data-scope="paragraph"' : '';
    return '<button type="button" class="cite-dot"' +
      ' data-cites="' + list.join(',') + '"' + scope +
      ' title="' + escapeAttr(label) + '"' +      // 悬停给一行极短来源
      ' aria-label="来源：' + escapeAttr(label) + '"></button>';
  });
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** 完整管线：标注 → Markdown → 换成按钮。 */
export function renderAnswerHtml(text, citations, { finishedOnly = false, markdown }) {
  const { text: annotated } = annotateCitations(text, { finishedOnly });
  const html = markdown(annotated);
  return replaceCitationTokens(html, citations);
}
