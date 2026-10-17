/* 45-render-search.js · 术语 / 引文检索：表单、结果头、结果分页与两种检索动作（只读 state，不绑事件） */
'use strict';
window.PHILO = window.PHILO || {};

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
       <button id="t-go" data-act="term-go">${SEARCH.term.button}</button>`;
  } else {
    $('#search-form').innerHTML =
      `<select id="q-unit"><option value="">不限单元</option></select>
       <select id="q-phil"><option value="">不限理论家</option></select>
       <select id="q-speaker"><option value="">不限说话人</option></select>
       <select id="q-concept"><option value="">不限概念</option></select>
       <input type="text" id="q-kw" class="quote-keyword" placeholder="引文关键词（可选）">
       <button id="q-go" data-act="quote-go">${SEARCH.quote.button}</button>`;
    fillQuoteSelects();
  }
  resetSearchResults();
}

function resetSearchResults() {
  StateWrite.searchItems([]);
  StateWrite.searchPage(0);
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

/* 只写列表状态：重绘由调用方（runTerm / runQuote）接着调 paintSearchPage(emptyMsg) */
function renderSearchItems(items, emptyMsg) {
  StateWrite.searchItems(items);
  StateWrite.searchPage(0);
  StateWrite.searchEmpty(emptyMsg);
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
  StateWrite.searchPage(p);
  list.innerHTML = items.slice(p * LIST_PER_PAGE, p * LIST_PER_PAGE + LIST_PER_PAGE).join('');
  pager.innerHTML = pagerHTML(items.length, p, LIST_PER_PAGE);
  // 只登记页码；翻页点击由 80-app.js 的委托处理
  wirePager(pager, items.length, p, LIST_PER_PAGE);
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
    const emptyMsg = '无命中。换个说法，或到「引文 / 原话」里按理论家浏览。';
    renderSearchItems([
      ...r.exact_hits.map(c => termHitCard(c, '精确')),
      ...r.semantic_hits.map(c => termHitCard(c, '语义')),
    ], emptyMsg);
    paintSearchPage(emptyMsg);
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
    const emptyMsg = '无命中，试试放宽筛选条件。';
    renderSearchItems(r.quotes.map(quoteCard), emptyMsg);
    paintSearchPage(emptyMsg);
  } catch (e) {
    $('#search-list').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

window.PHILO = window.PHILO || {};
PHILO.render = Object.assign(PHILO.render || {}, {
  buildSearchForm, paintSearchPage, resetSearchResults, fillQuoteSelects,
});
