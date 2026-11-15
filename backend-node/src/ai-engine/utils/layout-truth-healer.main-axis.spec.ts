/**
 * 刀 56 / P2-3：容器主轴（flex-direction）真值归一回归。
 *
 * 真机实锤 mc-max-1794462282698-2c855ae0（节点 38:3134 合作厂商弹窗）：
 *   分组容器 `c-component-group-2136638434` 上同时存在两条矛盾声明 ——
 *     inline `style="display:flex;flex-direction:row"`  ← LLM 写的
 *     scoped class `{ flex-direction: column }`         ← 按 Figma 生成的
 *   inline 优先 ⇒ 图标/标题/4 个行容器挤成一行，文本互相压字
 *   ⇒ RUNTIME-016（12 对 text-overlap）+ VISUAL-002 阻断，用户看到「第一 section 布局错误」。
 *
 * 本 spec 锁五件事：
 *   ① 阳性：inline row 与 class column 冲突，真值（子元素 4 个 y 带）= column ⇒ 改写 inline；
 *   ② 阳性：只有 class 声明且与真值不符 ⇒ 注入 inline 真值（inline 必胜）；
 *   ③ 阴性：inline/class 与真值一致 ⇒ 一字不改（幂等）；
 *   ④ 阴性：类名数字在 Figma 无唯一命中 / 真值判不出 ⇒ 不动（fail-open）；
 *   ⑤ 判据单一来源：detect 修前 1 条、修后 0 条。
 */

import {
  enforceContainerMainAxisTruth,
  detectContainerMainAxisConflicts,
} from './layout-truth-healer';

const SID = '38:3206';

/** 分组容器 Group 2136638434：icon+标题同带，下面 3 个行容器各自一带 ⇒ 4 个 y 带 ⇒ column。 */
function figmaGroupRoot(): any {
  const box = (x: number, y: number, w: number, h: number) => ({
    x, y, width: w, height: h,
  });
  return {
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      name: 'Document',
      children: [
        {
          id: SID,
          type: 'GROUP',
          name: 'Group 2136638434',
          absoluteBoundingBox: box(0, 0, 564, 300),
          children: [
            // 背景矩形：必须被排除，否则铺满整框会把所有行并成一个 y 带
            { id: '38:3207', type: 'RECTANGLE', name: 'Rectangle 1', absoluteBoundingBox: box(0, 0, 564, 300) },
            { id: '38:3208', type: 'FRAME', name: 'icon-普通厂商', absoluteBoundingBox: box(12, 12, 16, 16) },
            { id: '38:3210', type: 'TEXT', name: '普通厂商', characters: '普通厂商', absoluteBoundingBox: box(40, 12, 80, 20) },
            { id: '38:3211', type: 'FRAME', name: 'Frame 2136639905', absoluteBoundingBox: box(12, 44, 540, 24) },
            { id: '38:3224', type: 'FRAME', name: 'Frame 2136639906', absoluteBoundingBox: box(12, 76, 540, 24) },
            { id: '38:3237', type: 'FRAME', name: 'Frame 2136639907', absoluteBoundingBox: box(12, 108, 540, 24) },
          ],
        },
      ],
    },
  };
}

function vue(groupOpenTag: string, styleBody: string) {
  return `<template>
  <div class="c-component-content-section5-root" data-section-id="${SID}">
    ${groupOpenTag}
      <div class="c-component-group-title">普通厂商</div>
      <div class="c-component-frame-2136639905"><span>特来电</span></div>
    </div>
  </div>
</template>

<script setup>
const icon = ''
</script>

<style lang="less" scoped>
.c-component-content-section5-root { display: flex; flex-direction: column; }

${styleBody}
</style>`;
}

describe('刀 56 容器主轴真值归一', () => {
  it('阳性①：inline row 与 class column 冲突 ⇒ 按真值改写 inline（保留其它声明）', () => {
    const file = vue(
      '<div style="display:flex;flex-direction:row;align-items:center" class="c-component-group-2136638434">',
      '.c-component-group-2136638434 { display: flex; flex-direction: column; gap: 8px; }',
    );
    const files = { 'package/components/ContentSection5.vue': file };
    const r = enforceContainerMainAxisTruth(files, { figmaRoot: figmaGroupRoot() });
    const out = r.files['package/components/ContentSection5.vue'];
    expect(out).toContain('style="display:flex;flex-direction:column;align-items:center"');
    expect(out).not.toContain('flex-direction:row;align-items:center');
    // 编辑只动属性值：长度不缩短、标签结构不变
    expect(out.length).toBeGreaterThanOrEqual(file.length);
    expect((out.match(/<div\b/g) || []).length).toBe((file.match(/<div\b/g) || []).length);
    expect(r.stats.fixed).toBe(1);
    expect(r.stats.conflicts).toBe(1);
  });

  it('阳性②：仅 class 声明且与真值不符 ⇒ 注入 inline 真值', () => {
    const file = vue(
      '<div class="c-component-group-2136638434">',
      '.c-component-group-2136638434 { display: flex; flex-direction: row; }',
    );
    const r = enforceContainerMainAxisTruth(
      { 'package/components/ContentSection5.vue': file },
      { figmaRoot: figmaGroupRoot() },
    );
    const out = r.files['package/components/ContentSection5.vue'];
    // 注入位置在标签名之后（style 属性在各属性之前），断言只看「同一元素上声明了 column」
    expect(out).toContain('style="display:flex;flex-direction:column" class="c-component-group-2136638434"');
    expect(r.stats.mismatch).toBe(1);
  });

  it('阴性③：inline 与真值一致 ⇒ 一字不改', () => {
    const file = vue(
      '<div style="display:flex;flex-direction:column" class="c-component-group-2136638434">',
      '.c-component-group-2136638434 { flex-direction: column; }',
    );
    const r = enforceContainerMainAxisTruth(
      { 'package/components/ContentSection5.vue': file },
      { figmaRoot: figmaGroupRoot() },
    );
    expect(r.files['package/components/ContentSection5.vue']).toBe(file);
    expect(r.changes).toHaveLength(0);
  });

  it('阴性④：类名数字在 Figma 无唯一命中 / 真值判不出 ⇒ 不动', () => {
    const file = vue(
      '<div style="display:flex;flex-direction:row" class="c-component-group-9999999999">',
      '.c-component-group-9999999999 { flex-direction: column; }',
    );
    const r = enforceContainerMainAxisTruth(
      { 'package/components/ContentSection5.vue': file },
      { figmaRoot: figmaGroupRoot() },
    );
    expect(r.files['package/components/ContentSection5.vue']).toBe(file);

    // 真值判不出：节点只有一个有效子元素
    const root: any = figmaGroupRoot();
    root.document.children[0].children = [root.document.children[0].children[1]];
    const r2 = enforceContainerMainAxisTruth(
      { 'package/components/ContentSection5.vue': file },
      { figmaRoot: root },
    );
    expect(r2.files['package/components/ContentSection5.vue']).toBe(file);
  });

  it('阴性⑤：无 figmaRoot ⇒ 整刀 fail-open', () => {
    const file = vue(
      '<div style="display:flex;flex-direction:row" class="c-component-group-2136638434">',
      '.c-component-group-2136638434 { flex-direction: column; }',
    );
    const r = enforceContainerMainAxisTruth({ 'a.vue': file }, {});
    expect(r.files['a.vue']).toBe(file);
    expect(r.changes).toHaveLength(0);
  });

  it('同名复用节点：主轴一致即采用（真机 Frame 2136639905 复用 11 处），两向并存 ⇒ fail-open', () => {
    const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });
    const mk = (id: string, mode: 'col' | 'row') => ({
      id,
      type: 'FRAME',
      name: 'Frame 2136639999',
      absoluteBoundingBox: box(0, 0, 564, 200),
      children:
        mode === 'col'
          ? [
              { id: `${id}a`, type: 'FRAME', name: 'a', absoluteBoundingBox: box(12, 12, 16, 16) },
              { id: `${id}b`, type: 'FRAME', name: 'b', absoluteBoundingBox: box(12, 44, 540, 24) },
              { id: `${id}c`, type: 'FRAME', name: 'c', absoluteBoundingBox: box(12, 76, 540, 24) },
            ]
          : [
              { id: `${id}a`, type: 'FRAME', name: 'a', absoluteBoundingBox: box(12, 12, 16, 16) },
              { id: `${id}b`, type: 'FRAME', name: 'b', absoluteBoundingBox: box(40, 12, 240, 24) },
              { id: `${id}c`, type: 'FRAME', name: 'c', absoluteBoundingBox: box(300, 12, 240, 24) },
            ],
    });
    const file = `<template>
  <div class="c-component-root" data-section-id="1:1">
    <div style="display:flex;flex-direction:row" class="c-component-group-2136639999">
      <span>甲</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
.c-component-root { display: flex; flex-direction: column; }
</style>`;
    const consistent = {
      document: { id: 'r', type: 'DOCUMENT', name: 'doc', children: [mk('1:1', 'col'), mk('2:2', 'col')] },
    };
    const r1 = enforceContainerMainAxisTruth({ 'a.vue': file }, { figmaRoot: consistent });
    expect(r1.files['a.vue']).toContain('flex-direction:column');

    const conflicting = {
      document: { id: 'r', type: 'DOCUMENT', name: 'doc', children: [mk('1:1', 'col'), mk('2:2', 'row')] },
    };
    const r2 = enforceContainerMainAxisTruth({ 'a.vue': file }, { figmaRoot: conflicting });
    expect(r2.files['a.vue']).toBe(file);
    expect(r2.stats.ambiguous).toBeGreaterThan(0);
  });

  it('判据单一来源：detect 修前 1 条、修后 0 条', () => {
    const file = vue(
      '<div style="display:flex;flex-direction:row" class="c-component-group-2136638434">',
      '.c-component-group-2136638434 { flex-direction: column; }',
    );
    const files = { 'package/components/ContentSection5.vue': file };
    const before = detectContainerMainAxisConflicts(files, { figmaRoot: figmaGroupRoot() });
    expect(before.hits).toHaveLength(1);
    expect(before.hits[0]).toMatchObject({ effective: 'row', truth: 'column', nodeId: SID });

    const fixed = enforceContainerMainAxisTruth(files, { figmaRoot: figmaGroupRoot() });
    const after = detectContainerMainAxisConflicts(fixed.files, { figmaRoot: figmaGroupRoot() });
    expect(after.hits).toHaveLength(0);
  });

  /**
   * 2026-11-15（mc-max-1794749284344-c5e0aadc 实锤）：
   *   `GROUP 'header'` 2:8419 真值 = 横向一行（标题 + 三组「标签+数值」，y 441~445），
   *   组内挂了一个 8×8 装饰圆点（y=463，挂在文本基线下方）⇒ 旧实现把它算成独立 y 带
   *   （bands=2）⇒ 判 column ⇒ header 被写成竖排（30px 高塞 42px 内容，溢出压住 switch 条）。
   *   判据：装饰叶（子树无 TEXT 且面积占比 <5%）不参与主轴聚类 —— 无量纲、命名无关。
   */
  it('阳性④：header 行内 8×8 装饰圆点不得把 row 带成 column', () => {
    const headerRoot = () => ({
      document: {
        id: '0:0',
        type: 'DOCUMENT',
        name: 'Document',
        children: [
          {
            id: SID,
            type: 'GROUP',
            name: 'header',
            absoluteBoundingBox: { x: 0, y: 0, width: 388, height: 30.09 },
            children: [
              { id: 'h-t', type: 'TEXT', name: '设备监测', characters: '设备监测', absoluteBoundingBox: { x: 0, y: 2, width: 64, height: 19 } },
              { id: 'h-n', type: 'TEXT', name: 'note', characters: '*数据实时更新', absoluteBoundingBox: { x: 287, y: 0, width: 91, height: 21 } },
              { id: 'h-s1', type: 'FRAME', name: 'stat1', absoluteBoundingBox: { x: 100, y: 1, width: 80, height: 23 }, children: [
                { id: 'h-s1t', type: 'TEXT', name: 'label', characters: '设备类型', absoluteBoundingBox: { x: 100, y: 1, width: 60, height: 20 } },
              ] },
              { id: 'h-s2', type: 'FRAME', name: 'stat2', absoluteBoundingBox: { x: 186, y: 1, width: 100, height: 23 }, children: [
                { id: 'h-s2t', type: 'TEXT', name: 'label', characters: '设备总数', absoluteBoundingBox: { x: 186, y: 1, width: 60, height: 20 } },
              ] },
              // 装饰圆点：8×8 / (388×30.09) = 0.55% ⇒ 必须豁免
              { id: 'h-g', type: 'FRAME', name: 'g', absoluteBoundingBox: { x: 1, y: 22, width: 8, height: 8 } },
            ],
          },
        ],
      },
    });
    const file = `<template>
  <div class="c-device-monitor-header" data-section-id="${SID}" style="display:flex;flex-direction:column;align-items:center">
    <span>设备监测</span>
  </div>
</template>

<style lang="less" scoped>
.c-device-monitor-header { display: flex; }
</style>`;
    const r = enforceContainerMainAxisTruth(
      { 'package/components/StatsSection.vue': file },
      { figmaRoot: headerRoot() },
    );
    const out = r.files['package/components/StatsSection.vue'];
    expect(out).toContain('flex-direction:row');
    expect(out).not.toContain('flex-direction:column;align-items:center');
    expect(r.stats.fixed).toBe(1);
  });

  it('阴性⑤：真列布局（每行都有文本）仍判 column —— 装饰豁免不误伤', () => {
    const colRoot = () => ({
      document: {
        id: '0:0',
        type: 'DOCUMENT',
        name: 'Document',
        children: [
          {
            id: SID,
            type: 'GROUP',
            name: 'col',
            absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 },
            children: [
              { id: 'c1', type: 'FRAME', name: 'r1', absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 40 }, children: [
                { id: 'c1t', type: 'TEXT', name: 't', characters: '第一行', absoluteBoundingBox: { x: 8, y: 8, width: 60, height: 20 } },
              ] },
              { id: 'c2', type: 'FRAME', name: 'r2', absoluteBoundingBox: { x: 0, y: 60, width: 300, height: 40 }, children: [
                { id: 'c2t', type: 'TEXT', name: 't', characters: '第二行', absoluteBoundingBox: { x: 8, y: 68, width: 60, height: 20 } },
              ] },
            ],
          },
        ],
      },
    });
    const file = `<template>
  <div class="c-device-monitor-col" data-section-id="${SID}" style="display:flex;flex-direction:row">
    <span>第一行</span>
  </div>
</template>

<style lang="less" scoped>
.c-device-monitor-col { display: flex; }
</style>`;
    const r = enforceContainerMainAxisTruth(
      { 'package/components/ContentSection.vue': file },
      { figmaRoot: colRoot() },
    );
    expect(r.files['package/components/ContentSection.vue']).toContain('flex-direction:column');
  });
});
