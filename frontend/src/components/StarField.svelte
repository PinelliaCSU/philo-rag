<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.js';
  import { allLitNodes, listFavorites } from '../lib/db.js';
  import { StarMap } from '../lib/starmap.js';
  import { attachStar, provideGraph, app, focusInput, openConcept, setFocus } from '../lib/store.svelte.js';

  let background = $state(null);
  let links = $state(null);
  let canvas = $state(null);
  let hitLayer = $state(null);
  let container = $state(null);
  let label = $state('');
  let labelDef = $state('');
  let zoomLabel = $state('100%');
  let dragging = $state(false);
  let map = null;
  let drag = null;

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
      attachStar({
        enqueue: (direct, halo) => map.enqueue(direct, halo),
        setLit: (names) => map.setLit(names),
        connect: (names) => map.connectToDom(names),
        setFavorites: (names) => map.setFavorites(names),
        flash: (amount) => map.flash(amount),      // P3：流式输出 → 背景脉冲
      });
      const lit = await allLitNodes();
      map.setLit(lit.map((n) => n.name));
      const favs = await listFavorites('concept');
      map.setFavorites(favs.map((f) => f.refId));
      app.lit = lit.map((n) => n.name);
      zoomLabel = map.zoomLabel;
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

  // ------------------------------------------------------------------ 相机 //
  let wheelTimer = 0;
  function onWheel(event) {
    if (!map) return;
    event.preventDefault();          // 别让整页滚走
    const rect = container.getBoundingClientRect();
    map.setInteracting(true);        // 连续滚轮期间降级绘制
    map.zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY);
    zoomLabel = map.zoomLabel;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => map && map.setInteracting(false), 160);
  }

  function onPointerDown(event) {
    if (!map || event.button !== 0) return;
    if (event.target.closest('.star-hotspot, .lit-list, button')) return;
    drag = { x: event.clientX, y: event.clientY, moved: 0, pan: event.shiftKey };
    dragging = true;
    map.setInteracting(true);
    container.setPointerCapture && container.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!map || !drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.pan) map.panBy(dx, dy);
    else map.rotateBy(dx);           // 左右拖 = 绕天球转
    zoomLabel = map.zoomLabel;
  }

  function onPointerUp(event) {
    if (!drag) return;
    const clicked = drag.moved < 3;
    drag = null;
    dragging = false;
    map.setInteracting(false);   // 松手补画完整细节
    if (clicked) {
      // 空白处点一下 = 把焦点交回输入线（与既有交互契约一致）
      if (!event.shiftKey) focusInput();
    }
  }

  function onDblClick() {
    if (!map) return;
    map.resetCamera();
    zoomLabel = map.zoomLabel;
  }

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
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      map.zoomAt(map.width / 2, map.height / 2, -120);
      zoomLabel = map.zoomLabel;
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      map.zoomAt(map.width / 2, map.height / 2, 120);
      zoomLabel = map.zoomLabel;
    } else if (event.key === '0') {
      event.preventDefault();
      map.resetCamera();
      zoomLabel = map.zoomLabel;
    } else if (event.key === 'Escape') {
      map.setFocused(null);
      container.blur();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<div class="starfield" class:dragging bind:this={container} tabindex="0" role="application"
     aria-label="星图：只显示被回答点亮的概念。滚轮缩放、拖拽旋转、Shift+拖拽平移、双击复位；方向键在已点亮节点间移动，Enter 打开。"
     onkeydown={onKeydown}
     onwheel={onWheel}
     onpointerdown={onPointerDown}
     onpointermove={onPointerMove}
     onpointerup={onPointerUp}
     onpointercancel={onPointerUp}
     ondblclick={onDblClick}>
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
  <!-- 观测提示：极淡一行，说明能怎么动这张图 -->
  <p class="sky-hint" aria-hidden="true">滚轮缩放 · 拖拽旋转 · Shift+拖拽平移 · 双击复位　{zoomLabel}</p>
  <ul class="lit-list" aria-live="polite">
    {#each app.lit as name (name)}
      <li>
        <button type="button" class="linkish" onclick={() => openConcept(name)}>{name}</button>
      </li>
    {/each}
  </ul>
</div>
