'use strict';

/* ==========================================================================
   哲学大纲 · 知识库 —— 界面逻辑（原生 JS，无构建步骤）

   三个视图：
     溯源回答 —— 提问方式可切换（自动判定 / 点查询 / 范围查询），回答与引用分栏，
                 引用来源在固定区域内逐条翻页浏览；
     检索     —— 术语 / 概念 与 引文 / 原话 两种方式分段切换，结果统一分页；
     分面·体系 —— 卷、单元、理论家、概念的结构导航，卡片可直接转成提问。
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
   所有文本先过 esc()，因此渲染结果是安全的；`[3][5]` 这类引用不会被改动。
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
      out.push(`<li>${mdInline((ul || ol)[1])}</li>`);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join('');
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

/* ------------------------------ 视图切换 ------------------------------ */
function switchView(v) {
  document.querySelectorAll('.tab').forEach(t => {
    const selected = t.dataset.v === v;
    t.classList.toggle('on', selected);
    t.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
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
  h += `<div class="card"><h3>回答 <span class="muted heading-note">· ${strategyTag(r)}</span></h3>
    <div class="ans">${mdToHtml(r.answer)}</div></div>`;
  out.innerHTML = h;
  out.scrollTop = scrollTop;
}

function citeCard(c) {
  const ph = (c.philosophers || []).map(x => `<span class="tag">${esc(x)}</span>`).join('');
  const cc = (c.concepts || []).map(x => `<span class="tag">${esc(x)}</span>`).join('');
  const head = c.unit ? `<span class="unit">${esc(c.unit)}</span> ${esc(c.unit_title || '')}` : '';
  return `<div class="cite">
    <div class="meta"><b>[${c.n ?? ''}]</b> ${esc(c.citation)}</div>
    <div class="cite-tags">${head} ${ph}${cc}</div>
    <div class="body">${esc(c.text)}</div>
    <div class="foot"><button class="ghost" data-ctx="${esc(c.chunk_id)}">查看上下文</button></div>
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
  pane.innerHTML = list.slice(p * CITE_PER_PAGE, p * CITE_PER_PAGE + CITE_PER_PAGE).map(citeCard).join('');
  pane.scrollTop = 0;
  pager.innerHTML = pagerHTML(list.length, p, CITE_PER_PAGE);
  wirePager(pager, list.length, p, CITE_PER_PAGE, n => { state.citePage = n; renderCitations(r); });
}

async function doAsk(q, strategy) {
  const strat = strategy || state.strategy;
  const out = $('#ask-out');
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
      body: JSON.stringify({ question: q, strategy: strat }),
    });
    if (!r.ok) throw new Error(await errText(r));

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let meta = null;
    let answerText = '';
    let answerEl = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
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
          // 构建回答框架：先空容器，后续 delta 逐帧追加渲染
          renderAnswerSkeleton(event);
          renderCitations(event);
          answerEl = $('#ask-answer-text');
        } else if (event.type === 'delta') {
          answerText += event.text;
          if (answerEl) paintAnswer(answerEl, answerText);
        } else if (event.type === 'done') {
          // 最终清理（去掉模型可能输出的来源行）
          if (meta) {
            meta.answer = event.answer;
            state.ask = { ...meta, answer: event.answer };
            renderAnswer(state.ask);
          }
        } else if (event.type === 'error') {
          out.innerHTML = `<div class="err">${esc(event.detail)}</div>`;
        }
      }
    }

    // 如果没有收到任何事件（如网关跳过），回退到旧接口
    if (!meta) {
      const r2 = await jpost('/api/ask', { question: q, strategy: strat });
      state.ask = r2;
      state.citePage = 0;
      renderAnswer(r2);
      renderCitations(r2);
    }
  } catch (e) {
    out.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally {
    clearInterval(tick);
    $('#ask-btn').disabled = false;
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

/* ------------------------------ 分面 · 体系 ------------------------------ */
function renderFacets() {
  if (!state.facets) return;
  const f = state.facets, u = state.units;
  const byVol = {};
  u.forEach(x => { (byVol[x.volume] ||= []).push(x); });

  let h = `<div class="card facet-hero"><div class="muted">知识结构导航</div><h2>体系 · 卷与单元</h2>
    <div class="stat-grid">
      <div class="stat-box"><b>${u.length}</b><span>数值单元</span></div>
      <div class="stat-box"><b>${Object.keys(byVol).length}</b><span>卷</span></div>
      <div class="stat-box"><b>${f.concept.length}</b><span>核心概念</span></div>
    </div></div>`;

  h += `<div class="card muted facet-guide">点击任一卡片会把它转成一个提问：<b>概念</b> → 点查询「什么是 X？」；
        <b>理论家</b> → 范围查询「X 的核心思想是什么？」；<b>单元</b> → 自动判定。</div>`;

  for (const v of Object.keys(byVol)) {
    h += `<section class="card volume-section"><div class="row volume-head"><h3>${esc(v)}</h3>
      <span class="muted">${byVol[v].length} 个单元</span></div>
      <div class="grid volume-grid">` +
      byVol[v].map(x =>
        `<button class="chip unit-card" data-unit="${esc(x.code)}">
           <span class="unit">${esc(x.code)}</span><span>${esc(x.title)}</span>
         </button>`).join('') +
      `</div></section>`;
  }

  const names = { philosopher: '理论家', concept: '概念', era: '年代', school: '流派' };
  for (const k of ['philosopher', 'concept', 'era', 'school']) {
    const max = (f[k][0] && f[k][0][1]) || 1;
    h += `<div class="card axis-card"><h3>${names[k]} <span class="muted">· ${f[k].length} 项</span></h3>
      <div class="grid">` +
      f[k].map(([name, n]) =>
        `<button class="chip" data-k="${k}" data-name="${esc(name)}">
           <span>${esc(name)}<div class="bar"><i style="width:${Math.max(8, Math.round(n / max * 100))}%"></i></div></span>
           <b>${n}</b>
         </button>`).join('') +
      `</div></div>`;
  }

  $('#facet-out').innerHTML = h;
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
document.querySelectorAll('.tab').forEach(t => { t.onclick = () => switchView(t.dataset.v); });

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

/* 卡片上的两个动作：查看上下文 / 转到引文检索 */
document.addEventListener('click', e => {
  const ctx = e.target.closest('[data-ctx]');
  if (ctx) { openContext(ctx.dataset.ctx); return; }
  const tq = e.target.closest('[data-toquote]');
  if (tq) {
    state.searchMode = 'quote';
    switchView('search');
    buildSearchForm();
    $('#q-kw').value = tq.dataset.toquote;
    runQuote();
  }
});

/* 分面卡片 → 提问 */
$('#facet-out').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const unit = chip.dataset.unit;
  const k = chip.dataset.k;
  const name = chip.dataset.name;
  if (unit) {
    const title = chip.querySelectorAll('span')[1];
    askQuestion(`${unit}${title ? ' ' + title.textContent.trim() : ''} 的核心内容是什么？`, 'auto');
  } else if (k === 'philosopher') {
    askQuestion(`${name} 的核心思想是什么？`, 'theme');
  } else if (k === 'concept') {
    askQuestion(`什么是${name}？`, 'point');
  }
});

/* 弹窗关闭 */
$('#modal-close').onclick = () => $('#modal').classList.add('hidden');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });

/* 键盘：Esc 关弹窗；左右方向键翻引用 */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('#modal').classList.add('hidden'); return; }
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

  try {
    const [f, u] = await Promise.all([jget('/api/facets'), jget('/api/units')]);
    state.facets = f;
    state.units = u;
    fillQuoteSelects();
    renderFacets();
  } catch (e) {
    $('#facet-out').innerHTML = `<div class="err">分面数据加载失败：${esc(e.message)}</div>`;
  }
})();
