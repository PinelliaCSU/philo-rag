// 星图：自绘 Canvas 2D，三层画布（图版 / 星座线 / 节点与流式反馈）。
//
// 节点策略（本轮重做）：
//   · 星图上**只有概念节点**——每一个点都能用 /api/concept 查到；上一版的装饰星表已删除；
//   · 全量概念图一装载就存在（183 个节点），但未命中的节点**一个像素都不画**，
//     不用"暗淡显示"代替"不可见"；
//   · 只有被回答命中（direct）或作为一阶邻域（halo）时才可见，直接命中持久、邻域 20s 衰减。
//
// 视觉语言（对齐真实天文图）：星等由命中块数决定 → 点半径、四芒/八芒刻度长度与线宽；
// 星座连线只在已点亮节点之间画；图版家具（外框、角标、经纬网格、边缘刻度尺）提供星图的版式。
// **全图禁止**圆形发光 / 径向光晕 / 圆形辉光块：亮与暗只用「点的大小 + 刻度长短 + 线宽」表达，
// 流式反馈也改成线性提亮 + 扫描线 + 底边量程刻度，代码里没有任何 createRadialGradient。
//
// 相机：scale（滚轮缩放）/ rotation（拖拽旋转）/ 平移（Shift+拖拽），
// 概念节点与图版共用同一个相机，所以缩放旋转时它们一起动。
import { prefersReducedMotion, subscribe } from './motion.js';

const TAU = Math.PI * 2;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3.2;
const ROTATE_PER_PX = 0.0035;   // 拖拽 1px 转多少弧度
const ENERGY_DECAY = 0.92;      // 流式脉冲每帧衰减系数

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
    this.maxHits = 1;              // 全图最大命中数：星等（点大小/星芒长度）的基准

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
    this.maxHits = Math.max(1, ...this.nodes.map((n) => n.hits || 1));
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
    this.draw();
    this.syncHotspots();
  }

  /** 概念节点的世界坐标（px，相对屏幕中心）。 */
  point(node) {
    const pad = 0.94;
    return this.applyCamera(node.x * (this.width / 2) * pad, node.y * (this.height / 2) * pad);
  }

  /** 星等：0..1，由该概念在语料里的命中块数决定（命中越多越大越亮）。 */
  magnitude(node) {
    const h = Math.max(0, Math.min(1, Math.sqrt((node.hits || 1) / this.maxHits)));
    return h;
  }

  /** 视星等 → 点半径（真实星图上「星等越高点越大」，这里量纲换算到 1–3.4px）。 */
  radius(node) {
    const axis = (this.payload?.axes || []).includes(node.id);
    return 1.3 + this.magnitude(node) * 2.6 + (axis ? 0.4 : 0);
  }

  /** 星芒/刻线的长度：亮星更长。这是非圆形的层次手段（不用光晕）。 */
  tickLength(node) {
    return 2.5 + this.magnitude(node) * 9.5;
  }

  /** 背景层：星图图版（plate）的家具——外框、经纬网格、边缘刻度。
   *  这里**不画任何星点**：星图上的每个点都必须是概念节点（见 drawNodes）。 */
  drawBackground() {
    const ctx = this.bg.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);

    const W = this.width;
    const H = this.height;
    const ink = (a) => 'rgba(196, 206, 226, ' + (a * this.dim).toFixed(3) + ')';

    // 图版外框：四条细线 + 四角加粗的角标（印刷星图的版式）
    const inset = 18;
    ctx.strokeStyle = ink(0.16);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(inset, inset); ctx.lineTo(W - inset, inset);
    ctx.lineTo(W - inset, H - inset); ctx.lineTo(inset, H - inset);
    ctx.closePath();
    ctx.stroke();

    // 角标：每角两段短线，比外框亮一档
    ctx.strokeStyle = ink(0.3);
    ctx.lineWidth = 1;
    const corner = 14;
    for (const [cx, cy, dx, dy] of [
      [inset, inset, 1, 1], [W - inset, inset, -1, 1],
      [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * corner);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * corner, cy);
      ctx.stroke();
    }

    // 经纬网格：等距细线，随相机一起转/缩放（像星图的坐标网）
    const cols = 8;
    const rows = 5;
    ctx.strokeStyle = ink(0.055);
    ctx.lineWidth = 0.6;
    for (let i = 1; i < cols; i += 1) {
      const x = (W / cols) * i;
      const a = this.applyCamera(x - W / 2, -H / 2);
      const b = this.applyCamera(x - W / 2, H / 2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let j = 1; j < rows; j += 1) {
      const y = (H / rows) * j;
      const a = this.applyCamera(-W / 2, y - H / 2);
      const b = this.applyCamera(W / 2, y - H / 2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // 边缘刻度：底边一列短竖线，逢网格交点加长——真实星图的坐标尺
    ctx.strokeStyle = ink(0.22);
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= cols * 4; i += 1) {
      const x = (W / (cols * 4)) * i;
      if (x < inset || x > W - inset) continue;
      const long = i % 4 === 0;
      const len = long ? 10 : 5;
      ctx.beginPath();
      ctx.moveTo(x, H - inset);
      ctx.lineTo(x, H - inset - len);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, inset);
      ctx.lineTo(x, inset + len);
      ctx.stroke();
    }
    for (let j = 0; j <= rows * 4; j += 1) {
      const y = (H / (rows * 4)) * j;
      if (y < inset || y > H - inset) continue;
      const long = j % 4 === 0;
      const len = long ? 10 : 5;
      ctx.beginPath();
      ctx.moveTo(inset, y);
      ctx.lineTo(inset + len, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W - inset, y);
      ctx.lineTo(W - inset - len, y);
      ctx.stroke();
    }
  }

  drawLinks() {
    const ctx = this.links.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const lit = [...this.lit].filter((n) => this.byName.has(n));
    if (lit.length < 2) return;
    // 范围查询的星座轨迹：沿剪枝边把已点亮节点连起来
    ctx.strokeStyle = 'rgba(206, 216, 236, ' + (0.22 * this.dim).toFixed(3) + ')';
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

  /** 流式反馈：非圆形的「扫读」——线性提亮 + 一条扫描线 + 底边量程刻度。 */
  drawStreamFeedback(ctx, now) {
    if (this.energy <= 0.01) return;
    const strength = this.energy * (0.55 + 0.45 * this.dim);
    const W = this.width;
    const H = this.height;

    // ① 整屏线性提亮（自上而下的线性渐变；不是径向、不是辉光块）
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, 'rgba(198, 210, 236, ' + (0.085 * strength).toFixed(3) + ')');
    wash.addColorStop(0.55, 'rgba(184, 198, 228, ' + (0.045 * strength).toFixed(3) + ')');
    wash.addColorStop(1, 'rgba(168, 184, 216, 0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    // ② 扫描线：一条 1px 横向细线自上而下走，像读片机扫过星图
    const sweep = ((now * 0.07) % (H + 140)) - 70;
    ctx.fillStyle = 'rgba(216, 228, 250, ' + (0.36 * strength).toFixed(3) + ')';
    ctx.fillRect(0, Math.round(sweep), W, 1);

    // ③ 底边量程：一列刻度，读到哪亮到哪（进度感，而不是一团光）
    const ticks = 72;
    const head = ((now * 0.09) % W);
    const base = H - 18;
    for (let i = 0; i < ticks; i += 1) {
      const x = (W / ticks) * i;
      const d = Math.abs(x - head) / W;
      const a = Math.max(0, 0.5 - d * 1.1) * strength;
      if (a <= 0.012) continue;
      const long = i % 6 === 0;
      ctx.fillStyle = 'rgba(208, 220, 244, ' + a.toFixed(3) + ')';
      ctx.fillRect(x, base - (long ? 9 : 5), 1, long ? 9 : 5);
    }
  }

  drawNodes(now = performance.now()) {
    const ctx = this.nodeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const reduced = this.reduced;
    const lod = this.interacting;

    this.drawStreamFeedback(ctx, now);

    // 命中连线画在节点下面：极细、随 age 淡出（直线，不是光）
    for (const link of this.linksTo) {
      const age = (now - link.born) / 600;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(228, 234, 246, ' + (0.14 * (1 - age) * this.dim).toFixed(3) + ')';
      ctx.lineWidth = 0.6;
      ctx.moveTo(link.from.x, link.from.y);
      ctx.lineTo(link.to.x, link.to.y);
      ctx.stroke();
    }

    for (const node of this.nodes) {
      const isLit = this.lit.has(node.id);
      const isHalo = !isLit && this.halo.has(node.id);
      const isHover = this.hovered === node.id || this.focused === node.id;
      // 未命中 = 完全不可见：不画点、不画刻度、不画标签
      if (!isLit && !isHalo && !isHover) continue;

      const p = this.point(node);
      if (p.x < -20 || p.y < -20 || p.x > this.width + 20 || p.y > this.height + 20) continue;

      const mag = this.magnitude(node);
      const r = this.radius(node);
      const base = isLit ? 0.95 : isHalo ? 0.34 : 0.55;
      const alpha = base * this.dim;

      // 点亮动画：刻度从 0 长到全长（非圆形的「点亮」表现）
      const pulse = this.pulses.get(node.id);
      const grow = pulse && !reduced ? Math.min(1, (now - pulse) / 620) : 1;

      // 实心点：星图符号本身（1–3.4px 的圆点，没有渐变、没有外发光）
      ctx.beginPath();
      ctx.fillStyle = 'rgba(238, 243, 251, ' + (alpha * (0.55 + 0.45 * grow)).toFixed(3) + ')';
      ctx.arc(p.x, p.y, r * (0.55 + 0.45 * grow), 0, TAU);
      ctx.fill();

      // 四芒刻度：真实星图用刻线长度区分亮星（亮星更长）
      const t = this.tickLength(node) * grow;
      const bright = mag > 0.55;
      ctx.strokeStyle = 'rgba(228, 236, 250, ' + (alpha * 0.85).toFixed(3) + ')';
      ctx.lineWidth = bright ? 1 : 0.7;
      ctx.beginPath();
      ctx.moveTo(p.x - r - t, p.y); ctx.lineTo(p.x - r - 1.1, p.y);
      ctx.moveTo(p.x + r + 1.1, p.y); ctx.lineTo(p.x + r + t, p.y);
      ctx.moveTo(p.x, p.y - r - t); ctx.lineTo(p.x, p.y - r - 1.1);
      ctx.moveTo(p.x, p.y + r + 1.1); ctx.lineTo(p.x, p.y + r + t);
      ctx.stroke();

      // 最亮的一档再加斜向刻度（8 芒），仍然是线段
      if (bright && !lod) {
        const d = t * 0.55;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x - r - d, p.y - r - d); ctx.lineTo(p.x - r - d * 0.35, p.y - r - d * 0.35);
        ctx.moveTo(p.x + r + d * 0.35, p.y + r + d * 0.35); ctx.lineTo(p.x + r + d, p.y + r + d);
        ctx.moveTo(p.x + r + d, p.y - r - d); ctx.lineTo(p.x + r + d * 0.35, p.y - r - d * 0.35);
        ctx.moveTo(p.x - r - d * 0.35, p.y + r + d * 0.35); ctx.lineTo(p.x - r - d, p.y + r + d);
        ctx.stroke();
      }

      // 悬停 / 键盘聚焦：四角括线（标注框，不是光圈）
      if (isHover && !lod) {
        const b = r + 7;
        const len = 4;
        ctx.strokeStyle = 'rgba(232, 238, 248, ' + (0.65 * this.dim).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - b, p.y - b + len); ctx.lineTo(p.x - b, p.y - b); ctx.lineTo(p.x - b + len, p.y - b);
        ctx.moveTo(p.x + b - len, p.y - b); ctx.lineTo(p.x + b, p.y - b); ctx.lineTo(p.x + b, p.y - b + len);
        ctx.moveTo(p.x - b, p.y + b - len); ctx.lineTo(p.x - b, p.y + b); ctx.lineTo(p.x - b + len, p.y + b);
        ctx.moveTo(p.x + b - len, p.y + b); ctx.lineTo(p.x + b, p.y + b); ctx.lineTo(p.x + b, p.y + b - len);
        ctx.stroke();
      }

      // 收藏：一个小方框（非圆形）
      if (this.favorite.has(node.id)) {
        const s = r + 4;
        ctx.strokeStyle = 'rgba(236, 242, 252, ' + (0.3 * this.dim).toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
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
