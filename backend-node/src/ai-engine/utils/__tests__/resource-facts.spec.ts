/**
 * 🛡️ P1.7 资源事实源 + 资源契约 · 单测（2026-09-11）
 *
 * 事故 mc-max-1789096764029-13890774：
 *   mapping 变量名与模型引用一致（icon1…icon14），但注入只认模板使用形态
 *   → script 内 `const deviceIcons = [icon3, icon4, …]` 看不见 → 只注入 3 个 import
 *   → 运行时 `icon4 is not defined`。本 spec 锁定双覆盖采集 + 契约判定。
 */
import {
  collectResourceVarRefsFromSfc,
  collectResourceRefs,
  buildResourceFacts,
  checkResourceContract,
} from '../resource-facts.js';
import { ensureResourceImportsForRefs, stripUndefinedResourceRefs } from '../../roles/microcode/resource-mounter.js';

const MAPPING = [
  { assignedVarName: 'bg1', resourceFile: '../resources/images/bg-8788.png', name: 'bg' },
  { assignedVarName: 'icon1', resourceFile: '../resources/images/icon-8798.png', name: 'icon' },
  { assignedVarName: 'icon2', resourceFile: '../resources/images/icon-8817.png', name: 'icon' },
  { assignedVarName: 'icon3', resourceFile: '../resources/images/icon-8444.png', name: 'icon' },
  { assignedVarName: 'icon4', resourceFile: '../resources/images/icon-8473.png', name: 'icon' },
];

/** 13890774 形态：script 内数组引用 */
const SFC_ARRAY_REFS = `<template>
  <div class="c-demo-x-slot-con">
    <img :src="deviceIcons[0]" />
  </div>
</template>
<script setup>
import { ref } from 'vue'

const deviceIcons = [icon3, icon4]
const deviceBgs = [bg1]
</script>
`;

describe('collectResourceVarRefsFromSfc（模板 + script 双覆盖）', () => {
  it('script 内数组引用被采集（旧实现盲区）', () => {
    const refs = collectResourceVarRefsFromSfc(SFC_ARRAY_REFS);
    expect(refs.script.has('icon3')).toBe(true);
    expect(refs.script.has('icon4')).toBe(true);
    expect(refs.script.has('bg1')).toBe(true);
    expect(refs.template.has('deviceIcons')).toBe(false); // 非资源命名前缀
  });

  it('已 import 的变量不算「未定义引用」，但仍登记为引用', () => {
    const sfc = `<template><img :src="icon1" /></template>
<script setup>
import icon1 from '../../resources/images/icon-8798.png'
const list = [icon1]
</script>`;
    const refs = collectResourceVarRefsFromSfc(sfc);
    expect(refs.all.has('icon1')).toBe(true);
  });

  it('注释里的资源名不被误判', () => {
    const sfc = `<template><div /></template>
<script setup>
// 例如 icon9 可能被误用
/* icon8 说明 */
const x = 1
</script>`;
    const refs = collectResourceVarRefsFromSfc(sfc);
    expect(refs.all.has('icon9')).toBe(false);
    expect(refs.all.has('icon8')).toBe(false);
  });

  it('带属性 <template class="..."> 也能采集（486ec46 教训）', () => {
    const sfc = `<template class="c-mc-max-1-x"><img :src="icon1" /></template>
<script setup>
import icon1 from '../../resources/images/icon-8798.png'
</script>`;
    expect(collectResourceVarRefsFromSfc(sfc).template.has('icon1')).toBe(true);
  });
});

describe('buildResourceFacts / checkResourceContract', () => {
  it('R1：引用未 import 且事实源已登记 → error（注入漏项）', () => {
    const files = { 'package/components/Main.vue': SFC_ARRAY_REFS };
    const facts = buildResourceFacts({ mapping: MAPPING, files });
    expect(facts.missingImports.map((m) => m.varName).sort()).toEqual(['bg1', 'icon3', 'icon4']);
    const v = checkResourceContract(files, facts);
    expect(v.filter((x) => x.code === 'R1' && x.severity === 'error').length).toBe(3);
  });

  it('R2：引用既无 import 也不在事实源 → error（幽灵引用）', () => {
    const files = {
      'package/components/Main.vue': `<template><div /></template>
<script setup>
const list = [icon99]
</script>`,
    };
    const facts = buildResourceFacts({ mapping: MAPPING, files });
    const v = checkResourceContract(files, facts);
    expect(v.some((x) => x.code === 'R2' && x.message.includes('icon99'))).toBe(true);
  });

  it('R3：import 未在事实源登记 → warn', () => {
    const files = {
      'package/components/Main.vue': `<template><div /></template>
<script setup>
import icon7 from '../../resources/images/icon-9999.png'
const list = [icon7]
</script>`,
    };
    const facts = buildResourceFacts({ mapping: MAPPING, files });
    const v = checkResourceContract(files, facts);
    expect(v.some((x) => x.code === 'R3' && x.severity === 'warn')).toBe(true);
  });

  it('契约满足时零违规', () => {
    const files = {
      'package/components/Main.vue': `<template><img :src="icon1" /></template>
<script setup>
import icon1 from '../../resources/images/icon-8798.png'
import icon3 from '../../resources/images/icon-8444.png'
import icon4 from '../../resources/images/icon-8473.png'
import bg1 from '../../resources/images/bg-8788.png'
const deviceIcons = [icon3, icon4]
const deviceBgs = [bg1]
</script>`,
    };
    const facts = buildResourceFacts({ mapping: MAPPING, files });
    expect(checkResourceContract(files, facts).filter((x) => x.severity === 'error')).toEqual([]);
  });
});

describe('ensureResourceImportsForRefs（引用驱动补齐）', () => {
  it('script 内引用被补齐 import（13890774 治本）', () => {
    const files = { 'package/components/Main.vue': SFC_ARRAY_REFS };
    const { files: out, injected } = ensureResourceImportsForRefs(files, MAPPING, {});
    const content = out['package/components/Main.vue'];
    for (const v of ['icon3', 'icon4', 'bg1']) {
      expect(content).toContain(`import ${v} from '../../resources/images/`);
    }
    expect(injected.length).toBe(3);
  });

  it('路径基准正确：index.vue 用 ../resources/images/', () => {
    const files = {
      'package/index.vue': `<template><div :style="{ backgroundImage: 'url(' + bg1 + ')' }" /></template>
<script setup>
import { onMounted } from 'vue'
onMounted(() => {})
</script>`,
    };
    const { files: out } = ensureResourceImportsForRefs(files, MAPPING, {});
    expect(out['package/index.vue']).toContain(`import bg1 from '../resources/images/bg-8788.png'`);
  });

  it('事实源无该变量 → 不注入、登记为 unresolved', () => {
    const files = {
      'package/components/Main.vue': `<template><div /></template>
<script setup>
const list = [icon99]
</script>`,
    };
    const { files: out, injected, unresolved } = ensureResourceImportsForRefs(files, MAPPING, {});
    expect(injected.length).toBe(0);
    expect(unresolved.some((u) => u.varName === 'icon99')).toBe(true);
    expect(out['package/components/Main.vue']).not.toContain('import icon99');
  });

  it('幂等：重复执行不再注入', () => {
    const once = ensureResourceImportsForRefs({ 'package/components/Main.vue': SFC_ARRAY_REFS }, MAPPING, {});
    const twice = ensureResourceImportsForRefs(once.files, MAPPING, {});
    expect(twice.injected.length).toBe(0);
  });
});

describe('stripUndefinedResourceRefs（T08 兜底：script 覆盖）', () => {
  it('script 内未定义资源引用被降级为 undefined（不再 ReferenceError）', () => {
    const out = stripUndefinedResourceRefs(SFC_ARRAY_REFS, {});
    expect(out).not.toMatch(/\bicon4\b(?!\s*from)/);
    expect(out).toContain('undefined');
  });

  it('已 import 的变量不被降级', () => {
    const sfc = `<template><img :src="icon1" /></template>
<script setup>
import icon1 from '../../resources/images/icon-8798.png'
const list = [icon1]
</script>`;
    expect(stripUndefinedResourceRefs(sfc, {})).toContain('import icon1');
  });
});
