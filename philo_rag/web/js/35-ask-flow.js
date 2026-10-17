/* 35-ask-flow.js · 提问流：doAsk 的 SSE 状态机、竞态守卫与流式渲染节奏（编排各 render，不自己拼 HTML 容器） */
'use strict';
window.PHILO = window.PHILO || {};

function startTimer(el) {
  const t0 = performance.now();
  return setInterval(() => {
    if (el && el.isConnected) el.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's';
  }, 100);
}

/* 流式追加时按帧合并渲染：delta 每秒可上百个，逐个重排会明显卡顿。
   若容器已被 renderAnswer() 换掉（done 时重渲染），这一帧自动作废。 */
let answerFrame = 0;

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= ANSWER_BOTTOM_THRESHOLD;
}

function paintAnswer(el, text) {
  cancelAnimationFrame(answerFrame);
  answerFrame = requestAnimationFrame(() => {
    if (!el.isConnected) return;
    const pane = $('#ask-out');
    const followLatest = pane && isNearBottom(pane);
    const scrollTop = pane ? pane.scrollTop : 0;
    el.innerHTML = mdToHtml(text);
    if (pane) pane.scrollTop = followLatest ? pane.scrollHeight : scrollTop;
  });
}

/* 同一时刻只保留最新一条提问流。流式期间示例、澄清选项、地图入口都还能点，
   没有这个序号，旧流的 done 会用旧 meta 重新渲染，把新答案覆盖掉；
   state.ask / citePage 也会被两股流轮流重置。 */
let askSeq = 0;
let askAbort = null;

async function doAsk(q, strategy, focus) {
  const strat = strategy || state.strategy;
  const out = $('#ask-out');
  const seq = ++askSeq;
  if (askAbort) askAbort.abort();
  const ac = new AbortController();
  askAbort = ac;
  const stale = () => seq !== askSeq;

  out.innerHTML = '<div class="card muted">检索并生成中… <b id="ask-t">0.0s</b></div>';
  $('#cite-cards').innerHTML = '<div class="muted">—</div>';
  $('#cite-pager').innerHTML = '';
  const tick = startTimer($('#ask-t'));
  $('#ask-btn').disabled = true;
  try {
    // 流式 SSE：先收到 meta（引用面板就绪），再逐字追加回答正文
    const r = await API.streamAsk({
      // conversation_id 为 null 表示新会话；追问沿用同一 id，服务端才能取到上文
      question: q, strategy: strat, focus, conversation_id: state.conv.id,
    }, ac.signal);
    if (!r.ok) throw new Error(await errText(r));

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let meta = null;
    let answerText = '';
    let answerEl = null;
    let clarify = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (stale()) return;   // 已被新提问接管：停止消费这条流
      buf += decoder.decode(value, { stream: true });
      // SSE 事件以 \n\n 分隔
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = block.trim();
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        if (event.type === 'meta') {
          meta = event;
          meta.question = q;          // meta 不带问题原文，历史与 chips 都要用
          // 重复赋同值无害，因此可以无条件执行
          StateWrite.convId(event.conversation_id || state.conv.id);
          answerText = '';
          StateWrite.citePage(0);
          StateWrite.ask(event);
          if (event.strategy === 'clarify') {
            clarify = true;
            answerEl = null;
            renderClarifyCard(event);
            $('#cite-cards').innerHTML = '<div class="muted">—</div>';
            $('#cite-pager').innerHTML = '';
            continue;
          }
          // 构建回答框架：先空容器，后续 delta 逐帧追加渲染
          renderAnswerSkeleton(event);
          renderCitations(event);
          syncBookmarkButtons();
          answerEl = $('#ask-answer-text');
        } else if (event.type === 'delta') {
          if (clarify) continue;
          answerText += event.text;
          if (answerEl) paintAnswer(answerEl, answerText);
        } else if (event.type === 'done') {
          // 最终清理（去掉模型可能输出的来源行）。sections/annotations 在
          // meta 阶段被后端置空，done 事件里才是解析后的真值，必须一并合入，
          // 否则最终渲染会覆盖掉流式期间已显示的「术语注解」。
          if (clarify) continue;
          if (meta) {
            meta.answer = event.answer;
            StateWrite.ask({
              ...meta,
              answer: event.answer,
              sections: event.sections || [],
              annotations: event.annotations || [],
            });
            // chips 与历史只在 done 落地：被 stale() 接管的旧流根本走不到这里
            if (pushConvTurn(state.ask.question)) renderConvChips();
            recordAnswer(state.ask);
            renderAnswer(state.ask);
          }
        } else if (event.type === 'error') {
          out.innerHTML = `<div class="err">${esc(event.detail)}</div>`;
        }
      }
    }

    // 如果没有收到任何事件（如网关跳过），回退到旧接口
    if (!meta) {
      const r2 = await jpost('/api/ask', {
        question: q, strategy: strat, focus, conversation_id: state.conv.id,
      });
      if (stale()) return;
      StateWrite.ask(r2);
      StateWrite.citePage(0);
      r2.question = q;
      StateWrite.convId(r2.conversation_id || state.conv.id);
      if (r2.strategy === 'clarify') {
        renderClarifyCard(r2);
        $('#cite-cards').innerHTML = '<div class="muted">—</div>';
        $('#cite-pager').innerHTML = '';
      } else {
        if (pushConvTurn(q)) renderConvChips();
        recordAnswer(r2);
        renderAnswer(r2);
        renderCitations(r2);
        syncBookmarkButtons();
      }
    }
  } catch (e) {
    if (stale()) return;   // 旧请求被 abort() 打断属正常路径，不报错
    out.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  } finally {
    clearInterval(tick);
    if (!stale()) $('#ask-btn').disabled = false;
  }
}

window.PHILO = window.PHILO || {};
PHILO.ask = Object.assign(PHILO.ask || {}, {
  doAsk, paintAnswer, startTimer, isNearBottom,
  /* 作废在飞的旧流：新对话与「再次提问」都要用，askSeq / askAbort 只在本文件里 */
  cancelInflight() {
    askSeq++;
    if (askAbort) askAbort.abort();
  },
});
