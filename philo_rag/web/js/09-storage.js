/* 09-storage.js · 唯一的本地存储口：阅读位置 / 书签笔记 / 问答历史的读写、容错与裁剪 */
'use strict';
window.PHILO = window.PHILO || {};

function readPos() {
  try { return JSON.parse(localStorage.getItem(READ_POS_KEY) || 'null'); } catch { return null; }
}

function saveReadPos(code, scrollTop) {
  try {
    localStorage.setItem(READ_POS_KEY, JSON.stringify({ code, scrollTop }));
  } catch { /* 隐私模式：忽略 */ }
}

function loadNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(n => n && n.chunk_id) : [];
  } catch { return []; }
}

/* 落盘并返回写入的列表：state 由调用方经 StateWrite 写入（本文件不碰 state） */
function saveNotes(list) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(list));
  } catch { /* 隐私模式 / 配额不足：静默忽略，界面仍可用 */ }
  return list;
}

function loadAnswers() {
  try {
    const raw = JSON.parse(localStorage.getItem(ANS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(a => a && a.id && a.answer) : [];
  } catch { return []; }
}

/* 两级裁剪：先按条数，再按字符水位。pinned 条目最后才丢——用户明确收藏过的东西
   被后来的新答案挤掉，是最难解释的一种数据丢失。 */
function trimAnswers(list) {
  const out = list.slice(0, MAX_HISTORY);
  let size = JSON.stringify(out).length;
  if (size <= ANS_HARD_MAX) return out;
  // 逐个扣减各条自身的字符数，避免每丢一条就整体 stringify 一次（O(n²) 卡顿）
  const drop = keep => {
    for (let i = out.length - 1; i >= 0 && size > ANS_SOFT_MAX; i--) {
      if (!keep(out[i])) continue;
      size -= JSON.stringify(out[i]).length + 1;
      out.splice(i, 1);
    }
  };
  drop(a => !a.pinned);
  drop(() => true);
  return out;
}

/* 裁剪 + 落盘，返回裁剪后的列表（调用方据此写 state.answers） */
function saveAnswers(list) {
  const trimmed = trimAnswers(list);
  try {
    localStorage.setItem(ANS_KEY, JSON.stringify(trimmed));
  } catch { /* 隐私模式 / 配额不足：静默忽略，界面仍可用 */ }
  return trimmed;
}

window.PHILO.store = Object.assign(window.PHILO.store || {}, {
  readPos, saveReadPos, loadNotes, saveNotes, loadAnswers, saveAnswers, trimAnswers,
});
