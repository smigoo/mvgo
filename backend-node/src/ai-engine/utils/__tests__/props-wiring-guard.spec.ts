import {
  extractRequiredProps,
  extractDefinedProps,
  extractResourceProps,
  extractComponentCalls,
  detectMissingPropsWiring,
  detectUndefinedPropSources,
  detectRiskyPropAccessPatterns,
  autoWireSubComponentProps,
  rewriteSubcomponentResourceImportsToProps,
} from '../props-wiring-guard.js';
import {
  validateSubcomponentResourceDeps,
  injectResourceImports,
} from '../resource-import-guard.js';

describe('CODE-019 extractDefinedProps', () => {
  it('提取 required、resource 和泛型定义的 props', () => {
    const content = `
<script setup lang="ts">
const props = defineProps<{ title: string; bg2?: string; iconWeather?: string }>()
</script>
<template>
  <div :style="{ backgroundImage: \`url(\${bg2})\` }">{{ title }}<img :src="iconWeather" /></div>
</template>`;
    const props = extractDefinedProps(content);
    expect(props.map((p) => p.name).sort()).toEqual(['bg2', 'iconWeather', 'title']);
    expect(props.find((p) => p.name === 'title')?.required).toBe(true);
    expect(props.find((p) => p.name === 'bg2')?.required).toBe(false);
  });
});

describe('CODE-019 extractResourceProps', () => {
  const resourceDomMapping = [
    { assignedVarName: 'bg2', semanticVarName: 'bgTabActive', downloadStatus: 'success' },
    { assignedVarName: 'iconWeather', semanticVarName: 'iconWeather', downloadStatus: 'success' },
    { assignedVarName: 'icon1', downloadStatus: 'success' },
  ];

  it('识别定义且实际使用的资源 props', () => {
    const content = `
<script setup lang="ts">
const props = defineProps<{ bg2?: string; iconWeather?: string; title: string }>()
const local = 1
</script>
<template>
  <div :style="{ backgroundImage: \`url(\${bg2})\` }">
    <img :src="iconWeather" />
    {{ title }}
  </div>
</template>`;
    expect(extractResourceProps(content, { resourceDomMapping }).sort()).toEqual(['bg2', 'iconWeather']);
  });

  it('没有 resourceDomMapping 时不盲猜编号 prop', () => {
    const content = `
<script setup>
const props = defineProps({ bg2: String, title: String })
</script>
<template><div :style="{ backgroundImage: \`url(\${bg2})\` }"></div></template>`;
    expect(extractResourceProps(content, {})).toEqual([]);
  });
});

describe('CODE-019 detectMissingPropsWiring', () => {
  const resourceDomMapping = [
    { assignedVarName: 'bg2', semanticVarName: 'bgTabActive', downloadStatus: 'success' },
    { assignedVarName: 'iconWeather', semanticVarName: 'iconWeather', downloadStatus: 'success' },
  ];

  it('子组件使用资源 prop 但父组件未传 → BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><VehicleTypeDistribution /></template>`,
      },
      {
        path: 'package/components/VehicleTypeDistribution.vue',
        content: `
<template>
  <div :style="{ backgroundImage: \`url(\${bg2})\` }">
    <img :src="iconWeather" />
  </div>
</template>
<script setup lang="ts">
const props = defineProps<{ bg2?: string; iconWeather?: string }>()
</script>`,
      },
    ];

    const issues = detectMissingPropsWiring(files, { resourceDomMapping });
    expect(issues.map((i) => i.id)).toEqual(['CODE-019', 'CODE-019']);
    expect(issues[0].message).toContain('bg2');
    expect(issues[0].message).toContain('VehicleTypeDistribution');
  });

  it('父组件显式传入资源 props → 不 BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><VehicleTypeDistribution :bg2="bg2" :iconWeather="iconWeather" /></template>`,
      },
      {
        path: 'package/components/VehicleTypeDistribution.vue',
        content: `
<template>
  <div :style="{ backgroundImage: \`url(\${bg2})\` }">
    <img :src="iconWeather" />
  </div>
</template>
<script setup lang="ts">
const props = defineProps<{ bg2?: string; iconWeather?: string }>()
</script>`,
      },
    ];

    expect(detectMissingPropsWiring(files, { resourceDomMapping })).toHaveLength(0);
  });

  it('required prop 缺失仍然 BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><VehicleTypeDistribution :bg2="bg2" /></template>`,
      },
      {
        path: 'package/components/VehicleTypeDistribution.vue',
        content: `
<template><div>{{ title }}</div></template>
<script setup lang="ts">
const props = defineProps<{ title: string; bg2?: string }>()
</script>`,
      },
    ];

    const issues = detectMissingPropsWiring(files, { resourceDomMapping });
    expect(issues.map((i) => i.id)).toContain('CODE-019');
    expect(issues.some((i) => i.message.includes('title'))).toBe(true);
  });
});

// ──────────────────────────────────────────────
// P1-2：detectUndefinedPropSources
// ──────────────────────────────────────────────
describe('P1-2 detectUndefinedPropSources', () => {
  it('未声明的变量在 prop 绑定中 → WARNING', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <VehicleTypeDistribution :chartData="undeclaredData" />
</template>
<script setup>
const declaredData = [1, 2, 3]
</script>`,
      },
    ];
    const issues = detectUndefinedPropSources(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].message).toContain('undeclaredData');
  });

  it('已声明的变量在 prop 绑定中 → 不报', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <VehicleTypeDistribution :chartData="declaredData" />
</template>
<script setup>
const declaredData = [1, 2, 3]
</script>`,
      },
    ];
    expect(detectUndefinedPropSources(files)).toHaveLength(0);
  });

  it('字面量绑定 → 不报', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <MyComponent :title="'Hello'" :count="42" :flag="true" />
</template>
<script setup></script>`,
      },
    ];
    expect(detectUndefinedPropSources(files)).toHaveLength(0);
  });

  it('import 引入的变量 → 不报', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <MyChart :data="chartData" />
</template>
<script setup>
import { chartData } from './data.js'
</script>`,
      },
    ];
    expect(detectUndefinedPropSources(files)).toHaveLength(0);
  });

  it('function 声明 → 不报', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <MyChart :data="getData() ?? []" />
</template>
<script setup>
function getData() { return [] }
</script>`,
      },
    ];
    expect(detectUndefinedPropSources(files)).toHaveLength(0);
  });

  it('无主组件 → 空结果', () => {
    const files = [
      { path: 'package/components/Child.vue', content: '<template><div/></template>' },
    ];
    expect(detectUndefinedPropSources(files)).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// P1-2：detectRiskyPropAccessPatterns
// ──────────────────────────────────────────────
describe('P1-2 detectRiskyPropAccessPatterns', () => {
  it('子组件 prop 的 .map() 没有 ?. → WARNING', () => {
    const files = [
      {
        path: 'package/components/ChartPanel.vue',
        content: `<template>
  <div v-for="item in chartData.map((x) => x.name)" :key="item">{{ item }}</div>
</template>
<script setup>
const props = defineProps({ chartData: Array })
</script>`,
      },
    ];
    const issues = detectRiskyPropAccessPatterns(files);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].message).toContain('chartData');
    expect(issues[0].message).toContain('.map()');
  });

  it('子组件 prop 已有 ?. 前缀 → 不报', () => {
    const files = [
      {
        path: 'package/components/ChartPanel.vue',
        content: `<template>
  <div v-for="item in chartData?.map((x) => x.name)" :key="item">{{ item }}</div>
</template>
<script setup>
const props = defineProps({ chartData: Array })
</script>`,
      },
    ];
    expect(detectRiskyPropAccessPatterns(files)).toHaveLength(0);
  });

  it('props.propName.map() 没有 ?. → WARNING', () => {
    const files = [
      {
        path: 'package/components/ChartPanel.vue',
        content: `<template>
  <div>{{ labels }}</div>
</template>
<script setup>
const props = defineProps({ chartData: Array })
const labels = props.chartData.map((x) => x.name)
</script>`,
      },
    ];
    const issues = detectRiskyPropAccessPatterns(files);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some((i) => i.message.includes('chartData') && i.message.includes('.map()'))).toBe(true);
  });

  it('非 prop 的 .map() → 不报', () => {
    const files = [
      {
        path: 'package/components/ChartPanel.vue',
        content: `<template>
  <div v-for="item in localList.map((x) => x.name)" :key="item">{{ item }}</div>
</template>
<script setup>
const props = defineProps({ title: String })
const localList = [1, 2, 3]
</script>`,
      },
    ];
    expect(detectRiskyPropAccessPatterns(files)).toHaveLength(0);
  });

  it('空文件 → 空结果', () => {
    expect(detectRiskyPropAccessPatterns([])).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// ③ 治本：autoWireSubComponentProps（解 CODE-019 不收敛）
// ──────────────────────────────────────────────
describe('③ autoWireSubComponentProps', () => {
  const resourceDomMapping = [
    { assignedVarName: 'bg2', downloadStatus: 'success' },
    { assignedVarName: 'iconWeather', downloadStatus: 'success' },
    { assignedVarName: 'icon1', downloadStatus: 'success' },
  ];

  function makeFiles(mainContent: string, childContent = '') {
    return [
      { path: 'package/index.vue', content: mainContent },
      {
        path: 'package/components/VehicleTypeDistribution.vue',
        content:
          childContent ||
          `<template>
  <div :style="{ backgroundImage: \`url(\${bg2})\` }">
    <img :src="iconWeather" />
  </div>
</template>
<script setup lang="ts">
const props = defineProps<{ bg2?: string; iconWeather?: string; title: string }>()
</script>`,
      },
    ];
  }

  it('资源 props 漏传且父级已声明同名变量 → 自动补 :bg2/:iconWeather 绑定，检测归零', () => {
    const files = makeFiles(
      `<template>
  <VehicleTypeDistribution :title="t" />
</template>
<script setup>
import bg2 from '../resources/images/bg.png'
import iconWeather from '../resources/images/icon.png'
const t = 'x'
</script>`,
    );
    const res = autoWireSubComponentProps(files, { resourceDomMapping });
    const main = res.files['package/index.vue'] || '';
    expect(main).toContain(':bg2="bg2"');
    expect(main).toContain(':iconWeather="iconWeather"');
    // title 是父级已声明的 required prop 之外的 data prop；父级声明了 t 未声明 title → 不臆造
    expect(res.fixes.some((f: any) => f.prop === 'bg2')).toBe(true);
    // 修复后 CODE-019 检测应归零
    const issues = detectMissingPropsWiring(
      Object.entries(res.files).map(([p, c]) => ({ path: p, content: c })),
      { resourceDomMapping },
    );
    expect(issues).toHaveLength(0);
  });

  it('required prop 缺失但父级已声明同名变量 → 自动补绑定', () => {
    const files = makeFiles(
      `<template>
  <VehicleTypeDistribution :bg2="bg2" />
</template>
<script setup>
import bg2 from '../resources/images/bg.png'
const chartData = []
const activeTab = 'a'
</script>`,
      `<template><div>{{ chartData }}</div></template>
<script setup lang="ts">
const props = defineProps<{ chartData: Array; activeTab: string; bg2?: string }>()
</script>`,
    );
    const res = autoWireSubComponentProps(files, { resourceDomMapping });
    const main = res.files['package/index.vue'] || '';
    // chartData / activeTab 父级已 const 声明 → 可接线
    expect(main).toContain(':chartData="chartData"');
    expect(main).toContain(':activeTab="activeTab"');
    expect(main).toContain(':bg2="bg2"');
    const issues = detectMissingPropsWiring(
      Object.entries(res.files).map(([p, c]) => ({ path: p, content: c })),
      { resourceDomMapping },
    );
    expect(issues).toHaveLength(0);
  });

  it('required prop 父级未声明同名变量（数据源待异步注入）→ 不臆造注入', () => {
    const files = makeFiles(
      `<template>
  <VehicleTypeDistribution :bg2="bg2" />
</template>
<script setup>
import bg2 from '../resources/images/bg.png'
</script>`,
      // 子组件实际使用 bg2（作为背景），且声明 required chartData —— 父级未声明 chartData
      `<template><div :style="{ backgroundImage: \`url(\${bg2})\` }">{{ chartData }}</div></template>
<script setup lang="ts">
const props = defineProps<{ chartData: Array; bg2?: string }>()
</script>`,
    );
    const res = autoWireSubComponentProps(files, { resourceDomMapping });
    // bg2 父级已显式传入 → 无修复；chartData 父级未声明 → 不臆造注入（留给重试指导）
    expect(res.fixes.filter((f: any) => f.prop === 'chartData')).toHaveLength(0);
    expect(res.fixes.filter((f: any) => f.prop === 'bg2')).toHaveLength(0);
    expect(res.fixes).toHaveLength(0);
  });

  it('幂等：父组件已显式传 props → 不重复注入', () => {
    const files = makeFiles(
      `<template>
  <VehicleTypeDistribution :bg2="bg2" :iconWeather="iconWeather" :title="t" />
</template>
<script setup>
import bg2 from '../resources/images/bg.png'
import iconWeather from '../resources/images/icon.png'
const t = 'x'
</script>`,
    );
    const res = autoWireSubComponentProps(files, { resourceDomMapping });
    expect(res.fixes).toHaveLength(0);
  });

  it('无 index.vue → 空结果不崩', () => {
    const res = autoWireSubComponentProps(
      [{ path: 'package/components/Child.vue', content: '<template><div/></template>' }],
      { resourceDomMapping },
    );
    expect(res.fixes).toEqual([]);
  });
});

describe('P0/D rewriteSubcomponentResourceImportsToProps 契约改写', () => {
  const mapping = [
    { assignedVarName: 'icon1', resourceFile: '../resources/images/icon-1.png', downloadStatus: 'success' },
    { assignedVarName: 'bg1', resourceFile: '../resources/images/bg-1.png', downloadStatus: 'success' },
  ];

  it('子组件本地 import 资源 → 改为 defineProps 资源 prop，删除本地 import', () => {
    const before = `<template><div><img :src="icon1" /><div :style="{ backgroundImage: \`url(\${bg1})\` }"/></div></template>
<script setup>
import icon1 from '../../resources/images/icon-1.png'
import bg1 from '../../resources/images/bg-1.png'
</script>`;
    const r = rewriteSubcomponentResourceImportsToProps(before, mapping);
    expect(r.changed).toBe(true);
    expect(r.rewritten).toEqual(expect.arrayContaining(['icon1', 'bg1']));
    expect(r.content).not.toMatch(/import\s+icon1\s+from/);
    expect(r.content).not.toMatch(/import\s+bg1\s+from/);
    expect(r.content).toMatch(/defineProps/);
    expect(r.content).toMatch(/icon1/);
    expect(r.content).toMatch(/bg1/);
  });

  it('已有 defineProps 同名 prop → 不重复声明，只删本地 import', () => {
    const before = `<template><img :src="icon1" /></template>
<script setup>
import icon1 from '../../resources/images/icon-1.png'
const props = defineProps({ icon1: { type: String, required: true } })
</script>`;
    const r = rewriteSubcomponentResourceImportsToProps(before, mapping);
    expect(r.changed).toBe(true);
    const propCount = (r.content.match(/icon1/g) || []).length;
    // defineProps 内 1 处 + 模板 1 处 = 2，不应出现第 2 个 defineProps 声明
    expect((r.content.match(/defineProps/g) || []).length).toBe(1);
    expect(propCount).toBe(2);
  });

  it('子组件无本地 import → 不改动', () => {
    const before = `<template><img :src="icon1" /></template>
<script setup>
const props = defineProps({ icon1: { type: String, required: true } })
</script>`;
    const r = rewriteSubcomponentResourceImportsToProps(before, mapping);
    expect(r.changed).toBe(false);
  });

  it('空 resourceDomMapping 或 success 缺失 → 不改动', () => {
    const before = `<script setup>
import icon1 from '../../resources/images/icon-1.png'
</script>`;
    const r = rewriteSubcomponentResourceImportsToProps(before, []);
    expect(r.changed).toBe(false);
  });
});

describe('Step2 P0/D 契约对齐 validateSubcomponentResourceDeps / injectResourceImports', () => {
  const mapping = [
    { assignedVarName: 'icon1', resourceFile: '../resources/images/icon-1.png', downloadStatus: 'success' },
    { assignedVarName: 'bg1', resourceFile: '../resources/images/bg-1.png', downloadStatus: 'success' },
  ];

  it('collectDeclaredBindings 识别嵌套对象 defineProps（P0/D 改写产物不再误判 CODE-018）', () => {
    const content = `<template><img :src="icon1" /><div :style="{ backgroundImage: \`url(\${bg1})\` }"/></template>
<script setup>
const props = defineProps({ icon1: { type: String, required: true }, bg1: { type: String, required: true } })
</script>`;
    const r = validateSubcomponentResourceDeps(content, 'package/components/X.vue', mapping);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('collectDeclaredBindings 识别泛型 defineProps（<{icon1: string}>）', async () => {
    const content = `<template><img :src="icon1" /></template>
<script setup lang="ts">
const props = defineProps<{ icon1: string; bg1?: string }>()
</script>`;
    const r = validateSubcomponentResourceDeps(content, 'package/components/X.vue', mapping);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('子组件本地 import 资源 → 仍 valid（本地声明也算合规，兼容非 P0/D 路径）', async () => {
    const content = `<template><img :src="icon1" /></template>
<script setup>
import icon1 from '../../resources/images/icon-1.png'
</script>`;
    const r = validateSubcomponentResourceDeps(content, 'package/components/X.vue', mapping);
    expect(r.valid).toBe(true);
  });

  it('skipResourceVars 子组件注入不新增资源 import，且保留非资源 import', () => {
    const content = `<template><img :src="icon1" /><BaseX /></template>
<script setup>
import BaseX from './BaseX.vue'
const props = defineProps({ icon1: { type: String, required: true } })
</script>`;
    const out = injectResourceImports(content, mapping, '../../resources/images/', null, { skipResourceVars: true });
    expect(out).not.toMatch(/import\s+icon1\s+from/);
    expect(out).toMatch(/import\s+BaseX\s+from/);
  });

  it('缺声明仍 BLOCK：用了资源变量但无本地声明也无 defineProps', async () => {
    const content = `<template><img :src="icon1" /></template>
<script setup>
const props = defineProps({ title: String })
</script>`;
    const r = validateSubcomponentResourceDeps(content, 'package/components/X.vue', mapping);
    expect(r.valid).toBe(false);
    expect(r.missingVars).toContain('icon1');
  });
});
