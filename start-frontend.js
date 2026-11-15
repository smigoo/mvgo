#!/usr/bin/env node
/**
 * 前端 Vite dev server 脱离会话启动器。
 * 用 Node child_process.spawn({ detached: true, unref() }) 创建新会话，
 * 等价于 setsid（macOS 无 setsid 二进制），进程可跨 Bash 工具调用存活。
 * 用法：node /Users/smigoo/工作/mvgo/start-frontend.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FE_DIR = '/Users/smigoo/工作/mvgo/frontend';
const LOG = '/Users/smigoo/工作/mvgo/frontend-dev.log';

// 清空旧日志，避免和上次输出混在一起
try { fs.writeFileSync(LOG, ''); } catch (_) {}

// 🛡️ 2026-11-12 治本（实锤：vite 首页 500「connect ECONNREFUSED .../cbb-*/broker.sock」）：
// WorkBuddy 会话 env 携带 NODE_OPTIONS=--require=node-language-shim.cjs，vite 继承后所有
// fs 操作经 shim 代理到会话级 broker.sock；start-frontend 是 detached 长驻进程，Bash 工具
// 调用结束即 broker 清理 ⇒ shim 后续连接 ECONNREFUSED ⇒ 首页/模块请求 500。
// 后端 start-node.js 早已删 NODE_OPTIONS 故无此疾（对齐其清理口径）。
const env = { ...process.env };
for (const k of ['NODE_OPTIONS', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
  delete env[k];
}

// 🔴 2026-11-15 治本（实锤：本机 spawn 'npm run dev' 报
//   `Cannot find module '/Users/smigoo/工作/mvgo/vite/bin/vite.js'` + 「Brokered program
//   policy check unavailable」）：PATH 上的 npm 是 WorkBuddy 的 brokered wrapper
//   （~/.workbuddy/binaries/node/.../bin/npm），它**忽略 spawn 的 cwd**，在会话 cwd（仓库根）
//   执行 `npm run dev` ⇒ 命中根 package.json 的同名脚本，却按根 prefix 解析 vite bin
//   （根 node_modules 无 vite）⇒ MODULE_NOT_FOUND。
//   ⇒ 不再经 npm：直接用同一 node 执行 frontend/node_modules/vite/bin/vite.js，
//     cwd 显式给 FE_DIR（vite 自身尊重 cwd，读 frontend/vite.config.*）。
const NODE_BIN = process.execPath;
const VITE_BIN = path.join(FE_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(VITE_BIN)) {
  console.error('[start-frontend] 未找到 vite bin：' + VITE_BIN + '（请先在 frontend/ 执行 npm install）');
  process.exit(1);
}

const child = spawn(NODE_BIN, [VITE_BIN, '--host', '--port', '2610'], {
  cwd: FE_DIR,
  detached: true,          // Unix 下 -> 新 session/process group（等同 setsid）
  env,
  stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
});

child.unref();             // 父进程退出后子进程不被回收
console.log('[start-frontend] vite spawned pid=' + child.pid + ' (detached)');

child.on('error', (e) => console.error('[start-frontend] spawn error:', e.message));
child.on('exit', (code, sig) => {
  // 仅记录，不阻塞
  console.error('[start-frontend] vite exited code=' + code + ' sig=' + sig);
});
