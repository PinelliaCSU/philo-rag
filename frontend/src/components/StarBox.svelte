<script>
  import {
    closeOverlays, dropFavorite, jumpFavorite, refreshStarbox, setStarboxTab, app,
  } from '../lib/store.svelte.js';
  import { download, exportAllJson, exportFavoritesMarkdown } from '../lib/db.js';

  const TABS = [
    { key: 'question', label: '问题' },
    { key: 'answer', label: '回答' },
    { key: 'citation', label: '引用' },
    { key: 'concept', label: '概念' },
  ];

  async function exportJson() {
    const payload = await exportAllJson();
    download('philo-rag-answers.json', JSON.stringify(payload, null, 2));
  }

  async function exportMarkdown() {
    const text = await exportFavoritesMarkdown();
    download('philo-rag-favorites.md', text, 'text/markdown');
  }

  function search(event) {
    app.starbox.query = event.target.value;
    refreshStarbox();
  }
</script>

<section class="starbox" role="dialog" aria-label="星匣">
  <div class="starbox-tabs">
    {#each TABS as tab (tab.key)}
      <button type="button" class="linkish" class:active={app.starbox.tab === tab.key}
        onclick={() => setStarboxTab(tab.key)}>{tab.label}</button>
    {/each}
    <input class="starbox-search" type="search" placeholder="搜…" value={app.starbox.query}
      aria-label="在星匣里搜索" oninput={search} />
    <button type="button" class="linkish" onclick={closeOverlays}>关闭</button>
  </div>

  {#if !app.starbox.rows.length}
    <p class="muted-line">这里还是空的。选中一个问题、回答、引用或概念，按 S 收藏。</p>
  {:else}
    <ul class="starbox-list">
      {#each app.starbox.rows as row (row.id)}
        <li>
          <button type="button" class="linkish" onclick={() => jumpFavorite(row)}>
            {row.title || row.refId}
          </button>
          <button type="button" class="linkish faint" onclick={() => dropFavorite(row.id)}>删除</button>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="paper-footer">
    <button type="button" class="linkish" onclick={exportJson}>导出 JSON（全部回答）</button>
    <button type="button" class="linkish" onclick={exportMarkdown}>导出 Markdown（收藏）</button>
  </p>
</section>
