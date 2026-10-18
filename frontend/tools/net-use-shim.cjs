// 受限环境（沙箱禁止子进程管道）下的构建垫片。
//
// 两处子进程在受限环境里必然被拒绝：
//   · Vite 在 Windows 启动时执行 `net use` 探测网络盘映射；
//   · esbuild 需要以管道启动它自己的服务进程（JS/CSS 压缩与控制台转译）。
// 这里只做两件事：把 `net use` 换成空结果、把构建标记为「不压缩」。
// 普通开发机不需要它——`npm run build` 走标准 Vite 构建。
const cp = require('node:child_process');
const original = cp.exec;

cp.exec = function exec(command, ...rest) {
  if (typeof command === 'string' && command.trim().toLowerCase() === 'net use') {
    const cb = rest.find((x) => typeof x === 'function');
    if (cb) queueMicrotask(() => cb(null, '', ''));
    return { on() {}, once() {}, kill() {}, stdout: { on() {} }, stderr: { on() {} } };
  }
  return original.call(this, command, ...rest);
};

process.env.VITE_RESTRICTED_BUILD = '1';
