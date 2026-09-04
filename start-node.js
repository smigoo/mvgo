#!/usr/bin/env node
/**
 * Node 后端（13030）脱离会话启动器。
 * 用 child_process.spawn({ detached: true, unref() }) 创建新会话（等同 setsid），
 * 进程可跨 Bash 工具调用 / 沙箱回合存活，避免被沙箱进程树回收导致反复掉线。
 * 用法：node /Users/smigoo/工作/mvgo/start-node.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 用当前运行 node 的绝对路径（process.execPath），避免 managed node 版本目录变化（如 22.22.2 → 22.22.2-2）导致 ENOENT
const NODE_BIN = process.execPath;
const BE_DIR = '/Users/smigoo/工作/mvgo/backend-node';
const LOG = path.join(BE_DIR, 'server.log');

// 追加模式保留历史日志（排障需要回溯上一次运行的生成过程，2026-08-25 教训：
// attempt 失败原因因日志被清空而无法追查）；启动时写分隔线 + 简单轮转（>10MB 转存 .1）
try {
  const st = fs.existsSync(LOG) ? fs.statSync(LOG) : null;
  if (st && st.size > 10 * 1024 * 1024) {
    try { fs.renameSync(LOG, LOG + '.1'); } catch (_) {}
  }
  fs.appendFileSync(LOG, `\n\n===== [start-node] ===== ${new Date().toISOString()} =====\n`);
} catch (_) {}

// 构造干净环境：去掉代理变量（避免内网/本地连接被代理劫持），显式指定本地 MongoDB
const env = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NODE_OPTIONS']) {
  delete env[k];
}
env.NODE_ENV = 'development';
env.MONGODB_URI = 'mongodb://localhost:27017/langgraph-server';
// 开发态自动建号：任意 Token 头即可建立本地 dev-local 身份，便于本地联调
env.DEV_AUTO_LOGIN = 'true';

const child = spawn(NODE_BIN, ['dist/main.js'], {
  cwd: BE_DIR,
  detached: true,          // Unix 下 -> 新 session/process group（等同 setsid）
  env,
  stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
});

child.unref();             // 父进程退出后子进程不被回收
console.log('[start-node] backend spawned pid=' + child.pid + ' (detached), log=' + LOG);

child.on('error', (e) => console.error('[start-node] spawn error:', e.message));
child.on('exit', (code, sig) => {
  console.error('[start-node] backend exited code=' + code + ' sig=' + sig);
});
