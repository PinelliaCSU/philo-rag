// P1/P2/P3 的可测部分：相机变换、星表规模与亮度分布、流式脉冲能量。
// 用记录型 canvas 上下文替身，不依赖真实 canvas 实现。
import { describe, expect, it, vi } from 'vitest';
import { StarMap } from '../src/lib/starmap.js';

function recorder() {
  const calls = { arc: [], spike: 0, rects: 0, gradients: 0 };
  const gradient = { addColorStop: () => {} };
  const ctx = {
    clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    setTransform: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {},
    moveTo: () => {}, lineTo: () => {},
    fillRect: () => { calls.rects += 1; },
    createLinearGradient: () => { calls.gradients += 1; return gradient; },
    createRadialGradient: () => { calls.gradients += 1; return gradient; },
    arc: (x, y, r) => calls.arc.push({ x, y, r }),
  };
  return { ctx, calls };
}

function fakeCanvas(rec, width = 1280, height = 800) {
  return {
    style: {},
    width: 0,
    height: 0,
    getContext: () => rec.ctx,
    getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }),
  };
}

function makeMap(width = 1280, height = 800) {
  const rec = recorder();
  const map = new StarMap({
    background: fakeCanvas(rec, width, height),
    links: fakeCanvas(rec, width, height),
    nodes: fakeCanvas(rec, width, height),
    hitLayer: document.createElement('div'),
  });
  map.setData({
    version: 1, seed: 1, axes: [],
    nodes: [{ id: 'a', x: 0, y: 0, hits: 100, aliases: [] }],
    edges: [],
  });
  return { map, rec };
}

describe('P1 恒星图', () => {
  it('星表按视口面积生成，且暗星多于亮星', () => {
    const { map } = makeMap();
    expect(map.stars.length).toBeGreaterThanOrEqual(480);
    const bright = map.stars.filter((s) => s.mag > 0.7).length;
    const faint = map.stars.filter((s) => s.mag < 0.2).length;
    expect(faint).toBeGreaterThan(bright);   // 幂律：暗星多
    expect(bright).toBeGreaterThan(5);       // 但总要有几颗亮到能当坐标
  });

  it('背景层真的画了星（数量、星芒、银河带）', () => {
    const { map, rec } = makeMap();
    rec.calls.arc.length = 0;
    map.drawBackground();
    expect(rec.calls.arc.length).toBeGreaterThanOrEqual(map.stars.length);
    expect(rec.calls.rects).toBeGreaterThan(0);       // 银河带
    expect(rec.calls.gradients).toBeGreaterThan(0);   // 亮星光晕
  });
});

describe('P2 缩放与旋转', () => {
  it('缩放钉住光标下的世界点', () => {
    const { map } = makeMap();
    const cursor = { x: 900, y: 260 };
    const before = map.toWorld(cursor.x, cursor.y);
    map.zoomAt(cursor.x, cursor.y, -240);
    expect(map.camera.scale).toBeGreaterThan(1);
    const back = map.applyCamera(before.x, before.y);
    expect(back.x).toBeCloseTo(cursor.x, 3);
    expect(back.y).toBeCloseTo(cursor.y, 3);
  });

  it('缩放有上下限', () => {
    const { map } = makeMap();
    for (let i = 0; i < 40; i += 1) map.zoomAt(640, 400, -240);
    expect(map.camera.scale).toBeLessThanOrEqual(3.2);
    for (let i = 0; i < 80; i += 1) map.zoomAt(640, 400, 240);
    expect(map.camera.scale).toBeGreaterThanOrEqual(0.6);
  });

  it('拖拽改变旋转角，复位回到初始视角', () => {
    const { map } = makeMap();
    map.rotateBy(120);
    expect(Math.abs(map.camera.rotation)).toBeGreaterThan(0.1);
    map.zoomAt(100, 100, -200);
    map.panBy(30, -20);
    map.resetCamera();
    expect(map.camera).toEqual({ scale: 1, rotation: 0, tx: 0, ty: 0 });
  });
});

describe('P3 流式脉冲', () => {
  it('flash 抬升能量，空闲后逐帧衰减到 0 并停掉循环', () => {
    const { map } = makeMap();
    map.stopLoop();
    map.flash(6);
    expect(map.energy).toBeGreaterThan(0.05);
    let guard = 0;
    while (map.energy > 0.01 && guard < 400) {
      map.step();
      guard += 1;
    }
    expect(map.energy).toBeLessThan(0.02);
    map.step();                           // 再走一帧：能量归零 → 循环退出
    expect(map.energy).toBe(0);
    expect(map.unsubscribe).toBe(null);   // 静止即停 rAF
  });

  it('脉冲期间会铺一层辉光并点亮额外的闪烁星', () => {
    const { map, rec } = makeMap();
    map.stopLoop();

    // 静止：只画节点（没有任何 fillRect 辉光）
    rec.calls.arc.length = 0;
    rec.calls.rects = 0;
    map.energy = 0;
    map.drawNodes(0);
    const idleArcs = rec.calls.arc.length;
    const idleRects = rec.calls.rects;

    // 脉冲：整屏提亮 + 中心辉光（两次 fillRect）+ 一批闪烁星
    rec.calls.arc.length = 0;
    rec.calls.rects = 0;
    map.energy = 0.9;
    map.drawNodes(0);
    expect(rec.calls.rects).toBeGreaterThanOrEqual(2);
    expect(rec.calls.rects).toBeGreaterThan(idleRects);
    expect(rec.calls.arc.length).toBeGreaterThan(idleArcs);
  });
});
