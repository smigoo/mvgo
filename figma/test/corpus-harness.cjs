// Figma 整理插件回归安全网（阶段 1）
//
// 作用：用 backend-node/data/figma-node-cache/*.json 的 29 个真实节点树，
// 在 Node 里加载真实 code.js（不是副本），跑 structure-only 主流程，
// 输出每棵树整理后的结构快照。通过快照 diff 判断「改 A 是否坏了 B」。
//
// 用法：
//   node corpus-harness.cjs --baseline          生成/覆盖基线快照（首次、或确认行为变更时）
//   node corpus-harness.cjs --check             当前代码跑一遍，与基线 diff；非目标样本变化即 FAIL
//   node corpus-harness.cjs --check --allow=X   允许指定样本变化（逗号分隔文件名前缀）
//   node corpus-harness.cjs --list              列出纳入的样本
//   node corpus-harness.cjs --summary           只打印每样本的 summary 计数（调试用）
//
// 退出码：0=全绿；1=有 FAIL；2=环境/参数错误。
// 本脚本只读缓存、只读 code.js，不写产品文件、不部署、不重启。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const HERE = __dirname;
const REPO = path.resolve(HERE, '../..');
const CODE = path.resolve(REPO, 'figma/src/cursor_mcp_plugin/code.js');
const CACHE_DIR = path.resolve(REPO, 'backend-node/data/figma-node-cache');
const SNAP_DIR = path.resolve(HERE, 'corpus-snapshots');
const shim = require('./figma-node-shim.cjs');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

function listCorpus() {
  if (!fs.existsSync(CACHE_DIR)) throw new Error('缓存目录不存在: ' + CACHE_DIR);
  return fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => ({ file: f, full: path.join(CACHE_DIR, f) }));
}

// 在隔离 vm 中加载真实 code.js 并执行 structure-only
async function runOne(cacheFile) {
  const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const doc = raw.document;
  const figma = shim.buildFigmaMock({ ...raw, document: doc });

  const noop = () => {};
  const sandbox = {
    figma,
    __html__: '<html></html>',
    console: { log: noop, warn: noop, error: noop, debug: noop },
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    Blob: class {}, URL: class { static createObjectURL() { return ''; } static revokeObjectURL() {} },
    Buffer, process: { env: {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const src = fs.readFileSync(CODE, 'utf8');
  vm.runInContext(src, sandbox, { filename: 'code.js', timeout: 5000 });

  // 顶层 async IIFE（恢复缓存/广播选区）先跑完
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));

  // 触发结构整理
  if (typeof figma.ui.onmessage !== 'function') throw new Error('code.js 未注册 figma.ui.onmessage');
  await figma.ui.onmessage({ type: 'structure-only', setExport: false, groupModules: false });

  const result = figma.messages.filter(m => m && m.type === 'ai-organize-result').slice(-1)[0];
  const progress = figma.messages.filter(m => m && m.type === 'ai-progress').length;
  // 结果消息是铺平的（不是 result.summary），字段名见 code.js 结果对象
  const summary = result ? {
    renamed: result.renamed, reparented: result.reparented, reordered: result.reordered,
    grouped: result.grouped, deleted: result.deleted,
    sectionGroupsCreated: result.sectionGroupsCreated, sectionGroupsPinned: result.sectionGroupsPinned,
    sectionContainersRenamed: result.sectionContainersRenamed,
    slotConCreated: result.slotConCreated, slotConReused: result.slotConReused,
    slotConModules: result.slotConModules,
    nestedComponentRoots: result.nestedComponentRoots, nestedCpDemoted: result.nestedCpDemoted,
    deepHeaderFound: result.deepHeaderFound, rootHeaderDemotedDeep: result.rootHeaderDemotedDeep,
    chartLegendGuarded: result.chartLegendGuarded, chartLegendSkippedMerge: result.chartLegendSkippedMerge,
  } : null;
  return {
    file: path.basename(cacheFile),
    ok: !!(result && result.ok !== false),
    error: result && result.error ? String(result.error) : '',
    snapshot: shim.snapshot(figma),
    summary,
    messageCount: figma.messages.length,
    progressCount: progress,
  };
}

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12); }
function snapPath() { return path.join(SNAP_DIR, 'baseline.json'); }

async function main() {
  const corpus = listCorpus();
  if (has('--list')) {
    console.log('corpus 样本数:', corpus.length);
    corpus.forEach((c, i) => console.log(String(i + 1).padStart(2), c.file));
    return;
  }

  const mode = has('--baseline') ? 'baseline' : (has('--check') ? 'check' : (has('--summary') ? 'summary' : null));
  if (!mode) { console.error('需指定 --baseline / --check / --summary / --list'); process.exit(2); }

  const results = [];
  for (const c of corpus) {
    try {
      const r = await runOne(c.full);
      results.push(r);
    } catch (e) {
      results.push({ file: c.file, ok: false, error: String((e && e.message) || e), snapshot: '', summary: null });
    }
  }

  if (mode === 'summary') {
    for (const r of results) {
      const s = r.summary || {};
      console.log([
        r.ok ? 'OK  ' : 'FAIL',
        r.file.padEnd(52),
        'band=' + (s.sectionGroupsCreated || 0),
        'slot=' + (s.slotConCreated || 0) + '/' + (s.slotConReused || 0),
        'ren=' + (s.rename || 0),
        'repar=' + (s.reparent || 0),
        'err=' + r.error.slice(0, 40),
      ].join(' '));
    }
    return;
  }

  if (mode === 'baseline') {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    const base = {};
    for (const r of results) base[r.file] = { ok: r.ok, error: r.error, hash: sha(r.snapshot), snapshot: r.snapshot };
    fs.writeFileSync(snapPath(), JSON.stringify(base, null, 2));
    console.log('==== 基线已写入', snapPath(), '样本数', Object.keys(base).length, '====');
    for (const r of results) console.log(' ', r.ok ? 'OK  ' : 'FAIL', r.file, r.error.slice(0, 60));
    const bad = results.filter(r => !r.ok);
    if (bad.length) { console.log('基线含 FAIL 样本，请检查环境/mock:', bad.length); process.exit(1); }
    return;
  }

  // check 模式
  if (!fs.existsSync(snapPath())) { console.error('基线不存在，请先跑 --baseline'); process.exit(2); }
  const base = JSON.parse(fs.readFileSync(snapPath(), 'utf8'));
  const allowRaw = val('--allow') || '';
  const allow = new Set(allowRaw.split(',').map(s => s.trim()).filter(Boolean));

  let fail = 0;
  for (const r of results) {
    const b = base[r.file];
    if (!b) { console.log('FAIL', r.file, '基线中无此样本（新增样本需 --baseline 重建）'); fail++; continue; }
    const curHash = sha(r.snapshot);
    if (!r.ok) { console.log('FAIL', r.file, '整理报错:', r.error.slice(0, 80)); fail++; continue; }
    if (curHash !== b.hash) {
      if (allow.has(r.file)) {
        console.log('CHG ', r.file, '允许变化', b.hash, '->', curHash);
      } else {
        console.log('FAIL', r.file, '快照变化（未授权）', b.hash, '->', curHash);
        // 打印前 12 行差异定位
        const bl = b.snapshot.split('\n'), cl = r.snapshot.split('\n');
        let shown = 0;
        for (let i = 0; i < Math.max(bl.length, cl.length) && shown < 12; i++) {
          if (bl[i] !== cl[i]) { console.log('   L' + (i + 1), '-', (bl[i] || '').slice(0, 120)); console.log('        +', (cl[i] || '').slice(0, 120)); shown++; }
        }
        fail++;
      }
    } else {
      console.log('OK  ', r.file, curHash);
    }
  }
  console.log('==== diff 检查：样本', results.length, 'FAIL', fail, '允许变化', allow.size, '====');
  if (fail) process.exit(1);
}

main().catch(e => { console.error('harness 异常:', (e && e.stack) || e); process.exit(2); });
