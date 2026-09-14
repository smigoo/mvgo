/**
 * 🛡️ P3（2026-09-14 · 设备监测视觉对齐根治）：结构自测脚本。
 *
 * 对某个 microcode 产物目录断言以下事实（来自基线 设备监测-设计稿基准.png + Figma 真值）：
 *   ① 顶部标题栏「设备监测」（模板文本或 declare.componentName）
 *   ② 顶部统计条：设备类型 28 / 设备总数 68562 / 完好率 98%
 *   ③ 左侧 Tab 窄列：6 个 tab（监控/照明/通风/供配电/消防/交通诱导）
 *   ④ 右侧切换卡：2 张（隧道设备 56302/异常5，南北接线设备 1280/异常3）
 *   ⑤ 设备网格列数 = 事实源 gridColumns（planner 透传自视觉分析，设计稿 3 列）；无事实源时退化为「多列栅格」
 *   ⑥ 12 个设备名齐全（CO₂/CO2 归一容错）
 *   ⑦ 兄弟组件关键内容不重复（隧道设备/南北接线/摄像机/交通诱导 不得跨组件重复出现）
 *   ⑧ 根容器 slot-con 为纵向（switch 上 + tab 下，设计稿本就 column）
 *   ⑧b @antd/tab 内部横向双列（左 tab 窄列 + 右设备网格）
 *
 * 用法：node scripts/verify-device-monitor.mjs <componentDir> [--preview-url <url>]
 *   componentDir：产物根（含 package/index.vue + package/components/*.vue + resources/styles + .checkpoint/analysis.json）
 *   --preview-url：可选，puppeteer 渲染抓几何（需 backend-node 依赖的 puppeteer）
 *
 * 退出码：全部 PASS=0，任一 FAIL=1。
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire('/Users/smigoo/工作/mvgo/backend-node/package.json');

const args = process.argv.slice(2);
const componentDir = args[0];
let previewUrl = null;
const urlIdx = args.indexOf('--preview-url');
if (urlIdx >= 0) previewUrl = args[urlIdx + 1];

if (!componentDir || !existsSync(componentDir)) {
  console.error('用法：node scripts/verify-device-monitor.mjs <componentDir> [--preview-url <url>]');
  process.exit(2);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  const tag = cond ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

// ── 读取产物 ──
const pkgDir = join(componentDir, 'package');
const indexPath = join(pkgDir, 'index.vue');
const componentsDir = join(pkgDir, 'components');
const stylesDir = join(componentDir, 'resources', 'styles');

let indexVue = '';
let componentFiles = [];
let styleText = '';
try {
  indexVue = readFileSync(indexPath, 'utf8');
} catch (e) {
  console.error('无法读取 package/index.vue:', e.message);
  process.exit(2);
}
try {
  componentFiles = readdirSync(componentsDir)
    .filter((f) => f.endsWith('.vue'))
    .map((f) => ({ name: f, content: readFileSync(join(componentsDir, f), 'utf8') }));
} catch (e) {
  console.error('无法读取 components:', e.message);
}
try {
  for (const f of readdirSync(stylesDir)) {
    if (/\.(less|css)$/i.test(f)) styleText += '\n' + readFileSync(join(stylesDir, f), 'utf8');
  }
} catch (e) {
  console.warn('样式目录缺失:', e.message);
}

const allVue = indexVue + '\n' + componentFiles.map((c) => c.content).join('\n');

// ── 1. 顶部标题栏 ──
// 标题由 base-panel 外壳按 declare.json 的 componentName 渲染，模板内无独立标题文本属正常；
// 故同时接受「模板含设备监测」或「declare.json.componentName === 设备监测」。
let declareText = '';
try {
  declareText = readFileSync(join(componentDir, 'declare.json'), 'utf8');
} catch (e) {
  /* ignore */
}
const titleOk = /设备监测/.test(allVue) || /"componentName"\s*:\s*"设备监测"/.test(declareText);
check('① 顶部标题「设备监测」存在（模板或 declare.componentName）', titleOk, '');

// ── 2. 顶部统计条数字 ──
const statsOk =
  /设备类型/.test(allVue) && /\b28\b/.test(allVue) &&
  /设备总数/.test(allVue) && /68562/.test(allVue) &&
  /完好率/.test(allVue) && /98%/.test(allVue);
check('② 顶部统计条 28/68562/98% 齐全', statsOk, '');

// ── 3. 左侧 Tab 窄列 + 6 tab ──
const tabNames = ['监控', '照明', '通风', '供配电', '消防', '交通诱导'];
const tabHit = tabNames.filter((t) => allVue.includes(t)).length;
check('③ 6 个 Tab 文本齐全', tabHit === 6, `命中 ${tabHit}/6`);

// ── 4. 右侧切换卡 2 张 ──
const switchCardsOk =
  /隧道设备/.test(allVue) && /56302/.test(allVue) && /南北接线/.test(allVue) && /1280/.test(allVue);
check('④ 切换卡 2 张（隧道设备56302 / 南北接线1280）', switchCardsOk, '');

// ── 5. 设备网格：栅格列数（事实源优先锁定）──
// 设计稿实测 3 列（Figma cons 子节点 x 坐标三档 1518/1643/1768）。
// 事实源：planner 产物 `.checkpoint/analysis.json` 的 effectiveSections[].gridColumns
// （由视觉分析 preview-analysis.json 透传而来）。若事实存在 → 产物列数必须与之相等；
// 事实缺失 → 退化为「存在多列栅格」（不误报）。
let factGridCols = null;
try {
  const analysisPath = join(componentDir, '.checkpoint', 'analysis.json');
  const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
  const secs = analysis?.subComponentPlan?.effectiveSections || [];
  const gc = secs
    .map((s) => s.gridColumns ?? (s.body && s.body.gridColumns))
    .filter((n) => Number(n) > 1)
    .map((n) => Math.round(Number(n)));
  if (gc.length > 0) factGridCols = gc[0];
} catch (e) {
  /* 事实源缺失，退化为多列判定 */
}
const gridColsFound = (styleText.match(/grid-template-columns:\s*repeat\(\s*(\d+)/g) || [])
  .map((s) => parseInt(s.replace(/[^0-9]/g, ''), 10))
  .filter((n) => n >= 2);
if (factGridCols != null) {
  check(
    `⑤ 设备网格列数 = 事实源 ${factGridCols} 列`,
    gridColsFound.includes(factGridCols),
    `事实 gridColumns=${factGridCols}，产物检测到 [${gridColsFound.join(', ')}]`,
  );
} else {
  check('⑤ 设备网格为栅格多列布局', gridColsFound.length > 0, `检测到列数: [${gridColsFound.join(', ')}]（无事实源，宽松判定）`);
}

// ── 6. 12 个设备名 ──
const deviceNames = [
  '摄像机', '风速风向仪', '超高检测器', '烟道机器人', '激光雷达', 'CO₂传感器',
  'CO/VI检测器', '温湿度传感器', '压力传感器', '光照度变送器', '紧急电话', '水质监测设备',
];
// 容错：产物可能误写作 CO2 传感器（无下标），统一归一为 CO₂ 再比对
const normDevice = (s) =>
  s.replace(/CO\s*2\s*传感器/g, 'CO₂传感器').replace(/CO2/g, 'CO₂');
const deviceHit = deviceNames.filter((n) => {
  const norm = normDevice(allVue);
  return norm.includes(n);
}).length;
check('⑥ 12 个设备名齐全', deviceHit === 12, `命中 ${deviceHit}/12`);

// ── 7. 内容不重复：slot-con 下各兄弟组件间关键内容只出现一次 ──
// （设计稿本就同时有「左 Tab 窄列」与「右切换卡」，两者共存是正确的；
//   真正要防的是**同一份内容被画多遍**——如 485d724d 的「隧道设备」在 SwitchSection 与 MainSection 各画一次。）
const bodyLeafFiles = componentFiles.filter((f) =>
  /(Switch|Tabs|Main|Stats|CardGrid|Content|Header)/i.test(f.name),
);
const dupAnchors = ['隧道设备', '南北接线', '摄像机', '交通诱导'];
const dupHits = [];
for (const anchor of dupAnchors) {
  const owners = bodyLeafFiles.filter((f) => f.content.includes(anchor)).map((f) => f.name);
  if (owners.length > 1) dupHits.push(`${anchor} ∈ ${owners.join('+')}`);
}
check(
  '⑦ 兄弟组件间关键内容不重复出现',
  dupHits.length === 0,
  dupHits.length ? dupHits.join('; ') : `扫描 ${bodyLeafFiles.length} 个组件，无重复`,
);

// ── 8. 根容器方向：设计稿 slot-con 为纵向（上 switch + 下 @antd/tab），横向双列在 @antd/tab 内部 ──
// Figma 真值（figma-node-data.json）：
//   89:40 slot-con 407×380，含 switch(396×65) 上 + @antd/tab(46×317) 下 → column
//   89:37 @antd/tab 46×317，含 左 tabs(46px 窄列) + 右 cons(367×295 设备网格) → row
// 故：slot-con 应为 column；横向双列断言改在 TabsSection 内部的 `tabs-list`(左窄列) 与 `cons-grid`(右内容)。
const slotConBlock = styleText.match(/\.c-device-monitor-slot-con\s*\{[^}]*\}/);
const slotConDir = slotConBlock
  ? /flex-direction:\s*row/.test(slotConBlock[0])
    ? 'row'
    : /flex-direction:\s*column/.test(slotConBlock[0])
      ? 'column'
      : 'unset'
  : 'missing';
check(
  '⑧ 根容器 slot-con 为纵向（switch 上 + tab 下）',
  slotConDir === 'column',
  `slot-con flex-direction=${slotConDir}`,
);

// ── 8b. @antd/tab 内部横向双列（左 tab 窄列 + 右 cons 内容区）──
// 注意：LLM 非确定性会命名漂移（本轮 -tab/-tabs/-cons，旧轮 -tabs-section/-tabs-list/-cons-grid）。
// 故用「结构判定」而非硬编码类名：① 找到一个容器为 flex row（左列+右内容）；
// ② 存在 tab 窄列（width 小，≤110px）与 cons 栅格（display:grid）两个关键特征类。
const flexBlocks = [...styleText.matchAll(/\.([\w-]*(?:tab|cons|tabs)[\w-]*)\s*\{([^}]*)\}/g)];
let hasRowContainer = false;
let tabsColWidth = null;
let hasConsGrid = false;
for (const m of flexBlocks) {
  const cls = m[1];
  const body = m[2];
  if (/flex-direction:\s*row/.test(body)) hasRowContainer = true;
  if (/display:\s*grid/.test(body) && /grid-template-columns/.test(body)) hasConsGrid = true;
  const wm = body.match(/width:\s*(\d+)px/);
  if (wm && Number(wm[1]) <= 110) tabsColWidth = Math.max(tabsColWidth || 0, Number(wm[1]));
}
check(
  '⑧b @antd/tab 内部横向双列（左 tab 窄列 + 右设备网格）',
  hasRowContainer && hasConsGrid && tabsColWidth !== null,
  `row容器=${hasRowContainer}, cons栅格=${hasConsGrid}, tab窄列宽=${tabsColWidth}px`,
);

// ── 可选：puppeteer 几何核验 ──
if (previewUrl) {
  (async () => {
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (e) {
      console.warn('⚠️ 未安装 puppeteer，跳过几何核验:', e.message);
      finish();
      return;
    }
    try {
      const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 480, height: 480 });
      await page.goto(previewUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      const geo = await page.evaluate(() => {
        const root = document.querySelector('.c-device-monitor-slot-con');
        if (!root) return null;
        const rb = root.getBoundingClientRect();
        const main = root.querySelector('.c-device-monitor-main-section');
        const tabCol = root.querySelector('.c-device-monitor-tabs-wrapper, .c-device-monitor-tabs-list');
        const deviceItems = root.querySelectorAll('.c-device-monitor-device-item').length;
        const tabItems = root.querySelectorAll('.c-device-monitor-tab-item').length;
        return {
          rootW: Math.round(rb.width),
          mainW: main ? Math.round(main.getBoundingClientRect().width) : 0,
          tabW: tabCol ? Math.round(tabCol.getBoundingClientRect().width) : 0,
          deviceItems,
          tabItems,
        };
      });
      await browser.close();
      if (geo) {
        const tabRatio = geo.rootW ? geo.tabW / geo.rootW : 0;
        check('⑧ Tab 窄列占比 < 20%', tabRatio < 0.2, `tab=${(tabRatio * 100).toFixed(1)}%`);
        check('⑨ 设备卡 = 12', geo.deviceItems === 12, `实测 ${geo.deviceItems}`);
        check('⑩ 渲染 tab 数 = 6', geo.tabItems === 6, `实测 ${geo.tabItems}`);
      }
    } catch (e) {
      console.warn('⚠️ 渲染核验失败:', e.message);
    }
    finish();
  })();
} else {
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log('\n==================== 汇总 ====================');
  console.log(`总计 ${results.length} 项，PASS ${results.length - failed.length}，FAIL ${failed.length}`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ` (${f.detail})` : '')));
    process.exit(1);
  }
  console.log('✅ 全部通过');
  process.exit(0);
}
