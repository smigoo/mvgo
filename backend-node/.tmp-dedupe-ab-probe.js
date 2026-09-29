/**
 * 定向重放探针：复现 b07a2ee4「12 卡共享背景 bg3 被去重器拆台」场景，A/B 新旧实现。
 *   OLD = dist（改前最后一次 build，仍含逐条循环）
 *   NEW = src （刚改：varName 分组 + sharedCount 组内最大 + 确定性锚优先）
 */
const OLD = require('./dist/ai-engine/roles/microcode/resource-mounter.js');
const NEW = require('./src/ai-engine/roles/microcode/resource-mounter.js');

// ── fixture：完全按 b07a2ee4 的真实形态构造 ──
// mapping：第 1 条 sharedBy=12，另有 11 条同 varName（sharedBy=[]，各自 owner）
const mkMapping = () => {
  const arr = [
    {
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg3',
      resourceFile: 'bg3.png',
      bgRole: 'container',
      mountTarget: 'cons',
      ownerSectionId: '2:8438',
      figmaNodeId: '2:8439',
      sharedBy: Array.from({ length: 12 }, (_, i) => `card${i + 1}`),
    },
  ];
  for (let i = 0; i < 11; i++) {
    arr.push({
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg3',
      resourceFile: 'bg3.png',
      bgRole: 'container',
      mountTarget: 'cons',
      ownerSectionId: `2:846${i}`,
      figmaNodeId: `2:846${i}`,
      sharedBy: [],
    });
  }
  return arr;
};

// 产物：容器根 / v-for item / 内层 label 三处都引用了 bg3（LLM 误挂 + 事实链正确挂并存）
const mkFiles = () => ({
  'package/components/ContentCons.vue': `<template>
  <div data-section-id="2:8437" class="c-device-monitor-cons" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%' }">
    <div v-for="(item, index) in deviceList" :key="index" class="c-device-monitor-group-2136637321" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '117px 64px' }">
      <span class="c-device-monitor-cons-label" :style="{ backgroundImage: 'url(' + bg3 + ')' }">{{ item.label }}</span>
    </div>
  </div>
</template>`,
});

const run = (mod, label) => {
  const out = mod.dedupeBgMultiRefs(mkFiles(), mkMapping());
  const src = out['package/components/ContentCons.vue'];
  const hasVFor = /group-2136637321[^>]*:style/.test(src);
  const hasCons = /c-device-monitor-cons"[^>]*:style/.test(src);
  const hasLabel = /cons-label[^>]*:style/.test(src);
  console.log(`[${label}] v-for item 保留 bg3: ${hasVFor} | 容器根 bg3: ${hasCons} | label bg3: ${hasLabel}`);
  return { hasVFor, hasCons, hasLabel };
};

console.log('=== A/B：同一输入，新旧 dedupeBgMultiRefs ===');
const o = run(OLD, 'OLD dist（逐条循环）');
const n = run(NEW, 'NEW src （varName 分组）');

console.log('');
if (!o.hasVFor && n.hasVFor) {
  console.log('✅ 复现并修复：OLD 把 v-for item 拆台删掉（12 卡背景全丢），NEW 保留 v-for item 且清掉错误引用');
} else if (o.hasVFor && n.hasVFor) {
  console.log('⚠️ fixture 未复现拆台（OLD 也保留了）—— 需核对 fixture 与真实场景差异');
} else if (!n.hasVFor) {
  console.log('❌ NEW 仍丢 —— 修复无效，需回查');
}
if (o.hasCons || o.hasLabel) console.log('  （OLD 残留错误引用：容器/label）');
if (n.hasCons || n.hasLabel) console.log('  ⚠️ NEW 残留错误引用：容器/label —— 应被清掉');
