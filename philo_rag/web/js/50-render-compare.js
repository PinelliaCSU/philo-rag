/* 50-render-compare.js · 概念对比：两侧概念卡与共现差异（只读 state，不绑事件） */
'use strict';
window.PHILO = window.PHILO || {};

function cmpNum(v) { return v != null ? v : 0; }

/* definition 在概念卡里是对象（含 chunk_id / unit / citation），
   但契约只承诺「两侧 definition」，因此字符串形态也接住 */
function cmpDefText(t) {
  const def = t && t.definition;
  if (!def) return '';
  return typeof def === 'string' ? def : String(def.text || '');
}

function cmpTermBlock(t, label) {
  const term = (t && t.term) || label;
  if (!t || t.found === false) {
    return `<div class="cmp-side">
      <h5><span class="tag">${esc(label)}</span> ${esc(term)}</h5>
      <div class="muted">词典未收录，另一侧照常显示。</div>
    </div>`;
  }
  const units = (t.units || []).slice(0, 8).map(u =>
    `<button type="button" class="chip concept-unit" data-map-unit="${esc(u.code)}">
       <span class="unit">${esc(u.code)}</span><span>${esc(u.title || '')}</span>
       <b>${cmpNum(u.hits != null ? u.hits : u.count)} 块</b></button>`).join('');
  const phils = (t.philosophers || []).map(p =>
    `<span class="tag">${esc(p.name)} <span class="muted">${cmpNum(p.count)}</span></span>`).join('');
  const themes = (t.themes || []).map(x => {
    const name = typeof x === 'string' ? x : (x && x.name) || '';
    if (!name) return '';
    return `<button type="button" class="chip theme-chip"
      data-ask="${esc(name)}在体系中的位置" data-ask-strategy="theme">
      <span>主题：${esc(name)}</span></button>`;
  }).join('');
  return `<div class="cmp-side">
    <h5><span class="tag">${esc(label)}</span>
      <button type="button" class="ghost cmp-open" data-concept="${esc(term)}">${esc(term)}</button></h5>
    <p class="cmp-def">${esc(cmpDefText(t) || '（无定义句，仅有检索证据）')}</p>
    ${units ? `<div class="muted">单元分布</div><div class="cmp-tags">${units}</div>` : ''}
    ${phils ? `<div class="muted">理论家</div><div class="cmp-tags">${phils}</div>` : ''}
    ${themes ? `<div class="cmp-tags">${themes}</div>` : ''}
  </div>`;
}

function cmpQuoteCard(q, label) {
  const text = String(q.text || '');
  return `<div class="cite cmp-quote">
    <div class="meta"><span class="tag">${esc(label)}</span> ${esc(q.citation || '')}</div>
    <div class="body">${text ? esc(text) : '<span class="cite-stub">（无正文）</span>'}</div>
    <div class="meta muted quote-meta">${q.speaker ? `—— ${esc(q.speaker)}　` : ''}<span class="unit">${esc(q.unit || '—')}</span></div>
    <div class="foot">
      <button class="ghost" data-ctx="${esc(q.chunk_id)}">查看上下文</button>
      <button class="ghost" data-bookmark="${esc(q.chunk_id)}">☆ 收藏</button>
    </div>
  </div>`;
}

function cmpQuotes(t, label) {
  const list = ((t && t.quotes) || []).slice(0, 3);   // 契约：每侧最多 3 条
  if (!list.length) return '<div class="muted">该侧没有引文。</div>';
  return list.map(q => cmpQuoteCard(q, label)).join('');
}

/* 收藏只要 chunk_id，引文文案与正文登记进缓存，避免把长文本塞进 data-* */
function rememberCompareChunks(r) {
  ((r && r.terms) || []).forEach(t => {
    (t.quotes || []).forEach(q => {
      if (!q.chunk_id) return;
      StateWrite.chunk({
        chunk_id: q.chunk_id, citation: q.citation, unit: q.unit,
        unit_title: q.unit_title || '', text: q.text,
      });
    });
  });
}

function renderCompare(r) {
  const terms = (r && r.terms) || [];
  const a = terms[0] || {}, b = terms[1] || {};
  const nameA = a.term || 'A', nameB = b.term || 'B';
  const chipList = (list, countOf, empty) => (list || []).map(x =>
    `<button type="button" class="chip related-chip" data-concept="${esc(x.name)}">
       <span>${esc(x.name)}</span><b>${countOf(x)}</b></button>`).join('') || empty;
  const shared = chipList(r.shared_related, x => `${cmpNum(x.a)}/${cmpNum(x.b)}`,
    '<div class="muted">无共同共现概念。</div>');
  const sharedUnits = (r.shared_units || []).map(u =>
    `<button type="button" class="chip concept-unit" data-map-unit="${esc(u.code)}">
       <span class="unit">${esc(u.code)}</span><span>${esc(u.title || '')}</span>
       <b>${cmpNum(u.a)}/${cmpNum(u.b)}</b></button>`).join('');
  return `<div class="compare-grid">
    <div class="cmp-col">
      <h4>定义与归属</h4>
      ${cmpTermBlock(a, 'A')}
      ${cmpTermBlock(b, 'B')}
    </div>
    <div class="cmp-col">
      <h4>共现与差异</h4>
      <div class="muted">同一块内与两侧都共现（A/B 次数）</div>
      <div class="grid concept-grid">${shared}</div>
      ${sharedUnits ? `<div class="muted">两侧重叠的单元（A/B 命中块数）</div>
        <div class="grid concept-grid">${sharedUnits}</div>` : ''}
      <div class="cmp-only">
        <div>
          <div class="muted">仅 ${esc(nameA)}</div>
          <div class="grid concept-grid">${chipList(r.a_only_related, x => cmpNum(x.count), '<div class="muted">—</div>')}</div>
        </div>
        <div>
          <div class="muted">仅 ${esc(nameB)}</div>
          <div class="grid concept-grid">${chipList(r.b_only_related, x => cmpNum(x.count), '<div class="muted">—</div>')}</div>
        </div>
      </div>
    </div>
    <div class="cmp-col">
      <h4>引文</h4>
      ${cmpQuotes(a, 'A')}
      ${cmpQuotes(b, 'B')}
    </div>
  </div>`;
}

async function runCompare() {
  const a = $('#cmp-a').value.trim();
  const b = $('#cmp-b').value.trim();
  const out = $('#cmp-out');
  if (!a || !b) {
    out.innerHTML = '<div class="card muted">A、B 两个概念都要填。</div>';
    return;
  }
  out.innerHTML = '<div class="muted">对比中…</div>';
  try {
    const r = await jget('/api/compare?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b));
    rememberCompareChunks(r);
    out.innerHTML = renderCompare(r);
    syncBookmarkButtons();
  } catch (e) {
    out.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

window.PHILO = window.PHILO || {};
PHILO.render = Object.assign(PHILO.render || {}, {
  renderCompare,
});
