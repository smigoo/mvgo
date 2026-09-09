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

const child = spawn('npm', ['run', 'dev', '--', '--host', '--port', '2610'], {
  cwd: FE_DIR,
  detached: true,          // Unix 下 -> 新 session/process group（等同 setsid）
  env: process.env,
  stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
});

child.unref();             // 父进程退出后子进程不被回收
console.log('[start-frontend] vite spawned pid=' + child.pid + ' (detached)');

child.on('error', (e) => console.error('[start-frontend] spawn error:', e.message));
child.on('exit', (code, sig) => {
  // 仅记录，不阻塞
  console.error('[start-frontend] vite exited code=' + code + ' sig=' + sig);
});
