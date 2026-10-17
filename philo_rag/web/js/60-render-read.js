/* 60-render-read.js · 连续阅读与原文上下文弹窗：术语加链接、块渲染、上下单元、滚动位置（只读 state） */
'use strict';
window.PHILO = window.PHILO || {};

/* 术语自动加链接——本任务唯一有替换风险的地方，四条规则都在这里：
   ① 入参是**已 esc** 的文本，替换后不再走 mdToHtml，否则 &lt; 会被二次解析；
   ② 概念按长度降序，长词先占位；
   ③ 每个概念只替换第一次出现，否则一段文字会变成按钮森林；
   ④ 用 \u0001N\u0001 占位、最后统一回填成按钮，否则「大他者」会吃掉已经
      替换过的「大他者性」里的子串。 */
function linkTerms(escapedText, concepts) {
  const words = [...new Set((concepts || [])
    .filter(w => w && String(w).trim())
    .map(String))].sort((a, b) => b.length - a.length);
  const slots = [];
  let text = String(escapedText || '');
  for (const w of words) {
    const needle = esc(w);            // 概念名先 esc，才能在上面的转义文本里定位
    const at = text.indexOf(needle);
    if (at === -1) continue;
    slots.push(`<button type="button" class="term-link" data-term="${esc(w)}">${needle}</button>`);
    const slot = '\u0001' + (slots.length - 1) + '\u0001';
    text = text.slice(0, at) + slot + text.slice(at + needle.length);
  }
  return text.replace(/\u0001(\d+)\u0001/g, (m, i) => slots[Number(i)] ?? m);
}

function readBlockHTML(c) {
  const body = String(c.text || '');
  // 只给正文与引文加链接：脚注本身就是释义，链接化反而抢焦点
  const html = (c.chunk_type === 'body' || c.chunk_type === 'quote')
    ? linkTerms(esc(body), c.concepts)
    : esc(body);
  const unit = c.unit || (state.read && state.read.code) || '';
  const concept = (c.concepts || [])[0];
  /* 就这段提问用「块坐标 + 首个概念」合成问句：把原文塞进问题会触发
     off_topic / no_anchor 判定，原文里的引号还会污染输入框。 */
  const q = concept
    ? `${unit} 中关于「${concept}」的论述是什么？`
    : `${unit} 这一节的核心论点是什么？`;
  const kind = c.chunk_type && c.chunk_type !== 'body'
    ? `　<span class="tag">${esc(c.chunk_type)}</span>` : '';
  return `<div class="read-block">
    <div class="meta muted">${esc(c.citation || '')}${kind}</div>
    <div class="read-text">${html}</div>
    <div class="foot">
      <button class="ghost" data-bookmark="${esc(c.chunk_id)}">☆ 收藏</button>
      <button class="ghost" data-ctx="${esc(c.chunk_id)}">查看上下文</button>
      <button class="ghost" data-ask="${esc(q)}" data-ask-strategy="auto">就这段提问</button>
    </div>
  </div>`;
}

function renderRead() {
  const rd = state.read;
  const out = $('#read-out');
  if (!rd || !out) return;
  const idx = state.units.findIndex(u => String(u.code) === String(rd.code));
  const prev = idx > 0 ? state.units[idx - 1] : null;
  const next = idx >= 0 && idx < state.units.length - 1 ? state.units[idx + 1] : null;
  const prevBtn = $('#read-prev'), nextBtn = $('#read-next');
  if (prevBtn) { prevBtn.disabled = !prev; prevBtn.dataset.readNav = prev ? prev.code : ''; }
  if (nextBtn) { nextBtn.disabled = !next; nextBtn.dataset.readNav = next ? next.code : ''; }
  $('#read-title').innerHTML = `<b>${esc(rd.code)}</b> ${esc(rd.title || '')}
    <span class="muted">· ${idx >= 0 ? `第 ${idx + 1} / ${state.units.length} 单元` : '单元'}</span>`;
  out.innerHTML = rd.items.map(readBlockHTML).join('')
    || '<div class="muted">该单元没有索引块。</div>';
  out.style.fontSize = state.readFont + 'px';
}

async function loadReadUnit(code) {
  const out = $('#read-out');
  if (!out) return;
  out.innerHTML = '<div class="muted">加载单元内容…</div>';
  try {
    const r = await jget('/api/unit?code=' + encodeURIComponent(code) + '&limit=200');
    StateWrite.read({ code: r.code, title: r.title || '', items: r.items || [] });
    rememberUnitChunks(state.read.items);   // 收藏按钮只要 chunk_id，文案从这里取
    renderRead();
    syncBookmarkButtons();
    const pos = readPos();
    // 只恢复同一单元的位置：换了单元还停在上一单元的滚动高度会很莫名
    out.scrollTop = pos && String(pos.code) === String(state.read.code)
      ? Number(pos.scrollTop) || 0 : 0;
  } catch (e) {
    out.innerHTML = `<div class="err">单元内容加载失败：${esc(e.message)}</div>`;
  }
}

async function openRead(code) {
  if (!code) return;
  switchView('read');
  await loadReadUnit(code);
}

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

window.PHILO = window.PHILO || {};
PHILO.render = Object.assign(PHILO.render || {}, {
  renderRead, openContext, loadReadUnit,
});
