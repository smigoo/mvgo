/**
 * 生成结果验收脚本（管线修复的真机验收工具；不在 src 下、不参与构建）
 *   node scripts/verify-generation.js <taskId 或 componentDir 名>
 * 检查 09-26 那批管线修复在**真实生成**里是否生效（日志关键字 + 产物事实）。
 * 与基线 c-device-monitor-8d304bf9（修复前画像）对比。
 */
const fs = require('fs');
const path = require('path');

const BE = '/Users/smigoo/工作/mvgo/backend-node';
const WORK = path.join(BE, 'workspace/custom-components');
const TEMP = '/Users/smigoo/工作/mvgo/temp-components';
const BASELINE = 'c-device-monitor-8d304bf9';

const arg = process.argv[2] || '';
if (!arg) {
  console.log('用法: node __verify_gen.js <taskId 或 componentDir>');
  process.exit(1);
}

// 定位产物目录（支持 taskId 或目录名）
let dir = null;
if (fs.existsSync(path.join(WORK, arg))) dir = path.join(WORK, arg);
else {
  const tailMatch = /-([0-9a-f]{8})$/.exec(arg);
  if (tailMatch) {
    const hit = fs.readdirSync(WORK).find((d) => d.endsWith('-' + tailMatch[1]));
    if (hit) dir = path.join(WORK, hit);
  }
}
if (!dir) { console.log('❌ 找不到产物目录:', arg); process.exit(1); }
const compDir = path.basename(dir);
const taskId = fs.existsSync(path.join(TEMP))
  ? (fs.readdirSync(TEMP).flatMap((u) => {
      const up = path.join(TEMP, u);
      if (!fs.statSync(up).isDirectory()) return [];
      return fs.readdirSync(up).filter((t) => t.endsWith(compDir.replace(/^c-[a-z-]+-/, ''))).map((t) => ({ u, t }));
    })[0] || null)
  : null;

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const pad = (s, n) => String(s).padEnd(n);
const ok = (b) => (b ? '✅' : '❌');

console.log('══════ 产物验收: ' + compDir + (taskId ? '  (task=' + taskId.t + ')' : '') + ' ══════\n');

// ── 1. 产物事实 ──
const metaPath = path.join(dir, 'component-meta.json');
let meta = {};
try { meta = JSON.parse(read(metaPath) || '{}'); } catch { /* ignore */ }
const degraded = Array.isArray(meta.degradedFiles) ? meta.degradedFiles : [];
console.log('【卡片存活】degradedFiles = ' + degraded.length + ' ' + ok(degraded.length === 0)
  + (degraded.length ? ' → ' + degraded.join(', ') : '') + '   [基线: 1]');

const idx = read(path.join(dir, 'package/index.vue'));
const secIds = [...idx.matchAll(/data-section-id="([^"]+)"/g)].map((m) => m[1]);
console.log('【模板装配】data-section-id 数 = ' + secIds.length + ' ' + ok(secIds.length > 0)
  + (secIds.length ? ' → ' + secIds.join(' → ') : '') + '   [基线: 3]');

const compFiles = fs.existsSync(path.join(dir, 'package/components'))
  ? fs.readdirSync(path.join(dir, 'package/components')).filter((f) => f.endsWith('.vue')) : [];
const chartComps = compFiles.filter((f) => /echarts|setOption/.test(read(path.join(dir, 'package/components', f))));
console.log('【图表数量】组件文件 ' + compFiles.length + ' 个，其中**含 echarts 渲染**的 ' + chartComps.length + ' 个 → '
  + (chartComps.join(', ') || '(无)') + '   [基线 8d304bf9: 0 个（设计有图表却未落地，属待查）；env-monitor 1652d1b7 才是重复两个]');

// 样式侧：tab 选中态是否同源（R5）
const less = read(path.join(dir, 'resources/styles/common.less'));
const hasActiveNew = /\.c-[\w-]+--active\s*\{[^}]*[a-z-]+\s*:/.test(less.replace(/\/\*[\s\S]*?\*\//g, ''));
const hasActiveOld = /\.c-[\w-]+-active(?![\w-])/.test(less.replace(/\/\*[\s\S]*?\*\//g, ''));
console.log('【选中态同源 R5】--active 有非空规则: ' + ok(hasActiveNew) + ' | 旧名 -active 选择器残留: ' + ok(!hasActiveOld)
  + '   [基线: --active 是空 TODO 块 → ❌]');

// 计数文本分段着色（P-11）
const consFile = compFiles.find((f) => /cons/i.test(f));
const consSrc = consFile ? read(path.join(dir, 'package/components', consFile)) : '';
const hasPerChar = /formatDeviceCountSegments\(/.test(consSrc);
console.log('【计数文本 P-11】' + (consFile || '(无 cons 组件)') + ' 含分段渲染: ' + ok(hasPerChar)
  + '   [基线: ❌ 单一 @color-text-base]');

// ── 2. 日志事实（server.log + 今日日志）──
const logs = [path.join(BE, 'server.log'), path.join(BE, `logs/app-2026-09-27.log`)]
  .filter((p) => fs.existsSync(p)).map(read).join('\n');
// 🎯 精确时间窗：多数流水线日志行**不含 taskId**（用 componentName/语义名），
//   按行号切片会把同批次其它任务（甚至历史任务）算进来 → 必须按**时间戳**切。
const lines = logs.split('\n');
const tsOf = (l) => {
  const m = /\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\]/.exec(l);
  return m ? Date.parse(m[1]) : null;
};
let src = logs.slice(-400000);
let winInfo = '（未定位任务 → 退化为文件尾部，数字可能含其它任务）';
if (taskId) {
  const i = lines.findIndex((l) => l.includes(taskId.t));
  if (i >= 0) {
    let t0 = null;
    for (let k = i; k >= 0; k--) { const t = tsOf(lines[k]); if (t) { t0 = t; break; } }
    if (t0 != null) {
      const artMtime = fs.statSync(path.join(dir, 'package/index.vue')).mtimeMs;
      const tEnd = Math.min(t0 + 10 * 60 * 1000, artMtime + 60 * 1000); // 产物完成 + 60s，且不超 10min
      const win = lines.slice(Math.max(0, i - 5)).filter((l) => { const t = tsOf(l); return t == null || (t >= t0 && t <= tEnd); });
      src = win.join('\n');
      winInfo = '（时间窗 ' + new Date(t0).toISOString() + ' → 产物完成+60s，' + win.length + ' 行）';
    }
  }
}
const has = (re) => re.test(src);

console.log('\n── 日志关键字 ' + winInfo + ' ──');
console.log('【装配路径】确定性模板装配: ' + ok(has(/确定性模板装配/))
  + ' | rootLayoutFacts.source=deterministic-template: ' + ok(has(/"source":"deterministic-template"/)));
const layoutCount = (src.match(/LAYOUT-FACTS-INJECT/g) || []).length;
console.log('【布局事实注入】LAYOUT-FACTS-INJECT = ' + layoutCount + (layoutCount > 0 ? ' ✅' : ' ❌'));
console.log('【R5 类名对齐】' + ok(has(/类名对齐/)) + (has(/R5/) ? ' (含 R5)' : ''));

// 共享背景重复挂载检测（同 file+var 的"挂到 v-for item"次数）
const sharedHits = [...src.matchAll(/共享背景（\d+ 卡）挂到 v-for item[^\n]*?\{"file":"([^"]+)"\}/g)].map((m) => m[1]);
const dup = sharedHits.length - new Set(sharedHits).size;
console.log('【资源去重】共享背景挂载 ' + sharedHits.length + ' 次 / 去重后文件 ' + new Set(sharedHits).size
  + (sharedHits.length ? (dup === 0 ? ' ✅ 无重复' : ' ❌ 重复 ' + dup + ' 次') : '') + '   [基线: 同文件 3 次]');
if (sharedHits.length) {
  const detail = src.split('\n').filter((l) => /共享背景（/.test(l)).slice(0, 5);
  for (const l of detail) console.log('      ' + l.slice(0, 150));
  if (sharedHits.length > 5) console.log('      …（窗内可能含同批次并发任务，以上为明细，人工可判）');
}

const skipped = (src.match(/写盘门禁失败（已跳过）/g) || []).length;
const isolated = (src.match(/P1-4 坏文件隔离降级/g) || []).length;
const lessHeal = (src.match(/LESS 颜色函数 var\(\) 参数/g) || []).length;
console.log('【下策路径】写盘跳过 = ' + skipped + ' ' + ok(skipped === 0)
  + ' | 坏文件隔离 = ' + isolated + ' ' + ok(isolated === 0)
  + ' | LESS 颜色函数自愈 = ' + lessHeal + (lessHeal > 0 ? ' ✅' : ''));

console.log('\n（基线 ' + BASELINE + ' 修前画像：degradedFiles=1、两个图表组件、--active 空块、P-11 未生效、bg3 同文件挂 3 次）');
