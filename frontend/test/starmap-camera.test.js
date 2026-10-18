// 星图的三条硬约束：① 只画可查询的概念节点（没有装饰星）；② 未命中完全不可见；
// ③ 全图不使用圆形发光/径向渐变；另外覆盖 P2 相机与 P3 流式反馈。
import { describe, expect, it } from 'vitest';
import { StarMap } from '../src/lib/starmap.js';

function recorder() {
  const calls = { arc: [], line: 0, rects: 0, radial: 0, linear: 0, strokeRect: 0 };
  const gradient = { addColorStop: () => {} };
  const ctx = {
    clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    setTransform: () => {}, beginPath: () => {}, closePath: () => {}, fill: () => {},
    stroke: () => { calls.line += 1; },
    moveTo: () => {}, lineTo: () => {},
    fillRect: () => { calls.rects += 1; },
    strokeRect: () => { calls.strokeRect += 1; },
    createLinearGradient: () => { calls.linear += 1; return gradient; },
    // 出现径向渐变 = 违反「禁止圆形发光」，计数后由测试断言为 0
    createRadialGradient: () => { calls.radial += 1; return gradient; },
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

const NODES = [
  { id: '大他者', x: -0.4, y: 0.2, hits: 229, aliases: [] },
  { id: '客体小a', x: 0.3, y: -0.1, hits: 120, aliases: [] },
  { id: '象征界', x: 0.5, y: 0.4, hits: 40, aliases: [] },
  { id: '主体', x: -0.1, y: -0.5, hits: 8, aliases: [] },
];

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
    nodes: NODES,
    edges: [{ source: '大他者', target: '客体小a', weight: 0.8 }],
  });
  return { map, rec };
}

describe('P1 星图只由概念节点构成', () => {
  it('全量概念图先装载：183 类节点一次到位，不靠"背景星"补画面', () => {
    const { map } = makeMap();
    expect(map.nodes).toHaveLength(NODES.length);
    expect(map.maxHits).toBe(229);
    // 装饰星表已被移除
    expect(map.stars).toBeUndefined();
    expect(typeof map.buildStars).toBe('undefined');
  });

  it('背景层不画任何星点：只有图版家具（框线 / 网格 / 刻度）', () => {
    const { map, rec } = makeMap();
    rec.calls.arc.length = 0;
    rec.calls.line = 0;
    map.drawBackground();
    expect(rec.calls.arc).toHaveLength(0);     // 没有一个"星点"
    expect(rec.calls.line).toBeGreaterThan(0); // 但有框线/网格/刻度
  });

  it('未命中的概念完全不可见：不画点、不画刻度', () => {
    const { map, rec } = makeMap();
    map.lit = new Set();
    map.halo = new Set();
    rec.calls.arc.length = 0;
    rec.calls.line = 0;
    map.drawNodes(0);
    expect(rec.calls.arc).toHaveLength(0);
    // 只剩可能存在的流式刻度（这里 energy=0，所以也不该有）
    expect(rec.calls.line).toBe(0);
  });

  it('命中后才可见：画实心点 + 四芒刻度，亮星刻度更长', () => {
    const { map, rec } = makeMap();
    map.lit = new Set(['大他者', '主体']);
    rec.calls.arc.length = 0;
    rec.calls.line = 0;
    map.drawNodes(0);
    expect(rec.calls.arc).toHaveLength(2);          // 恰两个命中节点
    expect(rec.calls.line).toBeGreaterThanOrEqual(2); // 每个节点一组四芒刻度
    expect(map.tickLength(map.byName.get('大他者')))
      .toBeGreaterThan(map.tickLength(map.byName.get('主体')));   // 星等越高刻度越长
  });

  it('全流程不使用径向渐变（禁止圆形发光）', () => {
    const { map, rec } = makeMap();
    map.lit = new Set(['大他者', '客体小a']);
    map.energy = 0.9;
    map.drawBackground();
    map.drawLinks();
    map.drawNodes(performance.now());
    map.setHovered('大他者');
    map.setFocused('大他者');
    map.setFavorites(['客体小a']);
    map.draw();
    expect(rec.calls.radial).toBe(0);
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

  it('缩放有上下限，拖拽改变旋转角，复位回到初始视角', () => {
    const { map } = makeMap();
    for (let i = 0; i < 40; i += 1) map.zoomAt(640, 400, -240);
    expect(map.camera.scale).toBeLessThanOrEqual(3.2);
    for (let i = 0; i < 80; i += 1) map.zoomAt(640, 400, 240);
    expect(map.camera.scale).toBeGreaterThanOrEqual(0.6);

    map.rotateBy(120);
    expect(Math.abs(map.camera.rotation)).toBeGreaterThan(0.1);
    map.resetCamera();
    expect(map.camera).toEqual({ scale: 1, rotation: 0, tx: 0, ty: 0 });
  });
});

describe('P3 流式反馈（非圆形）', () => {
  it('流式期间画线性提亮 + 扫描线 + 量程刻度，且没有径向渐变', () => {
    const { map, rec } = makeMap();
    map.stopLoop();

    rec.calls.rects = 0;
    rec.calls.linear = 0;
    map.energy = 0;
    map.drawNodes(0);
    const idleRects = rec.calls.rects;

    rec.calls.rects = 0;
    rec.calls.linear = 0;
    map.energy = 0.9;
    map.drawNodes(1000);
    expect(rec.calls.linear).toBeGreaterThanOrEqual(1);   // 线性渐变做整体提亮
    expect(rec.calls.rects).toBeGreaterThan(idleRects);   // 额外多出扫描线与刻度
    expect(rec.calls.radial).toBe(0);                    // 没有圆形辉光
  });

  it('能量衰减到 0 后停掉 rAF', () => {
    const { map } = makeMap();
    map.stopLoop();
    map.flash(6);
    expect(map.energy).toBeGreaterThan(0.05);
    let guard = 0;
    while (map.energy > 0.01 && guard < 400) { map.step(); guard += 1; }
    map.step();
    expect(map.energy).toBe(0);
    expect(map.unsubscribe).toBe(null);
  });
});
