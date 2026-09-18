// 测试 P-12 防御性治理规则
import {
  validateDynamicClassStyles,
  ensureFlexLayoutForSiblings,
  validateResourceBindingLevel,
  extractNodeLevelColorTruth
} from './src/ai-engine/utils/post-process.js';

// 测试 P-12a: 动态 class 样式校验
const testVue1 = `
<template>
  <div class="container">
    <div :class="{ 'state-switch': isActive }">内容</div>
    <div class="tab-item active">标签</div>
  </div>
</template>

<style>
.container {
  display: flex;
}
.tab-item {
  padding: 8px;
}
</style>
`;

console.log('=== 测试 P-12a: 动态 class 样式校验 ===');
const result1 = validateDynamicClassStyles(testVue1);
console.log('修复后代码:');
console.log(result1);
console.log('\n');

// 测试 P-12b: Flex 布局注入
const testVue2 = `
<template>
  <div class="tabs-list">
    <div class="tab-item">标签1</div>
    <div class="tab-item">标签2</div>
  </div>
</template>

<style>
.tabs-list {
  width: 100%;
}
.tab-item {
  padding: 8px;
}
</style>
`;

console.log('=== 测试 P-12b: Flex 布局注入 ===');
const result2 = ensureFlexLayoutForSiblings(testVue2);
console.log('修复后代码:');
console.log(result2);
console.log('\n');

// 测试 P-12c: 资源绑定层级校验
const testVue3 = `
<template>
  <div class="container">
    <div class="tabs-list" :style="{ backgroundImage: \`url(\${bgTabActive})\` }">
      <div class="tab-item">标签</div>
    </div>
  </div>
</template>
`;

console.log('=== 测试 P-12c: 资源绑定层级校验 ===');
const warnings = validateResourceBindingLevel(testVue3, []);
console.log('警告:', warnings);
console.log('\n');

// 测试 P-12d: 节点级颜色真值提取
const testFigmaData = {
  type: 'FRAME',
  children: [
    {
      type: 'TEXT',
      id: '1:1',
      characters: '摄像机',
      style: { fills: [{ color: { r: 1, g: 1, b: 1 } }] }
    },
    {
      type: 'TEXT',
      id: '1:2',
      characters: '(2/484)',
      style: { fills: [{ color: { r: 1, g: 1, b: 1 } }] },
      characterStyleOverrides: [0, 1, 0, 0, 0, 0, 0],
      styleOverrideTable: {
        '1': { color: { r: 0.88, g: 0.2, b: 0.2 } }
      }
    }
  ]
};

console.log('=== 测试 P-12d: 节点级颜色真值提取 ===');
const truth = extractNodeLevelColorTruth(testFigmaData);
console.log('提取的真值:', JSON.stringify(truth, null, 2));
