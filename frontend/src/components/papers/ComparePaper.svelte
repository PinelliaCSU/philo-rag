<script>
  import { openSheet, app } from '../../lib/store.svelte.js';

  const compare = $derived(app.compare || null);
  const left = $derived(compare && compare.terms ? compare.terms[0] : null);
  const right = $derived(compare && compare.terms ? compare.terms[1] : null);
</script>

<article class="compare-paper">
  <p class="question-line">{left?.term || ''} ↔ {right?.term || ''}</p>
  {#if !compare}
    <p class="muted-line">还差一个概念。在低语层里用「对 A ↔ B」再试一次。</p>
  {:else}
    <section class="seg">
      <h3>定义与归属</h3>
      <div class="two-col">
        {#each [left, right] as side, i (i)}
          <div>
            <p class="faint">{side.term}{side.found ? '' : '（词典未收录）'}</p>
            {#if side.definition}<p class="body-text">{side.definition}</p>{/if}
            {#if side.themes && side.themes.length}<p class="faint">主题：{side.themes.join('　')}</p>{/if}
            {#if side.philosophers && side.philosophers.length}
              <p class="faint">理论家：{side.philosophers.slice(0, 5).map((p) => p.name).join('、')}</p>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="seg">
      <h3>共享与独有共现</h3>
      {#if compare.shared_related && compare.shared_related.length}
        <p class="faint">共享</p>
        <ul class="inline-list">
          {#each compare.shared_related as row (row.name)}<li>{row.name}<span class="faint">{row.a} / {row.b}</span></li>{/each}
        </ul>
      {/if}
      <div class="two-col">
        <div>
          <p class="faint">只有 {left?.term}</p>
          <ul class="inline-list">
            {#each compare.a_only_related || [] as row (row.name)}<li>{row.name}<span class="faint">{row.count}</span></li>{/each}
          </ul>
        </div>
        <div>
          <p class="faint">只有 {right?.term}</p>
          <ul class="inline-list">
            {#each compare.b_only_related || [] as row (row.name)}<li>{row.name}<span class="faint">{row.count}</span></li>{/each}
          </ul>
        </div>
      </div>
    </section>

    <section class="seg">
      <h3>两侧引文</h3>
      <div class="two-col">
        {#each [left, right] as side, i (i)}
          <div>
            {#each side?.quotes || [] as q (q.chunk_id)}
              <blockquote class="quote-block">
                <p>{q.text}</p>
                <p class="faint">
                  {q.speaker || '未署名'}　{q.citation}
                  <button type="button" class="linkish" onclick={() => openSheet([{ ...q, n: 1 }], null)}>看来源</button>
                </p>
              </blockquote>
            {/each}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</article>
