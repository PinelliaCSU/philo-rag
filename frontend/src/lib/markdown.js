// 轻量 Markdown：只做排版需要的子集（标题 / 段落 / 列表 / 强调 / 行内代码）。
// 不渲染表格与原始 HTML——答案正文里的尖括号一律转义，避免注入。
//
// 换行必须归一：后端（Python）给出的回答是 CRLF（`\r\n`）。如果这里按 `/\n{2,}/` 切块，
// CRLF 的「空行」是 `\n\r\n`，永远匹配不上 → 整篇被当成一个块，
// 再被标题分支吃掉后半段（详见 README 的流式说明）。所以入口先归一成 LF。

const CRLF = /\r\n?/g;

/** 统一换行：CRLF / CR → LF。正文、块、行内三条入口都过它。 */
export function normalizeNewlines(text) {
  return String(text == null ? '' : text).replace(CRLF, '\n');
}

// 空行 = 两行之间只有空白：容错行尾空格与 `\r`
const BLOCK_SPLIT = /\n[ \t]*\n/;

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 行内语法：`code` / **强调** / *斜体*。先转义再替换，标签由本函数自己产出。 */
export function renderInline(text) {
  let out = escapeHtml(normalizeNewlines(text));
  out = out.replace(/`([^`]+)`/g, (_, code) => '<code>' + code + '</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>' + '$1' + '</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>' + '$1' + '</em>');
  // 引用点占位符 ⟦cite:1,3⟧ 原样保留，由 citations.js 在 HTML 上替换成按钮
  return out;
}

/** 把正文切成块；流式渲染只重绘最后一块，前面的块定型后不再碰。 */
export function splitBlocks(text) {
  return normalizeNewlines(text)
    .split(BLOCK_SPLIT)
    .map((raw) => raw.replace(/\s+$/, ''))
    .filter((raw) => raw.length > 0);
}

/** 单个块 → HTML。（标题 / 无序列表 / 有序列表 / 段落） */
export function renderBlock(block) {
  const src = normalizeNewlines(block);
  const lines = src.split('\n');
  const head = lines[0].match(/^(#{1,4})\s+(.*)$/);
  if (head) {
    const level = head[1].length + 1; // # → h2：纸页顶部已有问题行，标题不抢 h1
    const title = '<h' + level + '>' + renderInline(head[2]) + '</h' + level + '>';
    // 标题后面紧跟的内容必须一起渲染：模板后端常给出「### 标题\n- 项目」这种紧凑块，
    // 只返回标题会把整段正文静默丢掉（P4 的直接成因之一）。
    const body = lines.slice(1).join('\n').replace(/^\s*\n+/, '');
    return body.trim() ? title + renderBlock(body) : title;
  }
  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    const items = lines.map((l) => '<li>' + renderInline(l.replace(/^\s*[-*]\s+/, '')) + '</li>');
    return '<ul>' + items.join('') + '</ul>';
  }
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
    const items = lines.map((l) => '<li>' + renderInline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
    return '<ol>' + items.join('') + '</ol>';
  }
  return '<p>' + lines.map(renderInline).join('<br />') + '</p>';
}

/** 全量渲染（定型时调用一次，作为权威版本）。 */
export function renderMarkdown(text) {
  return splitBlocks(text).map(renderBlock).join('');
}

/** 流式过程中只渲染「当前未完成块」：把上一块的收尾也算进来，避免半行闪烁。 */
export function renderTail(text) {
  return renderInline(normalizeNewlines(text)).replace(/\n/g, '<br />');
}
