/**
 * 🛡️ CODE-022 修复器（根治方案 R3-2）：pruneUnmountedResourceImports 单测
 */
import {
  pruneUnmountedResourceImports,
  isResourceVarMounted,
} from '../resource-import-guard.js';

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

  // ────────── 2026-09-29 死锁回归（mc-max-1790666332846-2e5fc9e7 实锤） ──────────
  // 背景：本函数（修复器）与门禁 `code-structure-validator#findUnmountedResourceVars`
  // 此前各实现一份「是否已挂载」的判据且**口径不同**：
  //   - 门禁：先剥注释，再 `\b<name>\b` 计数        → 判「未挂载」→ CODE-022 硬闸 BLOCK
  //   - 修复器：不剥注释，对含注释全文计数          → 判「已挂载」→ 不删
  // 而 LLM 会在 import 行下方写自解释注释（实锤产物 HeaderSub.vue）：
  //   `import icon2 from '../../resources/images/icon-8070.png'`
  //   `// 资源变量由系统自动注入（icon2 = icon-8070.png）`
  // ⇒ 两侧判据相反 ⇒ 自愈永不生效 ⇒ 3 轮重试同错复现 ⇒ 重试耗尽（当天 5 个任务死于此）。
  // 修法：抽 `isResourceVarMounted`（剥注释 + 剔 import 行）为单一事实源，两侧共用。
  it('回归：import 下方注释提到变量名 → 仍判未挂载并删除（死锁根因）', () => {
    const content = `<template>
  <div class="header-sub"><span>今日累计</span></div>
</template>
<script setup>
import icon1 from '../../resources/images/icon-1.png'
// 资源变量由系统自动注入（icon1 = icon-1.png）
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.changed).toBe(true);
    expect(r.pruned).toEqual(['icon1']);
    expect(r.content).not.toContain('import icon1 from');
    // 失真的自解释注释须同批清理，避免其它按文本扫变量名的审计器误判「仍在使用」
    expect(r.content).not.toContain('资源变量由系统自动注入');
  });

  it('回归：注释清理只删「整行注释」，含代码行的同行注释不被误删', () => {
    const content = `<template><div>{{ t }}</div></template>
<script setup>
import icon1 from '../../resources/images/icon-1.png'
// icon1 说明（整行注释，应删）
const t = 1 // 与 icon1 相关的同行注释（应保留）
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.pruned).toEqual(['icon1']);
    expect(r.content).not.toContain('icon1 说明');
    // 含代码的行及其同行注释必须原样保留（只删 script 内的纯注释行）
    expect(r.content).toContain('const t = 1 // 与 icon1 相关的同行注释（应保留）');
  });

  it('isResourceVarMounted：模板 :src / :style / 别名转发 三种合法引用均判已挂载', () => {
    const tplSrc = `<template><img :src="icon1" /></template>
<script setup>
import icon1 from '../../resources/images/icon-1.png'
</script>`;
    const tplStyle = `<template><div :style="{ backgroundImage: \`url(\${bg1})\` }"></div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
</script>`;
    const alias = `<template><div :style="{ backgroundImage: \`url(\${bgTab})\` }"></div></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
const bgTab = bg1
</script>`;
    expect(isResourceVarMounted(tplSrc, 'icon1')).toBe(true);
    expect(isResourceVarMounted(tplStyle, 'bg1')).toBe(true);
    expect(isResourceVarMounted(alias, 'bg1')).toBe(true);
    // 反例：仅 import + 仅注释提及 → 未挂载
    const onlyComment = `<template><div /></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
// bg1
</script>`;
    expect(isResourceVarMounted(onlyComment, 'bg1')).toBe(false);
    // 反例：块注释提及同样不算挂载
    const blockComment = `<template><div /></template>
<script setup>
import bg1 from '../../resources/images/bg-1.png'
/* bg1 由系统注入 */
</script>`;
    expect(isResourceVarMounted(blockComment, 'bg1')).toBe(false);
  });

  // ────────── 2026-09-29：混合场景（原 mount-unused-resource-icons.spec.ts 唯一不重复的覆盖） ──────────
  // 背景：该 spec 原属已删除的「CODE-022 图标自愈」（mountUnusedResourceIcons）。自愈器删除后其
  // 唯一仍有价值的断言 = 「同一文件里已挂载的保留、未挂载的删除」不再成对出现时的行为，故迁到本文件。
  it('混合：模板已引用 icon1（已挂载）→ 保留；bg1 零引用 → 删除', () => {
    const content = `<template><h3><img :src="icon1" /></h3></template>
<script setup>
import icon1 from '../../resources/images/icon-1.png'
import bg1 from '../../resources/images/bg-1.png'
</script>`;
    const r = pruneUnmountedResourceImports(content, mapping);
    expect(r.changed).toBe(true);
    expect(r.pruned).toEqual(['bg1']);
    expect(r.content).toContain('import icon1 from');
    expect(r.content).not.toContain('import bg1 from');
  });
});
