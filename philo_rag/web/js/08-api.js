/* 08-api.js · 唯一的出网口：JSON 请求、SSE 提问流与后端错误文案 */
'use strict';
window.PHILO = window.PHILO || {};

/* 后端出错时优先取 JSON 里的 detail，避免界面直接显示 "Internal Server Error" */
async function errText(r) {
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    return j.detail || j.message || t;
  } catch { return t; }
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await errText(r));
  return r.json();
}

async function jpost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await errText(r));
  return r.json();
}

/* 流式 SSE：先收到 meta（引用面板就绪），再逐字追加回答正文。
   只在这里出现 fetch，35-ask-flow.js 拿到的是同一个 Response。 */
const API = {
  streamAsk(body, signal) {
    return fetch('/api/ask_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // conversation_id 为 null 表示新会话；追问沿用同一 id，服务端才能取到上文
      body: JSON.stringify(body),
      signal,
    });
  },
};

window.PHILO.api = Object.assign(window.PHILO.api || {}, { errText, jget, jpost, streamAsk: API.streamAsk });
