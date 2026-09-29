/**
 * 🛡️ 存量清洗（2026-09-29）：对全语料组件重跑「图表豁免版」consolidator，
 * 清除 common.less 中图表类被误置的真值像素（52px 家族），并同步重编 index.css。
 * 幂等：与生成期管线同一实现（dist 导出函数），重复跑无变化即跳过。
 *
 * 用法：
 *   node .tmp-consolidate-sweep.js --dry   # 只统计不写盘
 *   node .tmp-consolidate-sweep.js --apply # 写盘（common.less + index.css）
 */
const fs = require('fs');
const path = require('path');
const { consolidateSubComponentClasses } = require('./dist/ai-engine/utils/style-class-consolidator.js');
const less = require('less');

const APPLY = process.argv.includes('--apply');
const ROOTS = [
  '/Users/smigoo/工作/mvgo/backend-node/workspace/custom-components',
  '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
];
const SKIP = new Set(['.mc-gen', '.snapshots', '.checkpoint', 'node_modules', '.git']);

async function main() {
  let comps = 0, clChanged = 0, cssRebuilt = 0, cssFail = 0;
  const changedList = [];
  for (const ROOT of ROOTS) {
    for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!d.isDirectory() || SKIP.has(d.name)) continue;
      const compDir = path.join(ROOT, d.name);
      const clPath = path.join(compDir, 'resources/styles/common.less');
      const entryPath = path.join(compDir, 'resources/styles/index.less');
      if (!fs.existsSync(clPath) || !fs.existsSync(entryPath)) continue;
      comps++;

      const files = {};
      const pkg = path.join(compDir, 'package');
      let hasVue = false;
      // 递归收集（与审计脚本同口径，防漏嵌套子目录的图表 .vue）
      const collectVue = (dir, relBase) => {
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          if (SKIP.has(e.name)) continue;
          const p = path.join(dir, e.name);
          const rel = relBase ? relBase + '/' + e.name : e.name;
          if (e.isDirectory()) collectVue(p, rel);
          else if (e.name.endsWith('.vue')) { try { files['package/' + rel] = fs.readFileSync(p, 'utf-8'); hasVue = true; } catch {} }
        }
      };
      if (fs.existsSync(pkg)) collectVue(pkg, '');
      if (!hasVue) continue;
      // 容错：个别组件目录缺 index.vue（quality-staging 残留等）
      if (!fs.existsSync(path.join(pkg, 'index.vue'))) continue;

      const before = fs.readFileSync(clPath, 'utf-8');

      // 🛡️ 冲突预筛（2026-09-29）：consolidator 重跑伴随全文件重排（dry-run 446/990 会变），
      //   大面积扰动不可接受。只处理「布局承载类」冲突：common.less 中 chartRef 元素类
      //   （echarts 挂载点）或其父类（图表根类）含写死 px，且 .vue 同类是百分比
      //   ⇒ 豁免才会改变结果。图例/图标等非布局类的像素可能是合理真值，不碰。
      const clText = before;
      let isConflict = false;
      const pxRe = /\.([a-zA-Z][\w-]*)\s*\{([^{}]*)\}/g;
      let mm;
      const pxClasses = new Set();
      while ((mm = pxRe.exec(clText)) !== null) {
        if (/\b(width|height)\s*:\s*\d+px/i.test(mm[2])) pxClasses.add(mm[1]);
      }
      if (pxClasses.size) {
        for (const rel of Object.keys(files)) {
          if (!rel.endsWith('.vue')) continue;
          const vue = files[rel];
          if (!vue.includes('echarts')) continue;
          // 布局承载类 = chartRef 所在元素 class + 其父元素 class（模板根 div）
          const layoutClasses = new Set();
          const refM = vue.match(/ref="chartRef"[^>]*class="([^"]+)"/) || vue.match(/class="([^"]+)"[^>]*ref="chartRef"/);
          if (refM) for (const c of refM[1].split(/\s+/)) layoutClasses.add(c);
          const tplM = vue.match(/<template>\s*<([a-z]+)[^>]*class="([^"]+)"/i);
          if (tplM) for (const c of tplM[2].split(/\s+/)) layoutClasses.add(c);
          for (const cls of layoutClasses) {
            if (!pxClasses.has(cls)) continue;
            const r = new RegExp('\\.' + cls + '\\s*\\{[^}]*\\b(width|height)\\s*:\\s*\\d+%', 'i');
            if (r.test(vue)) { isConflict = true; break; }
          }
          if (isConflict) break;
        }
      }
      if (!isConflict) continue;

      files['resources/styles/common.less'] = before;
      let after = before;
      try {
        const out = consolidateSubComponentClasses({ ...files }, { logger: { warn() {}, info() {} } });
        after = out['resources/styles/common.less'];
      } catch (e) {
        console.log('CONSOLIDATE-FAIL', d.name, e.message.slice(0, 80));
        continue;
      }
      if (after === before) continue;
      clChanged++;
      changedList.push(path.basename(ROOT) + '/' + d.name);

      if (!APPLY) continue;
      fs.writeFileSync(clPath, after, 'utf-8');

      // 重编 index.css（复刻 phase2.service.ts 编译口径）
      try {
        const lessSource = fs.readFileSync(entryPath, 'utf-8');
        const result = await less.render(lessSource, { filename: entryPath, paths: [path.dirname(entryPath)] });
        const ruleCount = (result.css.match(/\{/g) || []).length;
        if (ruleCount === 0) throw new Error('empty output');
        fs.writeFileSync(path.join(compDir, 'resources/styles/index.css'), result.css, 'utf-8');
        cssRebuilt++;
      } catch (e) {
        cssFail++;
        console.log('LESS-FAIL', d.name, e.message.slice(0, 100));
      }
    }
  }
  console.log(`=== 存量清洗（${APPLY ? 'APPLY' : 'DRY-RUN'}） ===`);
  console.log(`组件总数          : ${comps}`);
  console.log(`common.less 变化  : ${clChanged}`);
  if (APPLY) {
    console.log(`index.css 重编    : ${cssRebuilt}（失败 ${cssFail}）`);
  }
  console.log('--- 变化样本（前 20） ---');
  for (const s of changedList.slice(0, 20)) console.log(' ', s);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
