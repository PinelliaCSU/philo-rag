<script>
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../../lib/api.js';
  import { getReadPos, setReadPos } from '../../lib/db.js';
  import { ask, openUnit, setFocus, app } from '../../lib/store.svelte.js';

  let scroller = $state(null);
  let scale = $state(1);
  const unit = $derived(app.unit || {});

  function applyScale() {
    if (!scroller) return;
    scroller.style.fontSize = (16 * scale).toFixed(2) + 'px';
  }

  onMount(() => {
    applyScale();
    if (unit.savedScroll) scroller.scrollTop = unit.savedScroll;
  });

  function onKeydown(event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      scale = Math.min(1.6, scale + 0.1);
      applyScale();
    } else if (event.key === '-') {
      event.preventDefault();
      scale = Math.max(0.8, scale - 0.1);
      applyScale();
    } else if (event.key === '0') {
      event.preventDefault();
      scale = 1;
      applyScale();
    }
  }

  function rememberScroll() {
    if (!scroller || !unit.code) return;
    setReadPos({ code: unit.code, scrollTop: scroller.scrollTop });
  }

  async function showQuotes() {
    const payload = await api.quote({ unit: unit.code, limit: 12 }).catch(() => null);
    if (payload) app.unit.quotes = payload.quotes || [];
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<article class="unit-paper" tabindex="0" onkeydown={onKeydown} bind:this={scroller} onscroll={rememberScroll}>
  <p class="question-line">{unit.code} {unit.title || ''}</p>
  <p class="carry-line">
    {unit.volume || ''}　{unit.head || ''}　{unit.coords ? unit.coords.join('　') : ''}
  </p>

  {#if unit.counts}
    <p class="faint">原文块 {unit.counts.chunks}　引文 {unit.counts.quotes}</p>
  {/if}

  {#if unit.children && unit.children.length}
    <section class="seg">
      <h3>子单元</h3>
      <ul class="inline-list">
        {#each unit.children as child (child.code)}
          <li><button type="button" class="linkish" onclick={() => openUnit(child.code)}>{child.code} {child.title}</button></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if (unit.concepts && unit.concepts.length) || (unit.philosophers && unit.philosophers.length)}
    <section class="seg">
      <h3>本单元术语与理论家</h3>
      <ul class="inline-list">
        {#each unit.concepts || [] as c (c.name)}
          <li>
            <button type="button" class="linkish" onclick={() => setFocus({ type: 'concept', id: c.name, label: c.name })}>{c.name}</button>
            <span class="faint">{c.count}</span>
          </li>
        {/each}
      </ul>
      <ul class="inline-list">
        {#each unit.philosophers || [] as p (p.name)}<li>{p.name}<span class="faint">{p.count}</span></li>{/each}
      </ul>
    </section>
  {/if}

  <section class="seg">
    {#each unit.items || [] as item (item.chunk_id)}
      <div class="quote-block">
        <p>{item.text}</p>
        <p class="faint">
          {item.citation}
          {#if item.concepts && item.concepts.length}
            　{item.concepts.slice(0, 4).join('、')}
          {/if}
        </p>
      </div>
    {/each}
  </section>

  <p class="paper-footer">
    <button type="button" class="linkish" onclick={() => ask(unit.title || unit.code, { strategy: 'point' })}>用该单元提问</button>
    <button type="button" class="linkish" onclick={showQuotes}>本单元引文</button>
  </p>
</article>
