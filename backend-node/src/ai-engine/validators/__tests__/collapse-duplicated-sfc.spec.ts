/**
 * 刀 23 SFC 整份双写折叠守卫 spec（2026-11-18 · RUNTIME-004 族B 实锤）
 *
 * 病灶：mc-max-1794826753848-3bece447 的 index.vue = `<template><template>` 双开 +
 * script 逐字×2 → vue/compiler-sfc `Identifier 'ref' has already been declared`
 * → load-error → RUNTIME-004 BLOCK → 任务 failed。
 *
 * 判据：两份 script 块逐字相同 + template 块序列重复 ⇒ 折叠保留第一份。
 * 任何一份不同 ⇒ fail-open 不动（防误删合法多块/嵌套形态）。
 */
import { collapseDuplicatedSfcBlocks } from '../../roles/microcode/code-healer.js';

// sfc-semantics → acorn-optional-loader 用 import.meta（jest CJS 不支持）⇒ mock 成空实现
// （dedupeScriptImports 对 acorn 的用途是自由变量检测，缺失时降级跳过，不影响 import 去重）
jest.mock('../../utils/acorn-optional-loader.js', () => ({
  acornParser: null,
  acornWalker: null,
}));

// 复刻 3bece447 真实形态：双开 + script/style 重复（字节级同构）
const DOUBLED_SFC = `<template><template>
  <base-panel panelKey="default-panel">
    <div class="c-x-root">
      <ChartSection />
    </div>
  <div ref="chartRef" class="c-x-chart"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import ChartSection from './components/ChartSection.vue'
const activeMcTab = ref('')
const chartRef = ref(null); let chart = null
onMounted(() => { chart = 1 })
onUnmounted(() => { chart = null })
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style></template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import ChartSection from './components/ChartSection.vue'
const activeMcTab = ref('')
const chartRef = ref(null); let chart = null
onMounted(() => { chart = 1 })
onUnmounted(() => { chart = null })
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`;

describe('刀23 SFC 整份双写折叠守卫', () => {
  test('P1 双写形态命中并折叠为单份（保留第一份 template+script）', () => {
    const r = collapseDuplicatedSfcBlocks(DOUBLED_SFC);
    expect(r.changed).toBe(true);
    expect(r.reason).toBe('collapsed-duplicated-sfc');
    // 折叠后不再有重复声明形态
    expect((r.content.match(/<script setup>/g) || []).length).toBe(1);
    expect((r.content.match(/<template[\s>]/g) || []).length).toBe(1);
    expect((r.content.match(/<\/template>/g) || []).length).toBe(1);
    // 第一份内容保留
    expect(r.content).toContain('const activeMcTab = ref');
    expect(r.content).toContain("<base-panel");
    // 块内重复 import 一并消化（3bece447 实锤：单块内两次 import { ref } 仍崩）
    expect((r.content.match(/import \{ ref/g) || []).length).toBeLessThanOrEqual(1);
  });

  test('P2 幂等：折叠后再跑不再命中', () => {
    const once = collapseDuplicatedSfcBlocks(DOUBLED_SFC);
    const twice = collapseDuplicatedSfcBlocks(once.content);
    expect(twice.changed).toBe(false);
  });

  test('N1 两份 script 不同（合法多块/演化态）⇒ fail-open 不动', () => {
    // 双份完整 template+script 形态但两份 script 内容不同 ⇒ 判据要求逐字相同 ⇒ 不动
    const diff = `<template>
  <div>a</div>
</template>
<script setup>
const a = 1
</script>
<template>
  <div>a</div>
</template>
<script setup>
const a = 2
</script>`;
    const r = collapseDuplicatedSfcBlocks(diff);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('script-mismatch');
  });

  test('N2 正常单块 SFC（含 template 嵌套）⇒ 不动', () => {
    const normal = `<template>
  <div class="root">
    <div class="inner">
      <span>{{ title }}</span>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const title = ref('x')
</script>
<style lang="less" scoped>
.r { color: red; }
</style>`;
    const r = collapseDuplicatedSfcBlocks(normal);
    expect(r.changed).toBe(false);
  });

  test('N3 空串/无 template fail-open', () => {
    expect(collapseDuplicatedSfcBlocks('').changed).toBe(false);
    expect(collapseDuplicatedSfcBlocks('<div>x</div>').changed).toBe(false);
  });

  test('N4 只有 script 重复、template 单份（截断态）⇒ 不动（交由既有链路）', () => {
    const only = `<template>
  <div>a</div>
</template>
<script setup>
const a = 1
</script>
<script setup>
const a = 1
</script>`;
    const r = collapseDuplicatedSfcBlocks(only);
    // template 开标签数=1 不满足双写判据 ⇒ 不动
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('not-doubled');
  });
});
