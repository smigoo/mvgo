/**
 * 根治 A/B 回放验证（358a1476 真实产物）
 * A: normalizeVueFileFontSize —— tab 内联 @fontSize 病灶 → var() 形态；style 块维持 @fontSize
 * B: healColorSlotLiteralsInVue —— echarts JS 区 '@color-text-base' → light 槽值
 */
import { readFileSync } from 'node:fs';
import { normalizeVueFileFontSize } from './src/ai-engine/utils/font-size-normalizer.js';
import { healColorSlotLiteralsInVue } from './src/ai-engine/utils/color-slot-literal-healer.js';
import { parseThemeVarsMixins } from './src/ai-engine/utils/color-slot-mapper.js';

let pass = 0, fail = 0;
const assert = (c, label, detail = '') => {
  if (c) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
};

const COMP = '/Users/smigoo/工作/mvgo/backend-node/workspace/custom-components/c-traffic-monitor-358a1476';

// ═══ A：病灶 index.vue 回放 ═══
console.log('■ A：normalizeVueFileFontSize（tab 内联字号病灶）');
{
  // fixture = code-fix-rules.js TAB_ITEM_STYLE 守卫源头形态（14px 合法 px），非被旧管线污染后的产物
  const src = `<template><div class="mc-s4-tablist" style="display:flex;align-items:center;gap:16px;">
        <div class="mc-s4-tab mc-s4-tab--active" style="font-size:14px;line-height:1;white-space:nowrap;cursor:pointer;color:#3b82f6;font-weight:600;">江阴靖江长江隧道</div>
        <div class="mc-s4-tab" style="font-size:14px;line-height:1;white-space:nowrap;cursor:pointer;">江阴大桥</div>
  </div></template>\n<style scoped>.x { font-size: 18px; }</style>`;
  const r = normalizeVueFileFontSize(src);
  const hasBadInline = /<template[\s>][\s\S]*<\/template>/i.exec(r.text)[0].includes('font-size: @fontSize');
  assert(!hasBadInline, 'template 区不再产生 font-size: @fontSize（病灶消除）');
  assert(r.text.includes('font-size: var(--fontSize, 14px)'), 'tab 14px → var(--fontSize, 14px)', r.changes.slice(0,2).map(c=>c.to).join(' | '));
  const inlineChanges = r.changes.filter(c => c.scope === 'inline-style');
  assert(inlineChanges.length === 2, `内联归一 ${inlineChanges.length} 处（tab 两个）`);
  // 真实病灶产物（已被旧管线污染成 @fontSize）确认不再二次破坏
  // 🔁 2026-11-13 二态升级：污染残留（内联 @fontSize）现在应被治愈为 var() 形态（6002417a 实锤）
  const polluted = readFileSync(`${COMP}/package/index.vue`, 'utf-8');
  const rp = normalizeVueFileFontSize(polluted);
  const hadDisease = polluted.includes('font-size: @fontSize');
  assert(!hadDisease || rp.text.includes('font-size: var(--fontSize, 14px)'), '已污染 @FontSize 内联残留被二态治愈为 var() 形态');
  // 幂等：治愈后再跑一遍不再变化
  const rp2 = normalizeVueFileFontSize(rp.text);
  assert(rp2.text === rp.text, '治愈后幂等（二次归一零改动）');
  // :style 绑定与 fg- 不碰
  const src2 = `<template><div :style="{ fontSize: '16px' }"><span class="x-fg-grid-126338-card" style="font-size:24px">真值</span></div></template>`;
  const r2 = normalizeVueFileFontSize(src2);
  assert(r2.text.includes(":style=\"{ fontSize: '16px' }\""), ':style 绑定表达式不碰');
  assert(r2.text.includes('class="x-fg-grid-126338-card" style="font-size:24px"'), 'fg- 接管标签内联不碰');
  // style 块维持 @fontSize
  const src3 = `<template><div style="font-size:14px">a</div></template>\n<style scoped>.a { font-size: 18px; }</style>`;
  const r3 = normalizeVueFileFontSize(src3);
  assert(r3.text.includes('calc(@fontSize * 1.2857)'), 'style 块 18px → calc(@fontSize * 1.2857)（@ 形态保留）');
  // M5-7 门禁视角：产物无裸 font-size:Npx（除 ≤5px）
  const bare = [...r.text.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].filter(m => parseFloat(m[1]) > 5);
  assert(bare.length === 0, `M5-7 视角无裸 px 残留（${bare.length}）`);
}

// ═══ B：echarts JS 槽位残留回放 ═══
console.log('■ B：healColorSlotLiteralsInVue（echarts JS 槽位残留）');
{
  const tv = readFileSync(`${COMP}/resources/styles/themes/theme-vars.less`, 'utf-8');
  const light = parseThemeVarsMixins(tv).light;
  assert(light && light['color-text-base'] === '#333333', `theme-light 槽值解析 OK（color-text-base=${light?.['color-text-base']}）`);
  const src = readFileSync(`${COMP}/package/components/TunnelChart.vue`, 'utf-8');
  const r = healColorSlotLiteralsInVue(src, light);
  assert(r.text.includes("color: '#333333'"), `echarts color 槽位 → light 真值（${r.changes.length} 处）`);
  assert(!r.text.includes("'@color-text-base'"), "不再有 '@color-text-base' 字面量");
  // style 块内 @color 不被误伤
  const src2 = `<script>const c = '@color-primary'</script>\n<style>.a { color: @color-primary; }</style>`;
  const r2 = healColorSlotLiteralsInVue(src2, light);
  assert(r2.text.includes("const c = '#1990ff'"), 'script 区槽位 → 槽值');
  assert(r2.text.includes('color: @color-primary;'), 'style 块内 @color 引用保留（合法 less）');
  // 未知槽位不动
  const r3 = healColorSlotLiteralsInVue("const x = '@color-not-exist'", light);
  assert(r3.text.includes("'@color-not-exist'"), '未知槽位不臆造、原样保留');
}

console.log(`\n═══ 结果：${pass} pass / ${fail} fail ═══`);
process.exit(fail > 0 ? 1 : 0);
