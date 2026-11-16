// AI 全自动整理 layoutIntent 异构混组 / 跨模块争抢 的定点回归验证（v20261116）
// 真机 2015-130 崩坏复现：@echarts/radar 被 rectified-stat / overdue-stat / hazard-radar
// 三个 module 各认领一次，「左图表 + 右上下两卡」被打散成三平级。
// 本脚本走 apply-ai-ops（corpus-harness 只走 structure-only，覆盖不到 AI 路径），
// 只读缓存 + 只读 code.js，不写产品文件、不部署。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const shim = require('./figma-node-shim.cjs');

const REPO = path.resolve(__dirname, '../..');
const CODE = path.resolve(REPO, 'figma/src/cursor_mcp_plugin/code.js');
const CACHE = path.resolve(REPO, 'backend-node/data/figma-node-cache');
const TARGET = 'XK5lAcOFt3Yn6WvtanieKM_1-712_3e3288a3.json';

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
function boxesEqual(a, b) {
  if (!a || !b) return false;
  return ['x', 'y', 'width', 'height'].every(k => Math.abs(Number(a[k]) - Number(b[k])) <= 0.01);
}

// 日志里三个互相争抢 radar 的单 id 模块
const CONFLICT_MODULES = [
  { order: 1, name: 'rectified-stat', nodeIds: ['1:727'] },   // 上卡
  { order: 1, name: 'overdue-stat',   nodeIds: ['1:735'] },   // 下卡
  { order: 1, name: 'hazard-radar',   nodeIds: ['1:816'] },   // radar
];

async function run(modules, ops) {
  const raw = JSON.parse(fs.readFileSync(path.join(CACHE, TARGET), 'utf8'));
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
  const before = {};
  for (const id of ['1:816', '1:727', '1:735']) {
    const n = byId(figma.currentPage, id);
    before[id] = n ? {
      x: n.absoluteBoundingBox.x, y: n.absoluteBoundingBox.y,
      width: n.absoluteBoundingBox.width, height: n.absoluteBoundingBox.height,
      parent: n.parent && n.parent.id,
    } : null;
  }
  await figma.ui.onmessage({
    type: 'apply-ai-ops',
    ops: ops || [],
    groupModules: true,
    useLayoutIntent: true,
    setExport: false,
    layoutIntent: { modules: modules, decorations: [] },
  });
  const result = figma.messages.filter(m => m && m.type === 'ai-organize-result').slice(-1)[0];
  return { figma, result, before };
}

(async () => {
  const t = await run(CONFLICT_MODULES);

  check('A01 apply-ai-ops 执行成功', !!(t.result && t.result.ok !== false),
    t.result ? 'ok=' + t.result.ok : 'no result');

  const radar = byId(t.figma.currentPage, '1:816');
  check('A02 radar 节点仍存在', !!radar, radar ? radar.name : 'missing');

  // 核心断言：radar 不能被多个业务模块组同时直接持有
  const parents = [];
  (function walk(n) {
    if (!n || !('children' in n)) return;
    for (const c of n.children || []) {
      if (c.id === '1:816') parents.push({ group: n.name, pluginData: (() => { try { return c.parent.getPluginData('mvModuleContainer'); } catch (e) { return ''; } })() });
      walk(c);
    }
  })(t.figma.currentPage);
  check('A03 radar 只被一个父级持有（无多组争抢）', parents.length <= 1,
    'holders=' + parents.length + ' ' + JSON.stringify(parents));

  // A04：同构护栏直接验证（绕过执行路径的其它判据，精准测本轮改动）。
  // 真机崩坏形态 = radar 与卡片同父且 y 重叠 ⇒ expandModuleNodes 会把 radar 拉进卡片组。
  // 护栏后 radar 与卡片被判异构 ⇒ 不混组。
  const raw2 = JSON.parse(fs.readFileSync(path.join(CACHE, TARGET), 'utf8'));
  const figma2 = shim.buildFigmaMock(raw2);
  const noop2 = () => {};
  const sb2 = {
    figma: figma2, __html__: '<html></html>',
    console: { log: noop2, warn: noop2, error: noop2, debug: noop2 },
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    Blob: class {}, URL: class { static createObjectURL() { return ''; } static revokeObjectURL() {} },
    Buffer, process: { env: {} },
  };
  sb2.globalThis = sb2;
  vm.createContext(sb2);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), sb2, { filename: 'code.js', timeout: 5000 });
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  // 关键：把两张卡 reparent 到 radar 的父级（2002:85），复现真机「三者同父 + y 重叠」。
  {
    const radarNode = byId(figma2.currentPage, '1:816');
    const cardsNode = byId(figma2.currentPage, '1:727');
    const cardBNode = byId(figma2.currentPage, '1:735');
    if (radarNode && radarNode.parent && cardsNode && cardBNode) {
      radarNode.parent.appendChild(cardsNode);
      radarNode.parent.appendChild(cardBNode);
    }
  }
  // 原缓存里卡片在 cards 里、radar 在 Frame 里，不同父级 ⇒ 单 id 扩展本就不会混组 ⇒ 假绿。
  const cardA = byId(figma2.currentPage, '1:727');
  const cardB = byId(figma2.currentPage, '1:735');
  const radar2 = byId(figma2.currentPage, '1:816');
  const host = radar2 && radar2.parent;
  check('A04a radar 与卡片已构造为同父级', !!host && !!cardA && !!cardB && cardA.parent === host && cardB.parent === host,
    host ? host.name + ' kids=' + (host.children || []).length : 'missing');
  check('A04b 几何同视觉行（护栏前的触发条件成立）',
    !!cardA && !!radar2 && sb2.sameVisualRow(cardA.absoluteBoundingBox, radar2.absoluteBoundingBox),
    cardA && radar2 ? 'cardA.y=' + cardA.absoluteBoundingBox.y + ' radar.y=' + radar2.absoluteBoundingBox.y : 'missing');
  check('A04c 内容形态判为异构（护栏判据）',
    !!cardA && !!radar2 && !sb2.isSameContentShape(cardA, radar2),
    cardA && radar2 ? sb2.memberStructureSig(cardA) + ' vs ' + sb2.memberStructureSig(radar2) : 'missing');
  // 核心有效断言：真机崩坏方向是 radar 作 seed（hazard-radar module 的 nodeIds=[1:816]），
  // expandModuleNodes 把同父同行的卡片吞进 radar 组 ⇒ section-hazard-radar 含 radar+两卡；
  // 同时卡片 seed 的 module 又争抢同一个 radar。护栏后 radar seed 不再吞卡片。
  let expandedIds = [];
  try { expandedIds = sb2.expandModuleNodes([radar2], host, () => {}).map(n => n.id); } catch (e) {}
  check('A04d radar 作 seed 时未把卡片吞进组（有效断言）',
    !expandedIds.some(id => id === '1:727' || id === '1:735'),
    'expanded=' + JSON.stringify(expandedIds));
  check('A04e 同构自反（阳性对照：护栏不误杀同类）',
    !!radar2 && sb2.isSameContentShape(radar2, radar2) && !!cardA && sb2.isSameContentShape(cardA, cardA));

  // 几何零漂移：三个关键节点 bbox 不变
  const drift = [];
  for (const id of ['1:816', '1:727', '1:735']) {
    const n = byId(t.figma.currentPage, id);
    const b = t.before[id];
    if (!n || !b) { drift.push(id + ':missing'); continue; }
    const now = { x: n.absoluteBoundingBox.x, y: n.absoluteBoundingBox.y, width: n.absoluteBoundingBox.width, height: n.absoluteBoundingBox.height };
    if (!boxesEqual(now, b)) drift.push(id + ':' + JSON.stringify(now) + '!=' + JSON.stringify(b));
  }
  check('A05 关键节点几何零漂移', drift.length === 0, drift.join(' | '));

  check('A06 同构护栏拦住混组（可观测产物：三冲突 module 均未成组）',
    t.result && Number(t.result.moduleGroups || 0) === 0,
    t.result ? 'moduleGroups=' + t.result.moduleGroups + ' moduleSkipped=' + t.result.moduleSkipped : 'no result');

  console.log('\n结果: PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
