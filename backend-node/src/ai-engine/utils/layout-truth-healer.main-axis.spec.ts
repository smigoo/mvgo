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
});
