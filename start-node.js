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
// 🗑️ 墓碑（2026-09-30 删除）：此处原为 `const fetch = require('node-fetch');`
//    为什么删：node-fetch v3 是 ESM-only，CJS require 拿到的是 namespace 对象
//      （keys = AbortError/Blob/FetchError/File…），不是函数 ⇒ 调用必抛
//      "fetch is not a function"，被下方 catch 静默吞掉。
//    收敛到哪：Node 22 内置 globalThis.fetch（已实测 typeof === 'function'）。
const fetch = globalThis.fetch;

async function main() {

// 用当前运行 node 的绝对路径（process.execPath），避免 managed node 版本目录变化（如 22.22.2 → 22.22.2-2）导致 ENOENT
const NODE_BIN = process.execPath;
const BE_DIR = '/Users/smigoo/工作/mvgo/backend-node';
const LOG = path.join(BE_DIR, 'server.log');

// 🛡️ V8 正则回溯熔断（2026-09-29 实锤 · mc-max-1790654134322-bc91bb18 卡死事件）：
//   现象：进程存活 / 13030 仍 LISTEN / TCP 可连，但 **HTTP 全部无响应**（curl 000）、日志静默 6.5 分钟。
//   `sample <pid> 3` 采 2530 样本全部落同一条栈：
//     uv__io_poll → TLSWrap::ClearOut（收到 HTTPS 响应）→ MicrotaskQueue → PromiseFulfillReactionJob
//       → AsyncFunctionAwaitResolveClosure → StringPrototypeMatch → RegExpMatchFast → [回溯循环]
//   ⇒ 主线程被 `String.prototype.match()` 的**灾难性回溯**占满，事件循环无法推进。
//   （具体是哪个正则尚未唯一确定；已压测排除 code-validator.js:57 引号剥离 / /\{[\s\S]*\}/ / 代码围栏 / 分隔符检测。）
//
//   对策：V8 在回溯次数超过 `--regexp-backtracks-before-fallback` 时，
//   回退到**实验性非回溯引擎**（线性时间，语义等价），从而把「无限卡死」变成「正常返回」。
//   对比实验（/^(a+)+$/ 匹配 'a'×32+'b'）：不带 flag → 8 秒未返回（卡死复现）；带 flag → 1ms 返回 false。
//   ⚠️ 下方第 ~70 行会删除 NODE_OPTIONS（规避 WorkBuddy 的 node-language-shim），
//      所以 flag **必须**走 spawn 的 argv，而不能靠环境变量注入。
const V8_SAFETY_FLAGS = [
  '--enable-experimental-regexp-engine-on-excessive-backtracks',
  '--regexp-backtracks-before-fallback=50000',
];

// 🛡️ R3-B（2026-09-11）版本一致性护栏：启动时比对 dist 构建时间 vs src 最新 mtime，
// 不一致打 WARN —— 杜绝「旧 dist 生成的产物被当成新代码效果」的误判（cfb53488 即此类）。
// 同时打印 git HEAD 短 hash，供任务 meta 记录代码版本。
function latestSrcMtime(dir, extRe, acc = { latest: 0, file: null }) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'coverage' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { latestSrcMtime(p, extRe, acc); continue; }
    if (!extRe.test(e.name)) continue;
    // 🛡️ 2026-09-29（假阳性实锤）：测试文件不参与运行时产出（jest `testRegex: ".*\.spec\.ts$"`，
    //   `*.test.js` 在本仓永不被执行）⇒ 把它们算进「src 最新改动」会让护栏误报 STALE：
    //   改了 spec 就提示「dist 落后于源码 / 运行的是旧代码，请重新 build」，逼出无意义重构建，
    //   并让人怀疑修复是否真的装载（本次排查「背景图消失」时就先被这条噪音误导了一轮）。
    if (/\.(spec|test)\.[cm]?[jt]sx?$/i.test(e.name)) continue;
    try {
      const m = fs.statSync(p).mtimeMs;
      if (m > acc.latest) { acc.latest = m; acc.file = p; }
    } catch { /* skip */ }
  }
  return acc;
}
function gitHeadShort(cwd) {
  try {
    return require('child_process').execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}
// 🛡️ 2026-09-30（假警报实锤，改动判据本身）：原判据只看 `dist/main.js` 的 mtime，
//   而 `nest build` 是**增量编译**——只重写本次真正变更的文件，`main.js` 常常原封不动。
//   实测：main.js 停在 21:32，同期布局改动已 emit 到 dist/ai-engine/**（mtime 23:53），
//   于是每次启动都报「dist 落后于源码」= 狼来了；真落后时反而没人信。
//   改为读「构建时间证据」（取最新者）：
//     ① `dist/.build-stamp`       —— build 脚本成功结尾写入（scripts/write-build-stamp.mjs），最可靠
//     ② `tsconfig.build.tsbuildinfo` —— 直接跑 `nest build`（不走 npm script）时也会刷新
//     ③ `dist/main.js` mtime      —— 兜底，兼容历史语义
const DIST_MAIN = path.join(BE_DIR, 'dist', 'main.js');
const BUILD_STAMP = path.join(BE_DIR, 'dist', '.build-stamp');
const TS_BUILDINFO = path.join(BE_DIR, 'tsconfig.build.tsbuildinfo');
const _evidence = [BUILD_STAMP, TS_BUILDINFO, DIST_MAIN]
  .map((f) => {
    try {
      const st = fs.statSync(f);
      return st.isFile() ? { name: path.relative(BE_DIR, f), t: st.mtimeMs } : null;
    } catch { return null; }
  })
  .filter(Boolean);
const _distTime = _evidence.length ? Math.max(..._evidence.map((e) => e.t)) : 0;
const _distBasis = _evidence.length
  ? _evidence.filter((e) => e.t === _distTime).map((e) => e.name).join(' | ')
  : '无构建产物';
const _srcScan = latestSrcMtime(path.join(BE_DIR, 'src'), /\.(ts|js)$/);
const _gitHash = gitHeadShort(BE_DIR);
const STALE = _distTime > 0 && _srcScan.latest > _distTime;
const R3B_STATUS =
  `[start-node] dist 构建时间=${new Date(_distTime).toISOString()} 基准=${_distBasis} git=${_gitHash}` +
  (STALE ? '  ⚠️ STALE' : '  ✅ 与源码一致');
// 🔑 阳性留痕：健康时也要吭声 —— 否则「护栏通过」与「护栏压根没跑」无法区分。
//   且判定要**落盘**（见下方 server.log 分隔线处）：本文件的 console 走 stdout，
//   而 detached / 无终端启动时 stdout 会被丢弃 ⇒ 判定永久丢失，又回到「分不清」。
let R3B_REPORT = R3B_STATUS;
if (STALE) {
  const _r3bWarn =
    `[start-node] ⚠️ R3-B 版本护栏：dist 构建时间(${new Date(_distTime).toISOString()}, 基准=${_distBasis}) ` +
    `早于 src 最新改动(${new Date(_srcScan.latest).toISOString()}, ${path.relative(BE_DIR, _srcScan.file || '')})。` +
    `当前 dist 落后于源码，运行的是旧代码，请重新 build 后再启动。`;
  R3B_REPORT = _r3bWarn + '\n' + R3B_STATUS;
  console.warn(_r3bWarn);
}
console.log(R3B_STATUS);


// 追加模式保留历史日志（排障需要回溯上一次运行的生成过程，2026-08-25 教训：
// attempt 失败原因因日志被清空而无法追查）；启动时写分隔线 + 简单轮转（>10MB 转存 .1）
try {
  const st = fs.existsSync(LOG) ? fs.statSync(LOG) : null;
  if (st && st.size > 10 * 1024 * 1024) {
    try { fs.renameSync(LOG, LOG + '.1'); } catch (_) {}
  }
  fs.appendFileSync(LOG, `\n\n===== [start-node] ===== ${new Date().toISOString()} =====\n`);
  // R3-B 判定落盘：stdout 在 detached/无终端启动时会丢失，只有落盘才能事后审计
  // 「护栏到底跑没跑、当时判成什么」——这正是它失效很久没人发现的原因。
  fs.appendFileSync(LOG, R3B_REPORT + '\n');
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

// 重启前检查活动任务（P1-3 graceful drain）
//
// 🔴 2026-09-30 修复：这段护栏此前**从未生效过一次**，三处缺陷叠加，
//    每一处都独立地把执行路径逼向 catch → return false（= 无条件放行）：
//    ① `require('node-fetch')` 拿到 namespace 对象而非函数 ⇒ fetch is not a function；
//    ② 鉴权头写错：`Authorization: Bearer dev` 恒 401 —— session.guard.ts:31 只认
//       `headers['token']` 或 `query.token`，正确的头是 `token: dev`；
//    ③ 响应形状误判：`/api/tasks` 返回 `{success,code,data:{tasks:[],count}}`，
//       数组在 `data.tasks` 而非顶层 ⇒ `tasks.filter is not a function`。
//    ⇒ 修完后必须留**阳性留痕**（下方 ✅ 那行日志）：只有「护栏跑了且通过」打了日志，
//      才能把「通过」与「压根没跑」区分开 —— 否则下次仍然查不出它是否活着。
async function checkActiveTasks() {
  if (process.env.FORCE_KILL) return false;

  let res;
  try {
    res = await fetch('http://localhost:13030/api/tasks', {
      headers: { token: 'dev' },     // 注意：不是 Authorization: Bearer
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    // 连接失败 = 服务本来就没在跑（首次启动的必经路径）⇒ 正常放行，不是异常。
    console.log('[start-node] 未探测到在跑的服务（属首次启动的正常情况），直接拉起');
    return false;
  }

  try {
    if (!res.ok) {
      console.warn(`[start-node] ⚠️ 活动任务探测返回 HTTP ${res.status}，**无法判定**是否有任务在跑。`);
      console.warn('   按「无活动任务」放行；若此刻确有生成在进行，重启会把它打断。');
      return false;
    }

    const json = await res.json();
    // 契约：{ success, code, message, data: { tasks: TaskItem[], count } }
    const tasks = json?.data?.tasks ?? (Array.isArray(json?.data) ? json.data : null);
    if (!Array.isArray(tasks)) {
      console.warn('[start-node] ⚠️ 活动任务探测响应结构非预期，**无法判定**是否有任务在跑，按无活动任务放行。');
      return false;
    }

    const active = tasks.filter((t) => ['running', 'queued', 'rate_limited'].includes(t.status));
    if (active.length > 0) {
      console.error(`⚠️ ${active.length} 个生成任务进行中（${active.map((t) => t.sessionId).join(',')}）`);
      console.error('   等待完成或 FORCE_KILL=1 node start-node.js 强制重启');
      return true; // 有活动任务，阻止重启
    }

    // 🔑 阳性留痕：证明护栏这次真的执行到了，而不是被静默吞掉
    console.log(`[start-node] ✅ 活动任务检查通过（历史 ${tasks.length} 条，进行中 0 条），可以安全重启`);
  } catch (e) {
    console.warn('[start-node] ⚠️ 活动任务探测结果解析失败，**无法判定**是否有任务在跑：', e.message);
  }
  return false;
}

// 检查活动任务，如果有则退出
const hasActive = await checkActiveTasks();
if (hasActive) {
  process.exit(1);
}

const child = spawn(NODE_BIN, [...V8_SAFETY_FLAGS, 'dist/main.js'], {
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

// 等待子进程启动
setTimeout(() => {
  console.log('[start-node] 服务启动完成');
}, 3000);
}

main();
