// 星图：自绘 Canvas 2D，三层画布（背景恒星 / 星座线 / 节点与脉冲）。
//
// 概念节点仍旧遵守设计文档 §11 的硬规则：节点初始亮度 0，只有被回答命中的概念才亮；
// 未点亮节点不显示标签、不响应点击；直接命中持久、一阶邻域临时；空闲时停止 rAF。
//
// 与设计文档的差异（P1 要求）：背景不再只有 520 个不可见的灰点，而是一张**可辨识的恒星图**——
// 按幂律分布星等的程序化星表 + 银河带 + 亮星的四芒星芒。这些是装饰星，不参与点亮、
// 不可点击、不写库；「点亮只由回答命中决定」这条契约没有被改动。
//
// 相机（P2）：scale（滚轮缩放）/ rotation（拖拽旋转）/ 平移（Shift+拖拽），
// 概念节点与背景星共用同一个相机，所以缩放旋转时它们一起动。
import { prefersReducedMotion, subscribe } from './motion.js';

const TAU = Math.PI * 2;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3.2;
const ROTATE_PER_PX = 0.0035;   // 拖拽 1px 转多少弧度
const ENERGY_DECAY = 0.92;      // 流式脉冲每帧衰减系数

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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 星色：少数偏暖、少数偏冷，多数接近白
function starColor(hue) {
  if (hue < 0.16) return [255, 224, 190];
  if (hue > 0.86) return [198, 218, 255];
  return [238, 235, 228];
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
    this.dirtyBackground = true;   // 静态层缓存：只有换数据/换尺寸/动相机时才重画

    // 观测相机：缩放、旋转、平移（世界坐标原点在屏幕中心）
    this.camera = { scale: 1, rotation: 0, tx: 0, ty: 0 };
    this.stars = [];
    this.starSeed = 0;

    // 流式脉冲能量：0..1，随每个提交的字符批次抬升、逐帧衰减（P3）
    this.energy = 0;
    this.lastFlashAt = 0;
    this.interacting = false;      // 拖拽/缩放中降级绘制，保证操作流畅
  }

  /** 交互开始/结束：结束时补画一次完整细节。 */
  setInteracting(active) {
    if (this.interacting === active) return;
    this.interacting = active;
    this.dirtyBackground = true;
    this.draw();
  }

  // ------------------------------------------------------------------ 数据 //
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

  // ------------------------------------------------------------------ 相机 //
  /** 世界坐标（相对屏幕中心，px）→ 屏幕坐标。 */
  applyCamera(x, y) {
    const { scale, rotation, tx, ty } = this.camera;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return {
      x: this.width / 2 + (x * c - y * s) * scale + tx,
      y: this.height / 2 + (x * s + y * c) * scale + ty,
    };
  }

  /** 屏幕坐标 → 世界坐标。缩放要钉住光标下的那一点时用它。 */
  toWorld(sx, sy) {
    const { scale, rotation, tx, ty } = this.camera;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const dx = sx - this.width / 2 - tx;
    const dy = sy - this.height / 2 - ty;
    return { x: (dx * c + dy * s) / scale, y: (-dx * s + dy * c) / scale };
  }

  cameraChanged() {
    this.dirtyBackground = true;
    this.draw();
    this.syncHotspots();   // 热区跟着节点走
  }

  /** 滚轮缩放：钉住光标下的世界点，zoomAt(-100) 放大。 */
  zoomAt(sx, sy, deltaY) {
    const factor = Math.exp(-deltaY * 0.0016);
    const next = clamp(this.camera.scale * factor, MIN_SCALE, MAX_SCALE);
    if (next === this.camera.scale) return;
    const world = this.toWorld(sx, sy);
    this.camera.scale = next;
    const rotated = this.rotateWorld(world.x, world.y);
    this.camera.tx = sx - this.width / 2 - rotated.x;
    this.camera.ty = sy - this.height / 2 - rotated.y;
    this.cameraChanged();
  }

  rotateWorld(x, y) {
    const { scale, rotation } = this.camera;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return { x: (x * c - y * s) * scale, y: (x * s + y * c) * scale };
  }

  /** 拖拽旋转（dx 像素）。 */
  rotateBy(dx) {
    this.camera.rotation += dx * ROTATE_PER_PX;
    this.cameraChanged();
  }

  /** Shift+拖拽平移（观星时的顺手操作）。 */
  panBy(dx, dy) {
    this.camera.tx += dx;
    this.camera.ty += dy;
    this.cameraChanged();
  }

  /** 双击 / Esc 回到初始视角。 */
  resetCamera() {
    this.camera = { scale: 1, rotation: 0, tx: 0, ty: 0 };
    this.cameraChanged();
  }

  get zoomLabel() {
    return Math.round(this.camera.scale * 100) + '%';
  }

  // ------------------------------------------------------------------ 画布 //
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
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.dirtyBackground = true;
    this.buildStars();
    this.draw();
    this.syncHotspots();
  }

  /** 程序化星表：固定 seed，刷新不变。星点数量随视口面积走。 */
  buildStars() {
    const area = this.width * this.height;
    // (待补充：可见星点数量/密度策略) 当前按面积密度取 480–1200 颗
    const count = clamp(Math.round(area / 1500), 480, 1200);
    const rng = mulberry32(20261018);
    const stars = [];
    for (let i = 0; i < count; i += 1) {
      // 归一化天空坐标：[-1,1] 覆盖视口（缩放/旋转在绘制时按相机施加）
      const nx = rng() * 2 - 1;
      const ny = rng() * 2 - 1;
      // 星等按幂律：暗星多、亮星少，这样才像真实星野而不是均匀噪点
      const mag = Math.pow(rng(), 2.4);
      stars.push({ nx, ny, mag, hue: rng() });
    }
    this.stars = stars;
    this.starSeed = Math.round(area);
  }

  /** 概念节点的世界坐标（px，相对屏幕中心）。 */
  point(node) {
    const pad = 0.94;
    return this.applyCamera(node.x * (this.width / 2) * pad, node.y * (this.height / 2) * pad);
  }

  starPoint(star) {
    return this.applyCamera(star.nx * (this.width / 2), star.ny * (this.height / 2));
  }

  radius(node) {
    const axis = (this.payload?.axes || []).includes(node.id);
    const base = Math.sqrt(Math.max(node.hits || 1, 1));
    return Math.max(1.5, Math.min(5, 1.2 + base * 0.22)) + (axis ? 0.8 : 0);
  }

  /** 背景层：银河带 + 恒星 + 概念图的隐约结构线（固定 seed）。 */
  drawBackground() {
    const ctx = this.bg.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);

    // 银河：一条随相机一起转的稀薄星尘带
    const bandAngle = this.camera.rotation - 0.52;
    ctx.save();
    ctx.translate(this.width / 2 + this.camera.tx, this.height / 2 + this.camera.ty);
    ctx.rotate(bandAngle);
    const bandLen = Math.hypot(this.width, this.height) * 1.1 * this.camera.scale;
    const bandW = this.height * 0.34 * this.camera.scale;
    const grad = ctx.createLinearGradient(0, -bandW, 0, bandW);
    grad.addColorStop(0, 'rgba(150, 168, 205, 0)');
    grad.addColorStop(0.5, 'rgba(168, 182, 214, 0.085)');
    grad.addColorStop(1, 'rgba(150, 168, 205, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-bandLen / 2, -bandW, bandLen, bandW * 2);
    ctx.restore();

    // 恒星：按星等给半径、亮度、星芒。
    // 拖拽/缩放时交错取样并跳过光晕，静止后补画完整细节（交互流畅优先）。
    const lod = this.interacting;
    const stepRatio = lod ? 2 : 1;
    for (let i = 0; i < this.stars.length; i += stepRatio) {
      const star = this.stars[i];
      const p = this.starPoint(star);
      if (p.x < -8 || p.y < -8 || p.x > this.width + 8 || p.y > this.height + 8) continue;
      const mag = star.mag;
      const [r, g, b] = starColor(star.hue);
      const alpha = (0.2 + mag * 0.78) * this.dim;
      const radius = 0.45 + mag * 1.45;

      if (mag > 0.72 && !lod) {
        // 亮星：先铺一层光晕
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 6);
        glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (0.34 * alpha).toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 6, 0, TAU);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
      ctx.arc(p.x, p.y, radius, 0, TAU);
      ctx.fill();

      if (mag > 0.88 && !lod) {
        // 最亮的几颗加四芒星芒：一眼就能认出这是星图
        const spike = radius * (4.5 + mag * 3);
        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.3 * alpha).toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x - spike, p.y);
        ctx.lineTo(p.x + spike, p.y);
        ctx.moveTo(p.x, p.y - spike);
        ctx.lineTo(p.x, p.y + spike);
        ctx.stroke();
      }
    }

    // 概念图的结构线：很低但可见，像星表连线
    if (this.nodes.length) {
      ctx.strokeStyle = 'rgba(186, 196, 214, ' + (0.05 * this.dim).toFixed(3) + ')';
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
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const lit = [...this.lit].filter((n) => this.byName.has(n));
    if (lit.length < 2) return;
    // 范围查询的星座轨迹：沿剪枝边把已点亮节点连起来
    ctx.strokeStyle = 'rgba(214, 208, 194, ' + (0.16 * this.dim).toFixed(3) + ')';
    ctx.lineWidth = 0.8;
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
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const reduced = this.reduced;

    // P3：流式脉冲——中心一团极淡的辉光 + 几颗随机被「点亮」的星，随输出节奏呼吸
    if (this.energy > 0.01) {
      const e = this.energy;
      // 阅读时（dim 低）脉冲弱一档，避免盖住正文
      const strength = e * (0.6 + 0.4 * this.dim);
      // ① 整屏极淡提亮：报告「背景在呼吸」最直接的信号
      ctx.fillStyle = 'rgba(198, 210, 235, ' + (0.035 * strength).toFixed(3) + ')';
      ctx.fillRect(0, 0, this.width, this.height);

      // ② 中心辉光：随输出节奏轻微起伏
      const wobble = 0.85 + 0.15 * Math.sin(now * 0.012);
      const glow = ctx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, Math.hypot(this.width, this.height) * 0.62,
      );
      glow.addColorStop(0, 'rgba(226, 232, 245, ' + (0.17 * strength * wobble).toFixed(3) + ')');
      glow.addColorStop(0.45, 'rgba(210, 220, 240, ' + (0.075 * strength * wobble).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(200, 210, 235, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, this.width, this.height);

      // ③ 闪烁星：每帧换一批被点亮的星，读起来像「星野在回应输出」
      if (this.stars.length) {
        const flickers = Math.round(10 + strength * 34);
        for (let i = 0; i < flickers; i += 1) {
          const star = this.stars[(now * 0.06 + i * 137) % this.stars.length | 0];
          if (!star || star.mag < 0.45) continue;
          const p = this.starPoint(star);
          const radius = 0.7 + star.mag * 3.2 * strength;
          ctx.beginPath();
          ctx.fillStyle = 'rgba(238, 244, 255, ' + (0.85 * strength).toFixed(3) + ')';
          ctx.arc(p.x, p.y, radius, 0, TAU);
          ctx.fill();
        }
      }
    }

    // 命中连线画在节点下面：极细、随 age 淡出
    for (const link of this.linksTo) {
      const age = (now - link.born) / 600;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(233, 229, 219, ' + (0.12 * (1 - age) * this.dim).toFixed(3) + ')';
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
      if (isLit) alpha = 0.78;
      else if (isHalo) alpha = 0.32;
      else if (isHover) alpha = 0.6;
      if (!alpha) continue;
      alpha *= this.dim;

      const pulse = this.pulses.get(node.id);
      if (pulse && !reduced) {
        const t = Math.min(1, (now - pulse) / 620);
        const grow = 1 + t * 2.4;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(232, 228, 216, ' + (0.3 * (1 - t) * this.dim).toFixed(3) + ')';
        ctx.lineWidth = 0.9;
        ctx.arc(p.x, p.y, r * grow, 0, TAU);
        ctx.stroke();
      }

      // 点亮节点给一圈光晕：在星野里更容易认出来
      if (isLit) {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 7);
        halo.addColorStop(0, 'rgba(236, 240, 250, ' + (0.3 * this.dim).toFixed(3) + ')');
        halo.addColorStop(1, 'rgba(236, 240, 250, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 7, 0, TAU);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = 'rgba(240, 237, 228, ' + alpha.toFixed(3) + ')';
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();

      if (this.favorite.has(node.id)) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(240, 237, 228, ' + (0.28 * this.dim).toFixed(3) + ')';
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

  // ------------------------------------------------------------------ 脉冲 //
  /** P3：流式输出的每个提交批次抬一次能量，由 step() 逐帧衰减。 */
  flash(amount = 6) {
    const now = performance.now();
    this.energy = clamp(this.energy + 0.05 + Math.min(amount, 8) * 0.012, 0, 1);
    this.lastFlashAt = now;
    this.startLoop();
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

    // 流式能量衰减：静止后自然回到 0，循环随之停下
    if (this.energy > 0.01) {
      this.energy *= ENERGY_DECAY;
      busy = true;
    } else if (this.energy) {
      this.energy = 0;
      this.drawNodes(now);
    }

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

  /** 命中连线：从星点指向正文里的那个词，600ms 后淡掉；节点本身保持低亮。 */
  connectToDom(names) {
    if (!this.nodes.length || typeof document === 'undefined') return;
    const rect = this.nodeCanvas.getBoundingClientRect();
    const now = performance.now();
    for (const name of names || []) {
      const node = this.byName.get(name);
      if (!node) continue;
      const el = document.querySelector(
        '.term-hit[data-term="' + String(name).replace(/"/g, '\\\\"') + '"]',
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

  /** 点击热区：只给「已点亮 / 邻域 / 收藏」的节点，未点亮节点不暴露。 */
  syncHotspots() {
    if (!this.hitLayer) return;
    const actionable = this.nodes.filter(
      (n) => this.lit.has(n.id) || this.halo.has(n.id) || this.favorite.has(n.id),
    );
    // 相机变化时热区集合通常不变：只挪位置，避免每次 pointermove 重建 DOM
    if (actionable.length === this.hotspots.length
        && actionable.every((n, i) => this.hotspots[i].name === n.id)) {
      for (let i = 0; i < actionable.length; i += 1) {
        const p = this.point(actionable[i]);
        this.hotspots[i].el.style.left = p.x + 'px';
        this.hotspots[i].el.style.top = p.y + 'px';
      }
      return;
    }
    this.hotspots = [];
    this.hitLayer.textContent = '';
    for (const node of actionable) {
      const p = this.point(node);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'star-hotspot';
      el.tabIndex = -1;   // 183 个节点不各占一个 Tab 停靠点：星图容器自己收键盘
      el.setAttribute('aria-label', node.id);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.addEventListener('pointerdown', (e) => e.stopPropagation());   // 点在热区上不触发拖拽
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
