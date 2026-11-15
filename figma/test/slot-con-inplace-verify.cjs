// 双 section 内容容器原地升格为 slot-con 的定点回归验证（v20261116）
// 目标样本：Q1QuWz0j9YdIsxUnu6F1oV_1-479_9e4c1b4f.json（1:479 今日巡查）
// 阴性对照：GTcJm0DKQvcJvcOZTh5n1l_38-3134_3e3288a3.json（多块图标/文本行，必须仍建 wrapper）
// 只读缓存、只读 code.js，不写产品文件、不部署。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const shim = require('./figma-node-shim.cjs');

const REPO = path.resolve(__dirname, '../..');
const CODE = path.resolve(REPO, 'figma/src/cursor_mcp_plugin/code.js');
const CACHE = path.resolve(REPO, 'backend-node/data/figma-node-cache');
const TARGET = 'Q1QuWz0j9YdIsxUnu6F1oV_1-479_9e4c1b4f.json';
const NEGATIVE = 'GTcJm0DKQvcJvcOZTh5n1l_38-3134_3e3288a3.json';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS', name, detail || ''); }
  else { fail++; console.log('FAIL', name, detail || ''); }
}
function collect(root) {
  const out = [];
  (function walk(n) { if (!n) return; out.push(n); for (const c of (n.children || [])) walk(c); })(root);
  return out;
}
function byId(root, id) { return collect(root).find(n => n.id === id) || null; }
function named(root, name) { return collect(root).find(n => n.name === name) || null; }
function boxEq(a, b) {
  if (!a || !b) return false;
  return ['x', 'y', 'width', 'height'].every(k => Math.abs(Number(a[k]) - Number(b[k])) <= 0.01);
}

async function run(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(CACHE, file), 'utf8'));
  const figma = shim.buildFigmaMock(raw);
  const noop = () => {};
  const sb = {
    figma, __html__: '<html></html>',
    console: { log: noop, warn: noop, error: noop, debug: noop },
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    Blob: class {}, URL: class { static createObjectURL() { return ''; } static revokeObjectURL() {} },
    Buffer, process: { env: {} },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), sb, { filename: 'code.js', timeout: 5000 });
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await figma.ui.onmessage({ type: 'structure-only', setExport: false, groupModules: false });
  const result = figma.messages.filter(m => m && m.type === 'ai-organize-result').slice(-1)[0];
  return { raw, figma, result };
}

(async () => {
  const t = await run(TARGET);
  check('T01 目标整理成功', !!(t.result && t.result.ok !== false));
  check('T02 原地复用，不新建 wrapper',
    t.result && t.result.slotConCreated === 0 && t.result.slotConReused === 1,
    t.result ? 'created=' + t.result.slotConCreated + ' reused=' + t.result.slotConReused : 'no result');

  const names = (t.figma.root.children || []).map(n => n.name);
  check('T03 根三段式 bg/slot-con/header', names.join(',') === 'bg,slot-con,header', names.join(','));

  const slot = byId(t.figma.root, '1:481');
  check('T04 slot-con 就是原 content（双 section 直属）',
    !!slot && slot.name === 'slot-con' && (slot.children || []).length === 2,
    slot ? slot.name + ' kids=' + (slot.children || []).length : 'not found');
  let marked = false;
  try { marked = slot && slot.getPluginData('mvSlotCon') === '1'; } catch (e) {}
  check('T05 mvSlotCon 标记写入', marked);
  check('T06 无 content 残留', !named(t.figma.root, 'content'));

  const rawMap = new Map();
  for (const n of collect(t.raw.document)) if (n.id && n.absoluteBoundingBox) rawMap.set(n.id, n.absoluteBoundingBox);
  let total = 0, diff = 0;
  for (const n of collect(t.figma.root)) {
    const b = rawMap.get(n.id);
    if (!b || !n.absoluteBoundingBox) continue;
    total++;
    if (!boxEq(n.absoluteBoundingBox, b)) diff++;
  }
  check('T07 全部原节点几何零漂移', diff === 0, '节点 ' + total + ' 偏差 ' + diff);

  const neg = await run(NEGATIVE);
  check('N01 阴性对照仍建 wrapper',
    neg.result && neg.result.slotConCreated === 1,
    neg.result ? 'created=' + neg.result.slotConCreated : 'no result');

  console.log('\n==== 定点回归：PASS=' + pass + ' FAIL=' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('验证异常:', (e && e.stack) || e); process.exit(2); });
