/**
 * 调试资源映射机制的脚本
 * 用于分析资源映射生成和注入过程
 */

const fs = require('fs');
const path = require('path');
const { buildVarToMapping, injectResourceImports } = require('./src/ai-engine/utils/resource-import-guard.js');

// 模拟资源映射数据
const sampleResourceDomMapping = [
  {
    resourceFile: '../resources/images/bg1.png',
    figmaNodeId: 'node-123',
    figmaPath: 'cp-环境监测/bg',
    name: 'bg',
    figmaBox: { x: 0, y: 0, width: 800, height: 600 },
    usage: ':style="{ backgroundImage: `url(\${bg1})` }"',
    targetDomSelector: '.bg-container',
    targetDomHint: '背景区域',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    semanticVarName: 'bgMain',
    assignedVarName: 'bg1',
    mountTarget: '环境监测',
    bgRole: 'container'
  },
  {
    resourceFile: '../resources/images/icon1.png',
    figmaNodeId: 'node-456',
    figmaPath: 'cp-环境监测/icon-arrow',
    name: 'icon-arrow',
    figmaBox: { x: 100, y: 50, width: 24, height: 24 },
    usage: '<img :src="icon1">',
    targetDomSelector: '.icon-arrow-container',
    targetDomHint: '箭头图标区域',
    previewAnalysisRole: 'icon',
    downloadStatus: 'success',
    semanticVarName: 'iconArrow',
    assignedVarName: 'icon1'
  },
  {
    resourceFile: null,
    figmaNodeId: 'node-789',
    figmaPath: 'cp-环境监测/missing-bg',
    name: 'missing-bg',
    figmaBox: { x: 200, y: 100, width: 200, height: 150 },
    usage: ':style="{ backgroundImage: `url(\${bg2})` }"',
    targetDomSelector: '.missing-bg-container',
    targetDomHint: '缺失背景区域',
    previewAnalysisRole: 'bg',
    downloadStatus: 'missing',
    semanticVarName: 'bgMissing',
    assignedVarName: 'bg2',
    mountTarget: null,
    bgRole: 'sub-state'
  }
];

// 模拟Vue组件代码
const sampleVueCode = `
<template>
  <div class="environment-monitor">
    <div class="bg-container" :style="{ backgroundImage: \`url(\${bg1})\` }"></div>
    <div class="icon-arrow-container">
      <img :src="icon1" alt="arrow">
    </div>
    <div class="missing-bg-container" :style="{ backgroundImage: \`url(\${bg2})\` }"></div>
  </div>
</template>

<script setup>
// 组件逻辑
</script>

<style scoped>
.bg-container {
  width: 100%;
  height: 100%;
  background-size: cover;
}
.icon-arrow-container {
  position: absolute;
  top: 50px;
  left: 100px;
}
.missing-bg-container {
  width: 200px;
  height: 150px;
  background-color: #f0f0f0;
}
</style>
`;

console.log('=== 资源映射调试分析 ===\n');

// 1. 分析资源映射数据
console.log('1. 资源映射数据分析：');
console.log(JSON.stringify(sampleResourceDomMapping, null, 2));

// 2. 构建变量到映射的关系
const { available, varToMapping } = buildVarToMapping(sampleResourceDomMapping);
console.log('\n2. 变量到映射的关系：');
console.log('可用资源数量:', available.length);
console.log('变量映射:', Object.fromEntries(varToMapping));

// 3. 分析代码中使用的变量
console.log('\n3. 代码中使用的变量：');
const usedVars = new Set();
const numberedPattern = /\b(bg|icon|img)(\d+)\b/g;
let numMatch;
while ((numMatch = numberedPattern.exec(sampleVueCode)) !== null) {
  if (varToMapping.has(numMatch[0])) {
    usedVars.add(numMatch[0]);
  }
}
console.log('使用的编号变量:', Array.from(usedVars));

// 4. 注入资源import
console.log('\n4. 注入资源import：');
const injectedCode = injectResourceImports(sampleVueCode, sampleResourceDomMapping);
console.log('注入后的代码：');
console.log(injectedCode);

// 5. 分析注入结果
console.log('\n5. 注入结果分析：');
const imports = [];
const aliasDecls = [];
const scriptSetupPattern = /<script\s+setup[^>]*>/;
const scriptMatch = injectedCode.match(scriptSetupPattern);
if (scriptMatch) {
  const insertPos = scriptMatch.index + scriptMatch[0].length;
  const scriptContent = injectedCode.slice(insertPos);
  console.log('注入的script内容：');
  console.log(scriptContent);
}

console.log('\n=== 调试完成 ===');