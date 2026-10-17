/* 40-render-history.js · 本地笔记 / 书签与问答历史的渲染、导出（只读 state，不绑事件） */
'use strict';
window.PHILO = window.PHILO || {};

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
    StateWrite.addNote({
      chunk_id: chunkId,
      citation: src.citation || '',
      unit: src.unit || '',
      unit_title: src.unit_title || '',
      text: String(src.text || '').slice(0, 300),
      note: '',
      ts: Date.now(),
    });
  } else {
    StateWrite.notes(state.notes.filter(n => n.chunk_id !== chunkId));
  }
  StateWrite.notes(saveNotes(state.notes));
  syncBookmarkButtons(chunkId);
  if ($('#pane-notes').classList.contains('on')) renderNotes();
}

function removeNote(chunkId) {
  StateWrite.notes(saveNotes(state.notes.filter(n => n.chunk_id !== chunkId)));
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
  // 批注的 change 事件由 80-app.js 的 document 级委托处理（见 PHILO.note.edit）
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

const HIST_STRATEGY = { point: '点查询', theme: '范围查询', clarify: '澄清', gate: '已跳过' };

function answerId() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* 只在 done 事件后写：skipped / clarify / 空答案都不写——它们不是「一次可复现的
   回答」，留在历史里只会让列表变噪声。 */
function recordAnswer(r) {
  const answer = String(r.answer || '');
  if (!answer.trim() || r.skipped || r.strategy === 'clarify') return;
  const citations = (r.citations || []).map(c => ({
    n: c.n,
    chunk_id: c.chunk_id,
    citation: c.citation,
    unit: c.unit,
    unit_title: c.unit_title,
  }));
  const entry = {
    id: answerId(),
    ts: Date.now(),
    conversation_id: r.conversation_id || state.conv.id || '',
    question: r.question || '',
    standalone: r.standalone || '',
    strategy: r.strategy || 'point',
    route_reason: r.route_reason || '',
    backend: r.backend || '',
    answer,
    sections: r.sections || [],
    annotations: r.annotations || [],
    citations,
    cite_count: citations.length,
    pinned: false,
  };
  StateWrite.answers(saveAnswers([entry, ...state.answers]));
  // 回填 id：回答卡上的「收藏本条回答」按钮据此出现在本次回答上
  r.id = entry.id;
  r.pinned = false;
  if ($('#pane-history') && $('#pane-history').classList.contains('on')) renderHistory();
}

function fmtTs(ts) {
  const d = new Date(Number(ts) || 0);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderHistory() {
  const out = $('#hist-out');
  if (!out) return;
  if (!state.answers.length) {
    out.innerHTML = '<div class="card muted">还没有历史。每次回答生成完会自动记一条，' +
      '只存在浏览器本地；点条目可复原当时的回答与引用。</div>';
    return;
  }
  const kw = (($('#hist-filter') || {}).value || '').trim().toLowerCase();
  const list = state.answers.filter(a => !kw
    || String(a.question || '').toLowerCase().includes(kw)
    || String(a.standalone || '').toLowerCase().includes(kw));
  if (!list.length) {
    out.innerHTML = `<div class="card muted">没有匹配「${esc(kw)}」的历史条目。</div>`;
    return;
  }
  out.innerHTML = list.map(a => `<div class="card hist-item">
    <button type="button" class="hist-main" data-ans-open="${esc(a.id)}">
      <div class="hist-q">${esc(a.question || '（未记录问题）')}</div>
      <div class="meta muted">
        <span class="tag">${esc(HIST_STRATEGY[a.strategy] || a.strategy || '—')}</span>
        ${esc(fmtTs(a.ts))}　引用 ${a.cite_count != null ? a.cite_count : (a.citations || []).length} 条
      </div>
    </button>
    <div class="foot">
      <button class="ghost" data-ans-pin="${esc(a.id)}">${a.pinned ? '★ 已收藏' : '★ 收藏'}</button>
      <button class="ghost" data-ans-remove="${esc(a.id)}">删除</button>
    </div>
  </div>`).join('');
}

/* 复原历史答案：直接喂两个纯渲染函数。entry 里没有 theme 字段，
   renderAnswer 对范围查询只是少一张「聚合概览」卡，不会抛错。 */
function openAnswer(id) {
  const entry = state.answers.find(a => a.id === id);
  if (!entry) return;
  switchView('ask');
  StateWrite.citePage(0);
  StateWrite.ask(entry);   // 引用卡「展开全文」要从 state.ask.citations 里找 chunk_id
  renderAnswer(entry);
  renderCitations(entry);
  syncBookmarkButtons();
  $('#ask-out').scrollTop = 0;
}

function toggleAnswerPin(id) {
  const a = state.answers.find(x => x.id === id);
  if (!a) return;
  a.pinned = !a.pinned;
  StateWrite.answers(saveAnswers(state.answers));
  if (state.ask && state.ask.id === id) {
    StateWrite.askPinned(a.pinned);
    renderAnswer(state.ask);
  }
  if ($('#pane-history') && $('#pane-history').classList.contains('on')) renderHistory();
}

function removeAnswer(id) {
  StateWrite.answers(saveAnswers(state.answers.filter(a => a.id !== id)));
  renderHistory();
}

/* 导出沿用 exportNotes() 的 Blob 下载模式：无后端、无依赖 */
function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportAnswersJSON() {
  if (!state.answers.length) return;
  downloadBlob(JSON.stringify(state.answers, null, 2),
    '哲学大纲-问答历史.json', 'application/json;charset=utf-8');
}

function exportAnswersMarkdown() {
  if (!state.answers.length) return;
  const lines = ['# 问答历史 · 《哲学大纲》', ''];
  state.answers.forEach((a, i) => {
    lines.push(`## ${i + 1}. ${a.question || '（未记录问题）'}`);
    lines.push('');
    lines.push(`- 时间：${fmtTs(a.ts)}`);
    lines.push(`- 方式：${HIST_STRATEGY[a.strategy] || a.strategy || '—'}${a.pinned ? '　★ 已收藏' : ''}`);
    if (a.standalone && a.standalone !== a.question) lines.push(`- 按上文改写为：${a.standalone}`);
    if (a.route_reason) lines.push(`- 判定依据：${a.route_reason}`);
    lines.push('');
    lines.push(String(a.answer || ''));
    lines.push('');
    const cits = a.citations || [];
    if (cits.length) {
      lines.push(`引用来源（${cits.length} 条，正文未存档）：`);
      lines.push('');
      cits.forEach(c => lines.push(
        `- [${c.n}] ${c.citation || ''}　${c.unit || ''} ${c.unit_title || ''}`));
      lines.push('');
    }
  });
  downloadBlob(lines.join('\n'), '哲学大纲-问答历史.md', 'text/markdown;charset=utf-8');
}

window.PHILO = window.PHILO || {};
PHILO.render = Object.assign(PHILO.render || {}, {
  renderNotes, renderHistory, syncBookmarkButtons,
});
