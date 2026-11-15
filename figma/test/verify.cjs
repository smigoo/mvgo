// 统一验证入口：一条命令跑完阶段 1 的所有自检
//   node verify.cjs
// 覆盖：① 产品代码语法 ② shim 几何精确还原 ③ reparent 语义
//       ④ corpus diff（29 真树 vs 基线）⑤ 阴阳对照（注入篡改必须被抓）
// 退出码 0=全绿 1=FAIL。只读，不写产品文件、不部署。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const shim = require('./figma-node-shim.cjs');

const HERE = __dirname;
const REPO = path.resolve(HERE, '../..');
const CODE = path.resolve(REPO, 'figma/src/cursor_mcp_plugin/code.js');
const CACHE = path.resolve(REPO, 'backend-node/data/figma-node-cache');
const BASE = path.join(HERE, 'corpus-snapshots/baseline.json');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS', name, detail || ''); }
  else { fail++; console.log('FAIL', name, detail || ''); }
}
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12); }

function loadCorpus(file) {
  return JSON.parse(fs.readFileSync(path.join(CACHE, file), 'utf8'));
}
function runTree(raw, codeSrc) {
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
  vm.runInContext(codeSrc, sb, { filename: 'code.js', timeout: 5000 });
  return (async () => {
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    await figma.ui.onmessage({ type: 'structure-only', setExport: false, groupModules: false });
    return figma;
  })();
}

async function main() {
  const src = fs.readFileSync(CODE, 'utf8');

  // ① 语法
  try { new vm.Script(src, { filename: 'code.js' }); check('S01 code.js 语法', true); }
  catch (e) { check('S01 code.js 语法', false, e.message); }

  // ② 几何精确还原（对 29 样本逐个比对 abs bbox）
  const files = fs.readdirSync(CACHE).filter(f => f.endsWith('.json')).sort();
  let geoNodes = 0, geoDiff = 0;
  for (const f of files) {
    const raw = loadCorpus(f);
    const figma = shim.buildFigmaMock(raw);
    (function cmp(a, b) {
      geoNodes++;
      const x = a.absoluteBoundingBox, y = b.absoluteBoundingBox || {};
      if (Math.abs(x.x - (y.x || 0)) > 0.01 || Math.abs(x.y - (y.y || 0)) > 0.01) geoDiff++;
      for (let i = 0; i < (a.children || []).length; i++) cmp(a.children[i], (b.children || [])[i] || {});
    })(figma.root, raw.document);
  }
  check('G01 29 样本几何精确还原', geoDiff === 0, '节点 ' + geoNodes + ' 偏差 ' + geoDiff);

  // ③ reparent 语义
  const one = shim.buildFigmaMock(loadCorpus(files[0]));
  function walk(n, o = []) { o.push(n); for (const c of n.children) walk(c, o); return o; }
  const leaf = walk(one.root).find(n => n !== one.root && n.parent && n.parent !== one.root && n.children.length === 0);
  const b0 = { ...leaf.absoluteBoundingBox };
  one.root.appendChild(leaf);
  const b1 = { ...leaf.absoluteBoundingBox };
  check('R01 reparent 保持绝对位置', b0.x === b1.x && b0.y === b1.y, b0.x + ',' + b0.y + ' -> ' + b1.x + ',' + b1.y);
  check('R02 reparent 自动重算相对坐标', Number.isFinite(leaf.x) && Number.isFinite(leaf.y), 'rel=' + leaf.x + ',' + leaf.y);

  // ④ corpus diff
  if (!fs.existsSync(BASE)) { check('C00 基线存在', false, '请先跑 corpus-harness.cjs --baseline'); }
  else {
    const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
    let cDiff = 0, cFail = 0;
    for (const f of Object.keys(base)) {
      try {
        const figma = await runTree(loadCorpus(f), src);
        const h = sha(shim.snapshot(figma));
        if (h !== base[f].hash) cDiff++;
      } catch (e) { cFail++; }
    }
    check('C01 29 样本快照零差异', cDiff === 0 && cFail === 0, '变化 ' + cDiff + ' 报错 ' + cFail);
  }

  // ⑤ 阴阳对照：注入判据篡改必须被抓
  const probe = 'function isBgLike(n) {';
  const idx = src.indexOf(probe);
  if (idx < 0) check('Y00 探针函数存在', false, 'isBgLike 未找到，阴阳对照跳过');
  else {
    const nextFn = src.indexOf('\nfunction ', idx + 10);
    const badSrc = src.slice(0, idx) + 'function isBgLike(n) { return true; /*INJECT*/ '
      + src.slice(src.indexOf('{', idx) + 1, nextFn) + src.slice(nextFn);
    const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
    let caught = 0, n = 0;
    for (const f of Object.keys(base).slice(0, 5)) { // 5 样本足够证明
      n++;
      try {
        const figma = await runTree(loadCorpus(f), badSrc);
        if (sha(shim.snapshot(figma)) !== base[f].hash) caught++;
      } catch (e) { caught++; }
    }
    check('Y01 判据篡改被抓（非假绿）', caught === n, '抓到 ' + caught + '/' + n);
  }

  console.log('\n==== 统一验证：PASS=' + pass + ' FAIL=' + fail + ' ====');
  if (fail) process.exit(1);
}

main().catch(e => { console.error('verify 异常:', (e && e.stack) || e); process.exit(2); });
