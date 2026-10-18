<script>
  import { onMount } from 'svelte';
  import StarField from './components/StarField.svelte';
  import InputLine from './components/InputLine.svelte';
  import Paper from './components/Paper.svelte';
  import CitationSheet from './components/CitationSheet.svelte';
  import StarBox from './components/StarBox.svelte';
  import Whisper from './components/Whisper.svelte';
  import {
    boot, closeOverlays, favoriteFocused, focusInput, openWhisper, resetSession, app,
    toggleStarbox,
  } from './lib/store.svelte.js';
  import { LS, setFlag, db } from './lib/db.js';

  let inputFocused = $state(false);
  let breathing = $state(false);
  let exampleLit = $state(false);
  let extraHint = $state(false);
  let idleTimer = 0;

  const overlayOpen = $derived(app.sheet.open || app.whisper.open || app.starbox.open);

  onMount(async () => {
    await boot();
    // 示例纸片的附加提示只出现一次（跟随示例纸片出现，记在 Dexie meta 里）
    if (!app.exampleClosed) {
      const shown = await db.meta.get('exampleHintShown');
      if (!shown) {
        extraHint = true;
        await db.meta.put({ key: 'exampleHintShown', value: 1 });
      }
    }
    armIdle();
    window.addEventListener('pointerdown', armIdle);
    window.addEventListener('keydown', armIdle);
  });

  // 空闲 6 秒：呼吸一次 + 示例纸片微亮一次，不循环
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (app.paperKind || overlayOpen || app.input) return;
      breathing = true;
      exampleLit = true;
      setTimeout(() => (breathing = false), 2600);
      setTimeout(() => (exampleLit = false), 2600);
    }, 6000);
  }

  function dismissExample() {
    if (app.exampleClosed) return;
    app.exampleClosed = true;
    setFlag(LS.exampleClosed, true);
  }

  function pickExample(text) {
    dismissExample();
    app.input = text;
    focusInput();
  }

  function escape() {
    if (app.sheet.open) return closeOverlays();
    if (app.whisper.open) return closeOverlays();
    if (app.starbox.open) return closeOverlays();
    if (app.exampleClosed === false) {
      dismissExample();
      return;
    }
    if (app.input) {
      app.input = '';
      return;
    }
    resetSession();
  }

  function typingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function onKeydown(event) {
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      escape();
      return;
    }
    if (event.key === '/' && !app.input && !overlayOpen && !typingTarget(event.target)) {
      event.preventDefault();
      openWhisper();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (typingTarget(event.target)) return;

    if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      favoriteFocused();
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggleStarbox();
      return;
    }
    if (event.key.length === 1 && !event.shiftKey) {
      if (window.getSelection && String(window.getSelection())) return;  // 有选区时不抢输入
      event.preventDefault();
      app.input += event.key;
      focusInput();
      armIdle();
    }
  }

  $effect(() => {
    // 输入任意字符 → 示例纸片淡出
    if (app.input) dismissExample();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<main class="stage" class:has-paper={!!app.paperKind}>
  {#if !app.paperKind}
    <div class="home">
      <div class="glyph" class:breath={breathing} aria-hidden="true">○</div>
      {#if inputFocused}
        <p class="hint-line">问一个点，或描述一片范围……</p>
      {/if}
      <div class="input-holder" onfocusin={() => (inputFocused = true)}
           onfocusout={() => (inputFocused = false)}>
        <InputLine onEscapeEmpty={escape} />
      </div>
      {#if app.lastQuestion && !app.input}
        <p class="last-line home-last">
          上次问到这里：{app.lastQuestion}
          <button type="button" class="linkish" onclick={() => { app.input = app.lastQuestion; focusInput(); }}>
            回填
          </button>
        </p>
      {/if}
      {#if !app.exampleClosed}
        <div class="example-card" class:lit={exampleLit}>
          <p class="example-title">可以这样开始</p>
          <button type="button" class="example-line" onclick={() => pickExample('点：康德说的“先验”到底指什么？')}>
            点：康德说的「先验」到底指什么？
          </button>
          <button type="button" class="example-line" onclick={() => pickExample('范围：从笛卡尔到胡塞尔，主体性是如何变化的？')}>
            范围：从笛卡尔到胡塞尔，主体性是如何变化的？
          </button>
          {#if extraHint}
            <p class="example-hint">按 / 可以找一个点、一条引文、一个单元。</p>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <!-- DOM 顺序决定 Tab 顺序（输入线 → 纸页 → 引用点 → 星图 → 星匣）；
         视觉上纸页在上，用 CSS order 换位，不动 DOM -->
    <div class="input-holder bottom" onfocusin={() => (inputFocused = true)}
         onfocusout={() => (inputFocused = false)}>
      <InputLine onEscapeEmpty={escape} />
    </div>
    <Paper />
  {/if}
</main>

<!-- Tab 顺序：输入线 → 纸页 → 引用点 → 星图 → 星匣触发区（星图在 DOM 里排在舞台之后） -->
<StarField />

<button type="button" class="starbox-trigger" aria-label="打开星匣（F）"
  onclick={() => toggleStarbox(true)}>✦</button>

{#if app.sheet.open}
  <CitationSheet />
{/if}
{#if app.starbox.open}
  <StarBox />
{/if}
{#if app.whisper.open}
  <Whisper />
{/if}
