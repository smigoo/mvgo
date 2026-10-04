import { runPreWriteSelfHealing } from './pre-write-self-healing.js';
import { injectResourceImports } from './resource-import-guard.js';

/**
 * 🛡️ 方案 E（2026-09-16）：双链路共用落盘前自愈链单测。
 * 覆盖：.value 自愈 / 运行库兜底 / CODE-022 删未挂载 / 幂等性。
 */
describe('runPreWriteSelfHealing（双链路共用落盘前自愈链）', () => {
  const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

  it('.value 误用自愈：import 图片变量写 bg1.value → 去掉 .value', () => {
    const files = {
      'package/index.vue': `<template><div :style="\`url(\${bg1.value})\`"></div></template>
<script setup>
import bg1 from '../resources/images/bg-8788.png'
const stats = [{ bgImage: bg1.value }]
</script>`,
    };
    const { files: out, summary } = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(summary.valueFixed).toBe(1);
    expect(out['package/index.vue']).not.toContain('bg1.value');
    expect(out['package/index.vue']).toContain('url(${bg1})');
    expect(out['package/index.vue']).toContain('bgImage: bg1');
  });

  it('运行库兜底：echarts.init 但缺 import → 补 import * as echarts', () => {
    const files = {
      'package/index.vue': `<template><div ref="chartRef"></div></template>
<script setup>
import { ref, onMounted } from 'vue'
const chartRef = ref(null)
onMounted(() => { echarts.init(chartRef.value) })
</script>`,
    };
    const { files: out, summary } = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(summary.runtimeImport).toBe(1);
    expect(out['package/index.vue']).toContain("import * as echarts from 'echarts'");
  });

  it('CODE-022 删未挂载：import bg2 后 0 引用 → 删除该 import', () => {
    const mapping = [
      { assignedVarName: 'bg1', resourceFile: 'resources/images/bg-8788.png', downloadStatus: 'success', previewAnalysisRole: 'bg' },
      { assignedVarName: 'bg2', resourceFile: 'resources/images/bg-8807.png', downloadStatus: 'success', previewAnalysisRole: 'bg' },
    ];
    const files = {
      'package/index.vue': `<template><div :style="\`url(\${bg1})\`"></div></template>
<script setup>
import bg1 from '../resources/images/bg-8788.png'
import bg2 from '../resources/images/bg-8807.png'
</script>`,
    };
    const { files: out, summary } = runPreWriteSelfHealing(
      files,
      { resourceDomMapping: mapping, injectFn: injectResourceImports },
      { logger: noopLogger },
    );
    expect(summary.pruned).toBeGreaterThanOrEqual(1);
    expect(out['package/index.vue']).not.toContain('bg2 from');
    expect(out['package/index.vue']).toContain('bg1 from');
  });

  it('幂等：连续跑两次，第二次无变化（summary 全 0）', () => {
    const files = {
      'package/index.vue': `<template><div :style="\`url(\${bg1.value})\`"></div></template>
<script setup>
import bg1 from '../resources/images/bg-8788.png'
const s = { bgImage: bg1.value }
</script>`,
    };
    const first = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    const second = runPreWriteSelfHealing(first.files, {}, { logger: noopLogger });
    expect(second.files['package/index.vue']).toBe(first.files['package/index.vue']);
    expect(second.summary.valueFixed).toBe(0);
    expect(second.summary.runtimeImport).toBe(0);
  });

  it('无资源映射 / 无 injectFn 时，资源注入步骤安全跳过（不报错）', () => {
    const files = { 'package/index.vue': '<template><div>x</div></template>' };
    const { files: out } = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(out['package/index.vue']).toBe('<template><div>x</div></template>');
  });

  it('S6：backgroundImage 缺 size/repeat/position → 补全默认值', () => {
    const files = {
      'package/index.vue': '<template><div :style="activeTab === 1 ? { backgroundImage: `url(${bg2})` } : {}">x</div></template>',
    };
    const { files: out, summary } = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(summary.bgStyleComplete).toBe(1);
    expect(out['package/index.vue']).toContain("backgroundSize: '100% 100%'");
    expect(out['package/index.vue']).toContain("backgroundRepeat: 'no-repeat'");
    expect(out['package/index.vue']).toContain("backgroundPosition: '0px 0px'");
  });

  it('S6：已完整的 backgroundImage（含 size/repeat/position）→ 不补', () => {
    const files = {
      'package/index.vue': '<template><div :style="{ backgroundImage: `url(${bg1})`, backgroundSize: \'100% 100%\', backgroundPosition: \'0px 0px\', backgroundRepeat: \'no-repeat\' }">x</div></template>',
    };
    const { files: out, summary } = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(summary.bgStyleComplete).toBe(0);
    expect(out['package/index.vue']).toBe(files['package/index.vue']);
  });

  it('⑪ H1 接线：有 effectiveSections 时真值定值区块撑满 → 汇入 summary.percentHeightStretch（只报不改）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-x-con-con" data-section-id="272:2">
    <div class="c-x-antd-table-con" data-section-id="210:45641" style="height:100%"></div>
  </div>
</template>`,
    };
    const effectiveSections = [
      {
        id: '272:2',
        layoutMetadata: { height: 270 },
        children: [{ id: '210:45641', layoutMetadata: { height: 173 } }],
      },
    ];
    const { files: out, summary } = runPreWriteSelfHealing(
      files,
      { effectiveSections },
      { logger: noopLogger },
    );
    expect(summary.percentHeightStretch).toHaveLength(1);
    expect(summary.percentHeightStretch[0].blockClass).toBe('c-x-antd-table-con');
    expect(summary.percentHeightStats.hits).toBe(1);
    // 只报不改：产物内容逐字不变
    expect(out['package/index.vue']).toBe(files['package/index.vue']);
  });

  it('⑪ H1 接线：未传真值源 → 该步骤安全跳过（summary 无该字段）', () => {
    const files = { 'package/index.vue': '<template><div class="c-x-antd-table-con" data-section-id="1" style="height:100%"></div></template>' };
    const { summary } = runPreWriteSelfHealing(files, {}, { logger: noopLogger });
    expect(summary.percentHeightStretch).toBeUndefined();
  });

  it('⑪ H1 接线：仅传 percentHeightTruth（vue3 链）→ H1 生效，而 D1 不激活（不夹带）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-x-con-con" data-section-id="272:2">
    <div class="c-x-antd-table-con" data-section-id="210:45641" style="height:100%"></div>
  </div>
</template>`,
    };
    const percentHeightTruth = [
      {
        id: '272:2',
        layoutMetadata: { height: 270 },
        // 带 body.items 的卡片语义：若 effectiveSections 被传入，D1 会尝试改写它
        body: { items: [{ text: '1,234', color: '#ff4d4f' }] },
        children: [{ id: '210:45641', layoutMetadata: { height: 173 } }],
      },
    ];
    const { files: out, summary } = runPreWriteSelfHealing(
      files,
      { percentHeightTruth },
      { logger: noopLogger },
    );
    // H1 生效
    expect(summary.percentHeightStretch).toHaveLength(1);
    expect(summary.percentHeightStretch[0].blockClass).toBe('c-x-antd-table-con');
    // D1 未被激活（summary 无 D1 字段）
    expect(summary.d1BgFixed).toBeUndefined();
    expect(summary.d1ColorFixed).toBeUndefined();
    expect(out['package/index.vue']).toBe(files['package/index.vue']);
  });
});
