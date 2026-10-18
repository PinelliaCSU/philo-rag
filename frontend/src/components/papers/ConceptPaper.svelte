<script>
  import { setFocus, app, ask, openSheet } from '../../lib/store.svelte.js';

  const card = $derived(app.concept || {});
  const definition = $derived(card.definition || null);
  const semantic = $derived(card.semantic || null);
</script>

<article class="concept-paper">
  <p class="question-line">{card.term || app.question}</p>
  {#if card.aliases && card.aliases.length}
    <p class="carry-line">别名：{card.aliases.join(' / ')}</p>
  {/if}

  {#if card.found}
    {#if definition}
      <section class="seg">
        <p class="body-text">{definition.text}</p>
        <p class="faint">{definition.citation}</p>
      </section>
    {/if}

    {#if card.units && card.units.length}
      <section class="seg">
        <h3>单元分布</h3>
        <ul class="inline-list">
          {#each card.units as u (u.code)}
            <li>
              <button type="button" class="linkish" onclick={() => setFocus({ type: 'concept', id: card.term, label: card.term })}>
                {u.code} {u.title || ''}
              </button>
              <span class="faint">{u.hits}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if card.philosophers && card.philosophers.length}
      <section class="seg">
        <h3>理论家</h3>
        <ul class="inline-list">
          {#each card.philosophers as p (p.name)}<li>{p.name}<span class="faint">{p.count}</span></li>{/each}
        </ul>
      </section>
    {/if}

    {#if card.related && card.related.length}
      <section class="seg">
        <h3>相关概念</h3>
        <ul class="inline-list">
          {#each card.related as r (r.name)}
            <li>
              <button type="button" class="linkish" onclick={() => ask('什么是' + r.name + '？', { strategy: 'point' })}>{r.name}</button>
              <span class="faint">{r.count}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if card.themes && card.themes.length}
      <section class="seg">
        <h3>所属主题</h3>
        <p class="body-text">{card.themes.join('　')}</p>
      </section>
    {/if}

    {#if card.quotes && card.quotes.length}
      <section class="seg">
        <h3>引文</h3>
        {#each card.quotes as q (q.chunk_id)}
          <blockquote class="quote-block">
            <p>{q.text}</p>
            <p class="faint">
              {q.speaker || '未署名'}　{q.citation}
              <button type="button" class="linkish" onclick={() => openSheet([{ ...q, n: 1, citation: q.citation, text: q.text, chunk_id: q.chunk_id }], null)}>看来源</button>
            </p>
          </blockquote>
        {/each}
      </section>
    {/if}
  {:else}
    <p class="muted-line">词典未收录这个概念。</p>
    {#if semantic && (semantic.exact_hits?.length || semantic.semantic_hits?.length)}
      <section class="seg">
        <h3>语义检索</h3>
        {#each [...(semantic.exact_hits || []), ...(semantic.semantic_hits || [])].slice(0, 6) as hit (hit.chunk_id)}
          <div class="quote-block">
            <p>{hit.text}</p>
            <p class="faint">
              {hit.citation}
              <button type="button" class="linkish" onclick={() => setFocus({ type: 'citation', id: hit.chunk_id, label: hit.citation })}>定于此</button>
            </p>
          </div>
        {/each}
      </section>
    {/if}
  {/if}

  <p class="paper-footer">
    <button type="button" class="linkish" onclick={() => ask('什么是' + (card.term || app.question) + '？', { strategy: 'point' })}>问这个点</button>
    <button type="button" class="linkish" onclick={() => ask(card.term || app.question, { strategy: 'theme' })}>展开为范围查询</button>
  </p>
</article>
