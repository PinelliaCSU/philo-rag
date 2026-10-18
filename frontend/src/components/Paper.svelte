<script>
  import { app, favoriteFocused, setFocus } from '../lib/store.svelte.js';
  import AnswerPaper from './papers/AnswerPaper.svelte';
  import ConceptPaper from './papers/ConceptPaper.svelte';
  import SystemMapPaper from './papers/SystemMapPaper.svelte';
  import UnitPaper from './papers/UnitPaper.svelte';
  import ComparePaper from './papers/ComparePaper.svelte';

  let hovered = $state(false);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="paper-wrap" role="group" aria-label="纸页与收藏" class:corner-star={hovered}
     onmouseenter={() => (hovered = true)} onmouseleave={() => (hovered = false)}>
  <div class="paper" tabindex="0" role="region" aria-label="纸页">
    {#if app.paperKind === 'answer'}
      <AnswerPaper />
    {:else if app.paperKind === 'concept'}
      <ConceptPaper />
    {:else if app.paperKind === 'map'}
      <SystemMapPaper />
    {:else if app.paperKind === 'unit'}
      <UnitPaper />
    {:else if app.paperKind === 'compare'}
      <ComparePaper />
    {/if}
  </div>
  <button type="button" class="fav-star" aria-label="收藏这页"
    onfocus={() => {
      if (app.paperKind === 'answer') setFocus({ type: 'answer', id: app.answerId, label: app.question });
    }}
    onclick={favoriteFocused}>✦</button>
</div>
