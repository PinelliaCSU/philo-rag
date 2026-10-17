/* 30-render-answer.js · 回答与引用渲染：提问方式、回答卡、引用卡、术语注解、追问 chips（只读 state，不绑事件，不调用其它 render） */
'use strict';
window.PHILO = window.PHILO || {};

function setStrategy(s) {
  StateWrite.strategy(s);
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

/* 初始提示卡。骨架渲染会把 #ask-out 整个换掉，所以「新对话」要复原它，
   HTML 必须集中在一处常量里，而不是散在 index.html 与 JS 两边。 */
const ASK_INTRO_HTML = `<div class="card">
  <h3>怎么问？</h3>
  <p class="muted intro-note">
    上面「提问方式」可手动切换，也可以留在<b>自动判定</b>由系统按措辞决定。
    切换后下方会给出该方式的适用范围与示例，点示例即可直接发问。
    回答末尾的「术语注解」可点击，点击术语即打开<b>概念卡</b>；
    <b>术语 / 引文检索</b>与<b>体系地图</b>从顶部按钮召唤。
  </p>
</div>`;

function rewriteNoteHTML(r) {
  if (!(r && r.is_followup && r.standalone)) return '';
  return `<div class="muted rewrite-note">已按上文改写为：${esc(r.standalone)}</div>`;
}

function strategyTag(r) {
  if (r.skipped) return '已跳过';
  return r.strategy === 'theme' ? '范围查询' : '点查询';
}

function renderAnswer(r) {
  const out = $('#ask-out');
  const scrollTop = out.scrollTop;
  if (r.skipped) {
    out.innerHTML = rewriteNoteHTML(r) + `<div class="card"><h3>已跳过检索</h3>
      <div class="ans">${mdToHtml(r.answer)}</div>
      <div class="muted">判定类别：${esc((r.gate || {}).category || '')}</div></div>`;
    out.scrollTop = scrollTop;
    return;
  }
  let h = rewriteNoteHTML(r);
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

  h += `<div class="card"><h3>回答 <span class="muted heading-note">· ${strategyTag(r)}</span>${pinButton(r)}</h3>
    <div class="ans">${mdToHtml(r.answer)}</div>${annBlock}</div>`;
  out.innerHTML = h;
  out.scrollTop = scrollTop;
}

/* 「收藏本条回答」只出现在 renderAnswer 里：骨架渲染会在 done 时被它整体覆盖，
   两处各写一份必然漂移，所以骨架里刻意没有这个按钮。 */
function pinButton(r) {
  if (!r || !r.id) return '';
  return `<button type="button" class="ghost ans-pin" data-ans-pin="${esc(r.id)}">${
    r.pinned ? '★ 已收藏' : '★ 收藏本条回答'}</button>`;
}

function citeCard(c) {
  const ph = (c.philosophers || []).map(x => `<span class="tag">${esc(x)}</span>`).join('');
  const cc = (c.concepts || []).map(x => `<span class="tag">${esc(x)}</span>`).join('');
  /* 四层坐标注解（场域论=2 等）：结构维度，颜色比概念标签淡一档 */
  const cd = (c.coords || []).map(x => `<span class="tag tag-coord">${esc(x)}</span>`).join('');
  const head = c.unit ? `<span class="unit">${esc(c.unit)}</span> ${esc(c.unit_title || '')}` : '';
  const n = c.n ?? '';
  const text = c.text || '';
  /* 两种情况都要挂「展开全文」：① evidence 的 text 被后端截到 1200 字；
     ② 历史记录里的引用刻意不存正文（体积），只能按 chunk_id 回捞见 toggleCite。 */
  const truncated = !text || text.length >= 1200;
  const bodyHTML = text ? esc(text)
    : '<span class="cite-stub">正文未随历史保存，点下方「展开全文」回捞。</span>';
  return `<div class="cite" id="cite-${esc(n)}">
    <div class="meta"><b>[${n}]</b> ${esc(c.citation)}</div>
    <div class="cite-tags">${head} ${cd}${ph}${cc}</div>
    <div class="body cite-body" data-truncated="${truncated ? 1 : 0}" data-loaded="0">${bodyHTML}</div>
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
  StateWrite.citePage(p);
  const slice = list.slice(p * CITE_PER_PAGE, p * CITE_PER_PAGE + CITE_PER_PAGE);
  slice.forEach(c => {
    if (c.chunk_id) {
      StateWrite.chunk({
        chunk_id: c.chunk_id, citation: c.citation, unit: c.unit,
        unit_title: c.unit_title, text: c.text,
      });
    }
  });
  pane.innerHTML = slice.map(citeCard).join('');
  pane.scrollTop = 0;
  pager.innerHTML = pagerHTML(list.length, p, CITE_PER_PAGE);
  // 只登记页码；翻页点击由 80-app.js 的委托处理，收藏按钮由调用方 syncBookmarkButtons() 刷新
  wirePager(pager, list.length, p, CITE_PER_PAGE);
}

function jumpToCite(ref) {
  closePanel();
  const r = state.ask;
  const list = (r && r.citations) || [];
  const idx = list.findIndex(c => String(c.n) === String(ref));
  if (idx === -1) return;

  const page = Math.floor(idx / CITE_PER_PAGE);
  if (state.citePage !== page) {
    StateWrite.citePage(page);
    renderCitations(r);
    syncBookmarkButtons();
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

function renderAnswerSkeleton(r) {
  const out = $('#ask-out');
  if (r.skipped) {
    out.innerHTML = `<div class="card"><h3>已跳过检索</h3>
      <div class="ans">${mdToHtml(r.answer || '')}</div>
      <div class="muted">判定类别：${esc((r.gate || {}).category || '')}</div></div>`;
    return;
  }
  let h = rewriteNoteHTML(r);
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

function renderConvChips() {
  const box = $('#conv-chips');
  if (!box) return;
  box.innerHTML = state.conv.turns.map(t =>
    `<button type="button" class="chip conv-chip" data-conv-chip="${esc(t)}"
       title="填入输入框">${esc(t)}</button>`).join('');
  const btn = $('#conv-new');
  if (btn) btn.disabled = !state.conv.id && !state.conv.turns.length;
}

window.PHILO = window.PHILO || {};
PHILO.render = Object.assign(PHILO.render || {}, {
  renderAnswer, renderAnswerSkeleton, renderClarifyCard, renderCitations, renderConvChips,
  /* 「新对话」复原初始提示卡：原先是 newConv() 里内联的 DOM 写入，收到渲染层 */
  askIntro() {
    $('#ask-out').innerHTML = ASK_INTRO_HTML;
    $('#cite-cards').innerHTML = '<div class="muted">提问后，每条论断的来源在这里逐条浏览。</div>';
    $('#cite-pager').innerHTML = '';
  },
});
