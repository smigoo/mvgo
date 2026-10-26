// 🚨 本模块经新增 ⑬ techstack-tag-enforcer → element-coverage-validator → logger → config/backend-root.js
//    链（用 import.meta.url，jest CJS 报 `Identifier '__filename' has already been declared`）⇒
//    virtual mock 掉路径解析。与 element-coverage-validator.techstack.spec.ts 同口径。
jest.mock('../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
  chatAttachmentsDir: process.cwd() + '/temp-chat-attachments',
  apifoxZipsDir: process.cwd() + '/data/apifox-zips',
  apiCatalogsDir: process.cwd() + '/data/api-catalogs',
  resolveFrontendWorkspacePath: () => process.cwd(),
  frontendCustomComponentsDir: () => process.cwd(),
  frontendVue3ComponentsDir: () => process.cwd(),
}), { virtual: true })

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('⑪-c 资源挂载/臆造规则审计（#128 ⑧，只报不改）', () => {
  const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };
  const mkTmpOutput = (images: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'pwsh-11c-'));
    mkdirSync(join(dir, 'resources', 'images'), { recursive: true });
    for (const f of images) writeFileSync(join(dir, 'resources', 'images', f), 'x');
    return dir;
  };

  it('已下载图片零引用 ⇒ summary.unreferencedImages + RES-UNREF WARN；mc-preview 豁免', () => {
    const dir = mkTmpOutput(['header-1697.png', 'mc-preview.png']);
    try {
      const warn = jest.fn();
      const { summary } = runPreWriteSelfHealing(
        { 'package/index.vue': '<template><div/></template>' },
        { outputPath: dir },
        { logger: { ...noopLogger, warn } },
      );
      expect(summary.unreferencedImages).toEqual(['header-1697']);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('RES-UNREF'),
        expect.objectContaining({ images: ['header-1697'] }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('图片被任一 .vue 引用 ⇒ 不报（阳性对照）', () => {
    const dir = mkTmpOutput(['header-1697.png']);
    try {
      const { summary } = runPreWriteSelfHealing(
        { 'package/index.vue': `<template><div/></template>
<script setup>
import logo from '../resources/images/header-1697.png'
</script>` },
        { outputPath: dir },
        { logger: noopLogger },
      );
      expect(summary.unreferencedImages).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(':first-child{background:transparent} 与重复卡真值底色矛盾 ⇒ 强 WARN', () => {
    const warn = jest.fn();
    const { summary } = runPreWriteSelfHealing(
      { 'package/common.less': '.card:first-child { background: transparent; }' },
      { layoutStructure: { repeatedCardTruth: { baseFill: { css: '#123259' } } } } as any,
      { logger: { ...noopLogger, warn } },
    );
    expect(summary.firstChildTransparent).toEqual([{ file: 'package/common.less', class: 'card' }]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('FIRST-CHILD-TRANSPARENT'),
      expect.anything(),
    );
    expect(warn.mock.calls.some((c) => String(c[0]).includes('矛盾'))).toBe(true);
  });

  it(':first-child transparent 但无真值对照 ⇒ 弱 WARN 留痕', () => {
    const warn = jest.fn();
    const { summary } = runPreWriteSelfHealing(
      { 'package/index.vue': `<template><div/></template>
<style lang="less">
.card:first-child { background: transparent; }
</style>` },
      {},
      { logger: { ...noopLogger, warn } },
    );
    expect(summary.firstChildTransparent).toHaveLength(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('留痕观察'))).toBe(true);
  });

  it('真值底色本身是透明 ⇒ 不算矛盾（阳性对照）', () => {
    const warn = jest.fn();
    runPreWriteSelfHealing(
      { 'package/common.less': '.card:first-child { background: transparent; }' },
      { layoutStructure: { repeatedCardTruth: { baseFill: { css: 'transparent' } } } } as any,
      { logger: { ...noopLogger, warn } },
    );
    expect(warn.mock.calls.some((c) => String(c[0]).includes('矛盾'))).toBe(false);
  });

  // ③ 透明容器臆造背景审计（2026-10-20 · 5ef650ff 实锤：figma fills=[] 透明容器
  //    被产物刷 background ⇒ 盖住宿主底色，浅发白/深发灰。只报不改）
  it('透明容器（figma fills=[]）被产物刷背景 ⇒ summary.transparentContainerBg + 强 WARN + 台账', () => {
    const dir = mkTmpOutput([]);
    try {
      const warn = jest.fn();
      const { summary } = runPreWriteSelfHealing(
        {
          'package/index.vue':
            '<template><div class="c-x-root other" data-section-id="38:3134"><span/></div></template>',
          'package/common.less': '.c-x-root { background: #1f1f1f; padding: 8px; }',
        },
        {
          outputPath: dir,
          layoutStructure: {
            transparentContainerTruth: { transparentIds: ['38:3134'], total: 3, rootTransparent: true },
          },
        } as any,
        { logger: { ...noopLogger, warn } },
      );
      expect(summary.transparentContainerBg).toHaveLength(1);
      expect(summary.transparentContainerBg[0]).toEqual(
        expect.objectContaining({ sectionId: '38:3134', class: 'c-x-root', file: 'package/common.less' }),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('TRANSPARENT-CONTAINER-BG'),
        expect.objectContaining({ truthTotal: 3 }),
      );
      const meta = JSON.parse(readFileSync(join(dir, 'component-meta.json'), 'utf-8'));
      expect(
        meta.failOpenEvents.some((e: any) => e.rule === 'TRANSPARENT-CONTAINER-BG' && e.severity === 'WARN'),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('透明容器 background:transparent ⇒ 不报（阳性对照）', () => {
    const warn = jest.fn();
    const { summary } = runPreWriteSelfHealing(
      {
        'package/index.vue': '<template><div class="c-x-root" data-section-id="38:3134"/></template>',
        'package/common.less': '.c-x-root { background: transparent; }',
      },
      {
        layoutStructure: {
          transparentContainerTruth: { transparentIds: ['38:3134'], total: 1 },
        },
      } as any,
      { logger: { ...noopLogger, warn } },
    );
    expect(summary.transparentContainerBg).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('TRANSPARENT-CONTAINER-BG'))).toBe(false);
  });

  it('无透明容器真值 ⇒ 审计不启动（阳性对照）', () => {
    const warn = jest.fn();
    const { summary } = runPreWriteSelfHealing(
      {
        'package/index.vue': '<template><div class="c-x-root" data-section-id="38:3134"/></template>',
        'package/common.less': '.c-x-root { background: #1f1f1f; }',
      },
      {} as any,
      { logger: { ...noopLogger, warn } },
    );
    expect(summary.transparentContainerBg).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('TRANSPARENT-CONTAINER-BG'))).toBe(false);
  });

  it('透明容器无 data-section-id 锚点 ⇒ 不报（阳性对照）', () => {
    const warn = jest.fn();
    const { summary } = runPreWriteSelfHealing(
      {
        'package/index.vue': '<template><div class="c-x-root"/></template>',
        'package/common.less': '.c-x-root { background: #1f1f1f; }',
      },
      {
        layoutStructure: {
          transparentContainerTruth: { transparentIds: ['38:3134'], total: 1 },
        },
      } as any,
      { logger: { ...noopLogger, warn } },
    );
    expect(summary.transparentContainerBg).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('TRANSPARENT-CONTAINER-BG'))).toBe(false);
  });

  // ────────────────────── ㉑ 层 4+5 布局真值守卫（2026-10-26） ──────────────────────
  // 真机 mc-max-1792985029695-58de7d47 三处病灶同源：样式文本在「双写 + 跨文件优先级」下自相矛盾。
  // 桩真值树走 `.document`（离线重放铁律）。
  const layoutTruthRoot = {
    document: {
      children: [
        // 36:1726 = GROUP Mask group，真值 98×98（与 common.less 的 min-height:98px 逐位一致）
        { id: '36:1726', absoluteBoundingBox: { x: 0, y: 0, width: 98, height: 98 }, children: [] },
      ],
    },
  };

  it('㉑ 接线：无 figmaRoot ⇒ J1 仍生效（无需真值），J2/J3 跳过并留痕 skippedReason', () => {
    const { files: out, summary } = runPreWriteSelfHealing(
      {
        'package/index.vue': `<template><div class="c-x-grid" data-section-id="36:1698"/></template>
<style lang="less" scoped>.c-x-grid { flex-wrap: wrap; display: grid; }</style>`,
      },
      {} as any,
      { logger: noopLogger },
    );
    expect(summary.layoutTruthInertRemoved).toBe(1);
    expect(summary.layoutTruthHits).toBe(1);
    expect(summary.layoutTruthSkippedReason).toBe('no-truth-bbox');
    expect(out['package/index.vue']).not.toMatch(/flex-wrap/);
    // 成对断言：display 本身必须完整存活（防「保留分支推裸值」的产物损坏型 bug 复发）
    expect(out['package/index.vue']).toMatch(/display:\s*grid/);
  });

  it('㉑ 接线：有 figmaRoot ⇒ J3 剥掉抹除真值尺寸的 scoped min-height（shared 真值生效）', () => {
    const { files: out, summary } = runPreWriteSelfHealing(
      {
        // shared 表锚定真值 98px
        'resources/styles/common.less': '.c-mask { width: 100%; min-height: 98px; }',
        // SFC scoped 把它抹成 0（无单位 0 —— 首版判据漏网的真机形态）
        'package/components/ContentMask.vue': `<template><div class="c-mask" data-section-id="36:1726"/></template>
<style lang="less" scoped>.c-mask { display: flex; flex-direction: column; min-height: 0; }</style>`,
      },
      { figmaRoot: layoutTruthRoot } as any,
      { logger: noopLogger },
    );
    expect(summary.layoutTruthTruthOverrideStripped).toBe(1);
    const mask = out['package/components/ContentMask.vue'];
    expect(mask).not.toMatch(/min-height/);
    // 成对断言：非 min-* 声明必须原样保留
    expect(mask).toMatch(/display:\s*flex/);
    expect(mask).toMatch(/flex-direction:\s*column/);
    // shared 的真值锚绝不能被动
    expect(out['resources/styles/common.less']).toMatch(/min-height:\s*98px/);
  });

  it('㉑ 幂等：连续跑两次，第二次 J1/J2/J3 全 0', () => {
    const files = {
      'package/index.vue': `<template><div class="c-x-grid" data-section-id="36:1698"/></template>
<style lang="less" scoped>.c-x-grid { flex-wrap: wrap; display: grid; }</style>`,
    };
    const first = runPreWriteSelfHealing(files, {} as any, { logger: noopLogger });
    const second = runPreWriteSelfHealing(first.files, {} as any, { logger: noopLogger });
    expect(first.summary.layoutTruthInertRemoved).toBe(1);
    expect(second.summary.layoutTruthInertRemoved).toBe(0);
    expect(second.summary.layoutTruthHits).toBe(0);
  });
});
