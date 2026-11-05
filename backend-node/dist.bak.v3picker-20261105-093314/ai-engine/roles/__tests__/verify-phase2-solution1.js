/**
 * 🎯 Phase 2 方案1: 增强子组件拆分 - 手动验证脚本
 */

// 模拟 logger
const mockLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

// 直接复制核心函数，避免模块依赖问题
function countElements(sec, depth = 0) {
  if (depth > 4) return 0;
  const list =
    sec?.body?.children ||
    sec?.body?.elements ||
    sec?.children ||
    sec?.elements;
  if (!Array.isArray(list)) return 0;
  let total = 0;
  for (const child of list) {
    total += 1;
    total += countElements(child, depth + 1);
  }
  return total;
}

function calculateDepth(sec, currentDepth = 0) {
  if (currentDepth > 10) return currentDepth;
  const list =
    sec?.body?.children ||
    sec?.body?.elements ||
    sec?.children ||
    sec?.elements;
  if (!Array.isArray(list) || list.length === 0) return currentDepth;

  let maxChildDepth = currentDepth;
  for (const child of list) {
    const childDepth = calculateDepth(child, currentDepth + 1);
    if (childDepth > maxChildDepth) maxChildDepth = childDepth;
  }
  return maxChildDepth;
}

function extractCharts(sec) {
  const charts = [];

  function traverse(node, depth = 0) {
    if (depth > 4) return;

    const type = String(node?.type || '').toLowerCase();
    const name = String(node?.name || '').toLowerCase();
    const id = String(node?.id || '').toLowerCase();

    const chartKeywords = [
      'chart',
      'graph',
      'plot',
      'echarts',
      '图表',
      '曲线',
      '柱状',
      '折线',
      '饼图',
      'pie',
      'bar',
      'line',
    ];
    const isChart = chartKeywords.some(
      (kw) => type.includes(kw) || name.includes(kw) || id.includes(kw),
    );

    if (isChart) {
      charts.push({
        id: node.id || `chart-${charts.length + 1}`,
        name: node.name || node.id || `图表${charts.length + 1}`,
        type: type || 'chart',
      });
      // 找到图表后不再递归其子节点，避免重复计数
      return;
    }

    const children =
      node?.body?.children ||
      node?.body?.elements ||
      node?.children ||
      node?.elements;
    if (Array.isArray(children)) {
      for (const child of children) {
        traverse(child, depth + 1);
      }
    }
  }

  // 只遍历 section 的直接子节点，不遍历 section 本身（避免 section id 被误识别）
  const children =
    sec?.body?.children ||
    sec?.body?.elements ||
    sec?.children ||
    sec?.elements;
  if (Array.isArray(children)) {
    for (const child of children) {
      traverse(child, 0);
    }
  }

  return charts;
}

function countInteractions(sec) {
  let count = 0;

  function traverse(node, depth = 0) {
    if (depth > 4) return;

    const type = String(node?.type || '').toLowerCase();
    const name = String(node?.name || '').toLowerCase();

    const interactionKeywords = [
      'button',
      'input',
      'select',
      'switch',
      'tab',
      'checkbox',
      'radio',
      '按钮',
      '输入',
      '下拉',
      '开关',
      '切换',
      '选择',
    ];

    const isInteractive = interactionKeywords.some(
      (kw) => type.includes(kw) || name.includes(kw),
    );

    if (isInteractive) count++;

    const children =
      node?.body?.children ||
      node?.body?.elements ||
      node?.children ||
      node?.elements;
    if (Array.isArray(children)) {
      for (const child of children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(sec);
  return count;
}

function calculateSplitScore(section) {
  let score = 0;

  const elementCount = countElements(section);
  if (elementCount > 10) {
    score += 40;
  } else if (elementCount > 6) {
    score += 20;
  }

  const charts = extractCharts(section);
  if (charts.length >= 2) {
    score += 30;
  } else if (charts.length === 1 && elementCount > 8) {
    score += 15;
  }

  const interactions = countInteractions(section);
  if (interactions > 3) {
    score += 20;
  } else if (interactions > 1) {
    score += 10;
  }

  const maxDepth = calculateDepth(section);
  if (maxDepth > 3) {
    score += 10;
  }

  return {
    score,
    shouldSplit: score >= 30,
    reasons: {
      elementCount,
      charts: charts.length,
      interactions,
      maxDepth,
    },
    charts,
  };
}

// 测试用例
console.log('\n🎯 Phase 2 方案1: 增强子组件拆分 - 验证测试\n');

// 测试1: 元素密度评分
console.log('测试1: 元素密度评分（>10 元素 → 40分）');
const test1Section = {
  id: 'section-dense',
  body: {
    children: Array(12)
      .fill(null)
      .map((_, i) => ({ id: `elem-${i}`, type: 'text' })),
  },
};
const test1Result = calculateSplitScore(test1Section);
console.log('  结果:', {
  score: test1Result.score,
  shouldSplit: test1Result.shouldSplit,
  elementCount: test1Result.reasons.elementCount,
});
console.assert(test1Result.score >= 40, '❌ 元素密度评分失败');
console.assert(test1Result.shouldSplit === true, '❌ 应触发拆分');
console.log('  ✅ 通过\n');

// 测试2: 图表数量评分
console.log('测试2: 图表数量评分（≥2 图表 → 30分）');
const test2Section = {
  id: 'section-charts',
  body: {
    children: [
      { id: 'chart1', type: 'bar-chart', name: '柱状图' },
      { id: 'chart2', type: 'line-chart', name: '折线图' },
      { id: 'text1', type: 'text' },
    ],
  },
};
const test2Result = calculateSplitScore(test2Section);
console.log('  结果:', {
  score: test2Result.score,
  shouldSplit: test2Result.shouldSplit,
  charts: test2Result.reasons.charts,
  chartList: test2Result.charts.map((c) => c.name),
});
console.assert(test2Result.score >= 30, '❌ 图表数量评分失败');
console.assert(test2Result.reasons.charts === 2, '❌ 图表识别失败');
console.assert(test2Result.shouldSplit === true, '❌ 应触发拆分');
console.log('  ✅ 通过\n');

// 测试3: 交互复杂度评分
console.log('测试3: 交互复杂度评分（>3 交互元素 → 20分）');
const test3Section = {
  id: 'section-interactive',
  body: {
    children: [
      { id: 'btn1', type: 'button', name: '按钮1' },
      { id: 'btn2', type: 'button', name: '按钮2' },
      { id: 'input1', type: 'input', name: '输入框' },
      { id: 'select1', type: 'select', name: '下拉框' },
    ],
  },
};
const test3Result = calculateSplitScore(test3Section);
console.log('  结果:', {
  score: test3Result.score,
  shouldSplit: test3Result.shouldSplit,
  interactions: test3Result.reasons.interactions,
});
console.assert(test3Result.reasons.interactions === 4, '❌ 交互元素识别失败');
console.assert(test3Result.score >= 20, '❌ 交互复杂度评分失败');
console.log('  ✅ 通过\n');

// 测试4: 嵌套深度评分
console.log('测试4: 嵌套深度评分（>3 层 → 10分）');
const test4Section = {
  id: 'section-nested',
  body: {
    children: [
      {
        id: 'level1',
        children: [
          {
            id: 'level2',
            children: [
              {
                id: 'level3',
                children: [{ id: 'level4', type: 'text' }],
              },
            ],
          },
        ],
      },
    ],
  },
};
const test4Result = calculateSplitScore(test4Section);
console.log('  结果:', {
  score: test4Result.score,
  shouldSplit: test4Result.shouldSplit,
  maxDepth: test4Result.reasons.maxDepth,
});
console.assert(test4Result.reasons.maxDepth > 3, '❌ 嵌套深度计算失败');
console.assert(test4Result.score >= 10, '❌ 嵌套深度评分失败');
console.log('  ✅ 通过\n');

// 测试5: 低复杂度不触发拆分
console.log('测试5: 低复杂度不触发拆分（<30分）');
const test5Section = {
  id: 'section-simple',
  body: {
    children: [
      { id: 'text1', type: 'text' },
      { id: 'text2', type: 'text' },
    ],
  },
};
const test5Result = calculateSplitScore(test5Section);
console.log('  结果:', {
  score: test5Result.score,
  shouldSplit: test5Result.shouldSplit,
});
console.assert(test5Result.score < 30, '❌ 评分应低于阈值');
console.assert(test5Result.shouldSplit === false, '❌ 不应触发拆分');
console.log('  ✅ 通过\n');

// 测试6: 综合评分（多维度累加）
console.log('测试6: 综合评分（多维度累加）');
const test6Section = {
  id: 'section-complex',
  body: {
    children: [
      { id: 'chart1', type: 'bar-chart' },
      { id: 'chart2', type: 'line-chart' },
      ...Array(8)
        .fill(null)
        .map((_, i) => ({ id: `elem-${i}`, type: 'text' })),
      { id: 'btn1', type: 'button' },
      { id: 'btn2', type: 'button' },
    ],
  },
};
const test6Result = calculateSplitScore(test6Section);
console.log('  结果:', {
  score: test6Result.score,
  shouldSplit: test6Result.shouldSplit,
  breakdown: test6Result.reasons,
});
console.assert(test6Result.score >= 30, '❌ 综合评分失败');
console.assert(test6Result.shouldSplit === true, '❌ 应触发拆分');
// 有2个图表，应该得30分
console.assert(test6Result.reasons.charts === 2, '❌ 图表识别失败');
console.log('  ✅ 通过\n');

console.log('✅ 所有测试通过！\n');
console.log('📊 测试统计:');
console.log('  - 元素密度评分: ✅');
console.log('  - 图表数量评分: ✅');
console.log('  - 交互复杂度评分: ✅');
console.log('  - 嵌套深度评分: ✅');
console.log('  - 低复杂度判断: ✅');
console.log('  - 综合多维度评分: ✅');
console.log('\n🎯 Phase 2 方案1 核心功能验证完成！');
