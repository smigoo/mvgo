/**
 * 🛡️ ⑥-i v2（2026-11-10 · 用户验收裁决）：卡底「背景图」按 owner 精确挂载
 *
 * 用户裁决：三张统计卡**只用背景图**（bg-125/124/126.png），CSS 渐变+圆角是臆造。
 * 判据：卡组=几何（≥2 等高子项，祖先链登记）；bg 归属=mapping ownerSectionId + figmaPath `/bg`。
 */
import { collectCardGroups, collectCardBgByOwner, injectCardBgImages } from './card-background-truth.js';

const KID = (id: string, x: number) => ({
  id,
  name: id,
  type: 'FRAME',
  absoluteBoundingBox: { x, y: 984, width: 140, height: 74 },
  children: [],
});

const FIGMA = {
  document: {
    id: '2:7952',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 147 },
    children: [
      {
        id: '136:121',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 377, height: 86 },
        children: [
          {
            id: '2:8023',
            type: 'GROUP',
            absoluteBoundingBox: { x: 37, y: 984, width: 378, height: 74 },
            children: [KID('136:127', 274), KID('136:128', 166), KID('136:129', 37)],
          },
        ],
      },
    ],
  },
};

const MAPPING = [
  { resourceFile: '../resources/images/bg-125.png', figmaNodeId: '136:125', ownerSectionId: '136:129', figmaPath: 'slot/g/1/bg' },
  { resourceFile: '../resources/images/bg-124.png', figmaNodeId: '136:124', ownerSectionId: '136:128', figmaPath: 'slot/g/2/bg' },
  { resourceFile: '../resources/images/bg-126.png', figmaNodeId: '136:126', ownerSectionId: '136:127', figmaPath: 'slot/g/3/bg' },
  { resourceFile: '../resources/images/icon-8036.png', figmaNodeId: '2:8036', ownerSectionId: '136:129', figmaPath: 'slot/g/1/icon' },
];

const VUE = `<template>
  <div class="sec" data-section-id="136:121">
    <div class="card"><span>51</span></div>
    <div class="card"><span>2</span></div>
    <div class="card"><span>19</span></div>
  </div>
</template>
<script setup>const x = 1</script>
<style lang="less" scoped>
.card { min-width: 0; }
</style>
`;

describe('⑥-i v2 · 卡底背景图按 owner 精确挂载', () => {
  it('① 收集：卡组按 x 序 + bg 按 owner 各归其位（icon 不混入）', () => {
    const groups = collectCardGroups(FIGMA as any);
    expect(groups.get('136:121')).toEqual(['136:129', '136:128', '136:127']);
    const bg = collectCardBgByOwner(MAPPING as any);
    expect(bg.get('136:129')).toBe('../resources/images/bg-125.png');
    expect(bg.get('136:128')).toBe('../resources/images/bg-124.png');
    expect(bg.get('136:127')).toBe('../resources/images/bg-126.png');
    expect(String(bg.get('136:129'))).not.toContain('icon');
  });

  it('② 注入：三张卡按 DOM 序挂三张不同 bg（路径随文件深度归一）', () => {
    const r = injectCardBgImages([{ path: 'package/components/S.vue', content: VUE }], {
      cardGroups: collectCardGroups(FIGMA as any),
      bgByOwner: collectCardBgByOwner(MAPPING as any),
    });
    expect(r.changed).toBe(true);
    expect(r.stats.mounted).toBe(3);
    const c = r.contents[0].content;
    expect(c).toContain("background-image:url('../../resources/images/bg-125.png')");
    expect(c).toContain("background-image:url('../../resources/images/bg-124.png')");
    expect(c).toContain("background-image:url('../../resources/images/bg-126.png')");
  });

  it('③ 清除历史 ⑥-i 渐变注入块', () => {
    const legacy = VUE.replace(
      '</style>',
      '/* 卡底渐变真值（⑥-i 注入） */\n.card {\n  background: linear-gradient(90deg, #1f9eff 0%, #0091ff 92%);\n  border-radius: 1.76px;\n}\n</style>',
    );
    const r = injectCardBgImages([{ path: 'a.vue', content: legacy }], {
      cardGroups: collectCardGroups(FIGMA as any),
      bgByOwner: collectCardBgByOwner(MAPPING as any),
    });
    const c = r.contents[0].content;
    expect(c).not.toContain('卡底渐变真值');
    expect(c).not.toContain('linear-gradient(90deg, #1f9eff');
  });

  it('④ 幂等：已挂 background-image 的卡不重复注入', () => {
    const once = injectCardBgImages([{ path: 'a.vue', content: VUE }], {
      cardGroups: collectCardGroups(FIGMA as any),
      bgByOwner: collectCardBgByOwner(MAPPING as any),
    });
    const twice = injectCardBgImages([{ path: 'a.vue', content: once.contents[0].content }], {
      cardGroups: collectCardGroups(FIGMA as any),
      bgByOwner: collectCardBgByOwner(MAPPING as any),
    });
    expect(twice.stats.mounted).toBe(0);
  });
});
