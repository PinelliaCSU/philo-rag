<script>
  // 句末圆点：3–4px，命中区 24×24px；aria-label 用短来源名。
  let { label = '来源', cites = '', counts = 0 } = $props();
</script>

<button type="button" class="cite-dot" data-cites={cites} aria-label="来源：{label}">
  <span class="dot" aria-hidden="true"></span>
  {#if counts > 1}<span class="count" aria-hidden="true">{counts}</span>{/if}
</button>
