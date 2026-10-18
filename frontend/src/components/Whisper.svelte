<script>
  import { app, runWhisper, updateWhisper, closeWhisper } from '../lib/store.svelte.js';

  let el = $state(null);

  $effect(() => {
    if (app.whisper.open && el) el.focus();
  });

  function onInput(event) {
    updateWhisper(event.target.value);
  }

  function onKeydown(event) {
    const results = app.whisper.results;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWhisper();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (results.length) app.whisper.index = (app.whisper.index + 1) % results.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length) app.whisper.index = (app.whisper.index - 1 + results.length) % results.length;
    } else if (event.key === 'Enter') {
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      runWhisper();
    }
  }
</script>

<div class="whisper-backdrop" role="presentation" onclick={closeWhisper}>
  <div class="whisper" role="dialog" aria-label="低语层" onclick={(e) => e.stopPropagation()}>
    <input class="whisper-input" bind:this={el} value={app.whisper.raw ?? ''}
      aria-label="点 / 引 / 脉 / 读 / 图 / 对" oninput={onInput} onkeydown={onKeydown} />
    {#if app.whisper.results.length}
      <ul class="whisper-results">
        {#each app.whisper.results as row, i (row.value + i)}
          <li class:active={app.whisper.index === i}>
            <button type="button" class="linkish" onclick={() => { app.whisper.index = i; runWhisper(); }}>
              {row.label}
            </button>
            {#if row.hint}<span class="faint">{row.hint}</span>{/if}
          </li>
        {/each}
      </ul>
    {:else if app.whisper.mode !== 'point' && app.whisper.query.trim()}
      <p class="faint">Enter 直接执行「{app.whisper.mode}」。</p>
    {/if}
  </div>
</div>
