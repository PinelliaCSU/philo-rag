// 本地存储：Dexie / IndexedDB 是唯一的持久层，localStorage 只留一次性 UI 标记。
//
// 为什么不是 localStorage：收藏要按类型/时间查询、引用要按问题关联、点亮要按节点去重，
// 这些都需要索引与事务；localStorage 是同步 key-value，5MB 上限且没有事务。
// 旧的三个键不删——迁移写完 Dexie 再标记，旧数据保留一版供用户手动清理。
//
// 文件下半部分是纯函数（规划迁移、规划裁剪、组装导出），不碰 IndexedDB，
// 因此可以在 jsdom 里直接单测——这是 vitest 这条测试线的落点。

import Dexie from 'dexie';

export const LS = {
  exampleClosed: 'philo-example-closed',      // 示例纸片已关闭
  citationHint: 'philo-citation-hint',        // 首次引用提示已显示
  lastQuestion: 'philo-last-question',        // 上次问到这里
  readPos: 'philo-read-pos',                  // 单元阅读滚动位置
};

const LEGACY = {
  notes: 'philo-notes-v1',
  answers: 'philo-answers-v1',
  readPos: 'philo-read-pos',
};

export const HISTORY_MAX = 200;

export const db = new Dexie('philo-rag');
db.version(1).stores({
  answers: 'id, createdAt, pinned',
  citations: 'id, chunkId, answerId, pinned, createdAt',
  concepts: 'name, pinned, createdAt',
  favorites: '++id, type, refId, createdAt',
  litNodes: 'name, firstLitAt, lastHitAt',
  meta: 'key',
});

// --------------------------------------------------------------------------- //
// 纯函数：迁移 / 裁剪 / 导出
// --------------------------------------------------------------------------- //

/** 旧 localStorage → Dexie 的迁移计划。旧批注进 citations.legacyAnnotation。 */
export function planLegacyMigration({ notes = [], answers = [], readPos = null } = {}) {
  const citations = (Array.isArray(notes) ? notes : [])
    .filter((n) => n && n.chunk_id)
    .map((n) => ({
      id: 'legacy:' + n.chunk_id,
      chunkId: n.chunk_id,
      answerId: '',
      citation: n.citation || '',
      snippet: String(n.text || '').slice(0, 200),   // 只留片段，正文按 chunk_id 回捞
      unit: n.unit || '',
      unitTitle: n.unit_title || '',
      legacyAnnotation: n.note || '',   // 批注不再有编辑 UI，只读展示与导出
      pinned: 0,
      createdAt: n.ts || Date.now(),
    }));

  const rows = (Array.isArray(answers) ? answers : [])
    .filter((a) => a && a.id && a.answer)
    .map((a) => ({
      id: String(a.id),
      question: a.question || '',
      standalone: a.standalone || '',
      strategy: a.strategy || 'point',
      answer: a.answer,
      citations: a.citations || [],
      litNodes: a.litNodes || [],
      conversationId: a.conversationId || '',
      pinned: a.pinned ? 1 : 0,
      createdAt: a.ts || Date.now(),
    }));

  return {
    citations,
    answers: rows,
    readPos: readPos && typeof readPos === 'object' ? readPos : null,
  };
}

/** 裁剪计划：超出上限时先丢最早的未收藏条目，收藏的留到最后。返回要删的 id。 */
export function planTrim(rows, max = HISTORY_MAX) {
  if (!rows || rows.length <= max) return [];
  const byAge = [...rows].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const order = [...byAge.filter((r) => !r.pinned), ...byAge.filter((r) => r.pinned)];
  return order.slice(0, rows.length - max).map((r) => r.id);
}

/** 「导出 JSON（全部回答）」的内容：answers / citations / litNodes 全量，不依赖收藏。 */
export function buildExportJson({ answers = [], citations = [], litNodes = [], meta = [] } = {}) {
  return {
    exportedAt: new Date().toISOString(),
    answers,
    citations,
    litNodes,
    meta,
  };
}

/** 「导出 Markdown（收藏）」：四类收藏按类型分节。 */
export function buildFavoritesMarkdown({ favorites = [], answers = [], citations = [], concepts = [] } = {}) {
  const lines = ['# 星匣导出', '', '导出时间：' + new Date().toLocaleString('zh-CN'), ''];
  const byType = (t) => favorites.filter((f) => f.type === t);

  const questions = byType('question');
  if (questions.length) {
    lines.push('## 问题', '');
    for (const f of questions) lines.push('- ' + (f.title || f.refId));
    lines.push('');
  }

  const answerIds = new Set(byType('answer').map((f) => f.refId));
  const pickedAnswers = answers.filter((a) => answerIds.has(a.id));
  if (pickedAnswers.length) {
    lines.push('## 回答', '');
    for (const a of pickedAnswers) {
      lines.push('### ' + (a.question || '（未记录问题）'), '');
      lines.push(String(a.answer || '').trim(), '');
      if (a.litNodes && a.litNodes.length) lines.push('点亮：' + a.litNodes.join('、'), '');
    }
  }

  const citationIds = new Set(byType('citation').map((f) => f.refId));
  const pickedCitations = citations.filter((c) => citationIds.has(c.id) || citationIds.has(c.chunkId));
  if (pickedCitations.length) {
    lines.push('## 引用', '');
    for (const c of pickedCitations) {
      lines.push('- ' + (c.citation || c.chunkId));
      if (c.snippet) lines.push('  > ' + String(c.snippet).replace(/\n/g, ' '));
      if (c.legacyAnnotation) lines.push('  批注：' + c.legacyAnnotation);
    }
    lines.push('');
  }

  const conceptNames = new Set(byType('concept').map((f) => f.refId));
  const pickedConcepts = concepts.filter((c) => conceptNames.has(c.name));
  if (pickedConcepts.length) {
    lines.push('## 概念', '');
    for (const c of pickedConcepts) lines.push('- ' + c.name + (c.definition ? '：' + c.definition : ''));
    lines.push('');
  }

  return lines.join('\n');
}

// --------------------------------------------------------------------------- //
// localStorage：只留一次性标记与上次问题
// --------------------------------------------------------------------------- //
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式 / 配额不足：界面仍可用 */
  }
}

export function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function setFlag(key, on = true) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* 同上 */
  }
}

export function getLastQuestion() {
  try {
    return localStorage.getItem(LS.lastQuestion) || '';
  } catch {
    return '';
  }
}

export function setLastQuestion(question) {
  try {
    localStorage.setItem(LS.lastQuestion, String(question || ''));
  } catch {
    /* 同上 */
  }
}

export function getReadPos() {
  return readJSON(LS.readPos, null);
}

export function setReadPos(pos) {
  writeJSON(LS.readPos, pos);
}

// --------------------------------------------------------------------------- //
// 迁移与读写
// --------------------------------------------------------------------------- //
export async function migrateLegacy() {
  const done = await db.meta.get('migrated');
  if (done && done.value) return { migrated: false };

  const plan = planLegacyMigration({
    notes: readJSON(LEGACY.notes, []),
    answers: readJSON(LEGACY.answers, []),
    readPos: readJSON(LEGACY.readPos, null),
  });

  if (plan.citations.length) await db.citations.bulkPut(plan.citations);
  if (plan.answers.length) await db.answers.bulkPut(plan.answers);
  if (plan.readPos) {
    await db.meta.put({ key: 'legacyReadPos', value: plan.readPos });
    if (!getReadPos()) setReadPos(plan.readPos);
  }

  await db.meta.put({ key: 'migrated', value: 1 });
  return { migrated: true, notes: plan.citations.length, answers: plan.answers.length };
}

/** 点亮记录：只记直接命中（邻域临时低亮，不写库）。 */
export async function recordLitNodes(names, at = Date.now()) {
  if (!names || !names.length) return;
  await db.transaction('rw', db.litNodes, async () => {
    for (const name of names) {
      const row = await db.litNodes.get(name);
      if (row) {
        await db.litNodes.put({ ...row, lastHitAt: at, count: (row.count || 1) + 1 });
      } else {
        await db.litNodes.put({ name, firstLitAt: at, lastHitAt: at, count: 1 });
      }
    }
  });
}

export async function allLitNodes() {
  return db.litNodes.toArray();
}

export async function saveAnswer(record) {
  await db.answers.put(record);
  await trimAnswers();
  return record;
}

export async function trimAnswers(max = HISTORY_MAX) {
  const rows = await db.answers.toArray();
  const victims = planTrim(rows, max);
  if (victims.length) await db.answers.bulkDelete(victims);
}

const FAVORITE_TYPES = new Set(['question', 'answer', 'citation', 'concept']);

export async function addFavorite(type, refId, payload = {}) {
  if (!FAVORITE_TYPES.has(type)) throw new Error('未知收藏类型：' + type);
  const exists = await db.favorites.where({ type, refId }).first();
  if (exists) return exists;
  const id = await db.favorites.add({ type, refId, createdAt: Date.now(), ...payload });
  return { id, type, refId, ...payload };
}

export async function removeFavorite(type, refId) {
  await db.favorites.where({ type, refId }).delete();
}

export async function isFavorite(type, refId) {
  const row = await db.favorites.where({ type, refId }).first();
  return !!(row && row.id);
}

export async function listFavorites(type = null) {
  const all = await db.favorites.toArray();
  return (type ? all.filter((f) => f.type === type) : all)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeFavoriteById(id) {
  await db.favorites.delete(id);
}

export async function exportAllJson() {
  const [answers, citations, litNodes, meta] = await Promise.all([
    db.answers.toArray(),
    db.citations.toArray(),
    db.litNodes.toArray(),
    db.meta.toArray(),
  ]);
  return buildExportJson({ answers, citations, litNodes, meta });
}

export async function exportFavoritesMarkdown() {
  const [favorites, answers, citations, concepts] = await Promise.all([
    listFavorites(),
    db.answers.toArray(),
    db.citations.toArray(),
    db.concepts.toArray(),
  ]);
  return buildFavoritesMarkdown({ favorites, answers, citations, concepts });
}

/** 触发一次浏览器下载（导出链使用；不弹 toast）。 */
export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
