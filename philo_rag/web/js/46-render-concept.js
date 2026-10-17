/* 46-render-concept.js · 概念卡侧栏：纯字符串渲染 + 术语卡加载（只读 state，不绑事件） */
'use strict';
window.PHILO = window.PHILO || {};

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
    StateWrite.chunk({
      chunk_id: def.chunk_id, citation: def.citation, unit: def.unit,
      unit_title: def.unit_title, text: def.text,
    });
  }
  (r.quotes || []).forEach(q => {
    if (q.chunk_id) {
      StateWrite.chunk({
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

window.PHILO = window.PHILO || {};
PHILO.render = Object.assign(PHILO.render || {}, {
  renderConceptCard, loadConcept,
});
