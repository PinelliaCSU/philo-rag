/* 80-app.js · 视图与面板切换、唯一的事件委托、渲染编排与初始化 */
'use strict';
window.PHILO = window.PHILO || {};

// 阅读区滚动位置记忆的防抖计时器（渲染模块不绑事件，监听统一收在本文件）
let readPosTimer = 0;

function bindRead() {
  const out = $('#read-out');
  if (!out) return;
  // 滚动位置记忆：每次 scroll 都落盘太频繁，停手 200ms 后写一次
  out.addEventListener('scroll', () => {
    if (!state.read) return;
    clearTimeout(readPosTimer);
    readPosTimer = setTimeout(() => saveReadPos(state.read.code, out.scrollTop), 200);
  });
  // 字号增减与「返回地图」由本文件的 id 委托处理（read-font-dec / read-font-inc / read-back）
}

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
  if (kind === 'history') renderHistory();
  if (kind === 'concept') {
    const q = $('#concept-q');
    if (q && !q.value) q.focus();
  }
  // 三个面板共用一个滚动容器：不复位的话，从「检索结果第 N 页」切到地图会落在中段
  const body = $('#panel .panel-body');
  if (body) body.scrollTop = 0;
}

function showView(v) {
  const ask = $('#v-ask'), read = $('#v-read');
  if (ask) ask.classList.toggle('on', v === 'ask');
  if (read) read.classList.toggle('on', v === 'read');
}

/* 旧的三视图切换调用点（askQuestion / data-toquote / 历史复原）保持兼容 */
function switchView(v) {
  if (v === 'ask') { showView('ask'); closePanel(); }
  else if (v === 'read') { showView('read'); closePanel(); }
  else if (v === 'search') openPanel('search');
  else if (v === 'facet') openPanel('map');
  else closePanel();
}

function askQuestion(q, strategy) {
  setStrategy(strategy || 'auto');
  switchView('ask');
  $('#q').value = q;
  doAsk(q, strategy || state.strategy);
}

function newConv() {
  // 先作废在飞的旧流：否则它回来时会把旧会话的答案画进新会话
  PHILO.ask.cancelInflight();
  StateWrite.resetConv();
  PHILO.render.askIntro();
  $('#ask-btn').disabled = false;   // 旧流的 finally 因 stale() 不再解锁按钮
  renderConvChips();
}

/* ------------------------------ 事件绑定 ------------------------------
   渲染函数里不再出现任何 .onclick / .onchange：静态按钮按 id 分派、动态按钮带
   data-*，全部收敛到本文件的 document 级委托；data-* 动作链与原实现逐条一致。 */
$('#concept-q').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadConcept($('#concept-q').value);
});

$('#strategy-egs').addEventListener('click', e => {
  const t = e.target.closest('.eg');
  if (t) askQuestion(t.dataset.q, state.strategy);
});

/* 全局动作：引用跳转 / 术语→概念卡 / 展开收起 / 查看上下文 / 出处→体系地图 / 转到引文检索 */
document.addEventListener('click', e => {
  const ref = e.target.closest('.cite-ref');
  if (ref) { jumpToCite(ref.dataset.ref); return; }
  // 澄清卡点选：同属当前会话的一轮，doAsk 会自动带上 state.conv.id
  const co = e.target.closest('.clarify-option');
  if (co) { doAsk(co.dataset.q, co.dataset.s, co.dataset.f); return; }
  // chips 只回填输入框，不回滚会话状态（真值在服务端）
  const cc = e.target.closest('[data-conv-chip]');
  if (cc) { $('#q').value = cc.dataset.convChip; $('#q').focus(); return; }
  const term = e.target.closest('.term-link');
  if (term) { openConcept(term.dataset.term); return; }
  const tgl = e.target.closest('.cite-toggle');
  if (tgl) { toggleCite(tgl); return; }
  const bm = e.target.closest('[data-bookmark]');
  if (bm) { toggleBookmark(bm.dataset.bookmark); return; }
  const rm = e.target.closest('[data-note-remove]');
  if (rm) { removeNote(rm.dataset.noteRemove); return; }
  const ao = e.target.closest('[data-ans-open]');
  if (ao) { openAnswer(ao.dataset.ansOpen); return; }
  const ap = e.target.closest('[data-ans-pin]');
  if (ap) { toggleAnswerPin(ap.dataset.ansPin); return; }
  const ar = e.target.closest('[data-ans-remove]');
  if (ar) { removeAnswer(ar.dataset.ansRemove); return; }
  const cpt = e.target.closest('[data-concept]');
  if (cpt) { openConcept(cpt.dataset.concept); return; }
  const aq = e.target.closest('[data-ask]');
  if (aq) { askQuestion(aq.dataset.ask, aq.dataset.askStrategy || 'auto'); return; }
  const ctx = e.target.closest('[data-ctx]');
  if (ctx) { openContext(ctx.dataset.ctx); return; }
  const rd = e.target.closest('[data-read]');
  if (rd) { openRead(rd.dataset.read); return; }
  // 上下单元按钮在首页/末页是 disabled 且 data-read-nav 为空，直接忽略
  const rn = e.target.closest('[data-read-nav]');
  if (rn) { if (rn.dataset.readNav) openRead(rn.dataset.readNav); return; }
  const mu = e.target.closest('[data-map-unit]');
  if (mu) {
    openPanel('map');
    // 单元详情由编排层接着渲染（render 之间不互相调用）
    selectMapUnit(mu.dataset.mapUnit).then(r => {
      if (!r) return;
      renderUnitDetail(r);
      syncBookmarkButtons();
    });
    const chip = document.querySelector(`.map-unit[data-map-code="${CSS.escape(mu.dataset.mapUnit)}"]`);
    if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  const tq = e.target.closest('[data-toquote]');
  if (tq) {
    StateWrite.searchMode('quote');
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
    selectMapUnit(chip.dataset.mapCode).then(r => {
      if (!r) return;
      renderUnitDetail(r);
      syncBookmarkButtons();
    });
    return;
  }
  const ask = e.target.closest('[data-unit-ask]');
  if (ask) {
    const u = state.units.find(x => String(x.code) === String(ask.dataset.unitAsk));
    const title = u && u.title ? ' ' + u.title : '';
    askQuestion(`${ask.dataset.unitAsk}${title} 的核心内容是什么？`, 'auto');
  }
});

/* 弹窗关闭：按钮本身按 id 委托（见 CLICK_ACTIONS），这里只处理点遮罩 */
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });

/* 键盘：Esc 关弹窗；左右方向键翻引用 */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('#modal').classList.add('hidden'); closePanel(); return; }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.target.matches('input, select, textarea')) return;
  if (!$('#v-ask').classList.contains('on')) return;
  const go = e.key === 'ArrowLeft' ? 'prev' : 'next';
  const btn = document.querySelector(`#cite-pager .pg[data-pg="${go}"]`);
  if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
});

/* ------------------------------ 委托：面板 / 组件动作 ------------------------------
   原先这 20 处是逐元素绑定的 .onclick / .onchange。元素多为静态 HTML（没有 data-*），
   因此这里按 id 与 HTML 已有的 data-p / data-s / data-m 分派；动态生成的按钮带 data-act。 */
const CLICK_ACTIONS = {
  'panel-close': () => closePanel(),
  'ask-btn': () => {
    const q = $('#q').value.trim();
    if (q) doAsk(q, state.strategy);
  },
  'conv-new': () => newConv(),
  'concept-go': () => loadConcept($('#concept-q').value),
  'read-font-dec': () => {
    StateWrite.readFont(Math.max(READ_FONT_MIN, state.readFont - 1));
    $('#read-out').style.fontSize = state.readFont + 'px';
  },
  'read-font-inc': () => {
    StateWrite.readFont(Math.min(READ_FONT_MAX, state.readFont + 1));
    $('#read-out').style.fontSize = state.readFont + 'px';
  },
  'read-back': () => { switchView('ask'); openPanel('map'); },
  'modal-close': () => $('#modal').classList.add('hidden'),
  'notes-export': () => exportNotes(),
  'notes-clear': () => {
    if (!state.notes.length) return;
    if (!window.confirm(`确定清空 ${state.notes.length} 条书签与批注？此操作不可撤销。`)) return;
    StateWrite.notes(saveNotes([]));
    renderNotes();
    syncBookmarkButtons();
  },
  'hist-export-json': () => exportAnswersJSON(),
  'hist-export-md': () => exportAnswersMarkdown(),
  'cmp-go': () => runCompare(),
};

/* 翻页：等价于原先 wirePager 绑在 .pg 上的回调（同样的边界钳制、同样「同页不触发」）。
   页码与总数由 wirePager() 登记在分页容器元素上，这里按容器 id 决定重绘哪一块。 */
const PAGER_RERENDER = {
  'cite-pager': n => { StateWrite.citePage(n); renderCitations(state.ask); syncBookmarkButtons(); },
  'search-pager': n => { StateWrite.searchPage(n); paintSearchPage(state.searchEmpty); },
  'unit-pager': n => {
    StateWrite.unitDetailPage(n);
    if (!state.unitDetail || !state.unitDetail.raw) return;
    renderUnitDetail(state.unitDetail.raw);
    syncBookmarkButtons();
  },
};

document.addEventListener('click', e => {
  const pgBtn = e.target.closest('.pg[data-pg]');
  if (pgBtn) {
    const root = pgBtn.parentElement;
    const d = root && root.__pager;
    if (!d) return;
    const pages = Math.max(1, Math.ceil(d.total / d.perPage));
    const next = pgBtn.dataset.pg === 'prev' ? Math.max(0, d.page - 1) : Math.min(pages - 1, d.page + 1);
    if (next === d.page) return;
    const redraw = PAGER_RERENDER[root.id];
    if (redraw) redraw(next);
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) {
    if (act.dataset.act === 'term-go') runTerm();
    else if (act.dataset.act === 'quote-go') runQuote();
    return;
  }
  const tab = e.target.closest('#panel-nav .tab');
  if (tab) { openPanel(tab.dataset.p); return; }
  const segS = e.target.closest('#seg-strategy button');
  if (segS) { setStrategy(segS.dataset.s); return; }
  const segM = e.target.closest('#seg-search button');
  if (segM) { StateWrite.searchMode(segM.dataset.m); buildSearchForm(); return; }
  const box = e.target.closest('[id]');
  const run = box && CLICK_ACTIONS[box.id];
  if (run) run();
});

/* 批注框：原先是 renderNotes() 里逐个 .note-edit 绑 onchange，改为 document 级 change 委托 */
document.addEventListener('change', e => {
  const t = e.target.closest('.note-edit');
  if (!t) return;
  const i = Number(t.dataset.noteIndex);
  if (state.notes[i]) {
    StateWrite.noteText(i, t.value);
    StateWrite.notes(saveNotes(state.notes));
  }
});

/* 输入框回车：原先是 buildSearchForm() 里绑在 #t-q / #q-kw 上、以及 #q 上绑的 keydown */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = e.target.id;
  if (id === 't-q') runTerm();
  else if (id === 'q-kw') runQuote();
  else if (id === 'q') $('#ask-btn').click();
});

/* ------------------------------ 初始化 ------------------------------ */
(async function init() {
  setStrategy('auto');
  buildSearchForm();
  $('#ask-out').innerHTML = ASK_INTRO_HTML;
  renderConvChips();
  StateWrite.notes(loadNotes());
  StateWrite.answers(loadAnswers());
  $('#hist-filter').addEventListener('input', () => renderHistory());
  bindRead();
  ['#cmp-a', '#cmp-b'].forEach(sel => $(sel).addEventListener('keydown', e => {
    if (e.key === 'Enter') runCompare();
  }));

  try {
    const [f, u] = await Promise.all([jget('/api/facets'), jget('/api/units')]);
    StateWrite.facets(f);
    StateWrite.units(u);
    fillQuoteSelects();
    renderSystemMap();
  } catch (e) {
    $('#map-out').innerHTML = `<div class="err">体系数据加载失败：${esc(e.message)}</div>`;
  }
})();
