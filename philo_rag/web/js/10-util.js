/* 10-util.js · 通用工具：选择器、转义、轻量 Markdown、引用标记、通用分页骨架 */
'use strict';
window.PHILO = window.PHILO || {};

const $ = s => document.querySelector(s);

const esc = s => (s ?? '').toString()
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------ 轻量 Markdown ------------------------------
   范围查询的回答是带结构的：四节标题、小节标题、**强调**。后端按 Markdown 输出，
   这里做最小可用渲染——刻意不引入 Markdown 库：本项目要求无构建步骤、离线可用，
   而回答只会用到标题 / 强调 / 列表 / 分隔线 / 行内代码这几种语法。
   所有文本先过 esc()，因此渲染结果是安全的。渲染完成后，正文里的
   [n]/[E0x] 引用标记由 markupCiteRefs() 转成可点击按钮；Markdown 链接
   形如 [文字](url) 不会匹配该模式，已生成的 HTML 标签也不会被误伤。
   ------------------------------------------------------------------------- */
const RE_MD_HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const RE_MD_HR = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RE_MD_UL = /^\s{0,3}[-*+]\s+(.+)$/;
const RE_MD_OL = /^\s{0,3}\d+[.)]\s+(.+)$/;
/* 模型有时漏掉 `###`，只写裸的「① 体系定位」——这种独占一行的圈号短行按小节标题渲染 */
const RE_MD_CIRCLED = /^\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*[^\s。；！？][^。；！？]{0,24}$/;

function mdInline(s) {
  return esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

/* 「术语注解」的列表项：`- **术语**：不超过25字解释` 里的术语转成
   概念卡按钮（data-term 由全局点击监听捕获）。只作用于 `**…**：` 形态，
   普通加粗与引用标记 [n]/[E0x] 不受影响。 */
function mdTermList(s) {
  return esc(s)
    .replace(/\*\*([^*\n]+)\*\*(?=\s*[：:])/g,
      '<button type="button" class="term-link" data-term="$1">$1</button>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

function mdToHtml(text) {
  const out = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${mdInline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };

  for (const line of (text || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) { flushPara(); flushList(); continue; }

    const head = RE_MD_HEADING.exec(line);
    if (head) {
      flushPara(); flushList();
      const tag = head[1].length <= 3 ? 'h4' : 'h5';
      out.push(`<${tag}>${mdInline(head[2])}</${tag}>`);
      continue;
    }
    if (!para.length && !list && RE_MD_HR.test(line)) {
      flushList(); out.push('<hr>'); continue;
    }
    if (!para.length && !list && RE_MD_CIRCLED.test(line)) {
      out.push(`<h4>${mdInline(line.trim())}</h4>`); continue;
    }
    const ul = RE_MD_UL.exec(line);
    const ol = ul ? null : RE_MD_OL.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { flushList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${mdTermList((ul || ol)[1])}</li>`);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return markupCiteRefs(out.join(''));
}

/* 把回答正文里的 [n] / [E0x] 引用标记转成可点击按钮：
   [E0x] → data-ref="x"；[n] → data-ref="n"。用交替匹配先吞掉
   <code> 整段与所有 HTML 标签，只替换真实文本里的标记，
   因此 Markdown 链接（形如 [文字](url)）和标签属性都不会被误伤。 */
function markupCiteRefs(html) {
  return html.replace(/(<code>[^<]*<\/code>|<[^>]*>)|\[(E\d+|\d+)\](?!\()/g, (m, tag, mark) => {
    if (tag) return tag;
    const n = mark[0] === 'E' ? String(parseInt(mark.slice(1), 10)) : mark;
    return `<button type="button" class="cite-ref" data-ref="${n}">[${mark}]</button>`;
  });
}

/* 通用分页：把长列表收进固定区域，用按钮逐页浏览，而不是让页面无限延长 */
function pagerHTML(total, page, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return `<button class="pg" data-pg="prev" ${page <= 0 ? 'disabled' : ''}>‹</button>
    <span class="pg-count">${total ? page + 1 : 0} / ${total ? pages : 0}</span>
    <button class="pg" data-pg="next" ${page >= pages - 1 ? 'disabled' : ''}>›</button>`;
}

/* 分页登记：只记录本页的总数与页码，不绑任何事件。点击统一由 80-app.js 的
   document 级委托处理（PHILO.pager.go），渲染函数因此保持「只读 state、不绑事件」。 */
function wirePager(root, total, page, perPage) {
  if (!root) return;
  root.__pager = { total, page, perPage };
}

window.PHILO.util = Object.assign(window.PHILO.util || {}, {
  $, esc, mdToHtml, mdInline, mdTermList, markupCiteRefs, pagerHTML, wirePager,
});
