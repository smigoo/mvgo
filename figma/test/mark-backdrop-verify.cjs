// 阶段4 手工背景打标入口验证（7 项）
// 覆盖：返回 ok / 只写 pluginData 不改几何 / 不误标非目标 / 判据消费 / 幂等 / 空选区失败提示
// 只读消费缓存与 code.js，不写产品文件、不部署。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const shim = require('./figma-node-shim.cjs');

const REPO = path.resolve(__dirname, '../..');
const CODE = path.resolve(REPO, 'figma/src/cursor_mcp_plugin/code.js');
const CACHE = path.resolve(REPO, 'backend-node/data/figma-node-cache');
const src = fs.readFileSync(CODE, 'utf8');
const file = 'Q1QuWz0j9YdIsxUnu6F1oV_1-479_9e4c1b4f.json';

let pass = 0, fail = 0;
const ck = (n, ok, d) => { if (ok) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); } };

async function setup() {
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
    Buffer,
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'code.js', timeout: 5000 });
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  return figma;
}

(async () => {
  const figma = await setup();
  const target = figma.root.children.find(n => n.name === 'content');
  figma.currentPage.selection = [target];
  const bb = { ...target.absoluteBoundingBox };
  await figma.ui.onmessage({ type: 'mark-backdrop-manual' });
  const r = figma.messages.filter(m => m && m.type === 'mark-backdrop-result').slice(-1)[0];
  ck('M01 返回 ok', !!(r && r.ok !== false));
  ck('M02 目标写入 mvRootBackdrop=1', target.getPluginData('mvRootBackdrop') === '1');
  ck('M03 几何零变化', JSON.stringify(bb) === JSON.stringify(target.absoluteBoundingBox));
  ck('M04 非目标未误标', figma.root.children.filter(n => n !== target && n.getPluginData('mvRootBackdrop') === '1').length === 0);
  ck('M05 判据优先消费标记', /getPluginData\(ROOT_BACKDROP_KEY\) === "1"\)/.test(src));
  await figma.ui.onmessage({ type: 'mark-backdrop-manual' });
  ck('M06 幂等', target.getPluginData('mvRootBackdrop') === '1');

  const f2 = await setup();
  f2.currentPage.selection = [];
  await f2.ui.onmessage({ type: 'clear-cache' });
  await f2.ui.onmessage({ type: 'mark-backdrop-manual' });
  const r2 = f2.messages.filter(m => m && m.type === 'mark-backdrop-result').slice(-1)[0];
  ck('M07 真空选区明确失败提示', r2 && r2.ok === false && /选中/.test(r2.error || ''), r2 && r2.error);

  console.log('\n==== 手工打标 PASS=' + pass + ' FAIL=' + fail + ' ====');
  if (fail) process.exit(1);
})().catch(e => { console.error('验证异常:', (e && e.stack) || e); process.exit(2); });
