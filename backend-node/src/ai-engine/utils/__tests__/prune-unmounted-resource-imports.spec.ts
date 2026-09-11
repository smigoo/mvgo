/**
 * 🛡️ CODE-022 修复器（根治方案 R3-2）：pruneUnmountedResourceImports 单测
 */
import { pruneUnmountedResourceImports } from '../resource-import-guard.js';

const mapping = [
  { assignedVarName: 'bg1', resourceFile: 'images/bg-1.png', downloadStatus: 'success' },
  { assignedVarName: 'icon1', resourceFile: 'images/icon-1.png', downloadStatus: 'success' },
];

describe('pruneUnmountedResourceImports（CODE-022 修复器）', () => {
  it('import 后零引用 → 删除该 import', () => {
    const content = `<template><div class="a">{{ title }}</div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
import icon1 from '../../resources/images/icon-1.png'
const title = 'x'
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.changed).toBe(true);
    expect(r.pruned.sort()).toEqual(['bg1', 'icon1']);
    expect(r.content).not.toContain("import bg1 from");
    expect(r.content).not.toContain("import icon1 from");
  });

  it('模板 url(${bg1}) 引用 → 保留', () => {
    const content = `<template><div :style="{ backgroundImage: \`url(\${bg1})\` }"></div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.changed).toBe(false);
    expect(r.pruned).toEqual([]);
  });

  it('style 块引用 → 保留', () => {
    const content = `<template><div class="a"></div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
</script>
<style scoped>.a { background-image: url(\${bg1}); }</style>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.changed).toBe(false);
  });

  it('W2 别名转发计入引用：primary 不误删', () => {
    const content = `<template><div :style="{ backgroundImage: \`url(\${bgTabActive})\` }"></div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
const bgTabActive = bg1
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.changed).toBe(false);
  });

  it('幂等：无可删时零副作用', () => {
    const content = `<template><div :style="{ backgroundImage: \`url(\${bg1})\` }"><img :src="icon1" /></div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
import icon1 from '../../resources/images/icon-1.png'
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.changed).toBe(false);
    expect(r.content).toBe(content);
  });

  it('多个未挂载 → 全部删除', () => {
    const content = `<template><div>{{ t }}</div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
import icon1 from '../../resources/images/icon-1.png'
const t = 1
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.pruned.sort()).toEqual(['bg1', 'icon1']);
    expect(r.content).not.toContain("from '../../resources/images/");
  });
});
