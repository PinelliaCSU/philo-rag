import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// cwd 是 frontend/：星图 JSON 在 Python 包的静态目录里
const payload = JSON.parse(
  readFileSync(resolve(process.cwd(), '../philo_rag/web/data/starmap.json'), 'utf-8'),
);

const adjacency = () => {
  const map = new Map(payload.nodes.map((n) => [n.id, new Set()]));
  for (const edge of payload.edges) {
    map.get(edge.source).add(edge.target);
    map.get(edge.target).add(edge.source);
  }
  return map;
};

describe('星图布局', () => {
  it('节点覆盖全部词典概念，且带坐标与别名', () => {
    expect(payload.nodes).toHaveLength(183);
    for (const node of payload.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(Array.isArray(node.aliases)).toBe(true);
      expect(node.hits).toBeGreaterThan(0);
    }
  });

  it('坐标归一化在 [-1,1]', () => {
    for (const node of payload.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(-1);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.y).toBeGreaterThanOrEqual(-1);
      expect(node.y).toBeLessThanOrEqual(1);
    }
  });

  it('剪枝后平均度远低于全图（全图是 69）', () => {
    const avg = (2 * payload.edges.length) / payload.nodes.length;
    expect(avg).toBeLessThan(8);
    expect(payload.edges.length).toBeLessThanOrEqual(payload.nodes.length * 3);
  });

  it('图是连通的：每个节点都能走到其它节点', () => {
    const adj = adjacency();
    const seen = new Set([payload.nodes[0].id]);
    const stack = [payload.nodes[0].id];
    while (stack.length) {
      const cur = stack.pop();
      for (const next of adj.get(cur)) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    expect(seen.size).toBe(payload.nodes.length);
  });

  it('没有自环，且轴概念只做降权不做中心固定', () => {
    for (const edge of payload.edges) expect(edge.source).not.toBe(edge.target);
    expect(payload.axes).toEqual(['场域论', '本体论', '认识论', '目的论']);
    expect(payload.seed).toBe(20261018);
  });
});
