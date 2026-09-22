/**
 * item 级几何分组事实注入器（item-facts-injector）单测
 * golden：mc-1790048059931 ContentCons 卡（icon 27x32 + 文本列纵排）实锤
 */
import { describe, expect, it } from '@jest/globals';
import { injectItemLevelFacts } from '../item-facts-injector.js';

const ITEM_FACTS = {
  // 摄像机卡：文本列纵排 + icon 27x32
  '2:8438': {
    textStack: {
      flexDirection: 'column',
      gapPx: 4,
      texts: [
        { id: '2:8442', characters: '摄像机' },
        { id: '2:8443', characters: '(2/484)' },
      ],
    },
    siblingAssets: [
      { name: 'bg', widthPx: 117, heightPx: 64, isIcon: false },
      { name: 'icon', widthPx: 27, heightPx: 32, isIcon: true },
    ],
  },
};

const CONS_VUE = `<template>
  <div class="c-device-monitor-cons">
    <div v-for="item in deviceList" :key="item.label" class="c-device-monitor-card">
      <img :src="item.icon" class="c-device-monitor-icon-img" alt="" />
      <div class="c-device-monitor-cons-text">
        <span class="c-device-monitor-cons-label">{{ item.label }}</span>
        <span class="c-device-monitor-cons-value">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
const deviceList = [
  { label: '摄像机', value: '(2/484)', icon: icon1 },
  { label: '烟道机器人', value: '(0/484)', icon: icon2 },
]
</script>

<style lang="less" scoped>
.c-device-monitor-cons-text {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
`;

describe('injectItemLevelFacts', () => {
  it('v-for 绑定卡：script 数组签名双射 → 文本容器方向 row→column + icon 实测尺寸', () => {
    const r = injectItemLevelFacts(CONS_VUE, ITEM_FACTS);
    expect(r).not.toBeNull();
    // 方向注入
    const textBlock = r.content.match(/\.c-device-monitor-cons-text \{([^}]*)\}/)?.[1] || '';
    expect(textBlock).toContain('flex-direction: column');
    // icon 尺寸
    expect(r.content).toContain('width: 27px; height: 32px');
  });

  it('幂等：方向已正确 + img 已有尺寸 → null', () => {
    const fixed = CONS_VUE
      .replace('gap: 4px;\n}', 'gap: 4px;\n  flex-direction: column;\n}')
      .replace('<img :src="item.icon" class="c-device-monitor-icon-img" alt="" />',
        '<img :src="item.icon" class="c-device-monitor-icon-img" alt="" style="width: 27px; height: 32px;" />');
    expect(injectItemLevelFacts(fixed, ITEM_FACTS)).toBeNull();
  });

  it('空 facts / 空 content → null（fail-open）', () => {
    expect(injectItemLevelFacts(CONS_VUE, {})).toBeNull();
    expect(injectItemLevelFacts('', ITEM_FACTS)).toBeNull();
    expect(injectItemLevelFacts(null, ITEM_FACTS)).toBeNull();
  });

  it('签名不匹配（数组缺 value 文本）→ 不误注入', () => {
    const partial = CONS_VUE.replace("value: '(2/484)'", "value: '(X/484)'");
    const r = injectItemLevelFacts(partial, ITEM_FACTS);
    // '(2/484)' 不在数组 → 双射失败 → 走静态通道（模板是 {{item.value}} 绑定非字面量）→ 也不命中
    expect(r).toBeNull();
  });
});
