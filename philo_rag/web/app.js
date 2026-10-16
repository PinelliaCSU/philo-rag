'use strict';

/* ==========================================================================
   哲学大纲 · 知识库 —— 界面逻辑（原生 JS，无构建步骤）

   一个主入口（溯源回答）+ 三个可召唤面板：
     主视图    —— 提问方式可切换（自动判定 / 点查询 / 范围查询），回答与引用分栏，
                  引用来源在固定区域内逐条翻页浏览；
     概念卡    —— 点「术语注解」里的术语或侧栏按钮打开，显示词典卡（定义/出处/
                  单元分布/哲学家谱系/引文），数据来自 /api/concept；
     检索      —— 术语 / 概念 与 引文 / 原话 两种方式分段切换，结果统一分页；
     体系地图  —— 四个字头 × 四个位面（场域/本体/认识/目的）坐标视图，单元可转提问。
   ========================================================================== */

/* ------------------------------ 基础工具 ------------------------------ */
const $ = s => document.querySelector(s);

const esc = s => (s ?? '').toString()
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 后端出错时优先取 JSON 里的 detail，避免界面直接显示 "Internal Server Error" */
async function errText(r) {
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    return j.detail || j.message || t;
  } catch { return t; }
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await errText(r));
  return r.json();
}

async function jpost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await errText(r));
  return r.json();
}

function startTimer(el) {
  const t0 = performance.now();
  return setInterval(() => {
    if (el && el.isConnected) el.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's';
  }, 100);
}

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

/* 流式追加时按帧合并渲染：delta 每秒可上百个，逐个重排会明显卡顿。
   若容器已被 renderAnswer() 换掉（done 时重渲染），这一帧自动作废。 */
let answerFrame = 0;
const ANSWER_BOTTOM_THRESHOLD = 24;

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= ANSWER_BOTTOM_THRESHOLD;
}

function paintAnswer(el, text) {
  cancelAnimationFrame(answerFrame);
  answerFrame = requestAnimationFrame(() => {
    if (!el.isConnected) return;
    const pane = $('#ask-out');
    const followLatest = pane && isNearBottom(pane);
    const scrollTop = pane ? pane.scrollTop : 0;
    el.innerHTML = mdToHtml(text);
    if (pane) pane.scrollTop = followLatest ? pane.scrollHeight : scrollTop;
  });
}

/* 通用分页：把长列表收进固定区域，用按钮逐页浏览，而不是让页面无限延长 */
function pagerHTML(total, page, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return `<button class="pg" data-go="prev" ${page <= 0 ? 'disabled' : ''}>‹</button>
    <span class="pg-count">${total ? page + 1 : 0} / ${total ? pages : 0}</span>
    <button class="pg" data-go="next" ${page >= pages - 1 ? 'disabled' : ''}>›</button>`;
}

function wirePager(root, total, page, perPage, onGo) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  root.querySelectorAll('.pg').forEach(b => {
    b.onclick = () => {
      const next = b.dataset.go === 'prev' ? Math.max(0, page - 1) : Math.min(pages - 1, page + 1);
      if (next !== page) onGo(next);
    };
  });
}

/* ------------------------------ 状态 ------------------------------ */
const state = {
  strategy: 'auto',
  searchMode: 'term',
  ask: null,
  citePage: 0,
  searchItems: [],
  searchPage: 0,
  facets: null,
  units: [],
  unitDetail: null,      // 当前打开的单元导览 {code, items, page, raw}
  notes: [],             // 本地书签与批注（init 时从 localStorage 读入）
  chunkCache: new Map(), // chunk_id → 可收藏的块信息（引用卡 / 概念卡 / 单元块列表写入）
};
const CITE_PER_PAGE = 1;   // 引用来源：逐条浏览
const LIST_PER_PAGE = 4;   // 检索结果：每页 4 条

/* ------------------------------ 提问方式 ------------------------------ */
const STRATEGY = {
  auto: {
    scope: '不指定——由系统按你的措辞自动在下面两种之间选择。',
    egs: ['什么是字头？', '马克思在体系中的位置', '谈谈精神分析'],
  },
  point: {
    scope: '定位式提问：问一个概念 / 术语<b>是什么、出自哪里</b>。召回 8 条最相关的块，回答数百字，每条论断可回跳原文。',
    egs: ['什么是字头？', '大他者是什么意思？', '3-2 讲什么？'],
  },
  theme: {
    scope: '主题式提问：问一个主题<b>在全书中的面貌、脉络与谱系</b>。召回数百块并按数值单元聚合，回答数千字、按体系结构分节。',
    egs: ['马克思在体系中的位置', '谈谈精神分析', '黑格尔的思想脉络'],
  },
};

function setStrategy(s) {
  state.strategy = s;
  document.querySelectorAll('#seg-strategy button')
    .forEach(b => {
      const selected = b.dataset.s === s;
      b.classList.toggle('on', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
  const cfg = STRATEGY[s];
  $('#strategy-scope').innerHTML = cfg.scope;
  $('#strategy-egs').innerHTML = '<span class="label">示例</span>' +
    cfg.egs.map(e => `<button type="button" class="eg" data-q="${esc(e)}">${esc(e)}</button>`).join('');
}

/* ------------------------------ 视图与面板 ------------------------------
   主视图只有一个（溯源回答，永远可见）。检索 / 体系地图 / 概念卡改成
   从右侧面板召唤，用 openPanel() 切换面板内容，closePanel() 回到主视图。 */
const PANEL_TITLES = { concept: '概念卡', search: '术语 / 引文检索', map: '体系地图', notes: '笔记与书签' };

function closePanel() {
  $('#panel').classList.remove('open');
  document.querySelectorAll('#panel-nav .tab').forEach(t => {
    t.classList.remove('on');
    t.setAttribute('aria-pressed', 'false');
  });
}

function openPanel(kind) {
  $('#panel').classList.add('open');
  $('#panel-title').textContent = PANEL_TITLES[kind] || '';
  document.querySelectorAll('.panel-pane').forEach(p =>
    p.classList.toggle('on', p.id === 'pane-' + kind));
  document.querySelectorAll('#panel-nav .tab').forEach(t => {
    const selected = t.dataset.p === kind;
    t.classList.toggle('on', selected);
    t.setAttribute('aria-pressed', String(selected));
  });
  if (kind === 'map' && state.units.length) renderSystemMap();
  if (kind === 'notes') renderNotes();
  if (kind === 'concept') {
    const q = $('#concept-q');
    if (q && !q.value) q.focus();
  }
  // 三个面板共用一个滚动容器：不复位的话，从「检索结果第 N 页」切到地图会落在中段
  const body = $('#panel .panel-body');
  if (body) body.scrollTop = 0;
}

/* 旧的三视图切换调用点（askQuestion / data-toquote）保持兼容 */
function switchView(v) {
  if (v === 'search') openPanel('search');
  else if (v === 'facet') openPanel('map');
  else closePanel();
}

/* ------------------------------ 溯源回答 ------------------------------ */
function strategyTag(r) {
  if (r.skipped) return '已跳过';
  return r.strategy === 'theme' ? '范围查询' : '点查询';
}

function renderAnswer(r) {
  const out = $('#ask-out');
  const scrollTop = out.scrollTop;
  if (r.skipped) {
    out.innerHTML = `<div class="card"><h3>已跳过检索</h3>
      <div class="ans">${mdToHtml(r.answer)}</div>
      <div class="muted">判定类别：${esc((r.gate || {}).category || '')}</div></div>`;
    out.scrollTop = scrollTop;
    return;
  }
  let h = '';
  if (r.strategy === 'theme' && r.theme) {
    const c = r.theme.counts;
    const units = r.theme.units.slice(0, 10).map(u =>
      `<span class="unit">${esc(u.code || '前言')}</span> ${esc(u.title)} <span class="muted">${u.hits}块</span>`
    ).join('　');
    const lin = (r.theme.lineage || []).slice(0, 12)
      .map(([n, k]) => `<span class="tag">${esc(n)} ${k}</span>`).join('');
    h += `<div class="card"><h3>聚合概览 <span class="muted heading-note">· 范围查询</span></h3>
      <div class="muted">直接命中 ${c.direct} 块（元数据 ${c.meta} + 字面 ${c.literal}），占语料 ${(c.direct / c.corpus * 100).toFixed(1)}%，分布于 ${c.unit_total} 个单元${r.theme.seed_mode ? '；主题未登录词典，锚点由种子检索反推' : ''}</div>
      <div class="overview-units">${units}</div>
      <div class="overview-lineage">${lin}</div></div>`;
  }

  /* 术语注解：done.answer 只含 sections，注解在 annotations 里单独携带。
     转成 Markdown 走 mdToHtml()，让 `**术语**` 经 mdTermList 变成概念卡按钮；
     文本在构造 Markdown 前先清洗换行（esc 交给 mdToHtml 内部做）。 */
  const anns = (r.annotations || [])
    .map(a => ({
      term: String(a.term ?? '').replace(/[\r\n]+/g, ' ').trim(),
      explanation: String(a.explanation ?? '').replace(/[\r\n]+/g, ' ').trim(),
    }))
    .filter(a => a.term && a.explanation);
  const annBlock = anns.length
    ? `<div class="ans">${mdToHtml('## 术语注解\n\n' + anns.map(a => `- **${a.term}**：${a.explanation}`).join('\n'))}</div>`
    : '';

  h += `<div class="card"><h3>回答 <span class="muted heading-note">· ${strategyTag(r)}</span></h3>
    <div class="ans">${mdToHtml(r.answer)}</div>${annBlock}</div>`;
  out.innerHTML = h;
  out.scrollTop = scrollTop;
}

function citeCard(c) {
  const ph = (c.philosophers || []).map(x => `<span class="tag">${esc(x)}</span>`).join('');
  const cc = (c.concepts || []).map(x => `<span class="tag">${esc(x)}</span>`).join('');
  /* 四层坐标注解（场域论=2 等）：结构维度，颜色比概念标签淡一档 */
  const cd = (c.coords || []).map(x => `<span class="tag tag-coord">${esc(x)}</span>`).join('');
  const head = c.unit ? `<span class="unit">${esc(c.unit)}</span> ${esc(c.unit_title || '')}` : '';
  const n = c.n ?? '';
  const text = c.text || '';
  /* evidence 来源的 text 被后端截到 1200 字，达到该长度视为可能截断 */
  const truncated = text.length >= 1200;
  return `<div class="cite" id="cite-${esc(n)}">
    <div class="meta"><b>[${n}]</b> ${esc(c.citation)}</div>
    <div class="cite-tags">${head} ${cd}${ph}${cc}</div>
    <div class="body cite-body" data-truncated="${truncated ? 1 : 0}" data-loaded="0">${esc(text)}</div>
    <div class="foot">
      <button class="ghost cite-toggle" data-toggle="${esc(n)}">${truncated ? '展开全文' : '收起'}</button>
      <button class="ghost" data-ctx="${esc(c.chunk_id)}">查看上下文</button>
      <button class="ghost" data-bookmark="${esc(c.chunk_id)}">☆ 收藏</button>
      <span class="muted cite-expand-err" hidden></span>
    </div>
  </div>`;
}

function renderCitations(r) {
  const list = r.citations || [];
  const pane = $('#cite-cards'), pager = $('#cite-pager');
  if (!list.length) {
    pane.innerHTML = '<div class="muted">本次回答没有引用来源。</div>';
    pager.innerHTML = '';
    return;
  }
  const pages = Math.max(1, Math.ceil(list.length / CITE_PER_PAGE));
  const p = Math.min(state.citePage, pages - 1);
  state.citePage = p;
  const slice = list.slice(p * CITE_PER_PAGE, p * CITE_PER_PAGE + CITE_PER_PAGE);
  slice.forEach(c => {
    if (c.chunk_id) {
      state.chunkCache.set(c.chunk_id, {
        chunk_id: c.chunk_id, citation: c.citation, unit: c.unit,
        unit_title: c.unit_title, text: c.text,
      });
    }
  });
  pane.innerHTML = slice.map(citeCard).join('');
  pane.scrollTop = 0;
  pager.innerHTML = pagerHTML(list.length, p, CITE_PER_PAGE);
  wirePager(pager, list.length, p, CITE_PER_PAGE, n => { state.citePage = n; renderCitations(r); });
  syncBookmarkButtons();
}

/* 点回答正文里的引用标记：收起面板 → 切到对应页 → 滚动到卡片 → flash 高亮 */
function jumpToCite(ref) {
  closePanel();
  const r = state.ask;
  const list = (r && r.citations) || [];
  const idx = list.findIndex(c => String(c.n) === String(ref));
  if (idx === -1) return;

  const page = Math.floor(idx / CITE_PER_PAGE);
  if (state.citePage !== page) {
    state.citePage = page;
    renderCitations(r);
  }

  const card = document.getElementById('cite-' + ref);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  card.classList.remove('cite-flash');
  void card.offsetWidth;               // 强制重排，保证连续点击也能重新触发过渡
  card.classList.add('cite-flash');
  setTimeout(() => card.classList.remove('cite-flash'), 1500);
}

function refreshCiteToggle(citeEl) {
  const btn = citeEl.querySelector('.cite-toggle');
  const body = citeEl.querySelector('.cite-body');
  if (!btn || !body) return;
  const collapsed = citeEl.classList.contains('cite-collapsed');
  const truncated = body.dataset.truncated === '1';
  const loaded = body.dataset.loaded === '1';
  if (collapsed || (truncated && !loaded)) btn.textContent = '展开全文';
  else btn.textContent = '收起';
}

/* 引用卡片的展开/收起：截断文本点「展开全文」时用 chunk_id 取回完整原文 */
async function toggleCite(btn) {
  const citeEl = btn.closest('.cite');
  if (!citeEl) return;
  const body = citeEl.querySelector('.cite-body');
  const collapsed = citeEl.classList.contains('cite-collapsed');
  const truncated = body.dataset.truncated === '1';
  const loaded = body.dataset.loaded === '1';

  if (!collapsed && truncated && !loaded) {
    const n = btn.dataset.toggle;
    const list = (state.ask && state.ask.citations) || [];
    const c = list.find(x => String(x.n) === String(n));
    if (!c || !c.chunk_id) {
      citeEl.classList.add('cite-collapsed');
      refreshCiteToggle(citeEl);
      return;
    }
    const errEl = citeEl.querySelector('.cite-expand-err');
    if (errEl) errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = '加载中…';
    try {
      const r = await jget('/api/context?chunk_id=' + encodeURIComponent(c.chunk_id) + '&window=2');
      const focus = (r.items || []).find(it => it.is_focus) || (r.items || [])[0];
      if (!focus || !focus.text) throw new Error('上下文里没有命中块');
      body.textContent = focus.text;
      body.dataset.loaded = '1';
      body.dataset.truncated = '0';
      citeEl.classList.remove('cite-collapsed');
    } catch (e) {
      if (errEl) { errEl.hidden = false; errEl.textContent = '展开全文失败：' + e.message; }
    } finally {
      btn.disabled = false;
      refreshCiteToggle(citeEl);
    }
    return;
  }

  citeEl.classList.toggle('cite-collapsed', !collapsed);
  refreshCiteToggle(citeEl);
}

/* 同一时刻只保留最新一条提问流。流式期间示例、澄清选项、地图入口都还能点，
   没有这个序号，旧流的 done 会用旧 meta 重新渲染，把新答案覆盖掉；
   state.ask / citePage 也会被两股流轮流重置。 */
let askSeq = 0;
let askAbort = null;

async function doAsk(q, strategy, focus) {
  const strat = strategy || state.strategy;
  const out = $('#ask-out');
  const seq = ++askSeq;
  if (askAbort) askAbort.abort();
  const ac = new AbortController();
  askAbort = ac;
  const stale = () => seq !== askSeq;

  out.innerHTML = '<div class="card muted">检索并生成中… <b id="ask-t">0.0s</b></div>';
  $('#cite-cards').innerHTML = '<div class="muted">—</div>';
  $('#cite-pager').innerHTML = '';
  const tick = startTimer($('#ask-t'));
  $('#ask-btn').disabled = true;
  try {
    // 流式 SSE：先收到 meta（引用面板就绪），再逐字追加回答正文
    const r = await fetch('/api/ask_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, strategy: strat, focus }),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(await errText(r));

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let meta = null;
    let answerText = '';
    let answerEl = null;
    let clarify = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (stale()) return;   // 已被新提问接管：停止消费这条流
      buf += decoder.decode(value, { stream: true });
      // SSE 事件以 \n\n 分隔
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = block.trim();
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        if (event.type === 'meta') {
          meta = event;
          answerText = '';
          state.citePage = 0;
          state.ask = event;
          if (event.strategy === 'clarify') {
            clarify = true;
            answerEl = null;
            renderClarifyCard(event);
            $('#cite-cards').innerHTML = '<div class="muted">—</div>';
            $('#cite-pager').innerHTML = '';
            continue;
          }
          // 构建回答框架：先空容器，后续 delta 逐帧追加渲染
          renderAnswerSkeleton(event);
          renderCitations(event);
          answerEl = $('#ask-answer-text');
        } else if (event.type === 'delta') {
          if (clarify) continue;
          answerText += event.text;
          if (answerEl) paintAnswer(answerEl, answerText);
        } else if (event.type === 'done') {
          // 最终清理（去掉模型可能输出的来源行）。sections/annotations 在
          // meta 阶段被后端置空，done 事件里才是解析后的真值，必须一并合入，
          // 否则最终渲染会覆盖掉流式期间已显示的「术语注解」。
          if (clarify) continue;
          if (meta) {
            meta.answer = event.answer;
            state.ask = {
              ...meta,
              answer: event.answer,
              sections: event.sections || [],
              annotations: event.annotations || [],
            };
            renderAnswer(state.ask);
          }
        } else if (event.type === 'error') {
          out.innerHTML = `<div class="err">${esc(event.detail)}</div>`;
        }
      }
    }

    // 如果没有收到任何事件（如网关跳过），回退到旧接口
    if (!meta) {
      const r2 = await jpost('/api/ask', { question: q, strategy: strat, focus });
      if (stale()) return;
      state.ask = r2;
      state.citePage = 0;
      if (r2.strategy === 'clarify') {
        renderClarifyCard(r2);
        $('#cite-cards').innerHTML = '<div class="muted">—</div>';
        $('#cite-pager').innerHTML = '';
      } else {
        renderAnswer(r2);
        renderCitations(r2);
      }
    }
  } catch (e) {
    if (stale()) return;   // 旧请求被 abort() 打断属正常路径，不报错
    out.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally {
    clearInterval(tick);
    if (!stale()) $('#ask-btn').disabled = false;
  }
}

/* 流式专用：先搭骨架，delta 逐帧追加渲染 */
function renderAnswerSkeleton(r) {
  const out = $('#ask-out');
  if (r.skipped) {
    out.innerHTML = `<div class="card"><h3>已跳过检索</h3>
      <div class="ans">${mdToHtml(r.answer || '')}</div>
      <div class="muted">判定类别：${esc((r.gate || {}).category || '')}</div></div>`;
    return;
  }
  let h = '';
  if (r.strategy === 'theme' && r.theme) {
    const c = r.theme.counts;
    const units = r.theme.units.slice(0, 10).map(u =>
      `<span class="unit">${esc(u.code || '前言')}</span> ${esc(u.title)} <span class="muted">${u.hits}块</span>`
    ).join('　');
    const lin = (r.theme.lineage || []).slice(0, 12)
      .map(([n, k]) => `<span class="tag">${esc(n)} ${k}</span>`).join('');
    h += `<div class="card"><h3>聚合概览 <span class="muted heading-note">· 范围查询</span></h3>
      <div class="muted">直接命中 ${c.direct} 块（元数据 ${c.meta} + 字面 ${c.literal}），占语料 ${(c.direct / c.corpus * 100).toFixed(1)}%，分布于 ${c.unit_total} 个单元${r.theme.seed_mode ? '；主题未登录词典，锚点由种子检索反推' : ''}</div>
      <div class="overview-units">${units}</div>
      <div class="overview-lineage">${lin}</div></div>`;
  }
  const tag = r.skipped ? '已跳过' : (r.strategy === 'theme' ? '范围查询' : '点查询');
  h += `<div class="card"><h3>回答 <span class="muted heading-note">· ${tag}</span></h3>
    <div class="ans" id="ask-answer-text"></div></div>`;
  out.innerHTML = h;
  out.scrollTop = 0;
}

/* 宽泛主题澄清卡：meta.strategy === 'clarify' 时渲染，忽略后续 delta/done */
function renderClarifyCard(r) {
  const out = $('#ask-out');
  const opts = (r.options || []).map(o => `
    <button type="button" class="clarify-option"
      data-q="${esc(o.question)}" data-s="${esc(o.strategy)}" data-f="${esc(o.focus)}">
      <span class="clarify-label">${esc(o.label)}</span>
      <span class="muted">${esc(o.question)}</span>
    </button>`).join('');
  out.innerHTML = `<div class="card clarify-card">
    <h3>追问 <span class="muted heading-note">· 宽泛主题</span></h3>
    <div class="muted clarify-hint">这个问题比较宽泛，你想先看哪个方向？</div>
    <div class="clarify-topic">主题：<b>${esc(r.topic)}</b></div>
    <div class="clarify-options">${opts}</div>
  </div>`;
  out.scrollTop = 0;
}

function askQuestion(q, strategy) {
  setStrategy(strategy || 'auto');
  switchView('ask');
  $('#q').value = q;
  doAsk(q, strategy || state.strategy);
}

/* ------------------------------ 检索（术语 / 引文） ------------------------------ */
const SEARCH = {
  term: {
    scope: '问「某个术语 / 概念<b>是什么、在哪儿出现</b>」：先给词典卡（归属、别名、定义），再用语义检索补充相关段落。',
    placeholder: '例如：大他者 / 客体小a / 场域论 / 存在者整体',
    button: '检索术语',
  },
  quote: {
    scope: '问「<b>谁说过什么原话</b>、某个单元里有哪些引文」：按理论家 / 说话人 / 概念 / 单元精确过滤引文块，结果可枚举、可核对，不做向量近似。',
    button: '检索引文',
  },
};

function buildSearchForm() {
  const m = state.searchMode;
  $('#search-scope').innerHTML = SEARCH[m].scope;
  document.querySelectorAll('#seg-search button')
    .forEach(b => {
      const selected = b.dataset.m === m;
      b.classList.toggle('on', selected);
      b.setAttribute('aria-pressed', String(selected));
    });

  if (m === 'term') {
    $('#search-form').innerHTML =
      `<input type="text" id="t-q" placeholder="${esc(SEARCH.term.placeholder)}">
       <button id="t-go">${SEARCH.term.button}</button>`;
    $('#t-go').onclick = () => runTerm();
    $('#t-q').addEventListener('keydown', e => { if (e.key === 'Enter') runTerm(); });
  } else {
    $('#search-form').innerHTML =
      `<select id="q-unit"><option value="">不限单元</option></select>
       <select id="q-phil"><option value="">不限理论家</option></select>
       <select id="q-speaker"><option value="">不限说话人</option></select>
       <select id="q-concept"><option value="">不限概念</option></select>
       <input type="text" id="q-kw" class="quote-keyword" placeholder="引文关键词（可选）">
       <button id="q-go">${SEARCH.quote.button}</button>`;
    fillQuoteSelects();
    $('#q-go').onclick = () => runQuote();
    $('#q-kw').addEventListener('keydown', e => { if (e.key === 'Enter') runQuote(); });
  }
  resetSearchResults();
}

function resetSearchResults() {
  state.searchItems = [];
  state.searchPage = 0;
  $('#search-head').innerHTML = '';
  $('#search-list').innerHTML = '<div class="muted">输入条件后开始检索。</div>';
  $('#search-pager').innerHTML = '';
}

function fillQuoteSelects() {
  if (!state.facets) return;
  const f = state.facets;
  const opts = (items, withCount) => items.map(it => {
    const [name, n] = Array.isArray(it) ? it : [it, null];
    const label = (withCount && n != null) ? `${name}（${n}）` : name;
    return `<option value="${esc(name)}">${esc(label)}</option>`;
  }).join('');
  const put = (sel, firstLabel, body) => {
    const el = $(sel);
    if (el) el.innerHTML = `<option value="">${esc(firstLabel)}</option>` + body;
  };
  put('#q-unit', '不限单元', opts(state.units.map(u => u.code)));
  put('#q-phil', '不限理论家', opts(f.philosopher.slice(0, 80), true));
  put('#q-speaker', '不限说话人', opts(f.speaker || [], true));
  put('#q-concept', '不限概念', opts(f.concept.slice(0, 120), true));
}

function renderSearchItems(items, emptyMsg) {
  state.searchItems = items;
  state.searchPage = 0;
  paintSearchPage(emptyMsg);
}

function paintSearchPage(emptyMsg) {
  const items = state.searchItems;
  const list = $('#search-list'), pager = $('#search-pager');
  if (!items.length) {
    list.innerHTML = `<div class="muted">${esc(emptyMsg || '无命中。')}</div>`;
    pager.innerHTML = '';
    return;
  }
  const pages = Math.max(1, Math.ceil(items.length / LIST_PER_PAGE));
  const p = Math.min(state.searchPage, pages - 1);
  state.searchPage = p;
  list.innerHTML = items.slice(p * LIST_PER_PAGE, p * LIST_PER_PAGE + LIST_PER_PAGE).join('');
  pager.innerHTML = pagerHTML(items.length, p, LIST_PER_PAGE);
  wirePager(pager, items.length, p, LIST_PER_PAGE, n => { state.searchPage = n; paintSearchPage(emptyMsg); });
}

function termHeadCard(term, r) {
  if (!r.card) {
    return `<div class="card muted">词典未收录「${esc(term)}」，以下为语义检索结果。</div>`;
  }
  return `<div class="card">
    <h3>${esc(r.card.name)}</h3>
    <div class="muted">别名：${esc((r.card.aliases || []).join('、') || '—')}　归属：${esc(r.card.philosopher)}（${esc(r.card.lifespan)}，${esc(r.card.era)}）</div>
    <p class="term-definition">${esc(r.card.definition)}</p>
    <div class="term-actions">
      <button class="ghost" data-toquote="${esc(r.card.name)}">在引文中检索「${esc(r.card.name)}」</button>
    </div>
  </div>`;
}

function termHitCard(c, kind) {
  const ph = (c.philosophers || []).map(x => `<span class="tag">${esc(x)}</span>`).join('');
  const head = c.unit ? `<span class="unit">${esc(c.unit)}</span> ${esc(c.unit_title || '')}` : '';
  const score = c.score != null ? `　<span class="muted">score=${c.score}</span>` : '';
  return `<div class="cite">
    <div class="meta"><span class="tag">${kind}</span> ${esc(c.citation)}${score}</div>
    <div class="cite-tags">${head} ${ph}</div>
    <div class="body">${esc(c.text)}</div>
  </div>`;
}

function quoteCard(q) {
  return `<div class="quote">「${esc(q.text)}」
    <div class="meta muted quote-meta">—— ${esc(q.speaker || '未署名')}　<span class="unit">${esc(q.unit || '—')}</span> ${esc(q.unit_title || '')}<br>${esc(q.citation)}</div>
  </div>`;
}

async function runTerm(termArg) {
  const term = (termArg ?? $('#t-q').value).trim();
  if (!term) return;
  $('#t-q').value = term;
  $('#search-head').innerHTML = '';
  $('#search-list').innerHTML = '<div class="muted">检索中…</div>';
  $('#search-pager').innerHTML = '';
  try {
    const r = await jget('/api/term?term=' + encodeURIComponent(term));
    $('#search-head').innerHTML = termHeadCard(term, r);
    renderSearchItems([
      ...r.exact_hits.map(c => termHitCard(c, '精确')),
      ...r.semantic_hits.map(c => termHitCard(c, '语义')),
    ], '无命中。换个说法，或到「引文 / 原话」里按理论家浏览。');
  } catch (e) {
    $('#search-list').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

async function runQuote() {
  const p = new URLSearchParams();
  const map = { 'q-unit': 'unit', 'q-phil': 'philosopher', 'q-speaker': 'speaker', 'q-concept': 'concept' };
  for (const [id, key] of Object.entries(map)) {
    const el = $('#' + id);
    if (el && el.value) p.set(key, el.value);
  }
  const kw = $('#q-kw');
  if (kw && kw.value.trim()) p.set('keyword', kw.value.trim());
  p.set('limit', '40');

  $('#search-head').innerHTML = '';
  $('#search-list').innerHTML = '<div class="muted">检索中…</div>';
  $('#search-pager').innerHTML = '';
  try {
    const r = await jget('/api/quote?' + p.toString());
    const cond = Object.entries(r.filters || {}).map(([k, v]) => `${k}=${v}`).join('、');
    $('#search-head').innerHTML =
      `<div class="card muted">命中 <b>${r.count}</b> 条引文${cond ? '（筛选：' + esc(cond) + '）' : ''}</div>`;
    renderSearchItems(r.quotes.map(quoteCard), '无命中，试试放宽筛选条件。');
  } catch (e) {
    $('#search-list').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

/* ------------------------------ 概念卡侧栏 ------------------------------
   纯渲染函数 renderConceptCard(r)：不触碰 DOM，便于单测。
   /api/concept 契约：{term, aliases[], found, definition{text, unit, unit_title,
   page, char_span, citation, chunk_id}, units[{code,title,hits}],
   philosophers[{name,count}], related[{name,count}], themes[name],
   quotes[{chunk_id,text,speaker,unit,citation}]}。
   防御性处理：found=false、请求失败、404 一律显示「未收录或服务不可用」。
   「相关概念」「所属主题」是可点击的导航入口：前者翻到对应概念卡，后者直接发起范围查询。 */
function renderConceptCard(r) {
  if (!r || !r.found) {
    return '<div class="card muted">未收录或服务不可用。</div>';
  }
  const def = r.definition || {};
  const aliases = (r.aliases || []).filter(a => a && a !== r.term);
  const src = [];
  if (def.unit) {
    src.push(`<button type="button" class="ghost concept-src" data-map-unit="${esc(def.unit)}">
      ${esc(def.unit)} ${esc(def.unit_title || '')}</button>`);
  }
  if (def.citation) src.push(`<span class="muted">${esc(def.citation)}</span>`);
  if (def.page != null) src.push(`<span class="muted">p.${esc(def.page)}</span>`);
  if (def.char_span) src.push(`<span class="muted">${esc(def.char_span)}</span>`);
  if (def.chunk_id) {
    src.push(`<button type="button" class="ghost" data-ctx="${esc(def.chunk_id)}">查看上下文</button>`);
  }

  const units = (r.units || []).map(u =>
    `<button type="button" class="chip concept-unit" data-map-unit="${esc(u.code)}">
       <span class="unit">${esc(u.code)}</span><span>${esc(u.title || '')}</span>
       <b>${u.hits != null ? u.hits + ' 块' : ''}</b>
     </button>`).join('');

  const phils = (r.philosophers || []).map(p =>
    `<span class="tag">${esc(p.name)} <span class="muted">${p.count}</span></span>`).join('');

  const related = (r.related || []).map(x =>
    `<button type="button" class="chip related-chip" data-concept="${esc(x.name)}">
       <span>${esc(x.name)}</span><b>${x.count}</b>
     </button>`).join('');

  const themes = (r.themes || []).map(t =>
    `<button type="button" class="chip theme-chip"
             data-ask="${esc(t)}在体系中的位置" data-ask-strategy="theme">
       <span>主题：${esc(t)}</span>
     </button>`).join('');

  const quotes = (r.quotes || []).map(q => {
    const acts = [
      q.chunk_id ? `<button class="ghost" data-ctx="${esc(q.chunk_id)}">查看上下文</button>` : '',
      q.chunk_id ? `<button class="ghost" data-bookmark="${esc(q.chunk_id)}">☆ 收藏</button>` : '',
    ].filter(Boolean).join(' ');
    return `<div class="quote">「${esc(q.text)}」
       <div class="meta muted quote-meta">—— ${esc(q.speaker || '未署名')}　
         <span class="unit">${esc(q.unit || '—')}</span><br>${esc(q.citation || '')}</div>
       ${acts ? `<div class="foot">${acts}</div>` : ''}
     </div>`;
  }).join('');

  return `<div class="concept-card">
    <div class="card concept-hero">
      <div class="muted">术语词典</div>
      <h2>${esc(r.term)}</h2>
      ${aliases.length ? `<div class="muted">别名：${esc(aliases.join('、'))}</div>` : ''}
      <div class="term-actions">
        <button class="ghost" data-ask="什么是${esc(r.term)}？" data-ask-strategy="point">问：什么是${esc(r.term)}？</button>
        <button class="ghost" data-ask="${esc(r.term)}在体系中的位置" data-ask-strategy="theme">${esc(r.term)}在体系中的位置</button>
      </div>
    </div>
    <div class="card">
      <h3>定义</h3>
      <p class="concept-definition">${esc(def.text || '—')}</p>
      ${src.length ? `<div class="concept-source">出处：${src.join('　')}</div>` : ''}
    </div>
    ${units ? `<div class="card"><h3>单元分布</h3><div class="grid concept-grid">${units}</div></div>` : ''}
    ${phils ? `<div class="card"><h3>哲学家谱系</h3><div class="concept-lineage">${phils}</div></div>` : ''}
    ${related ? `<div class="card"><h3>相关概念 <span class="muted heading-note">· 同块共现</span></h3>
      <div class="grid concept-grid">${related}</div>
      <div class="muted heading-note">按「与该概念出现在同一块」的次数排序，点击进入对应概念卡。</div></div>` : ''}
    ${themes ? `<div class="card"><h3>所属主题</h3><div class="concept-lineage">${themes}</div></div>` : ''}
    ${quotes ? `<div class="card"><h3>引文</h3>${quotes}</div>` : ''}
  </div>`;
}

async function loadConcept(term) {
  const t = (term || '').trim();
  if (!t) return;
  const out = $('#concept-out');
  $('#concept-q').value = t;
  out.innerHTML = '<div class="muted">加载中…</div>';
  try {
    const r = await jget('/api/concept?term=' + encodeURIComponent(t) + '&limit=8');
    rememberConceptChunks(r);
    out.innerHTML = renderConceptCard(r);
    syncBookmarkButtons();
  } catch (e) {
    out.innerHTML = '<div class="card muted">未收录或服务不可用。</div>';
  }
}

/* 把概念卡里的定义块与引文块登记进 chunk 缓存：收藏按钮只需要 chunk_id，
   取文案时从这里查（避免把长文本塞进 data-* 属性）。 */
function rememberConceptChunks(r) {
  const def = r.definition;
  if (def && def.chunk_id) {
    state.chunkCache.set(def.chunk_id, {
      chunk_id: def.chunk_id, citation: def.citation, unit: def.unit,
      unit_title: def.unit_title, text: def.text,
    });
  }
  (r.quotes || []).forEach(q => {
    if (q.chunk_id) {
      state.chunkCache.set(q.chunk_id, {
        chunk_id: q.chunk_id, citation: q.citation, unit: q.unit,
        unit_title: '', text: q.text,
      });
    }
  });
}

function openConcept(term) {
  openPanel('concept');
  if (term) loadConcept(term);
}

/* ------------------------------ 体系地图 ------------------------------
   四个字头（编号首位）× 四个位面（depth）的坐标视图。数据只用
   /api/facets（unit 计数等）与 /api/units（code/title/depth/volume）。
   点击单元 → 显示该单元标题与信息 → 一键用该单元发起提问。 */
const HEAD_NAMES = { '1': '形而下学', '2': '形而上学', '3': '观念论', '4': '实践' };
const LAYER_NAMES = ['场域论', '本体论', '认识论', '目的论'];

function headIndex(code) {
  const h = String(code || '').split('-')[0];
  return HEAD_NAMES[h] ? Number(h) : 0;
}

function layerIndex(u) {
  const d = Number(u.depth);
  if (d >= 1 && d <= 4) return d;
  const segs = String(u.code || '').split('-').length;
  return Math.max(1, Math.min(4, segs));
}

function mapUnitChip(u, hits) {
  return `<button type="button" class="chip map-unit" data-map-code="${esc(u.code)}">
    <span class="unit">${esc(u.code)}</span><span>${esc(u.title || '')}</span>
    ${hits ? `<b>${hits}</b>` : ''}
  </button>`;
}

function renderSystemMap() {
  if (!state.units.length) return;
  const f = state.facets || { concept: [], philosopher: [] };
  const hitByCode = {};
  (f.unit || []).forEach(([k, n]) => { hitByCode[k] = n; });

  const cells = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => []));
  let unplaced = 0;
  state.units.forEach(u => {
    const x = headIndex(u.code) - 1;
    const y = layerIndex(u) - 1;
    if (x >= 0 && x < 4 && y >= 0 && y < 4) cells[x][y].push(u);
    else unplaced++;
  });

  let h = `<div class="card map-hero">
      <div class="muted">知识结构导航</div>
      <h2>体系地图 · 字头 × 位面</h2>
      <div class="stat-grid">
        <div class="stat-box"><b>${state.units.length}</b><span>数值单元</span></div>
        <div class="stat-box"><b>${new Set(state.units.map(u => u.volume)).size}</b><span>卷</span></div>
        <div class="stat-box"><b>${f.concept.length}</b><span>核心概念</span></div>
      </div></div>`;

  h += `<div class="card muted map-guide">列 = 四个字头；行 = 四个位面。
        点击任一单元，下方显示单元信息，可一键用该单元发起提问。</div>`;

  h += '<div class="map-grid">';
  h += '<div class="map-corner"></div>';
  for (let x = 1; x <= 4; x++) {
    h += `<div class="map-colhead"><b>${esc(HEAD_NAMES[String(x)])}</b>
          <span class="muted">第 ${x} 字头</span></div>`;
  }
  for (let y = 0; y < 4; y++) {
    h += `<div class="map-rowhead"><b>${esc(LAYER_NAMES[y])}</b>
          <span class="muted">位面 ${y + 1}</span></div>`;
    for (let x = 0; x < 4; x++) {
      const list = cells[x][y];
      h += `<div class="map-cell">
        <div class="map-cell-head muted">${esc(HEAD_NAMES[String(x + 1)])} · ${esc(LAYER_NAMES[y])} · ${list.length} 单元</div>
        ${list.map(u => mapUnitChip(u, hitByCode[u.code])).join('') || '<span class="muted">—</span>'}
      </div>`;
    }
  }
  h += '</div>';
  if (unplaced) h += `<div class="muted map-note">${unplaced} 个单元未归入 4×4 字头/位面。</div>`;
  h += '<div class="card map-detail" id="map-detail"></div>';
  $('#map-out').innerHTML = h;
}

/* 单元导览：先渲染已知元信息，再拉 /api/unit 补内容（块列表 / 术语 / 理论家 / 子单元）。
   块列表按阅读顺序分页，每块都能「查看上下文」或收藏；子单元可继续点进去。 */
const UNIT_PER_PAGE = 6;

function blockItem(c) {
  const head = c.unit ? `<span class="unit">${esc(c.unit)}</span> ${esc(c.unit_title || '')}` : '';
  const body = String(c.text || '');
  const shown = body.length > 400 ? body.slice(0, 400) + '…' : body;
  return `<div class="block-item">
    <div class="meta muted">${head} ${esc(c.citation || '')}</div>
    <div class="body block-text">${esc(shown)}</div>
    <div class="foot">
      <button class="ghost" data-ctx="${esc(c.chunk_id)}">查看上下文</button>
      <button class="ghost" data-bookmark="${esc(c.chunk_id)}">☆ 收藏</button>
    </div>
  </div>`;
}

function rememberUnitChunks(items) {
  (items || []).forEach(c => {
    if (c.chunk_id) {
      state.chunkCache.set(c.chunk_id, {
        chunk_id: c.chunk_id, citation: c.citation, unit: c.unit,
        unit_title: c.unit_title, text: c.text,
      });
    }
  });
}

function renderUnitDetail(r) {
  const box = $('#map-detail');
  if (!box) return;
  const detail = state.unitDetail || { code: r.code, items: [], page: 0 };
  const items = detail.items || [];
  const pages = Math.max(1, Math.ceil(items.length / UNIT_PER_PAGE));
  const page = Math.min(detail.page || 0, pages - 1);
  detail.page = page;

  const h = headIndex(r.code);
  const children = (r.children || []).map(c =>
    `<button type="button" class="chip map-unit" data-map-code="${esc(c.code)}">
       <span class="unit">${esc(c.code)}</span><span>${esc(c.title || '')}</span>
     </button>`).join('');
  const concepts = (r.concepts || []).map(x =>
    `<button type="button" class="chip related-chip" data-concept="${esc(x.name)}">
       <span>${esc(x.name)}</span><b>${x.count}</b></button>`).join('');
  const phils = (r.philosophers || []).map(p =>
    `<span class="tag">${esc(p.name)} <span class="muted">${p.count}</span></span>`).join('');

  const slice = items.slice(page * UNIT_PER_PAGE, page * UNIT_PER_PAGE + UNIT_PER_PAGE);
  rememberUnitChunks(slice);

  box.innerHTML = `<div class="row map-detail-head"><h3>${esc(r.code)} ${esc(r.title || '')}</h3></div>
    <div class="muted">卷：${esc(r.volume || '—')}　字头：${esc(HEAD_NAMES[String(r.code).split('-')[0]] || '—')}
      　位面：${esc(LAYER_NAMES[(Number(r.depth) || 1) - 1] || '—')}
      　块：<b>${r.counts ? r.counts.chunks : items.length}</b>（引文 ${r.counts ? r.counts.quotes : 0}）</div>
    <div class="term-actions"><button class="ghost" data-unit-ask="${esc(r.code)}">用该单元提问</button></div>
    ${children ? `<h4>子单元</h4><div class="grid concept-grid">${children}</div>` : ''}
    ${concepts ? `<h4>本单元术语 <span class="muted heading-note">· 命中块数</span></h4>
      <div class="grid concept-grid">${concepts}</div>` : ''}
    ${phils ? `<h4>本单元理论家</h4><div class="concept-lineage">${phils}</div>` : ''}
    <h4>原文块 <span class="muted heading-note">· 按阅读顺序</span></h4>
    <div class="unit-blocks">${slice.map(blockItem).join('') || '<div class="muted">该单元没有索引块。</div>'}</div>
    <div class="pager-row" id="unit-pager">${pagerHTML(items.length, page, UNIT_PER_PAGE)}</div>`;
  wirePager($('#unit-pager'), items.length, page, UNIT_PER_PAGE, n => {
    detail.page = n;
    renderUnitDetail(r);
  });
  syncBookmarkButtons();
}

async function selectMapUnit(code) {
  const box = $('#map-detail');
  if (!box) return;
  if (!state.units.length) {
    box.innerHTML = '<div class="muted">体系数据未加载，无法显示单元信息。</div>';
    return;
  }
  const u = state.units.find(x => String(x.code) === String(code));
  const h = headIndex(code);
  const l = layerIndex(u || { code });
  box.innerHTML = `<div class="row map-detail-head"><h3>${esc(code)} ${esc((u && u.title) || '')}</h3></div>
    <div class="muted">卷：${esc((u && u.volume) || '—')}　字头：${esc(HEAD_NAMES[h] || '—')}　位面：${esc(LAYER_NAMES[l - 1] || '—')}</div>
    <div class="muted">加载单元内容…</div>`;
  try {
    const r = await jget('/api/unit?code=' + encodeURIComponent(code) + '&limit=200');
    state.unitDetail = { code: r.code, items: r.items || [], page: 0, raw: r };
    renderUnitDetail(r);
  } catch (e) {
    box.innerHTML = `<div class="muted">单元内容加载失败：${esc(e.message)}</div>`;
  }
}

/* ------------------------------ 本地笔记 / 书签 ------------------------------
   只存浏览器 localStorage（不上传、不写库）：每条 = 块坐标 + 引用文案 + 原文摘录
   + 自己的批注。用于把阅读中的发现固定下来；导出 Markdown 后可自行归档。
   收藏入口统一走 [data-bookmark="chunk_id"]，文案由 syncBookmarkButtons() 就地刷新。 */
const NOTES_KEY = 'philo-notes-v1';

function loadNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(n => n && n.chunk_id) : [];
  } catch { return []; }
}

function saveNotes(list) {
  state.notes = list;
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(list));
  } catch { /* 隐私模式 / 配额不足：静默忽略，界面仍可用 */ }
}

function noteIndex(chunkId) {
  return state.notes.findIndex(n => n.chunk_id === chunkId);
}

function bookmarkLabel(on) {
  return on ? '★ 已收藏' : '☆ 收藏';
}

/* 就地同步所有收藏按钮（引用卡 / 概念卡 / 单元块列表可能同时持有同一块） */
function syncBookmarkButtons(chunkId) {
  const sel = chunkId ? `[data-bookmark="${CSS.escape(chunkId)}"]` : '[data-bookmark]';
  document.querySelectorAll(sel).forEach(b => {
    const on = noteIndex(b.dataset.bookmark) !== -1;
    b.textContent = bookmarkLabel(on);
    b.classList.toggle('on', on);
  });
}

function toggleBookmark(chunkId) {
  if (!chunkId) return;
  const i = noteIndex(chunkId);
  if (i === -1) {
    const src = state.chunkCache.get(chunkId) || { chunk_id: chunkId };
    state.notes.push({
      chunk_id: chunkId,
      citation: src.citation || '',
      unit: src.unit || '',
      unit_title: src.unit_title || '',
      text: String(src.text || '').slice(0, 300),
      note: '',
      ts: Date.now(),
    });
  } else {
    state.notes = state.notes.filter(n => n.chunk_id !== chunkId);
  }
  saveNotes(state.notes);
  syncBookmarkButtons(chunkId);
  if ($('#pane-notes').classList.contains('on')) renderNotes();
}

function removeNote(chunkId) {
  state.notes = state.notes.filter(n => n.chunk_id !== chunkId);
  saveNotes(state.notes);
  syncBookmarkButtons(chunkId);
  renderNotes();
}

function renderNotes() {
  const out = $('#notes-out');
  if (!out) return;
  const list = state.notes;
  if (!list.length) {
    out.innerHTML = '<div class="card muted">还没有收藏。回答的引用卡、概念卡的引文、' +
      '单元面板的原文块上都有「☆ 收藏」，点一下即可固定一条。</div>';
    return;
  }
  out.innerHTML = list.map((n, i) => {
    const head = n.unit ? `${esc(n.unit)} ${esc(n.unit_title || '')}` : '（未标注单元）';
    return `<div class="card note-item">
      <div class="meta muted">${head}　${esc(n.citation || n.chunk_id)}</div>
      <div class="body note-excerpt">${esc(n.text || '')}</div>
      <textarea class="note-edit" data-note-index="${i}" placeholder="写点批注…">${esc(n.note || '')}</textarea>
      <div class="foot">
        <button class="ghost" data-ctx="${esc(n.chunk_id)}">查看上下文</button>
        <button class="ghost" data-note-remove="${esc(n.chunk_id)}">☆ 移除</button>
      </div>
    </div>`;
  }).join('');
  out.querySelectorAll('.note-edit').forEach(t => {
    t.onchange = () => {
      const i = Number(t.dataset.noteIndex);
      if (state.notes[i]) {
        state.notes[i].note = t.value;
        saveNotes(state.notes);
      }
    };
  });
}

function exportNotes() {
  if (!state.notes.length) return;
  const lines = ['# 阅读笔记 · 《哲学大纲》', ''];
  state.notes.forEach((n, i) => {
    lines.push(`## ${i + 1}. ${n.unit ? n.unit + ' ' + (n.unit_title || '') : '（未标注单元）'}`);
    lines.push('');
    lines.push('> ' + String(n.text || '').replace(/\n/g, ' '));
    lines.push('');
    lines.push(`出处：${n.citation || n.chunk_id}`);
    if (n.note) {
      lines.push('');
      lines.push(`批注：${n.note}`);
    }
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '哲学大纲-阅读笔记.md';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ------------------------------ 原文上下文 ------------------------------ */
async function openContext(chunkId) {
  $('#modal').classList.remove('hidden');
  $('#modal-body').innerHTML = '<div class="muted">加载中…</div>';
  try {
    const r = await jget('/api/context?chunk_id=' + encodeURIComponent(chunkId) + '&window=2');
    $('#modal-body').innerHTML = r.items.map(it => `
      <div class="cite ${it.is_focus ? 'ctx-focus' : ''}">
        <div class="meta">${esc(it.citation)}${it.is_focus ? '　<b>（命中块）</b>' : ''}</div>
        <div class="body">${esc(it.text)}</div>
      </div>`).join('');
  } catch (e) {
    $('#modal-body').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

/* ------------------------------ 事件绑定 ------------------------------ */
document.querySelectorAll('#panel-nav .tab').forEach(t => {
  t.onclick = () => openPanel(t.dataset.p);
});
$('#panel-close').onclick = () => closePanel();
$('#concept-go').onclick = () => loadConcept($('#concept-q').value);
$('#concept-q').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadConcept($('#concept-q').value);
});

document.querySelectorAll('#seg-strategy button').forEach(b => {
  b.onclick = () => setStrategy(b.dataset.s);
});

document.querySelectorAll('#seg-search button').forEach(b => {
  b.onclick = () => { state.searchMode = b.dataset.m; buildSearchForm(); };
});

$('#strategy-egs').addEventListener('click', e => {
  const t = e.target.closest('.eg');
  if (t) askQuestion(t.dataset.q, state.strategy);
});

$('#ask-btn').onclick = () => {
  const q = $('#q').value.trim();
  if (q) doAsk(q, state.strategy);
};
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ask-btn').click(); });

/* 全局动作：引用跳转 / 术语→概念卡 / 展开收起 / 查看上下文 / 出处→体系地图 / 转到引文检索 */
document.addEventListener('click', e => {
  const ref = e.target.closest('.cite-ref');
  if (ref) { jumpToCite(ref.dataset.ref); return; }
  const co = e.target.closest('.clarify-option');
  if (co) { doAsk(co.dataset.q, co.dataset.s, co.dataset.f); return; }
  const term = e.target.closest('.term-link');
  if (term) { openConcept(term.dataset.term); return; }
  const tgl = e.target.closest('.cite-toggle');
  if (tgl) { toggleCite(tgl); return; }
  const bm = e.target.closest('[data-bookmark]');
  if (bm) { toggleBookmark(bm.dataset.bookmark); return; }
  const rm = e.target.closest('[data-note-remove]');
  if (rm) { removeNote(rm.dataset.noteRemove); return; }
  const cpt = e.target.closest('[data-concept]');
  if (cpt) { openConcept(cpt.dataset.concept); return; }
  const aq = e.target.closest('[data-ask]');
  if (aq) { askQuestion(aq.dataset.ask, aq.dataset.askStrategy || 'auto'); return; }
  const ctx = e.target.closest('[data-ctx]');
  if (ctx) { openContext(ctx.dataset.ctx); return; }
  const mu = e.target.closest('[data-map-unit]');
  if (mu) {
    openPanel('map');
    selectMapUnit(mu.dataset.mapUnit);
    const chip = document.querySelector(`.map-unit[data-map-code="${CSS.escape(mu.dataset.mapUnit)}"]`);
    if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  const tq = e.target.closest('[data-toquote]');
  if (tq) {
    state.searchMode = 'quote';
    switchView('search');
    buildSearchForm();
    $('#q-kw').value = tq.dataset.toquote;
    runQuote();
  }
});

/* 体系地图：点单元 → 单元信息；点「用该单元提问」→ 收起面板并提问 */
$('#map-out').addEventListener('click', e => {
  const chip = e.target.closest('.map-unit');
  if (chip) {
    selectMapUnit(chip.dataset.mapCode);
    return;
  }
  const ask = e.target.closest('[data-unit-ask]');
  if (ask) {
    const u = state.units.find(x => String(x.code) === String(ask.dataset.unitAsk));
    const title = u && u.title ? ' ' + u.title : '';
    askQuestion(`${ask.dataset.unitAsk}${title} 的核心内容是什么？`, 'auto');
  }
});

/* 弹窗关闭 */
$('#modal-close').onclick = () => $('#modal').classList.add('hidden');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });

/* 键盘：Esc 关弹窗；左右方向键翻引用 */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('#modal').classList.add('hidden'); closePanel(); return; }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.target.matches('input, select, textarea')) return;
  if (!$('#v-ask').classList.contains('on')) return;
  const go = e.key === 'ArrowLeft' ? 'prev' : 'next';
  const btn = document.querySelector(`#cite-pager .pg[data-go="${go}"]`);
  if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
});

/* ------------------------------ 初始化 ------------------------------ */
(async function init() {
  setStrategy('auto');
  buildSearchForm();
  state.notes = loadNotes();

  $('#notes-export').onclick = () => exportNotes();
  $('#notes-clear').onclick = () => {
    if (!state.notes.length) return;
    if (!window.confirm(`确定清空 ${state.notes.length} 条书签与批注？此操作不可撤销。`)) return;
    saveNotes([]);
    renderNotes();
    syncBookmarkButtons();
  };

  try {
    const [f, u] = await Promise.all([jget('/api/facets'), jget('/api/units')]);
    state.facets = f;
    state.units = u;
    fillQuoteSelects();
    renderSystemMap();
  } catch (e) {
    $('#map-out').innerHTML = `<div class="err">体系数据加载失败：${esc(e.message)}</div>`;
  }
})();
