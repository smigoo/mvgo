/**
 * 🛡️ 刀 25/26（2026-10-12 · mc-max-1791779417789-cba8407d 实锤）—
 *   style-fragment-healer 单测。
 *
 * 阳性对照 = 本任务产物真实损坏片段：
 *   ① common.less `.c-cba840-form` 块的连续 `display: flex;}` 残片（容器被提前闭合
 *      误得 display:flex → 表单横向排列）；
 *   ② ContentSection.vue `<script>` 的独行逗号残片（vue/compiler-sfc Unexpected token）。
 * 阴性对照 = 合法压缩 CSS / 含字符串逗号的 script，必须零改动。
 */
import {
  normalizeDuplicatedCompressedClosers,
  stripLoneCommaLines,
  healStyleFragments,
  normalizeVForRowListDirection,
} from './style-fragment-healer.js';

describe('刀 25 normalizeDuplicatedCompressedClosers（LESS 压缩残片重复闭块）', () => {
  test('阳性：mc-max-1791779417789 真实残片 → 声明归最内层，外层不再误得 display:flex', () => {
    const corrupted = `.c-cba840-form {
  width: 100%;

  :deep(.ant-form-item-control) {
    flex: 1 1 auto;
    min-width: 0;
  display: flex;}
  display: flex;}

.c-cba840-form-item {
  width: 100%;
}
`;
    const fixed = normalizeDuplicatedCompressedClosers(corrupted);
    expect(fixed).not.toBe(corrupted);
    // 残片 A 展开：声明留在 :deep(.ant-form-item-control) 内
    expect(fixed).toContain('    min-width: 0;\n  display: flex;\n  }');
    // 残片 B 退化为纯闭括号（闭合外层 .c-cba840-form，外层不再误得 display:flex）
    expect(fixed).toContain('  display: flex;\n  }\n}\n\n.c-cba840-form-item');
    // 括号计数不变
    const open = (fixed.match(/\{/g) || []).length;
    const close = (fixed.match(/\}/g) || []).length;
    expect(close).toBe(open);
  });

  test('幂等：修复后二次调用零改动', () => {
    const corrupted = '.a {\n  min-width: 0;\n  display: flex;}\n  display: flex;}\n';
    const once = normalizeDuplicatedCompressedClosers(corrupted);
    const twice = normalizeDuplicatedCompressedClosers(once);
    expect(twice).toBe(once);
  });

  test('阴性：非相邻的相同压缩残片（不同规则）零改动', () => {
    const legit = '.m1 {\n  display: flex;}\n.m2 {\n  display: flex;}\n';
    expect(normalizeDuplicatedCompressedClosers(legit)).toBe(legit);
  });

  test('阴性：单行压缩写法（无重复）零改动', () => {
    const legit = '.a {\n  color: red;\n  display: flex;}\n';
    expect(normalizeDuplicatedCompressedClosers(legit)).toBe(legit);
  });

  test('阴性：普通规范 CSS 零改动', () => {
    const clean = '.a {\n  display: flex;\n  flex-direction: column;\n}\n';
    expect(normalizeDuplicatedCompressedClosers(clean)).toBe(clean);
  });
});

describe('刀 26 stripLoneCommaLines（script 独行逗号残片）', () => {
  test('阳性：mc-max-1791779417789 真实残片（对象字面量独行逗号）→ 删除', () => {
    const corrupted = `<template><div /></template>
<script setup>
const formState = reactive({
  productCode: '',
  productName: '',
  productModel: '',
  ,
  shadowTime: '5',
})
</script>
`;
    const fixed = stripLoneCommaLines(corrupted);
    expect(fixed).not.toBe(corrupted);
    expect(fixed).toContain("productModel: '',\n  shadowTime: '5',");
    expect(fixed).not.toMatch(/^\s*,\s*$/m);
  });

  test('阴性：字符串形式的逗号行（\',\'）不命中', () => {
    const legit = `<script setup>
const arr = ['a',
',',
'b']
</script>
`;
    expect(stripLoneCommaLines(legit)).toBe(legit);
  });

  test('阴性：前一行为非逗号结尾时不删（保守）', () => {
    const legit = `<script setup>
const a = 1
,
const b = 2
</script>
`;
    // 上一行不以 , 结尾 ⇒ 不动（此类真语法错误交给下游编译门禁）
    expect(stripLoneCommaLines(legit)).toBe(legit);
  });

  test('幂等：修复后二次调用零改动', () => {
    const corrupted = `<script setup>
const o = {
  a: '',
  ,
  b: '',
}
</script>
`;
    const once = stripLoneCommaLines(corrupted);
    expect(stripLoneCommaLines(once)).toBe(once);
  });
});

describe('刀 27 normalizeVForRowListDirection（v-for 列表容器横向纠偏）', () => {
  // 阳性对照 = mc-1791783806265-5831962c 实锤形态：v-for 元素是满宽卡片，父容器被写成 row
  const vue = `<template>
  <div class="c-x-list" v-bind="$attrs">
    <div v-for="(node, index) in nodeList" :key="index" class="c-x-card">
      <span class="c-x-name">{{ node.name }}</span>
    </div>
  </div>
</template>
<script setup>
const nodeList = []
</script>
`;
  const less = `.c-x-list {
  height: 100%;

  display: flex;
  flex-direction: row;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  align-items: center;
  justify-content: space-between;}

.c-x-card {
  position: relative;
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 72px;
}
`;

  test('阳性：v-for 容器 row + 子卡满宽 → column + space-between 归 flex-start', () => {
    const r = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/common.less': less,
    });
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ file: 'package/resources/styles/common.less', cls: 'c-x-list' });
    const css = r.files['package/resources/styles/common.less'];
    expect(css).toMatch(/\.c-x-list \{[\s\S]*?flex-direction: column/);
    expect(css).toMatch(/\.c-x-list \{[\s\S]*?justify-content: flex-start/);
    expect(css).toMatch(/\.c-x-list \{[\s\S]*?align-items: stretch/);
    // 子卡规则不受影响
    expect(css).toMatch(/\.c-x-card \{[\s\S]*?flex-direction: row/);
  });

  test('幂等：修复后二次调用零改动', () => {
    const once = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/common.less': less,
    });
    const twice = normalizeVForRowListDirection(once.files);
    expect(twice.changes).toHaveLength(0);
  });

  test('阴性：v-for 容器已是 column 零改动', () => {
    const colLess = less.replace('flex-direction: row', 'flex-direction: column');
    const r = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/common.less': colLess,
    });
    expect(r.changes).toHaveLength(0);
  });

  test('阴性：row 但子项非满宽（横滑标签列表等合法场景）零改动', () => {
    const narrowLess = less.replace('width: 100%;\n  height: 72px;', 'width: 120px;\n  height: 40px;');
    const r = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/common.less': narrowLess,
    });
    expect(r.changes).toHaveLength(0);
  });

  test('阴性：无 v-for 的普通容器 row 零改动', () => {
    const noVFor = vue.replace(/\bv-for="[^"]*"\s*/, '');
    const r = normalizeVForRowListDirection({
      'package/index.vue': noVFor,
      'package/resources/styles/common.less': less,
    });
    expect(r.changes).toHaveLength(0);
  });

  // 2026-10-13 · mc-1791885185329-7e7fce94 实锤：容器块嵌 &::-webkit-scrollbar 装饰，
  // 旧「含嵌套一律跳过」策略整块失明 → 掩码判据下应命中。
  const decoratedLess = `.c-x-list {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #123;
    border-radius: 3px;
  }
}

.c-x-card {
  display: flex;
  flex-direction: row;
  width: 100%;
  min-height: 72px;
}
`;

  test('阳性：容器嵌 scrollbar 装饰子规则仍命中（掩码判据）', () => {
    const r = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/common.less': decoratedLess,
    });
    expect(r.changes).toHaveLength(1);
    const css = r.files['package/resources/styles/common.less'];
    expect(css).toMatch(/\.c-x-list \{[\s\S]*?flex-direction: column/);
    // 装饰子规则原样保留
    expect(css).toMatch(/&::-webkit-scrollbar \{\n    width: 6px;\n  \}/);
    expect(css).toMatch(/&::-webkit-scrollbar-thumb \{[\s\S]*?background: #123/);
  });

  test('幂等：装饰容器修复后二次调用零改动', () => {
    const once = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/common.less': decoratedLess,
    });
    const twice = normalizeVForRowListDirection(once.files);
    expect(twice.changes).toHaveLength(0);
  });

  test('阴性：嵌套子规则 width:100% 不算满宽（c-8bb771-tab 误伤判据化）', () => {
    const nestedWidthLess = `.c-x-list {
  display: flex;
  flex-direction: row;
  width: 100%;
}

.c-x-card {
  display: flex;
  flex-direction: row;

  .c-x-card-inner {
    width: 100%;
  }
}
`;
    const r = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/common.less': nestedWidthLess,
    });
    expect(r.changes).toHaveLength(0);
  });

  // 2026-10-14 · mc-max-1791942831818-0397a327 实锤：cssPaths 首个文件常是只含
  // @import 的 index.less，旧 `break` 在此直接杀掉整条扫描 → 判据文件顺序依赖失明。
  test('阳性：首个 css 无子项规则时继续看后续 css（break 疤疾回归）', () => {
    const r = normalizeVForRowListDirection({
      'package/index.vue': vue,
      'package/resources/styles/index.less': '@import "./common.less";\n@fontSize: var(--fontSize);\n',
      'package/resources/styles/common.less': less,
    });
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ file: 'package/resources/styles/common.less', cls: 'c-x-list' });
  });
});

describe('healStyleFragments 组合入口（按扩展名分流）', () => {
  test('.less 全文走刀 25', () => {
    const corrupted = '.form {\n  min-width: 0;\n  display: flex;}\n  display: flex;}\n';
    const r = healStyleFragments('package/resources/styles/common.less', corrupted);
    expect(r.lessFixed).toBe(true);
    expect(r.commaFixed).toBe(false);
    expect(r.content).toContain('  display: flex;\n  }\n}');
  });

  test('.vue 的 style 块走刀 25、script 块走刀 26', () => {
    const corrupted = `<template><div class="x" /></template>
<script setup>
const o = {
  a: '',
  ,
}
</script>
<style lang="less" scoped>
.x {
  min-width: 0;
  display: flex;}
  display: flex;}
</style>
`;
    const r = healStyleFragments('package/index.vue', corrupted);
    expect(r.lessFixed).toBe(true);
    expect(r.commaFixed).toBe(true);
    expect(r.content).not.toMatch(/^\s*,\s*$/m);
    expect(r.content).toContain('  display: flex;\n  }\n}\n</style>');
  });

  test('干净文件零改动且引用相等', () => {
    const clean = '.a {\n  display: flex;\n}\n';
    const r = healStyleFragments('package/resources/styles/common.less', clean);
    expect(r.content).toBe(clean);
    expect(r.lessFixed).toBe(false);
  });
});
