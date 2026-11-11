/**
 * 🛡️ S3-c 卡底背景**就地纠正**（2026-11-11 · a5df24e9 实锤）
 *
 * 产物把三张卡的真值背景全塞进第一张卡子树（card / card-icon / img 各挂一张），第三张的 bg
 * 还挂到区块根容器（`background-size:100% 100%` ⇒ 整块拉伸铺满）。E3-v4 判得对但**判而不修**，
 * 旧 S3 的「注入独立 div」路线已实锤破坏布局 ⇒ S3-c 改为只改既有元素：
 *   ① 用 `collectCardGroups`（几何：≥2 等高子项按 x 排序）拿 owner 序；
 *   ② 用「class 重复次数恰等于 owner 数」定位卡元素（DOM 序即 x 序）；
 *   ③ 给第 i 张卡补 `data-section-id=owner[i]`，把该卡 bg 以 **import 变量** 绑定挂上（先剥静态错挂，防 E3-v2）；
 *   ④ 清掉同一资源在其它元素上的错挂。
 * 判据数据全部来自既有单一事实源（mapping + Figma 几何），无任务 id / 组件名 / 尺寸枚举。
 */
import { correctCardBgOwnership } from './code-fix-rules.js';
import { runAcceptanceChecks } from '../utils/component-acceptance';

const FIGMA = {
  document: {
    id: '0:0',
    type: 'DOCUMENT',
    children: [
      {
        id: '136:121',
        name: 'slot',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 900, width: 426, height: 200 },
        children: [
          {
            id: '2:8023',
            name: 'g',
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 984, width: 426, height: 74 },
            children: [
              { id: '136:129', type: 'FRAME', absoluteBoundingBox: { x: 37, y: 984, width: 140, height: 74 }, children: [] },
              { id: '136:128', type: 'FRAME', absoluteBoundingBox: { x: 166, y: 984, width: 120, height: 74 }, children: [] },
              { id: '136:127', type: 'FRAME', absoluteBoundingBox: { x: 274, y: 984, width: 141, height: 74 }, children: [] },
            ],
          },
        ],
      },
    ],
  },
};

const MAPPING = [
  { resourceFile: '../resources/images/bg-125.png', ownerSectionId: '136:129', targetDomSelector: '[data-section-id="136:129"]', figmaPath: 'slot/g/1/bg', previewAnalysisRole: 'bg', downloadStatus: 'success' },
  { resourceFile: '../resources/images/bg-124.png', ownerSectionId: '136:128', targetDomSelector: '[data-section-id="136:128"]', figmaPath: 'slot/g/2/bg', previewAnalysisRole: 'bg', downloadStatus: 'success' },
  { resourceFile: '../resources/images/bg-126.png', ownerSectionId: '136:127', targetDomSelector: '[data-section-id="136:127"]', figmaPath: 'slot/g/3/bg', previewAnalysisRole: 'bg', downloadStatus: 'success' },
];

/** a5df24e9 逐字形态：根挂 bg3，第一张卡子树里 card/icon/img 各挂一张 */
const VUE = `<template>
  <div class="sec" data-section-id="136:121" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%' }">
    <div class="x-card x-card-1" style="background-image:url('../../resources/images/bg-125.png');background-size:100% 100%;">
      <div class="x-card-icon" style="background-image:url('../../resources/images/bg-124.png');background-size:100% 100%;">
        <img class="x-card-img" style="background-image:url('../../resources/images/bg-126.png');background-size:100% 100%;" />
      </div>
    </div>
    <div class="x-card x-card-2"><span>2</span></div>
    <div class="x-card x-card-3"><span>19</span></div>
  </div>
</template>
<script setup>
import bg3 from '../../resources/images/bg-126.png'
import bg1 from '../../resources/images/bg-125.png'
import bg2 from '../../resources/images/bg-124.png'
</script>`;

describe('S3-c 卡底背景就地纠正', () => {
  it('阳性：三卡错挂 ⇒ 补锚点 + 归位（按 owner 序）+ 清根容器错挂，且 E3-v4 消失', () => {
    const before = runAcceptanceChecks({
      files: { 'package/components/S.vue': VUE },
      resourceDomMapping: MAPPING as any,
    });
    expect(before.fails.some((f) => f.code === 'E3-v4')).toBe(true);

    const r = correctCardBgOwnership({ 'package/components/S.vue': VUE }, FIGMA, MAPPING as any);
    expect(r.stats.anchored).toBe(3);
    expect(r.stats.remounted).toBe(3);
    expect(r.stats.cleared).toBeGreaterThanOrEqual(1);

    const out = r.files['package/components/S.vue'];
    const tags = [...out.matchAll(/<div[^>]*class="x-card(?![-\w])[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(3);
    // owner 序 = x 序：136:129(x37) → 136:128(x166) → 136:127(x274)；bg 分别 125/124/126
    expect(tags[0]).toContain('data-section-id="136:129"');
    expect(tags[0]).toContain('bg1');
    expect(tags[1]).toContain('data-section-id="136:128"');
    expect(tags[1]).toContain('bg2');
    expect(tags[2]).toContain('data-section-id="136:127"');
    expect(tags[2]).toContain('bg3');
    // 根容器不再消费任何卡底资源
    const rootTag = out.match(/<div class="sec"[^>]*>/)?.[0] || '';
    expect(rootTag).not.toContain('bg3');

    const after = runAcceptanceChecks({
      files: r.files,
      resourceDomMapping: MAPPING as any,
    });
    expect(after.fails.some((f) => f.code === 'E3-v4')).toBe(false);
  });

  it('幂等：已纠正产物再跑一次 ⇒ 不再重挂（remounted=0）', () => {
    const once = correctCardBgOwnership({ 'package/components/S.vue': VUE }, FIGMA, MAPPING as any);
    const twice = correctCardBgOwnership(once.files, FIGMA, MAPPING as any);
    expect(twice.stats.remounted).toBe(0);
    expect(twice.stats.anchored).toBe(0);
    expect(twice.files['package/components/S.vue']).toBe(once.files['package/components/S.vue']);
  });

  it('阴性（不猜）：重复 class 次数与 owner 数不符 ⇒ 整体跳过，文件零改动', () => {
    const two = VUE.replace(/\n    <div class="x-card x-card-3"><span>19<\/span><\/div>/, '');
    const r = correctCardBgOwnership({ 'package/components/S.vue': two }, FIGMA, MAPPING as any);
    expect(r.stats.anchored).toBe(0);
    expect(r.stats.remounted).toBe(0);
    expect(r.files['package/components/S.vue']).toBe(two);
  });
});
