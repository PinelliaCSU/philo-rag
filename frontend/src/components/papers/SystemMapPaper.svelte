<script>
  import { app, openUnit } from '../../lib/store.svelte.js';

  const units = $derived(app.lexicon.units || []);
  const axes = $derived(app.lexicon.axes || {});
  const heads = $derived(axes['字头'] || []);
  const layers = $derived(axes['四层'] || []);

  // 4×4 只服务「单元浏览」：格子里是编号两位的单元（1-2 这种），不是星图布局
  const byCode = $derived.by(() => {
    const map = new Map();
    for (const u of units) if (u.depth === 2) map.set(u.code, u);
    return map;
  });

  const grid = $derived(
    (heads.length ? heads : [1, 2, 3, 4].map((n) => ({ code: String(n), name: String(n) }))).map((h) =>
      (layers.length ? layers : [1, 2, 3, 4].map((n) => ({ code: String(n), name: String(n) }))).map((l) => ({
        head: h,
        layer: l,
        unit: byCode.get(h.code + '-' + l.code) || null,
      })),
    ),
  );

  const loose = $derived(units.filter((u) => u.depth > 2));
  const volumes = $derived([...new Set(units.filter((u) => u.depth === 1).map((u) => u.volume))]);
</script>

<article class="map-paper">
  <p class="question-line">体系地图</p>
  <p class="carry-line">4×4 字头 × 位面：仅用于单元浏览，不是星图的布局</p>

  <table class="unit-grid">
    <thead>
      <tr>
        <th></th>
        {#each grid[0] || [] as cell (cell.layer.code)}<th>{cell.layer.name}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each grid as row, i (i)}
        <tr>
          <th>{row[0]?.head.name}</th>
          {#each row as cell (cell.layer.code)}
            <td>
              {#if cell.unit}
                <button type="button" class="linkish" onclick={() => openUnit(cell.unit.code)}>
                  {cell.unit.code}<br /><span class="faint">{cell.unit.title}</span>
                </button>
              {:else}
                <span class="faint">—</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <section class="seg">
    <h3>卷与单元</h3>
    <ul class="inline-list">
      {#each volumes as v (v)}<li>{v}</li>{/each}
    </ul>
    <p class="faint">共 {units.length} 个单元条目，{loose.length} 个在网格之外（三级及更深）。</p>
  </section>

  <section class="seg">
    <h3>未归入网格的单元</h3>
    <ul class="inline-list">
      {#each loose as u (u.code + u.title)}
        <li>
          <button type="button" class="linkish" onclick={() => openUnit(u.code)}>{u.code} {u.title}</button>
        </li>
      {/each}
    </ul>
  </section>
</article>
