/* 47-render-map.js · 体系地图与单元导览：坐标视图、块列表分页、单元详情（只读 state，不绑事件，不调用其它 render） */
'use strict';
window.PHILO = window.PHILO || {};

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
      StateWrite.chunk({
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
  StateWrite.unitDetailPage(page);

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
    <div class="term-actions">
      <button class="ghost" data-unit-ask="${esc(r.code)}">用该单元提问</button>
      <button class="ghost" data-read="${esc(r.code)}">连续阅读</button>
    </div>
    ${children ? `<h4>子单元</h4><div class="grid concept-grid">${children}</div>` : ''}
    ${concepts ? `<h4>本单元术语 <span class="muted heading-note">· 命中块数</span></h4>
      <div class="grid concept-grid">${concepts}</div>` : ''}
    ${phils ? `<h4>本单元理论家</h4><div class="concept-lineage">${phils}</div>` : ''}
    <h4>原文块 <span class="muted heading-note">· 按阅读顺序</span></h4>
    <div class="unit-blocks">${slice.map(blockItem).join('') || '<div class="muted">该单元没有索引块。</div>'}</div>
    <div class="pager-row" id="unit-pager">${pagerHTML(items.length, page, UNIT_PER_PAGE)}</div>`;
  // 只登记页码；翻页点击由 80-app.js 的委托处理（renderUnitDetail + syncBookmarkButtons）
  wirePager($('#unit-pager'), items.length, page, UNIT_PER_PAGE);
}

async function selectMapUnit(code) {
  const box = $('#map-detail');
  if (!box) return null;
  if (!state.units.length) {
    box.innerHTML = '<div class="muted">体系数据未加载，无法显示单元信息。</div>';
    return null;
  }
  const u = state.units.find(x => String(x.code) === String(code));
  const h = headIndex(code);
  const l = layerIndex(u || { code });
  box.innerHTML = `<div class="row map-detail-head"><h3>${esc(code)} ${esc((u && u.title) || '')}</h3></div>
    <div class="muted">卷：${esc((u && u.volume) || '—')}　字头：${esc(HEAD_NAMES[h] || '—')}　位面：${esc(LAYER_NAMES[l - 1] || '—')}</div>
    <div class="muted">加载单元内容…</div>`;
  try {
    const r = await jget('/api/unit?code=' + encodeURIComponent(code) + '&limit=200');
    StateWrite.unitDetail({ code: r.code, items: r.items || [], page: 0, raw: r });
    return r;   // 渲染由调用方（80-app.js）接着调 renderUnitDetail()
  } catch (e) {
    box.innerHTML = `<div class="muted">单元内容加载失败：${esc(e.message)}</div>`;
    return null;
  }
}

window.PHILO = window.PHILO || {};
PHILO.render = Object.assign(PHILO.render || {}, {
  renderSystemMap, renderUnitDetail,
});
