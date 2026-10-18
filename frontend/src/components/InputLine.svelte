<script>
  import { onMount } from 'svelte';
  import { app, ask, registerInput } from '../lib/store.svelte.js';

  let { onEscapeEmpty } = $props();
  let el = $state(null);
  let focused = $state(false);

  function autoGrow() {
    if (!el) return;
    el.style.height = 'auto';
    const max = Math.round(window.innerHeight * 0.4);
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }

  onMount(() => {
    registerInput({
      focus: () => el && el.focus(),
      clear: () => {
        app.input = '';
        autoGrow();
      },
    });
    autoGrow();
  });

  $effect(() => {
    // 纸页内容变化后输入线高度也要重算（回填长问题时会变高）
    app.input;
    autoGrow();
  });

  function submit() {
    const text = app.input.trim();
    if (!text) return;
    app.input = '';
    autoGrow();
    ask(text, { strategy: 'auto' });
  }

  function onKeydown(event) {
    if (event.key === 'Enter') {
      // 中文 IME：组字中的 Enter 是选词，不是提交
      if (event.isComposing || event.keyCode === 229) return;
      if (event.shiftKey) return;        // Shift+Enter 换行
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      if (app.input) {
        app.input = '';
        autoGrow();
      } else {
        onEscapeEmpty && onEscapeEmpty();
      }
    }
  }

  export function appendChar(ch) {
    app.input += ch;
    el && el.focus();
    autoGrow();
  }
</script>

<div class="input-line" class:focused>
  <textarea
    bind:this={el}
    rows="1"
    bind:value={app.input}
    spellcheck="false"
    autocomplete="off"
    aria-label="问一个点，或描述一片范围"
    oninput={autoGrow}
    onkeydown={onKeydown}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
  ></textarea>
  <span class="baseline" aria-hidden="true"></span>
</div>
