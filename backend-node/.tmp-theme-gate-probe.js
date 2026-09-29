/**
 * 用 dist 里**真实的门禁函数**跑两个产物，看 THEME 系列到底报了什么、严重级别是什么。
 * 只读，不改任何文件。
 *
 * 用法：env -i PATH=... HOME=... node .tmp-theme-gate-probe.js
 */
const fs = require('fs');
const path = require('path');

const { detectThemeColorViolations } = require('./dist/ai-engine/utils/theme-color-guard.js');

const ROOT = path.resolve(__dirname, 'workspace/custom-components');
const TARGETS = ['c-device-monitor-2469e3a0', 'c-traffic-monitor-447d01cc'];

/** 收集组件目录下会被门禁扫描的文件（.less / .vue），path 用组件内相对路径 */
function collect(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === 'images' || e.name === 'node_modules') continue;
        walk(full, r);
      } else if (/\.(less|vue)$/.test(e.name)) {
        out.push({ path: r, content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(dir, '');
  return out;
}

for (const t of TARGETS) {
  const dir = path.join(ROOT, t);
  if (!fs.existsSync(dir)) {
    console.log(`\n### ${t} 不存在，跳过`);
    continue;
  }
  const files = collect(dir);
  const issues = detectThemeColorViolations(files);
  console.log(`\n### ${t}  (${files.length} 个 .less/.vue 文件)`);
  if (issues.length === 0) {
    console.log('  ✅ 无 THEME 类 issue');
  }
  for (const i of issues) {
    console.log(`  [${i.severity}] ${i.id}  @ ${i.file}`);
    console.log(`      ${String(i.message).replace(/\s+/g, ' ').slice(0, 420)}`);
  }
  // 自愈器能删掉几条？
  const { healFileLevelSlotOverrides, collectFileLevelSlotOverrides } = require('./dist/ai-engine/utils/theme-color-guard.js');
  const before = collectFileLevelSlotOverrides(files).length;
  const r = healFileLevelSlotOverrides(files);
  const after = collectFileLevelSlotOverrides(files).length;
  console.log(`  ↳ 文件级槽位字面量：自愈前 ${before} → 自愈后 ${after}（healResult=${JSON.stringify(r)}）`);
}
