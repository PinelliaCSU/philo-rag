// 全局状态与动作。Runes 只在这里集中：组件负责画，逻辑负责改状态。
//
// 流式的关键约定（§8.1）：delta 不写 $state，先进 incoming 缓冲；
// 单一 rAF 循环每帧最多取 2–6 个字符提交给界面；done 之后等 1.2–2s 再全量重渲染一次。
import { api, streamAsk } from './api.js';
import * as local from './db.js';
import { splitBlocks } from './markdown.js';
import { subscribe } from './motion.js';
import { buildTermIndex, findTerms, indexFromConcepts, topTerms } from './terms.js';

const LIT_LIMIT = 8;

export const app = $state({
  booted: false,
  starError: '',

  // 输入线内容（放在全局：回填、清空、直接键入都发生在别处）
  input: '',

  // 当前纸页
  paperKind: '',            // answer | concept | map | unit | compare
  question: '',
  standalone: '',
  prevQuestion: '',
  intent: 'point',          // point | theme
  strategy: 'point',        // 服务端最终采用的策略（gate/clarify 也记在这里）
  skipped: false,
  clarifyOffer: false,      // 「这个问题较大，按范围查询展开？」
  answerRaw: '',
  blocks: [],               // 已定型块（html），只渲染一次
  tail: '',                 // 当前未完成块（纯文本）
  runLen: 0,                // 本帧新增的字符数：尾迹与淡入只作用在这些字符上
  done: false,
  streaming: false,
  status: '',
  error: '',
  empty: false,

  citations: [],
  lit: [],
  halo: [],
  answerId: '',

  conversationId: null,
  focus: null,              // { type, id, label } 当前可收藏对象
  sheet: { open: false, citations: [], pinned: false },
  whisper: { open: false, mode: 'point', raw: '', query: '', results: [], index: 0 },
  starbox: { open: false, tab: 'question', query: '', rows: [] },

  // 纸页内容（非回答纸页）
  concept: null,
  unit: null,
  map: null,
  compare: null,

  lexicon: { concepts: [], units: [], facets: null, axes: {}, index: [] },
  starDim: 1,
  hintSeen: false,
  exampleClosed: false,
  lastQuestion: '',
  favoritesVersion: 0,
  readingScale: 1,
});

export const intentLine = () =>
  app.intent === 'theme'
    ? '按范围查询理解：梳理这条脉络。'
    : '按单点查询理解：解释这个概念。';

export const seedQuestion = (question) => {
  app.question = question;
  app.input = question;
  focusInput();
};

// 输入线的焦点由 App 注册：状态层不持有 DOM 引用
const inputBridge = { focus: () => {} };

export function registerInput(handle) {
  inputBridge.focus = handle.focus;
  inputBridge.clear = handle.clear;
}

export function focusInput() {
  inputBridge.focus && inputBridge.focus();
}

export function clearInput() {
  app.input = '';
  inputBridge.clear && inputBridge.clear();
}

// --------------------------------------------------------------------------- //
// 启动
// --------------------------------------------------------------------------- //
export async function boot() {
  if (app.booted) return;
  app.booted = true;
  app.hintSeen = local.readFlag(local.LS.citationHint);
  app.exampleClosed = local.readFlag(local.LS.exampleClosed);
  app.lastQuestion = local.getLastQuestion();

  try {
    await local.migrateLegacy();
  } catch {
    /* 迁移失败不该挡住界面：旧键仍在，用户还有原始数据 */
  }

  try {
    const [concepts, units, facets, stats] = await Promise.all([
      api.concepts(),
      api.units(),
      api.facets(),
      api.stats(),
    ]);
    app.lexicon.concepts = concepts || [];
    app.lexicon.units = units || [];
    app.lexicon.facets = facets || null;
    app.lexicon.axes = (stats && stats.axes) || {};
    app.lexicon.index = indexFromConcepts(concepts || []);
  } catch {
    /* 词典拿不到时，术语匹配降级为空：正文照常可读 */
  }
}

// --------------------------------------------------------------------------- //
// 提问：SSE → 缓冲 → rAF 提交 → 定型
// --------------------------------------------------------------------------- //
// 后端（Python）给的是 CRLF。块级切分、段落切分、Markdown 都要按 LF 判断，
// 所以在入口统一归一：归一之后 "\n\n" / /\n[ \t]*\n/ 才是真的空行。
const CRLF = /\r\n?/g;
const normalizeStream = (text) => String(text == null ? '' : text).replace(CRLF, '\n');
const BLANK_LINE = /\n[ \t]*\n/;

let incoming = '';
let settled = false;
let consumed = 0;
let pumpStop = null;
let settleTimer = 0;
let statusTimers = [];

function clearStatusTimers() {
  statusTimers.forEach((t) => clearTimeout(t));
  statusTimers = [];
}

function stopPump() {
  if (pumpStop) {
    pumpStop();
    pumpStop = null;
  }
}

function resetPaper() {
  stopPump();
  clearTimeout(settleTimer);
  clearStatusTimers();
  incoming = '';
  consumed = 0;
  app.answerRaw = '';
  app.blocks = [];
  app.tail = '';
  app.runLen = 0;
  app.done = false;
  app.streaming = false;
  app.error = '';
  app.empty = false;
  app.skipped = false;
  app.clarifyOffer = false;
  app.citations = [];
  app.lit = [];
  app.halo = [];
}

function pump() {
  if (pumpStop) return;
  pumpStop = subscribe(() => {
    if (consumed >= incoming.length) return;
    const backlog = incoming.length - consumed;
    // 每帧 2–6 字：积压多时取 6，语气放缓时取 2
    const take = backlog > 60 ? 6 : backlog > 20 ? 4 : 2;
    const chunk = incoming.slice(consumed, consumed + take);
    consumed += chunk.length;
    app.runLen = chunk.length;
    app.tail += chunk;
    // 每个提交批次给背景一次脉冲：星图的闪烁因此与输出节奏同频
    if (starBridge.flash) starBridge.flash(chunk.length);
    // 块边界：把已完成的块提交为 html，只留最后一块继续长
    // （用 /\n[ \t]*\n/ 而不是 '\n\n'：空行里可能带缩进）
    if (BLANK_LINE.test(app.tail)) {
      const parts = app.tail.split(BLANK_LINE);
      const rest = parts.pop() || '';
      for (const block of parts) {
        if (block.trim()) app.blocks.push(block);   // 存原文：渲染在组件里做一次
      }
      app.tail = rest;
      app.runLen = 0;
    }
  });
}

/** 定型时取最长的一份文本：answerRaw / 完整缓冲 / 已提交尾巴，谁最长用谁。 */
function longestText(...candidates) {
  let best = '';
  for (const c of candidates) if (typeof c === 'string' && c.length > best.length) best = c;
  return best;
}

function finishAuthoritative() {
  const text = longestText(app.answerRaw, incoming, app.tail);
  app.blocks = splitBlocks(text);
  app.tail = '';
  app.runLen = 0;
  app.done = true;
  app.streaming = false;
  app.status = '';
}

function applyMeta(meta) {
  if (meta.conversation_id !== undefined) app.conversationId = meta.conversation_id || null;
  app.standalone = meta.standalone || '';
  app.citations = meta.citations || [];
  app.strategy = meta.strategy || app.strategy;
  app.skipped = !!meta.skipped || meta.strategy === 'gate';
  if (meta.strategy === 'gate' && meta.answer) {
    app.answerRaw = normalizeStream(meta.answer);
    app.blocks = splitBlocks(app.answerRaw);
    app.tail = '';
    app.done = true;
    app.streaming = false;
    app.status = '';
  }
  // 范围查询的星座轨迹来自 theme.anchors.concepts（不用 citations[].concepts）
  if (app.strategy === 'theme' && meta.theme && meta.theme.anchors) {
    enqueueLit(meta.theme.anchors.concepts || []);
  }
}

/** 术语命中 → 星图点亮：直接命中 ≤8、持久；邻域临时低亮。 */
export function enqueueLit(names) {
  const direct = [];
  for (const name of names || []) {
    if (direct.length >= LIT_LIMIT) break;
    if (!direct.includes(name)) direct.push(name);
  }
  if (!direct.length) return;
  const halo = neighborsOf(direct);
  app.lit = [...new Set([...app.lit, ...direct])];
  app.halo = halo;
  local.recordLitNodes(direct).catch(() => {});
  app.favoritesVersion += 1;
  if (starBridge.enqueue) starBridge.enqueue(direct, halo);
  if (starBridge.connect) starBridge.connect(direct);
}

const starBridge = { enqueue: null, setLit: null };

/** StarField 挂上来的渲染器钩子：状态层不直接碰 canvas。 */
export function attachStar(handle) {
  starBridge.enqueue = handle.enqueue;
  starBridge.setLit = handle.setLit;
  starBridge.connect = handle.connect;
  starBridge.setFavorites = handle.setFavorites;
  starBridge.flash = handle.flash;
  if (app.lit.length) handle.setLit(app.lit);
}

/** 术语命中连线：由纸页在标好 DOM 之后调用（星点 → 正文里的词）。 */
export function connectTerms(names) {
  if (starBridge.connect && names && names.length) starBridge.connect(names);
}

function neighborsOf(names) {
  const graph = starBridge.graph ? starBridge.graph() : null;
  if (!graph) return [];
  const set = new Set();
  for (const edge of graph.edges || []) {
    if (names.includes(edge.source) && !names.includes(edge.target)) set.add(edge.target);
    if (names.includes(edge.target) && !names.includes(edge.source)) set.add(edge.source);
  }
  return [...set];
}

export function provideGraph(getter) {
  starBridge.graph = getter;
}

/** 提交一个问题。strategy 为空时由后端 auto 判定。 */
export async function ask(question, { strategy = 'auto', followup = false } = {}) {
  const text = String(question || '').trim();
  if (!text) return;

  // 同一会话里连续提问都带 conversation_id，服务端据此把「继续 / 详细点」改写成独立问题；
  // 首问（还没有 id）与 Esc 重置之后的提问才是新会话。
  if (app.question && app.question !== text) {
    app.prevQuestion = app.question;
  } else if (!app.question) {
    app.prevQuestion = '';
  }

  settled = false;
  resetPaper();
  app.paperKind = 'answer';
  app.question = text;
  app.intent = strategy === 'theme' ? 'theme' : 'point';
  app.strategy = app.intent;
  app.streaming = true;
  app.answerId = 'a-' + Date.now();
  app.status = '正在检索……';
  dispatchStatusTimers();
  local.setLastQuestion(text);
  app.lastQuestion = text;

  pump();

  try {
    await streamAsk(
      { question: text, strategy, conversationId: app.conversationId },
      {
        onMeta: async (meta) => {
          applyMeta(meta);
          if (meta.strategy === 'clarify') {
            // 澄清卡不显示：前端就地回退一次点查询（§7）
            stopPump();
            app.streaming = false;
            await fallbackToPoint(text);
          }
        },
        onDelta: (delta) => {
          incoming += normalizeStream(delta);
        },
        onDone: (event) => {
          settled = true;
          const final = normalizeStream(event.answer || '');
          if (final) app.answerRaw = final;
          app.citations = event.citations || app.citations;
          incoming = final || incoming;
          if (!final && !incoming) {
            app.empty = true;
            app.streaming = false;
            app.status = '';
            stopPump();
            return;
          }
          clearStatusTimers();
          app.status = '';
          const wait = 1200;
          settleTimer = setTimeout(() => {
            finishAuthoritative();
            commitTermHits(event.annotations || []);
            stopPump();
          }, wait);
        },
        onError: (detail) => {
          settled = true;
          clearStatusTimers();
          stopPump();
          app.streaming = false;
          app.status = '';
          app.error = detail || '这次没有接通。Enter 重试';
        },
        onClose: () => {
          // 流结束了却没有 done/error：连接被中断。保留已收到的文字，并明确告知（§8.4）
          if (settled) return;
          settled = true;
          clearStatusTimers();
          stopPump();
          finishAuthoritative();
          commitTermHits([]);
          app.error = '输出中断。Enter 重试';
        },
      },
    );
  } catch (err) {
    clearStatusTimers();
    stopPump();
    app.streaming = false;
    app.status = '';
    app.error = navigator.onLine === false ? '服务没有响应。' : '这次没有接通。Enter 重试';
  }
}

function dispatchStatusTimers() {
  clearStatusTimers();
  statusTimers.push(setTimeout(() => {
    if (app.streaming && !app.done) app.status = '正在唤醒索引……';
  }, 1500));
  statusTimers.push(setTimeout(() => {
    if (app.streaming && !app.done) app.status = '仍在生成……';
  }, 6000));
}

async function fallbackToPoint(question) {
  try {
    const res = await api.ask({ question, strategy: 'point' });
    const body = normalizeStream(res.answer || '');
    const ok = res.strategy !== 'gate' && !res.skipped && body.trim().length > 0;
    if (!ok) throw new Error('empty');
    app.strategy = 'point';
    app.intent = 'point';
    app.standalone = res.standalone || '';
    app.conversationId = res.conversation_id || app.conversationId;
    app.answerRaw = body;
    app.citations = res.citations || [];
    app.skipped = false;
    finishAuthoritative();
    commitTermHits(res.annotations || []);
  } catch {
    app.clarifyOffer = true;
    app.answerRaw = '';
    app.blocks = [];
    app.tail = '';
    app.done = true;
    app.streaming = false;
  }
}

/** 定型后按权威文本重新算一遍术语命中：正文 + done.annotations。 */
function commitTermHits(annotations) {
  const names = [];
  const hits = findTerms(app.answerRaw || '', app.lexicon.index);
  for (const name of topTerms(hits, LIT_LIMIT)) names.push(name);

  for (const ann of annotations || []) {
    for (const name of ann.concepts || []) {
      if (names.length >= LIT_LIMIT) break;
      if (!names.includes(name)) names.push(name);
    }
  }
  if (app.strategy === 'point' && app.question) {
    const asked = findTerms(app.question, app.lexicon.index);
    for (const name of topTerms(asked, 1)) {
      if (!names.includes(name) && names.length < LIT_LIMIT) names.unshift(name);
    }
  }
  enqueueLit(names);
  rememberAnswer();
  app.focus = { type: 'answer', id: app.answerId, label: app.question };
}

function rememberAnswer() {
  if (!app.answerRaw) return;
  local.saveAnswer({
    id: app.answerId || 'a-' + Date.now(),
    question: app.question,
    standalone: app.standalone,
    strategy: app.strategy,
    answer: app.answerRaw,
    // 只存引用坐标，正文按 chunk_id 走 /api/context 回捞（§12.1）
    citations: app.citations.map((c) => ({
      n: c.n,
      chunk_id: c.chunk_id,
      citation: c.citation,
      unit: c.unit,
      unit_title: c.unit_title,
      start: c.start,
      end: c.end,
    })),
    litNodes: app.lit.slice(),
    conversationId: app.conversationId || '',
    pinned: 0,
    createdAt: Date.now(),
  }).catch(() => {});
}

/** 范围纸页里点术语 → 点查询（不用题干硬猜）。 */
export function focusOnPoint(term) {
  ask('什么是' + term + '？', { strategy: 'point' });
}

export function switchIntent(next) {
  if (next === app.intent) return;
  ask(app.question, { strategy: next === 'theme' ? 'theme' : 'point' });
}

export function retry() {
  if (app.question) ask(app.question, { strategy: app.strategy === 'theme' ? 'theme' : 'point' });
}

export function resetSession() {
  resetPaper();
  app.paperKind = '';
  app.question = '';
  app.standalone = '';
  app.prevQuestion = '';
  app.conversationId = null;
  app.error = '';
  app.focus = null;
  app.concept = null;
  app.unit = null;
  app.map = null;
  app.compare = null;
  app.starDim = 1;
}

// --------------------------------------------------------------------------- //
// 其他纸页
// --------------------------------------------------------------------------- //
export async function openConcept(term) {
  const name = String(term || '').trim();
  if (!name) return;
  closeOverlays();
  app.paperKind = 'concept';
  app.question = name;
  app.answerRaw = '';
  app.tail = '';
  app.done = false;
  app.streaming = false;
  app.citations = [];
  app.starDim = 0.6;
  app.focus = { type: 'concept', id: name, label: name };
  try {
    const card = await api.concept(name);
    if (card && card.found) {
      app.concept = { ...card, semantic: null };
    } else {
      const semantic = await api.term(name).catch(() => null);
      app.concept = { ...(card || { term: name, found: false }), semantic };
    }
    enqueueLit([card && card.found ? card.term || name : name]);
  } catch {
    app.concept = { term: name, found: false, semantic: null };
  }
}

export async function openUnit(code) {
  closeOverlays();
  app.paperKind = 'unit';
  app.question = code;
  app.starDim = 0.6;
  try {
    app.unit = await api.unit(code);
    const saved = local.getReadPos();
    app.unit.savedScroll = saved && saved.code === code ? saved.scrollTop : 0;
    enqueueLit(app.unit.concepts ? app.unit.concepts.slice(0, LIT_LIMIT).map((c) => c.name) : []);
  } catch {
    app.unit = null;
  }
}

export async function openSystemMap() {
  closeOverlays();
  app.paperKind = 'map';
  app.question = '体系地图';
  app.starDim = 0.6;
  app.map = { units: app.lexicon.units };
}

export async function openCompare(a, b) {
  closeOverlays();
  app.paperKind = 'compare';
  app.question = a + ' ↔ ' + b;
  app.starDim = 0.6;
  try {
    app.compare = await api.compare(a, b);
    enqueueLit([a, b]);
  } catch {
    app.compare = null;
  }
}

export function useUnitToAsk(question) {
  ask(question, { strategy: 'point', followup: false });
}

// --------------------------------------------------------------------------- //
// 浮层：引用薄层 / 星匣 / 低语层
// --------------------------------------------------------------------------- //
export function closeOverlays() {
  app.sheet.open = false;
  app.whisper.open = false;
  app.starbox.open = false;
  app.starDim = app.paperKind ? 0.6 : 1;
}

export function openSheet(citations, entry) {
  app.sheet.open = true;
  app.sheet.citations = citations && citations.length ? citations : (entry ? [entry] : []);
  app.sheet.pinned = false;
  app.starDim = 0.55;
  app.focus = citations && citations.length
    ? { type: 'citation', id: citations[0].chunk_id, label: citations[0].citation || '' }
    : null;
}

export function toggleSheetPin() {
  app.sheet.pinned = !app.sheet.pinned;
}

export async function toggleStarbox(force) {
  const next = force == null ? !app.starbox.open : force;
  if (!next) {
    app.starbox.open = false;
    app.starDim = app.paperKind ? 0.6 : 1;
    return;
  }
  closeOverlays();
  app.starbox.open = true;
  app.starDim = 0.55;
  await refreshStarbox();
}

export async function refreshStarbox() {
  const rows = await local.listFavorites(app.starbox.tab === 'all' ? null : app.starbox.tab);
  const query = String(app.starbox.query || '').trim();
  app.starbox.rows = rows.filter((row) => {
    if (!query) return true;
    return JSON.stringify(row).includes(query) || String(row.title || '').includes(query);
  });
}

export function setStarboxTab(tab) {
  app.starbox.tab = tab;
  refreshStarbox();
}

export async function dropFavorite(id) {
  await local.removeFavoriteById(id);
  await refreshStarbox();
  app.favoritesVersion += 1;
}

export async function jumpFavorite(row) {
  if (row.type === 'concept') return openConcept(row.refId);
  if (row.type === 'citation') {
    const citations = await local.db.citations.toArray();
    const hit = citations.find((c) => c.id === row.refId);
    if (!hit) return openSheet([], null);
    // 库里只有坐标与片段：打开薄层时按 chunk_id 回捞正文
    const ctx = await api.context(hit.chunkId).catch(() => null);
    const focus = ctx && ctx.items ? ctx.items.find((i) => i.is_focus) : null;
    return openSheet([{ ...hit, n: 1, text: (focus && focus.text) || hit.snippet || '' }], null);
  }
  if (row.type === 'question') {
    seedQuestion(row.title || row.refId);
    return closeOverlays();
  }
  if (row.type === 'answer') {
    const answers = await local.db.answers.toArray();
    const hit = answers.find((a) => a.id === row.refId);
    if (hit) {
      closeOverlays();
      app.paperKind = 'answer';
      app.question = hit.question;
      app.strategy = hit.strategy || 'point';
      app.intent = hit.strategy === 'theme' ? 'theme' : 'point';
      app.answerRaw = hit.answer;
      app.citations = hit.citations || [];
      app.lit = hit.litNodes || [];
      finishAuthoritative();
      if (starBridge.setLit) starBridge.setLit(app.lit);
    }
  }
}

// 低语层 ---------------------------------------------------------------- //
const WHISPER_MODES = [
  { key: 'point', prefix: '' },
  { key: 'quote', prefix: '引 ' },
  { key: 'theme', prefix: '脉 ' },
  { key: 'unit', prefix: '读 ' },
  { key: 'map', prefix: '图 ' },
  { key: 'compare', prefix: '对 ' },
];

export function parseWhisper(raw) {
  const text = String(raw || '');
  for (const mode of WHISPER_MODES) {
    if (mode.prefix && text.startsWith(mode.prefix)) {
      return { mode: mode.key, query: text.slice(mode.prefix.length) };
    }
  }
  return { mode: 'point', query: text };
}

export function openWhisper() {
  app.whisper.open = true;
  app.whisper.raw = '';
  app.whisper.query = '';
  app.whisper.results = [];
  app.whisper.index = 0;
  app.whisper.mode = 'point';
  app.starDim = app.paperKind ? 0.6 : 1;
}

export function closeWhisper() {
  app.whisper.open = false;
  app.whisper.results = [];
  focusInput();          // 关闭后回到原焦点
}

/** 低语层输入：本地过滤，够快也够准；真正取数据在 Enter 时发生。 */
export function updateWhisper(raw) {
  app.whisper.raw = raw;
  const { mode, query } = parseWhisper(raw);
  app.whisper.query = query;
  app.whisper.mode = mode;
  app.whisper.index = 0;

  const q = query.trim();
  if (!q) {
    app.whisper.results = [];
    return;
  }

  if (mode === 'point') {
    app.whisper.results = filterConcepts(q);
  } else if (mode === 'unit' || mode === 'map') {
    app.whisper.results = (app.lexicon.units || [])
      .filter((u) => String(u.code).includes(q) || String(u.title || '').includes(q))
      .slice(0, 5)
      .map((u) => ({ label: u.code + ' ' + (u.title || ''), value: u.code }));
  } else {
    app.whisper.results = [];
  }
}

function filterConcepts(query) {
  const q = query.toLowerCase();
  const out = [];
  for (const c of app.lexicon.concepts || []) {
    const name = String(c.name || '');
    if (name.toLowerCase().includes(q)) {
      out.push({ label: name, value: name, hint: c.definition || '' });
    } else if ((c.aliases || []).some((a) => String(a).length > 1 && String(a).toLowerCase().includes(q))) {
      out.push({ label: name, value: name, hint: c.definition || '' });
    }
    if (out.length >= 5) break;
  }
  return out;
}

export async function runWhisper() {
  const mode = app.whisper.mode;
  const query = app.whisper.query.trim();
  const picked = app.whisper.results[app.whisper.index];
  if (mode === 'point') {
    const term = picked ? picked.value : query;
    if (!term) return;
    closeWhisper();
    return openConcept(term);
  }
  if (mode === 'theme') {
    if (!query) return;
    closeWhisper();
    return ask(query, { strategy: 'theme' });
  }
  if (mode === 'unit') {
    const code = picked ? picked.value : query;
    if (!code) return;
    closeWhisper();
    return openUnit(code);
  }
  if (mode === 'map') {
    closeWhisper();
    return openSystemMap();
  }
  if (mode === 'compare') {
    const pair = splitCompare(query);
    if (!pair) {
      closeWhisper();
      app.paperKind = 'compare';
      app.compare = null;
      app.question = query;
      return;
    }
    closeWhisper();
    return openCompare(pair[0], pair[1]);
  }
  if (mode === 'quote') {
    const params = parseQuoteTokens(query);
    closeWhisper();
    try {
      const payload = await api.quote({ ...params, limit: 12 });
      const quotes = (payload.quotes || []).map((q, i) => ({ ...q, n: i + 1 }));
      openSheet(quotes, null);
    } catch {
      openSheet([], null);
    }
  }
}

/** 对比拆分：A ↔ B / A vs B / 两个空白分隔的词。 */
export function splitCompare(text) {
  const raw = String(text || '').trim();
  const arrow = raw.split(/\s*(?:↔|<->|<=>|vs\.?|VS)\s*/);
  if (arrow.length === 2 && arrow[0].trim() && arrow[1].trim()) {
    return [arrow[0].trim(), arrow[1].trim()];
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 2) return [words[0], words[1]];
  return null;
}

/** 引 的 token 解析：单元编号 → 说话人 → 概念 → 关键词（优先级固定）。 */
export function parseQuoteTokens(text) {
  const raw = String(text || '').trim();
  const facets = app.lexicon.facets || {};
  const params = {};
  if (!raw) return params;

  const unitHit = raw.match(/(\d+(?:-\d+){0,3})/);
  if (unitHit) {
    params.unit = unitHit[1];
    const rest = raw.replace(unitHit[1], '').trim();
    if (rest) params.keyword = rest;
    return params;
  }

  const speakers = (facets.speaker || []).map((row) => row[0]);
  const concepts = (facets.concept || []).map((row) => row[0]);
  const speaker = speakers.find((s) => s && raw.includes(s));
  if (speaker) {
    params.speaker = speaker;
    const rest = raw.replace(speaker, '').trim();
    if (rest) params.keyword = rest;
    return params;
  }
  const concept = concepts.find((c) => c && c.length > 1 && raw.includes(c));
  if (concept) {
    params.concept = concept;
    const rest = raw.replace(concept, '').trim();
    if (rest) params.keyword = rest;
    return params;
  }
  params.keyword = raw;
  return params;
}

// 收藏 ------------------------------------------------------------------ //
export async function favoriteFocused() {
  const focus = app.focus;
  if (!focus) return;
  const payload = { title: focus.label || focus.id };
  if (focus.type === 'citation') {
    const entry = app.sheet.citations.find((c) => c.chunk_id === focus.id) || null;
    if (entry) {
      payload.title = entry.citation || entry.chunk_id;
      payload.snippet = String(entry.text || '').slice(0, 200);
      payload.origin = app.sheet.citations.length ? app.question : '';
      // 引用只存坐标 + 一小段片段：完整正文按 chunk_id 走 /api/context 回捞（§12.1）
      await local.db.citations.put({
        id: 'c:' + entry.chunk_id,
        chunkId: entry.chunk_id,
        answerId: '',
        citation: entry.citation || '',
        snippet: String(entry.text || '').slice(0, 200),
        legacyAnnotation: '',
        pinned: 1,
        createdAt: Date.now(),
      });
    }
  }
  await local.addFavorite(focus.type, focus.id, payload);
  app.favoritesVersion += 1;
  await refreshConceptFavorites();
}

/** 概念收藏 = 星图上多一圈极淡的环；收藏后立即生效，不必刷新。 */
async function refreshConceptFavorites() {
  if (!starBridge.setFavorites) return;
  const favs = await local.listFavorites('concept').catch(() => []);
  starBridge.setFavorites(favs.map((f) => f.refId));
}

export async function unfavoriteFocus() {
  const focus = app.focus;
  if (!focus) return;
  await local.removeFavorite(focus.type, focus.id);
  app.favoritesVersion += 1;
  await refreshConceptFavorites();
}

export function setFocus(focus) {
  app.focus = focus;
}

export async function favoriteState() {
  const focus = app.focus;
  if (!focus) return false;
  return local.isFavorite(focus.type, focus.id);
}
