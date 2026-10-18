<script>
  import { app, closeOverlays, toggleSheetPin, setFocus, favoriteFocused } from '../lib/store.svelte.js';
  import CitationDot from './CitationDot.svelte';
  import { shortSource } from '../lib/citations.js';
  import { api } from '../lib/api.js';

  let sheet = $state(null);

  // 收藏/历史里的引用只存坐标：打开薄层时按 chunk_id 回捞正文（§12.1）
  $effect(() => {
    const entries = app.sheet.citations || [];
    for (const entry of entries) {
      if (entry.text || !entry.chunk_id) continue;
      entry.text = '…';
      api.context(entry.chunk_id)
        .then((ctx) => {
          const focus = (ctx.items || []).find((i) => i.is_focus);
          entry.text = (focus && focus.text) || '';
        })
        .catch(() => {
          entry.text = '';
        });
    }
  });

  function restoreFocus() {
    const el = document.querySelector('.input-line textarea');
    if (el) el.focus();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlays();
      restoreFocus();
      return;
    }
    if (event.key !== 'Tab' || !sheet) return;
    // 焦点圈定：在薄层内循环
    const focusable = sheet.querySelectorAll('button, [href], input, [tabindex="0"]');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div class="sheet-backdrop" role="presentation" onclick={() => { closeOverlays(); restoreFocus(); }}>
  <section class="citation-sheet" role="dialog" aria-modal="false" aria-label="引用来源"
    bind:this={sheet} onkeydown={onKeydown} onclick={(e) => e.stopPropagation()}>
    <button type="button" class="fav-star sheet-star" aria-label="收藏这条引用"
      onfocus={() => {
        const c = app.sheet.citations[0];
        if (c) setFocus({ type: 'citation', id: c.chunk_id, label: shortSource(c) });
      }}
      onclick={favoriteFocused}>✦</button>

    {#if !app.sheet.citations.length}
      <p class="muted-line">没有找到相关的原文。</p>
    {:else}
      {#if app.sheet.citations[0]?.scope === 'paragraph'}
        <p class="faint">本段来源</p>
      {/if}
      {#each app.sheet.citations as entry, i (entry.chunk_id + '-' + i)}
        <div class="sheet-entry">
          <p class="sheet-head">
            <CitationDot label={shortSource(entry)} cites={String(entry.n ?? i + 1)} />
            {#if entry.philosophers && entry.philosophers.length}<span class="faint">{entry.philosophers.join('、')}　</span>{/if}
            <span>{entry.citation || entry.unit_title || ''}</span>
          </p>
          {#if entry.text}<p class="sheet-text">{entry.text}</p>{/if}
          {#if entry.legacyAnnotation}
            <p class="faint">旧批注（只读）：{entry.legacyAnnotation}</p>
          {/if}
          <p class="faint">
            语料库定位：{entry.chunk_id}　字符 {entry.start}–{entry.end}
            {#if entry.page}　页 {entry.page}{/if}
          </p>
          <p class="faint">
            <button type="button" class="linkish"
              onclick={() => navigator.clipboard && navigator.clipboard.writeText(entry.citation || entry.chunk_id)}>
              复制引用格式
            </button>
          </p>
        </div>
      {/each}
    {/if}

    <p class="paper-footer">
      <button type="button" class="linkish" onclick={toggleSheetPin}>
        {app.sheet.pinned ? '取消钉住' : '钉住'}
      </button>
      <button type="button" class="linkish" onclick={() => { closeOverlays(); restoreFocus(); }}>关闭</button>
    </p>
  </section>
</div>
