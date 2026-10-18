<script>
  import { onDestroy } from 'svelte';
  import { annotateCitations, replaceCitationTokens, shortSource } from '../../lib/citations.js';
  import { renderBlock, renderInline } from '../../lib/markdown.js';
  import { markTermHits } from '../../lib/terms.js';
  import { isLowPowerDevice, prefersReducedMotion, subscribe } from '../../lib/motion.js';
  import { LS, readFlag, setFlag } from '../../lib/db.js';
  import {
    ask, connectTerms, favoriteFocused, intentLine, openSheet, setFocus, app, switchIntent,
  } from '../../lib/store.svelte.js';

  let body = $state(null);
  let trail = $state(null);
  let runEl = $state(null);
  let showHint = $state(false);
  let constellationOpen = $state(false);

  // 已完成块只渲染一次：同一段原文永远产出同一段 html
  const memo = new Map();
  function blocksHtml() {
    return app.blocks.map((raw) => {
      const cached = memo.get(raw);
      if (cached) return cached;
      const { text } = annotateCitations(raw);
      const html = replaceCitationTokens(renderBlock(text), app.citations);
      memo.set(raw, html);
      return html;
    });
  }

  const tailParts = $derived.by(() => {
    const tail = app.tail;
    const cut = Math.max(0, tail.length - (app.runLen || 0));
    const before = tail.slice(0, cut);
    const run = tail.slice(cut);
    const render = (chunk) => {
      if (!chunk) return '';
      const { text } = annotateCitations(chunk, { finishedOnly: true });
      return replaceCitationTokens(renderInline(text), app.citations);
    };
    return { before: render(before), run: render(run) };
  });

  // 引用提示一次性淡入（3 秒），状态存 localStorage
  let hintTimer = 0;
  $effect(() => {
    if (app.done && !readFlag(LS.citationHint) && app.citations.length) {
      showHint = true;
      setFlag(LS.citationHint, true);
      hintTimer = setTimeout(() => (showHint = false), 3000);
    }
  });

  // ---------------- 字符尾迹：独立 Canvas 叠加层，不参与排版 ----------------
  const points = [];
  let stopTrail = null;
  const trailOff = () => prefersReducedMotion() || isLowPowerDevice();

  function sampleRun() {
    if (trailOff() || !trail || !runEl) return;
    const rects = runEl.getClientRects();
    if (!rects || !rects.length) return;
    const box = trail.getBoundingClientRect();
    const last = rects[rects.length - 1];
    points.push({
      x: last.right - box.left,
      y: last.top - box.top,
      h: last.height,
      born: performance.now(),
    });
    while (points.length > 30) points.shift();
    if (!stopTrail) {
      stopTrail = subscribe(drawTrail);
    }
  }

  function drawTrail() {
    const ctx = trail.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = trail.getBoundingClientRect();
    if (trail.width !== Math.floor(rect.width * dpr) || trail.height !== Math.floor(rect.height * dpr)) {
      trail.width = Math.floor(rect.width * dpr);
      trail.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, rect.width, rect.height);
    const now = performance.now();
    while (points.length && now - points[0].born > 520) points.shift();
    for (const p of points) {
      const age = (now - p.born) / 520;
      const alpha = 0.16 * (1 - age);
      ctx.fillStyle = 'rgba(232, 228, 216, ' + alpha.toFixed(3) + ')';
      ctx.fillRect(p.x, p.y + p.h * 0.25, 1, p.h * 0.5);
    }
    if (!points.length && stopTrail) {
      stopTrail();
      stopTrail = null;
    }
  }

  $effect(() => {
    app.tail;
    app.runLen;
    sampleRun();
  });

  // 定型之后在 DOM 上标出术语命中，再把星点连到那个词（约 600ms 后淡出）
  $effect(() => {
    if (!app.done || !app.lit.length || !body) return;
    if (!body.querySelector('.term-hit')) {
      markTermHits(body, app.lit, app.lexicon.index);
    }
    connectTerms(app.lit);
  });

  onDestroy(() => {
    clearTimeout(hintTimer);
    if (stopTrail) stopTrail();
  });

  function onBodyClick(event) {
    const dot = event.target.closest('.cite-dot');
    if (dot) {
      const ids = (dot.dataset.cites || '').split(',').filter(Boolean);
      const picked = app.citations.filter((c) => ids.includes(String(c.n)));
      const list = picked.length ? picked : app.citations;
      setFocus({ type: 'citation', id: (list[0] && list[0].chunk_id) || '', label: shortSource(list[0]) });
      openSheet(list, null);
      return;
    }
    // 点正文里的术语 = 「聚焦到一点」：直接发一个「什么是 X？」的点查询
    const term = event.target.closest('.term-hit[data-term]');
    if (term) {
      event.preventDefault();
      setFocus({ type: 'concept', id: term.dataset.term, label: term.dataset.term });
      ask('什么是' + term.dataset.term + '？', { strategy: 'point' });
    }
  }
</script>

<article class="answer-paper" aria-busy={app.streaming ? 'true' : 'false'}>
  <!-- 只在回答完成时播报一次，不逐字播报 -->
  <p class="sr-live" aria-live="polite">{app.done ? '回答已完成' : ''}</p>
  <p class="question-line">
    {app.question}
    <button type="button" class="fav-star inline-star" aria-label="收藏这个问题"
      onfocus={() => setFocus({ type: 'question', id: app.question, label: app.question })}
      onclick={favoriteFocused}>✦</button>
  </p>
  {#if app.prevQuestion}
    <p class="carry-line">承自：{app.prevQuestion}</p>
  {/if}
  {#if app.conversationId !== null || app.done || app.streaming}
    <p class="intent-line">
      {intentLine()}
      <button type="button" class="linkish"
        onclick={() => switchIntent(app.intent === 'theme' ? 'point' : 'theme')}>
        {app.intent === 'theme' ? '聚焦到一点' : '改成范围查询'}
      </button>
    </p>
  {/if}

  {#if app.clarifyOffer}
    <p class="offer-line">
      这个问题较大，按范围查询展开？
      <button type="button" class="linkish" onclick={() => switchIntent('theme')}>展开为范围查询</button>
    </p>
  {/if}

  {#if app.empty}
    <p class="muted-line">没有找到相关的原文。</p>
    <p class="muted-line">换个说法，或按 / 找一个点。</p>
  {/if}

  {#if app.skipped}
    <p class="muted-line">已跳过检索</p>
  {/if}

  {#if app.status}
    <p class="status-line" aria-live="off">{app.status}</p>
  {/if}

  {#if app.error}
    <p class="error-line">
      {app.error}
      <button type="button" class="linkish" onclick={() => ask(app.question, { strategy: app.strategy })}>Enter 重试</button>
    </p>
  {/if}

  <div class="md" bind:this={body} onclick={onBodyClick}>
    {#each blocksHtml() as html, i (i)}
      <div class="block">{@html html}</div>
    {/each}
    {#if app.tail}
      <p class="block tail">
        {@html tailParts.before}<span class="run" bind:this={runEl}>{@html tailParts.run}</span>
      </p>
    {/if}
    <canvas class="trail" bind:this={trail} aria-hidden="true"></canvas>
  </div>

  {#if app.done && app.lit.length && app.intent === 'theme'}
    <div class="constellation">
      <button type="button" class="linkish" onclick={() => (constellationOpen = !constellationOpen)}>
        已点亮星座 ┆ {app.lit.length}
      </button>
      {#if constellationOpen}
        <ul class="constellation-list">
          {#each app.lit as name (name)}
            <li><button type="button" class="linkish" onclick={() => ask('什么是' + name + '？', { strategy: 'point' })}>{name}</button></li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if showHint}
    <p class="hint-line">句末圆点看来源 · S 收藏 · F 打开星匣</p>
  {/if}

  {#if !app.input.trim() && app.done && app.question}
    <p class="last-line">
      上次问到这里：{app.question}
      <button type="button" class="linkish" onclick={() => { app.input = app.question; }}>
        回填
      </button>
    </p>
  {/if}
</article>
