/* 05-state.js · 唯一的可变状态 + 唯一写入方：state 只在此声明，其它模块经 StateWrite 改、只读 state */
'use strict';
window.PHILO = window.PHILO || {};

const state = {
  strategy: 'auto',
  searchMode: 'term',
  ask: null,
  citePage: 0,
  searchItems: [],
  searchPage: 0,
  searchEmpty: '',       // 检索无命中时的提示文案（分页重绘时复用它）
  facets: null,
  units: [],
  unitDetail: null,      // 当前打开的单元导览 {code, items, page, raw}
  notes: [],             // 本地书签与批注（init 时从本地存储读入）
  answers: [],           // 问答历史（键 philo-answers-v1，init 时读入）
  conv: { id: null, turns: [] },  // 会话：id 由服务端下发；turns 只显示 chips，不参与改写
  read: null,            // 连续阅读：{code, title, items}
  readFont: 18,          // 阅读区字号（px）：必须有初值，否则字号按钮会把 NaN 写进 style
  chunkCache: new Map(), // chunk_id → 可收藏的块信息（引用卡 / 概念卡 / 单元块列表写入）
};

/* 写入函数：其它模块只能经这里改 state；渲染函数只读（分页越界归位这类归一化也走这里） */
const StateWrite = {
  strategy(s) { state.strategy = s; },
  searchMode(m) { state.searchMode = m; },
  ask(v) { state.ask = v; },
  askPinned(v) { if (state.ask) state.ask.pinned = v; },
  citePage(n) { state.citePage = n; },
  searchItems(list) { state.searchItems = list; },
  searchPage(n) { state.searchPage = n; },
  searchEmpty(msg) { state.searchEmpty = msg || ''; },
  facets(f) { state.facets = f; },
  units(u) { state.units = u; },
  unitDetail(d) { state.unitDetail = d; },
  unitDetailPage(n) { if (state.unitDetail) state.unitDetail.page = n; },
  read(d) { state.read = d; },
  readFont(px) { state.readFont = px; },
  notes(list) { state.notes = list; },
  addNote(note) { state.notes.push(note); },
  noteText(i, text) { if (state.notes[i]) state.notes[i].note = text; },
  answers(list) { state.answers = list; },
  conv(c) { state.conv = c; },
  convId(id) { state.conv.id = id; },
  chunk(info) { state.chunkCache.set(info.chunk_id, info); },
  /* 新对话的状态复位：动作时序（作废旧流、重绘容器）留在 80-app.js 的 newConv 里 */
  resetConv() {
    state.conv = { id: null, turns: [] };
    state.ask = null;
    state.citePage = 0;
  },
};

/* 会话 chips 的纯状态写入：返回是否真的写入，编排层据此决定重绘 chips */
function pushConvTurn(q) {
  const text = String(q || '').trim();
  if (!text) return false;
  state.conv.turns.push(text);
  if (state.conv.turns.length > CONV_CHIPS_MAX) state.conv.turns.shift();
  return true;
}

window.PHILO.state = state;
window.PHILO.write = StateWrite;
window.PHILO.pushConvTurn = pushConvTurn;
