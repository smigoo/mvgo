/**
 * S4（2026-11-16）：F1 契约让位 —— 根容器 inline 已声明尺寸时，本归一器不得把它抹成 100%。
 *
 * 病灶（真机 8cc9f6dd / f5c9792c 双证）：
 *   产生处（code-generator 的 rootSizeStyle）在根容器 inline 写 `width:420px;height:425px`
 *   —— 组件自身尺寸的唯一真相，免疫下游改写。旧行为下本归一器把 class 侧一律写成
 *   `height:100%`（8abf9789 产物实锤），而 inline 侧又被 C 归一剥掉（f5c9792c 产物实锤）
 *   ⇒ 两个写者各自「以为自己是对的」，最终真值两边都没有。
 */
import { normalizeRootContainerLayout } from './root-container-normalizer.js';

const INDEX_PX = `<template>
  <div class="c-x-slot-con" style="display:flex;flex-direction:column;min-height:0;width:420px;height:425px;margin-left:auto;margin-right:auto;">
    <StatsSection class="c-x-sech-1" />
  </div>
</template>

<style lang="less" scoped>
/* mvgo-layout-truth */
.c-x-sech-1 { flex: 0 1 30px !important; min-height: 0; }
</style>`;

const INDEX_MARKED = `<template>
  <div class="c-x-slot-con" data-mvgo-geom="root" style="display:flex;flex-direction:column;height:100%;">
    <StatsSection class="c-x-sech-1" />
  </div>
</template>

<style lang="less" scoped>
/* mvgo-layout-truth */
.c-x-sech-1 { flex: 0 1 30px !important; min-height: 0; }
</style>`;

const INDEX_NO_SIZE = `<template>
  <div class="c-x-slot-con" style="display:flex;flex-direction:column;min-height:0;">
    <StatsSection class="c-x-sech-1" />
  </div>
</template>

<style lang="less" scoped>
/* mvgo-layout-truth */
.c-x-sech-1 { flex: 0 1 30px !important; min-height: 0; }
</style>`;

const COMMON_LESS = `.c-x-slot-con {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
}
`;

function mkFiles(indexVue: string) {
  return [
    { path: 'package/index.vue', content: indexVue },
    { path: 'resources/styles/common.less', content: COMMON_LESS },
  ];
}

describe('S4 · 内容根容器归一让位（inline 尺寸真值优先）', () => {
  test('inline 已写 width/height px ⇒ 跳过归一，不抹成 100%', () => {
    const { fixes } = normalizeRootContainerLayout(mkFiles(INDEX_PX), {});
    expect(fixes.some((f) => f.action === 'skipped-inline-truth')).toBe(true);
    // common.less 未被改写（无 height:100% 注入）
    const out = normalizeRootContainerLayout(mkFiles(INDEX_PX), {});
    const less = out.files.find((f) => f.path.endsWith('common.less'))!.content;
    expect(less).toBe(COMMON_LESS);
  });

  test('已带 data-mvgo-geom="root" 标记 ⇒ 同样让位', () => {
    const { fixes } = normalizeRootContainerLayout(mkFiles(INDEX_MARKED), {});
    expect(fixes.some((f) => f.action === 'skipped-inline-truth')).toBe(true);
  });

  test('阴性对照：inline 无尺寸声明 ⇒ 照旧归一（不因新增守卫而失效）', () => {
    const { fixes, files } = normalizeRootContainerLayout(mkFiles(INDEX_NO_SIZE), {});
    expect(fixes.some((f) => f.action === 'skipped-inline-truth')).toBe(false);
    const less = files.find((f) => f.path.endsWith('common.less'))!.content;
    expect(less).toContain('height: 100%');
  });
});
