<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.js';
  import { allLitNodes, listFavorites } from '../lib/db.js';
  import { StarMap } from '../lib/starmap.js';
  import { attachStar, provideGraph, app, openConcept, ask, setFocus } from '../lib/store.svelte.js';

  let background = $state(null);
  let links = $state(null);
  let canvas = $state(null);
  let hitLayer = $state(null);
  let container = $state(null);
  let label = $state('');
  let labelDef = $state('');
  let map = null;
  let ready = false;

  onMount(async () => {
    map = new StarMap({
      background,
      links,
      nodes: canvas,
      hitLayer,
      onSelect: (name) => {
        setFocus({ type: 'concept', id: name, label: name });
        openConcept(name);
      },
      onHover: (node) => {
        label = node ? node.id : '';
        // 一行极淡定义：星图数据里有年代 / 流派 / 别名，没有词典定义文本
        labelDef = node
          ? [node.era, node.school, (node.aliases || [])[0]].filter(Boolean).join(' · ')
          : '';
      },
    });

    try {
      const payload = await api.starmap();
      map.setData(payload);
      provideGraph(() => payload);
      ready = true;
      attachStar({
        enqueue: (direct, halo) => map.enqueue(direct, halo),
        setLit: (names) => map.setLit(names),
        connect: (names) => map.connectToDom(names),
        setFavorites: (names) => map.setFavorites(names),
      });
      const lit = await allLitNodes();
      map.setLit(lit.map((n) => n.name));
      const favs = await listFavorites('concept');
      map.setFavorites(favs.map((f) => f.refId));
      app.lit = lit.map((n) => n.name);
    } catch {
      app.starError = '知识图谱未能载入';
    }

    const onResize = () => map && map.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  onDestroy(() => map && map.stopLoop());

  // 星图随纸页/浮层整体降亮：阅读时它退到背景里
  $effect(() => {
    if (map) map.setDim(app.starDim);
  });

  function onKeydown(event) {
    if (!map) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const name = map.moveFocus(1);
      if (name) setFocus({ type: 'concept', id: name, label: name });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const name = map.moveFocus(-1);
      if (name) setFocus({ type: 'concept', id: name, label: name });
    } else if (event.key === 'Enter') {
      const name = map.focused;
      if (name) {
        event.preventDefault();
        openConcept(name);
      }
    } else if (event.key === 'Escape') {
      map.setFocused(null);
      container.blur();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<div class="starfield" bind:this={container} tabindex="0" role="application"
     aria-label="星图：只显示被回答点亮的概念。方向键在已点亮节点间移动，Enter 打开。"
     onkeydown={onKeydown}>
  <canvas bind:this={background} class="layer"></canvas>
  <canvas bind:this={links} class="layer"></canvas>
  <canvas bind:this={canvas} class="layer"></canvas>
  <div class="hotspots" bind:this={hitLayer}></div>
  {#if label}
    <div class="star-label" aria-hidden="true">
      <span class="name">{label}</span>
      {#if labelDef}<span class="def">{labelDef}</span>{/if}
    </div>
  {/if}
  {#if app.starError}
    <p class="star-error">{app.starError}</p>
  {/if}
  <ul class="lit-list" aria-live="polite">
    {#each app.lit as name (name)}
      <li>
        <button type="button" class="linkish" onclick={() => openConcept(name)}>{name}</button>
      </li>
    {/each}
  </ul>
</div>
