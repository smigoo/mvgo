#!/usr/bin/env node
/**
 * Java 后端（8080）脱离会话启动器。
 * 用 child_process.spawn({ detached: true, unref() }) 创建新会话（等同 setsid），
 * 进程可跨 Bash 工具调用 / 沙箱回合存活，避免被沙箱进程树回收导致反复掉线。
 * 用法：node /Users/smigoo/工作/mvgo/start-java.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const JAVA_HOME = '/opt/homebrew/Cellar/openjdk@17/17.0.20/libexec/openjdk.jdk/Contents/Home';
const JAVA_BIN = path.join(JAVA_HOME, 'bin', 'java');
const BE_DIR = '/Users/smigoo/工作/mvgo/backend-java';
const LOG = path.join(BE_DIR, 'java.log');

// 清空旧日志，避免和上次输出混在一起
try { fs.writeFileSync(LOG, ''); } catch (_) {}

// 构造干净环境：去代理、清掉端口污染变量、dev profile + 自动登录兜底
const env = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
  delete env[k];
}
delete env.SERVER__PORT;
delete env.SERVER_PORT;
env.SPRING_PROFILES_ACTIVE = 'dev';
env.DEV_AUTO_LOGIN = 'true';

const child = spawn(JAVA_BIN, ['-jar', 'mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar', '--server.port=8080'], {
  cwd: BE_DIR,
  detached: true,          // Unix 下 -> 新 session/process group（等同 setsid）
  env,
  stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
});

child.unref();             // 父进程退出后子进程不被回收
console.log('[start-java] backend spawned pid=' + child.pid + ' (detached), log=' + LOG);

child.on('error', (e) => console.error('[start-java] spawn error:', e.message));
child.on('exit', (code, sig) => {
  console.error('[start-java] backend exited code=' + code + ' sig=' + sig);
});
