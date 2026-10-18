// 动效调度：星图脉冲、字符尾迹、流式文字提交共用同一条 rAF。
// 空闲（没有订阅者）时立刻停掉循环——星图静止时不该有常驻绘制。

const reducedQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** `prefers-reduced-motion: reduce`：所有动画降级为「直接出现」。 */
export function prefersReducedMotion() {
  return !!(reducedQuery && reducedQuery.matches);
}

/** 低性能设备：关掉尾迹层，只保留节点脉冲（见 §8.4）。 */
export function isLowPowerDevice() {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  return cores <= 4 || mem <= 4;
}

const subscribers = new Set();
let frame = 0;

function tick(now) {
  frame = 0;
  for (const fn of [...subscribers]) {
    try {
      fn(now);
    } catch {
      subscribers.delete(fn);
    }
  }
  if (subscribers.size && !frame) frame = requestAnimationFrame(tick);
}

/** 订阅每帧回调；返回取消订阅函数。同一循环服务所有动画。 */
export function subscribe(fn) {
  subscribers.add(fn);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** 一次性动画：持续 ms 毫秒，每帧回调 (progress 0→1)。 */
export function animate(ms, onFrame) {
  if (prefersReducedMotion()) {
    onFrame(1);
    return () => {};
  }
  const start = performance.now();
  let stop = null;
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms);
    onFrame(p);
    if (p >= 1) stop && stop();
  };
  stop = subscribe(step);
  return () => stop && stop();
}

/** 淡出后归零的定时器集合：组件卸载时统一清理，避免定时器泄漏。 */
export function timeout(fn, ms) {
  return setTimeout(fn, ms);
}
