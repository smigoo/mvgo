/**
 * 🛡️ #719-C（2026-09-26）：`buildLayoutMappingFromSectionIds`
 * 用产物**自带的 `data-section-id`** 建「真实 class → 布局事实」映射，
 * 取代按 figma 节点名猜 + `LAYOUT_SUFFIX_VARIANTS` 猜后缀。
 */
import { buildLayoutMappingFromSectionIds } from '../layout-facts-injector.js';

const FACTS = {
  '89:41': { display: 'flex', flexDirection: 'column', source: 'figma-layoutMode', confidence: 'high' },
  '89:42': { display: 'flex', flexDirection: 'row', source: 'geometric-inference', confidence: 'low' },
  '2:8437': { display: 'grid', gridColumns: 3, source: 'geometric-grid-inference', confidence: 'high' },
};

const vue = (s: string) => ({ 'package/index.vue': s });

describe('#719-C buildLayoutMappingFromSectionIds', () => {
  it('真机形态（class 在 data-section-id 之前）→ 精确命中容器类名', () => {
    const files = vue(
      `<template>\n  <div class="c-env-monitor-con-con" data-section-id="89:41" style="display:flex">\n` +
        `    <div class="c-env-monitor-sub-t-con" data-section-id="89:42"></div>\n  </div>\n</template>`,
    );
    const r = buildLayoutMappingFromSectionIds(files, FACTS);
    expect(r['.c-env-monitor-con-con']).toMatchObject({ display: 'flex', flexDirection: 'column' });
    expect(r['.c-env-monitor-sub-t-con']).toMatchObject({ display: 'flex', flexDirection: 'row' });
  });

  it('属性顺序反转（data-section-id 在前）→ 仍命中（不假设顺序）', () => {
    const files = vue(`<div data-section-id="89:41" class="c-x-con" style="display:flex"></div>`);
    const r = buildLayoutMappingFromSectionIds(files, FACTS);
    expect(r['.c-x-con']).toMatchObject({ display: 'flex', flexDirection: 'column' });
  });

  it('网格事实透传 gridColumns（供 grid 注入分支使用）', () => {
    const files = vue(`<div class="c-x-cons" data-section-id="2:8437"></div>`);
    const r = buildLayoutMappingFromSectionIds(files, FACTS);
    expect(r['.c-x-cons']).toMatchObject({ display: 'grid', gridColumns: 3 });
  });

  it('该节点无布局事实 → 不建映射；无 data-section-id → 不建映射；非 .vue 跳过', () => {
    const files = vue(
      `<div class="c-x-unknown" data-section-id="9:999"></div>\n<div class="c-x-noid"></div>`,
    );
    files['resources/styles/common.less'] = '.c-x-leak { display: flex; }';
    const r = buildLayoutMappingFromSectionIds(files as any, FACTS);
    expect(Object.keys(r)).toEqual([]);
  });

  it('同一标签多个 class → 每个 class 都建映射（幂等/纯函数）', () => {
    const src = `<div class="c-x-con c-mc-max-123-con" data-section-id="89:41"></div>`;
    const files = vue(src);
    const r = buildLayoutMappingFromSectionIds(files, FACTS);
    expect(r['.c-x-con']).toBeDefined();
    expect(r['.c-mc-max-123-con']).toBeDefined();
    expect(files['package/index.vue']).toBe(src); // 未改入参
  });
});
