// 星图：自绘 Canvas 2D，三层画布（静态背景星 / 星座线 / 节点与脉冲）。
//
// 三条硬规则（见设计文档 §11）：
//   · 节点初始亮度 0，只有被回答命中的概念才亮；未点亮节点不显示标签、不响应点击；
//   · 直接命中持久、一阶邻域临时，邻域不写库；
//   · 空闲时停止 rAF：静止的星图不该有常驻绘制。
import { prefersReducedMotion, subscribe } from './motion.js';

const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StarMap {
  constructor({ background, links, nodes, hitLayer, onSelect, onHover }) {
    this.bg = background;
    this.links = links;
    this.nodeCanvas = nodes;
    this.hitLayer = hitLayer;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});

    this.payload = null;
    this.nodes = [];
    this.edges = [];
    this.lit = new Set();          // 直接命中（持久）
    this.halo = new Set();         // 一阶邻域（临时）
    this.favorite = new Set();     // 收藏过的概念：多一圈极淡环
    this.hovered = null;
    this.focused = null;           // 键盘聚焦的已点亮节点
    this.dim = 1;                  // 阅读/薄层/星匣时整体降亮
    this.pulses = new Map();       // name → startTime
    this.linksTo = [];             // 术语命中连线：星点 → 正文里的词，约 600ms 淡出
    this.queue = [];
    this.lastPulseAt = 0;
    this.width = 0;
    this.height = 0;
    this.unsubscribe = null;
    this.hotspots = [];
    this.reduced = prefersReducedMotion();
    this.dirtyBackground = true;   // 静态层离屏缓存：只有换数据/换尺寸时才重画

  }

  setData(payload) {
    this.payload = payload;
    this.nodes = (payload.nodes || []).map((n) => ({ ...n }));
    this.edges = (payload.edges || []).map((e) => ({ ...e }));
    this.byName = new Map(this.nodes.map((n) => [n.id, n]));
    this.dirtyBackground = true;
    this.resize();
    return this;
  }

  setLit(names) {
    this.lit = new Set(names || []);
    this.draw();
    this.syncHotspots();
  }

  setHalo(names) {
    this.halo = new Set(names || []);
    this.draw();
    this.syncHotspots();
  }

  setFavorites(names) {
    this.favorite = new Set(names || []);
    this.draw();
    this.syncHotspots();
  }

  setDim(factor) {
    this.dim = Math.max(0.5, Math.min(1, factor));
    this.draw();
  }

  setHovered(name) {
    if (this.hovered === name) return;
    this.hovered = name;
    this.draw();
    this.onHover(name ? this.byName.get(name) : null);
  }

  setFocused(name) {
    this.focused = name;
    this.draw();
  }

  /** 命中连线：从星点指向正文里的那个词，600ms 后淡掉；节点本身保持低亮。 */
  connectToDom(names) {
    if (!this.nodes.length || typeof document === 'undefined') return;
    const rect = this.nodeCanvas.getBoundingClientRect();
    const now = performance.now();
    for (const name of names || []) {
      const node = this.byName.get(name);
      if (!node) continue;
      const el = document.querySelector(
        '.term-hit[data-term="' + String(name).replace(/"/g, '\\"') + '"]',
      );
      if (!el) continue;
      const box = el.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      this.linksTo.push({
        from: this.point(node),
        to: { x: box.left - rect.left, y: box.top - rect.top + box.height / 2 },
        born: now,
      });
    }
    if (this.linksTo.length) this.startLoop();
  }

  /** 一次回答的直接命中：限制条数、200ms 节流、排队逐个脉冲。 */
  enqueue(direct, halo) {
    const batch = (direct || []).slice(0, 8);
    this.queue = batch.slice();
    this.pendingHalo = halo || [];
    // 邻域是临时光晕：20 秒后自行衰减（下一次提问也会顶掉）
    clearTimeout(this.haloTimer);
    this.haloTimer = setTimeout(() => {
      this.halo = new Set();
      this.draw();
      this.syncHotspots();
    }, 20000);
    if (!this.queue.length) {
      this.setHalo(this.pendingHalo);
      return;
    }
    this.startLoop();
  }

  startLoop() {
    if (this.unsubscribe) return;
    this.unsubscribe = subscribe(() => this.step());
  }

  stopLoop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  step() {
    const now = performance.now();
    let busy = false;

    if (this.queue.length && now - this.lastPulseAt > 200) {
      const name = this.queue.shift();
      this.lastPulseAt = now;
      this.pulses.set(name, now);
      if (this.pendingHalo && this.pendingHalo.length && !this.queue.length) {
        this.setHalo(this.pendingHalo);   // 邻域在最后一个脉冲后一起低亮
      }
    }

    for (const [name, at] of this.pulses) {
      if (now - at > 900) this.pulses.delete(name);
      else busy = true;
    }
    this.linksTo = this.linksTo.filter((link) => now - link.born < 600);
    if (this.linksTo.length) busy = true;

    this.drawNodes(now);
    if (!busy && !this.queue.length) this.stopLoop();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.bg.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    for (const canvas of [this.bg, this.links, this.nodeCanvas]) {
      canvas.width = Math.floor(this.width * dpr);
      canvas.height = Math.floor(this.height * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.dirtyBackground = true;
    this.draw();
    this.syncHotspots();
  }

  point(node) {
    const pad = 0.06;
    const x = this.width / 2 + node.x * (this.width / 2) * (1 - pad);
    const y = this.height / 2 + node.y * (this.height / 2) * (1 - pad);
    return { x, y };
  }

  radius(node) {
    const axis = (this.payload?.axes || []).includes(node.id);
    const base = Math.sqrt(Math.max(node.hits || 1, 1));
    return Math.max(1.5, Math.min(5, 1.2 + base * 0.22)) + (axis ? 0.8 : 0);
  }

  /** 静态层：背景星 + 轴元素的隐约结构线（固定 seed，刷新不变）。 */
  drawBackground() {
    const ctx = this.bg.getContext('2d');
    ctx.clearRect(0, 0, this.width, this.height);
    const rng = mulberry32(20261018);
    const count = Math.min(520, Math.round((this.width * this.height) / 2600));
    for (let i = 0; i < count; i += 1) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      const r = 0.3 + rng() * 0.7;
      const alpha = 0.04 + rng() * 0.1;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(224, 220, 210, ' + alpha.toFixed(3) + ')';
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    // 结构线：只在有布局时画，透明度极低；干扰可全隐（这里给到几乎看不见）
    if (this.nodes.length) {
      ctx.strokeStyle = 'rgba(200, 196, 186, 0.035)';
      ctx.lineWidth = 0.6;
      for (const edge of this.edges) {
        const a = this.byName.get(edge.source);
        const b = this.byName.get(edge.target);
        if (!a || !b) continue;
        const p1 = this.point(a);
        const p2 = this.point(b);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  drawLinks() {
    const ctx = this.links.getContext('2d');
    ctx.clearRect(0, 0, this.width, this.height);
    const lit = [...this.lit].filter((n) => this.byName.has(n));
    if (lit.length < 2) return;
    // 范围查询的星座轨迹：沿剪枝边把已点亮节点连起来，极淡
    ctx.strokeStyle = 'rgba(214, 208, 194, ' + (0.12 * this.dim).toFixed(3) + ')';
    ctx.lineWidth = 0.7;
    const litSet = new Set(lit);
    for (const edge of this.edges) {
      if (!litSet.has(edge.source) || !litSet.has(edge.target)) continue;
      const p1 = this.point(this.byName.get(edge.source));
      const p2 = this.point(this.byName.get(edge.target));
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  drawNodes(now = performance.now()) {
    const ctx = this.nodeCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.width, this.height);
    const reduced = this.reduced;

    // 命中连线画在节点下面：极细、随 age 淡出
    for (const link of this.linksTo) {
      const age = (now - link.born) / 600;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(233, 229, 219, ' + (0.1 * (1 - age) * this.dim).toFixed(3) + ')';
      ctx.lineWidth = 0.6;
      ctx.moveTo(link.from.x, link.from.y);
      ctx.lineTo(link.to.x, link.to.y);
      ctx.stroke();
    }

    for (const node of this.nodes) {
      const p = this.point(node);
      const r = this.radius(node);
      const isLit = this.lit.has(node.id);
      const isHalo = !isLit && this.halo.has(node.id);
      const isHover = this.hovered === node.id || this.focused === node.id;

      let alpha = 0;
      if (isLit) alpha = 0.62;
      else if (isHalo) alpha = 0.24;
      else if (isHover) alpha = 0.5;
      if (!alpha) continue;
      alpha *= this.dim;

      const pulse = this.pulses.get(node.id);
      if (pulse && !reduced) {
        const t = Math.min(1, (now - pulse) / 620);
        const grow = 1 + t * 2.4;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(232, 228, 216, ' + (0.22 * (1 - t) * this.dim).toFixed(3) + ')';
        ctx.lineWidth = 0.8;
        ctx.arc(p.x, p.y, r * grow, 0, TAU);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.fillStyle = 'rgba(236, 232, 222, ' + alpha.toFixed(3) + ')';
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();

      if (this.favorite.has(node.id)) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(236, 232, 222, ' + (0.18 * this.dim).toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.arc(p.x, p.y, r + 3.5, 0, TAU);
        ctx.stroke();
      }
    }
  }

  draw() {
    if (!this.width) return;
    if (this.dirtyBackground) {
      this.drawBackground();
      this.dirtyBackground = false;
    }
    this.drawLinks();
    this.drawNodes();
  }

  /** 点击热区：只给「已点亮 / 邻域 / 收藏」的节点，未点亮节点不暴露。 */
  syncHotspots() {
    if (!this.hitLayer) return;
    this.hotspots = [];
    this.hitLayer.textContent = '';
    const actionable = this.nodes.filter(
      (n) => this.lit.has(n.id) || this.halo.has(n.id) || this.favorite.has(n.id),
    );
    for (const node of actionable) {
      const p = this.point(node);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'star-hotspot';
      el.tabIndex = -1;   // 183 个节点不各占一个 Tab 停靠点：星图容器自己收键盘
      el.setAttribute('aria-label', node.id);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.addEventListener('click', () => this.onSelect(node.id));
      el.addEventListener('mouseenter', () => this.setHovered(node.id));
      el.addEventListener('mouseleave', () => this.setHovered(null));
      el.addEventListener('focus', () => this.setFocused(node.id));
      el.addEventListener('blur', () => this.setFocused(null));
      this.hitLayer.appendChild(el);
      this.hotspots.push({ name: node.id, el });
    }
  }

  /** 键盘：方向键在已点亮节点之间移动，Enter 打开，Esc 离开。 */
  moveFocus(direction) {
    const order = this.nodes.filter((n) => this.lit.has(n.id));
    if (!order.length) return null;
    const current = order.findIndex((n) => n.id === this.focused);
    let next = current;
    if (current < 0) next = 0;
    else next = (current + direction + order.length) % order.length;
    const node = order[next];
    this.setFocused(node.id);
    return node.id;
  }
}
