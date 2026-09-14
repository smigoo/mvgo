/**
 * Subcomponent Planner - 子组件规划器
 * 职责：基于 layoutStructure 的 sections 结构，纯规则产出"强制子组件清单"，
 *       供 microcode/vue3 engineer 阶段注入 prompt，按 section.id 强制拆分。
 *
 * 设计要点：
 *   - 纯规则，不调 LLM（开销 < 1ms）
 *   - 不命名子组件（命名权交给 engineer LLM）
 *   - 按 section.id 强制拆分：isForced = 有效 sections 数 >= 3
 *   - 微码流程过滤 panel-header（base-panel 已自带标题栏），Vue3 不过滤
 *   - 视觉顺序由 Figma absoluteBoundingBox 事实源决定（sortSectionsByFigmaY）
 *   - 产出：{ effectiveSections: [{id, responsibility, elementCount, title, children?}], isForced, minFiles }
 *   - 🛡️ A′ Phase 5（2026-09-10）：container-rebuild 容器保留嵌套，不 flatten。
 *     容器 isLayoutContainer=true，不占独立 .vue 槽；minFiles / isForced 按叶子计数。
 */

import { createLogger } from '../logger/index.js';
import { enforceTabStructure } from './tab-structure-guard.js';
import {
  collapseRepeatedSiblingSections,
  isCollapsedListSection,
} from '../utils/repeated-section-collapser.js';
import {
  isLayoutContainerSection,
  collectLeafSections,
  anchorPhantomSections,
  sortSectionsByFigmaY,
  indexFigmaNodes,
  figmaSectionBox,
} from '../utils/section-tree.js';
// 🛡️ 刀 5a（2026-09-13）：section type 推导抽离到纯函数模块（无 import.meta 依赖，可单测）
import { deriveSectionType } from '../utils/section-type-derive.js';

export { isLayoutContainerSection, collectLeafSections };

const logger = createLogger({ name: 'subcomponent-planner' });

// type → 中文职责描述（注入 prompt，让 LLM 知道每个子组件干什么）
const TYPE_RESPONSIBILITY = {
  header: '顶部标题区/控件区（标题、副标题、操作按钮等）',
  footer: '底部汇总区/分页/全局操作',
  tabs: '标签页切换区',
  stats: '数据统计指标区（数字+标签+趋势）',
  grid: '网格卡片布局区',
  list: '列表项布局区',
  card: '单卡片容器',
  chart: '图表/数据可视化区',
  body: '主内容区',
  sidebar: '侧边栏',
  nav: '竖向导航区（分类/菜单切换）',
  toolbar: '工具栏',
};

function compactDiagnosticItem(item) {
  if (item == null) return null;
  if (typeof item !== 'object') return String(item).slice(0, 180);
  return {
    id: item.id || item.code || item.key || item.type || null,
    sectionId: item.sectionId || item.section || item.figmaNodeId || item.nodeId || null,
    severity: item.severity || item.level || item.status || null,
    message: item.message || item.summary || item.reason || item.description || item.title || null,
  };
}

function compactDiagnosticList(items, limit = 5) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.slice(0, limit).map(compactDiagnosticItem).filter(Boolean);
}

function compactCoverageReport(report) {
  if (!report || typeof report !== 'object') return null;
  return {
    coverageRate: Number.isFinite(report.coverageRate) ? report.coverageRate : null,
    summary: report.summary || report.reason || report.message || null,
    totalCount: Number.isFinite(report.totalCount)
      ? report.totalCount
      : Number.isFinite(report.total)
        ? report.total
        : null,
    coveredCount: Number.isFinite(report.coveredCount)
      ? report.coveredCount
      : Number.isFinite(report.covered)
        ? report.covered
        : null,
    missingCount: Number.isFinite(report.missingCount)
      ? report.missingCount
      : Number.isFinite(report.missing)
        ? report.missing
        : null,
  };
}

function compactTextTruthValidation(validation) {
  if (!validation || typeof validation !== 'object') return null;
  return {
    status: validation.status || validation.verdict || validation.level || null,
    summary: validation.summary || validation.message || validation.reason || null,
    mismatchCount: Number.isFinite(validation.mismatchCount)
      ? validation.mismatchCount
      : Array.isArray(validation.violations)
        ? validation.violations.length
        : null,
    violationCount: Number.isFinite(validation.violationCount)
      ? validation.violationCount
      : null,
  };
}

function compactChartDataHints(chartDataHints) {
  if (!Array.isArray(chartDataHints) || chartDataHints.length === 0) return [];
  return chartDataHints.slice(0, 5).map((hint) => {
    if (hint == null) return null;
    if (typeof hint !== 'object') return String(hint).slice(0, 120);
    return {
      id: hint.id || hint.key || hint.name || null,
      label: hint.label || hint.title || hint.name || null,
      sectionId: hint.sectionId || hint.section || null,
      values: Array.isArray(hint.values) ? hint.values.slice(0, 6) : null,
      notes: hint.notes || hint.message || hint.summary || null,
    };
  }).filter(Boolean);
}

function summarizePipelineDiagnostics(opts = {}) {
  const summary = {
    analysisDiagnostics: compactDiagnosticList(opts.analysisDiagnostics, 5),
    analysisFixes: compactDiagnosticList(opts.analysisFixes, 5),
    chromeSectionDiagnostics: compactDiagnosticList(opts.chromeSectionDiagnostics, 5),
    resourceDiagnostics: compactDiagnosticList(opts.resourceDiagnostics, 5),
    coverageReport: compactCoverageReport(opts.coverageReport),
    textTruthValidation: compactTextTruthValidation(opts.textTruthValidation),
    chartDataHints: compactChartDataHints(opts.chartDataHints),
  };

  const hasContent =
    summary.analysisDiagnostics.length > 0 ||
    summary.analysisFixes.length > 0 ||
    summary.chromeSectionDiagnostics.length > 0 ||
    summary.resourceDiagnostics.length > 0 ||
    summary.coverageReport ||
    summary.textTruthValidation ||
    summary.chartDataHints.length > 0;

  return hasContent ? summary : null;
}

// 识别 panel-header（微码 base-panel 已自带标题栏，应过滤避免误算）
const PANEL_HEADER_PATTERN = /panel[-_ ]?header|标题栏|^header$/i;

/**
 * 统计 section 内元素数量（递归，深度受限防止畸形数据爆栈）。
 */
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

/**
 * 🎯 Phase 2 方案1: 计算 section 嵌套深度
 */
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

/**
 * 🎯 Phase 2 方案1: 识别图表类型元素
 */
function extractCharts(sec) {
  const charts = [];

  function traverse(node, depth = 0) {
    if (depth > 4) return;

    // 检查节点类型/名称是否为图表
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

    // 递归子节点
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

/**
 * 🎯 Phase 2 方案1: 统计交互复杂度
 * 检测：按钮、输入框、下拉框、开关、标签页等交互元素
 */
function countInteractions(sec) {
  let count = 0;

  function traverse(node, depth = 0) {
    if (depth > 4) return;

    const type = String(node?.type || '').toLowerCase();
    const name = String(node?.name || '').toLowerCase();

    // 交互关键词
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

/**
 * 🎯 Phase 2 方案1: 多维度复杂度评分
 *
 * 评分体系：
 * - 元素密度（40%）：>10 → 40分，>6 → 20分
 * - 图表数量（30%）：≥2 → 30分，=1 且元素>8 → 15分
 * - 交互复杂度（20%）：>3 → 20分，>1 → 10分
 * - 嵌套深度（10%）：>3 → 10分
 *
 * 阈值：≥30 分触发拆分
 */
function calculateSplitScore(section) {
  let score = 0;

  // 维度 1: 元素密度（40% 权重）
  const elementCount = countElements(section);
  if (elementCount > 10) {
    score += 40;
  } else if (elementCount > 6) {
    score += 20;
  }

  // 维度 2: 图表数量（30% 权重）
  const charts = extractCharts(section);
  if (charts.length >= 2) {
    score += 30;
  } else if (charts.length === 1 && elementCount > 8) {
    score += 15;
  }

  // 维度 3: 交互复杂度（20% 权重）
  const interactions = countInteractions(section);
  if (interactions > 3) {
    score += 20;
  } else if (interactions > 1) {
    score += 10;
  }

  // 维度 4: 嵌套深度（10% 权重）
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
    charts, // 返回图表列表供后续使用
  };
}

/**
 * 判断 section 是否为微码 base-panel 自带的 panel-header（应过滤）。
 * 同时要求元素数 < 4，避免误杀"内容型 header"（如顶部统计卡片区）。
 */
function isPanelHeader(sec) {
  const id = String(sec?.id || '').toLowerCase();
  const name = String(sec?.name || '').toLowerCase();
  const patternHit =
    PANEL_HEADER_PATTERN.test(id) || PANEL_HEADER_PATTERN.test(name);
  if (!patternHit) return false;
  return countElements(sec) < 4;
}

/**
 * P2': 识别图例 section（色块+短文本组合，无交互元素）。
 * 图例特征：至少 1 个 color-block + 至少 1 个 text，且无交互元素。
 */
function isLegendSection(sec) {
  const children =
    sec?.body?.children ||
    sec?.body?.elements ||
    sec?.children ||
    sec?.elements;
  if (!Array.isArray(children) || children.length < 2) return false;

  // 统计元素类型
  let hasColorBlock = false;
  let hasText = false;
  const interactiveTypes = [
    'button',
    'input',
    'select',
    'switch',
    'tab',
    'checkbox',
    'radio',
  ];
  const nonLegendTypes = [
    'card',
    'stat-card',
    'chart',
    'bar-chart',
    'line-chart',
    'pie-chart',
  ];

  for (const child of children) {
    const type = String(child?.type || '').toLowerCase();
    const name = String(child?.name || '').toLowerCase();

    // 检查 color-block
    if (type === 'color-block' || name.includes('色块')) {
      hasColorBlock = true;
    }
    // 检查 text
    if (type === 'text' || name.includes('文本')) {
      hasText = true;
    }
    // 检查交互元素
    if (interactiveTypes.some((t) => type.includes(t) || name.includes(t))) {
      return false;
    }
    // 检查非图例元素
    if (nonLegendTypes.some((t) => type.includes(t) || name.includes(t))) {
      return false;
    }
  }

  return hasColorBlock && hasText;
}

/**
 * P2': 识别图表 section。
 */
function isChartSection(sec) {
  const type = deriveSectionType(sec);
  return type === 'chart';
}

/**
 * P2': 合并图例 section 到相邻图表 section。
 * 规则：图例必须与图表相邻（前后均可），中间不能有其他 section 间隔。
 */
function mergeLegendSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return sections;

  const result = [...sections];
  const mergedIndices = new Set();

  // 遍历所有 section，识别图例并尝试合并
  for (let i = 0; i < result.length; i++) {
    if (!isLegendSection(result[i])) continue;

    // 向前查找相邻图表
    let merged = false;
    for (let j = i - 1; j >= 0; j--) {
      if (isChartSection(result[j])) {
        // 合并到该图表
        if (!result[j].mergedLegendSections) {
          result[j].mergedLegendSections = [];
        }
        result[j].mergedLegendSections.push(result[i]);
        mergedIndices.add(i);
        merged = true;
        logger.info(
          `P2': 图例 section "${result[i].id}" 合并到图表 section "${result[j].id}"`,
        );
        break;
      }
      // 如果遇到非图例 section，停止向前查找
      if (!isLegendSection(result[j])) break;
    }

    // 如果向前未找到，向后查找相邻图表
    if (!merged) {
      for (let j = i + 1; j < result.length; j++) {
        if (isChartSection(result[j])) {
          if (!result[j].mergedLegendSections) {
            result[j].mergedLegendSections = [];
          }
          result[j].mergedLegendSections.push(result[i]);
          mergedIndices.add(i);
          logger.info(
            `P2': 图例 section "${result[i].id}" 合并到图表 section "${result[j].id}"`,
          );
          break;
        }
        if (!isLegendSection(result[j])) break;
      }
    }
  }

  // 过滤掉已合并的图例 section
  return result.filter((_, idx) => !mergedIndices.has(idx));
}

/**
 * 🎯 Phase 2 方案1: 从 Figma Auto Layout 提取布局元数据
 */
function extractLayoutMetadata(section) {
  const layout = section?.layout || section?.body?.layout || {};

  // Figma layoutMode: HORIZONTAL | VERTICAL | NONE
  const layoutMode = String(
    layout.layoutMode || layout.direction || '',
  ).toUpperCase();

  return {
    direction:
      layoutMode === 'HORIZONTAL'
        ? 'row'
        : layoutMode === 'VERTICAL'
          ? 'column'
          : 'column',
    alignItems:
      layout.primaryAxisAlignItems || layout.alignItems || 'flex-start',
    justifyContent:
      layout.counterAxisAlignItems || layout.justifyContent || 'flex-start',
    gap: layout.itemSpacing || layout.gap || 0,
    // A（2026-08-29）：补区块像素高度，供「子区块高度按比例分配」规则使用。
    // 约束 ai-generation-constraints.md 要求 `flex: <Figma高度px> 1 0`，但此前 layoutMetadata
    // 完全没有 height 字段，导致 prompt 永远拿不到 px 数值、LLM 只能回退 height:100%（多区块溢出根因）。
    height:
      section?.absoluteBoundingBox?.height ||
      section?.size?.height ||
      section?.height ||
      0,
    // 🎯 2026-09-07（0907 审计 L1）：透传 vision 归一化 flexGrow 系数（平均值=1，
    // 比例 = 设计稿高度比）。统一 flex 事实源：内容区块 grow 用系数，
    // 禁止把像素高度写进 grow（root-container.md/chart-standards.md/constraints.md 已同步）。
    // 缺失时为 0，由 planner 在全部 section 提取后按高度归一化兜底补齐。
    flexGrow: Number(section?.styles?.flexGrow) || 0,
    padding: {
      top: layout.paddingTop || 0,
      right: layout.paddingRight || 0,
      bottom: layout.paddingBottom || 0,
      left: layout.paddingLeft || 0,
    },
  };
}

/**
 * 🎯 Phase 2 方案1: Section 内部拆分策略
 *
 * 拆分规则（按优先级）：
 * R1: 图表 ≥2 → 每个图表独立子组件
 * R2: 元素 >10 且无图表 → 按密度分组（每组 ≤8 元素）
 * R3: 嵌套深度 >3 → 深层节点提升为子组件
 * R4: 交互复杂度 >3 → 每个交互区域独立子组件
 */
function splitSectionInternally(section, sectionIndex) {
  const scoreResult = calculateSplitScore(section);

  if (!scoreResult.shouldSplit) {
    return []; // 不需要内部拆分
  }

  const subcomponents = [];
  const { charts, reasons } = scoreResult;

  // R1: 图表隔离（优先级最高）
  if (charts.length >= 2) {
    charts.forEach((chart, idx) => {
      subcomponents.push({
        type: 'chart-component',
        id: chart.id,
        name: chart.name || `Chart${idx + 1}`,
        responsibility: `图表组件：${chart.name}`,
        reason: 'R1: 图表隔离策略',
        props: ['chartData', 'chartConfig'],
        emits: ['legendClick', 'dataZoom'],
      });
    });

    logger.info(
      `section-${sectionIndex}: 图表隔离 → ${charts.length} 个图表子组件`,
    );
    return subcomponents;
  }

  // R2: 元素密度拆分（图表 <2 且元素 >10）
  if (reasons.charts < 2 && reasons.elementCount > 10) {
    // 简化策略：拆分为 2-3 个子组件
    const groupCount = Math.ceil(reasons.elementCount / 8);
    for (let i = 0; i < Math.min(groupCount, 3); i++) {
      subcomponents.push({
        type: 'element-group',
        id: `${section.id}-group${i + 1}`,
        name: `Group${i + 1}`,
        responsibility: `元素分组 ${i + 1}（高密度拆分）`,
        reason: `R2: 元素密度拆分（总计${reasons.elementCount}个元素）`,
        props: [],
        emits: [],
      });
    }

    logger.info(
      `section-${sectionIndex}: 元素密度拆分 → ${subcomponents.length} 个分组`,
    );
    return subcomponents;
  }

  // R3: 深层嵌套拆分
  if (reasons.maxDepth > 3) {
    subcomponents.push({
      type: 'nested-component',
      id: `${section.id}-nested`,
      name: 'NestedContent',
      responsibility: '深层嵌套内容区',
      reason: `R3: 嵌套深度拆分（深度${reasons.maxDepth}层）`,
      props: [],
      emits: [],
    });

    logger.info(`section-${sectionIndex}: 嵌套深度拆分 → 1 个子组件`);
    return subcomponents;
  }

  // R4: 交互复杂度拆分
  if (reasons.interactions > 3) {
    subcomponents.push({
      type: 'interaction-area',
      id: `${section.id}-interactive`,
      name: 'InteractiveArea',
      responsibility: '交互控件区',
      reason: `R4: 交互复杂度拆分（${reasons.interactions}个交互元素）`,
      props: [],
      emits: ['action'],
    });

    logger.info(`section-${sectionIndex}: 交互复杂度拆分 → 1 个子组件`);
    return subcomponents;
  }

  return subcomponents;
}

/**
 * 🛡️ R1-1（2026-09-11）：收集 section 归属的 Figma 节点 id 集合（sourceNodeIds）。
 * 动机：planner 对同一区域双重解释时（cfb53488：@antd/tab 壳 `89:37` + 臆造 `section-main-content`），
 * 二者 type/responsibility 可能相同（可被现有措辞去重兜底）也可能不同（漏网）——
 * 靠「sourceNodeIds 交集」做**不依赖措辞**的单一归属判定：任一 Figma 节点 id 只能归属一个叶子 section。
 * 来源：显式 sourceNodeIds > figmaNode/nodeId > 形如 `数字:数字` 的 id（Figma node id 格式）>
 * tabStructure.panels 引用的节点 id（纳入归属图）> 子元素 figmaNode/nodeId。
 */
function collectSourceNodeIds(sec) {
  const ids = [];
  const push = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s && !ids.includes(s)) ids.push(s);
  };
  if (Array.isArray(sec?.sourceNodeIds)) sec.sourceNodeIds.forEach(push);
  push(sec?.figmaNode);
  push(sec?.nodeId);
  if (/^\d+:\d+$/.test(String(sec?.id || ''))) push(sec.id);
  if (Array.isArray(sec?.tabStructure?.panels)) {
    sec.tabStructure.panels.forEach(push);
  }
  const children =
    sec?.body?.children ||
    sec?.body?.elements ||
    sec?.children ||
    sec?.elements;
  if (Array.isArray(children)) {
    for (const c of children) {
      push(c?.figmaNode);
      push(c?.nodeId);
      if (/^\d+:\d+$/.test(String(c?.id || ''))) push(c.id);
    }
  }
  return ids;
}

function buildEffectiveSection(sec, idx, ctx) {
  if (isLayoutContainerSection(sec)) {
    const children = (sec.children || []).map((child, i) =>
      buildEffectiveSection(child, i, ctx),
    );
    const title = sec.header?.title || sec.title || sec.name || '';
    return {
      id: sec.id || `container-${idx + 1}`,
      responsibility:
        '纵向布局容器（仅空间包裹，不单独生成 .vue 文件；子区块必须按 children 树在父模板内组装）',
      elementCount: children.reduce((n, c) => n + (Number(c.elementCount) || 0), 0),
      title: String(title).trim().slice(0, 30),
      type: 'container',
      isLayoutContainer: true,
      layout: sec.layout || 'vertical',
      layoutSource: 'container-rebuild',
      children,
      collapsed: false,
      complexityScore: 0,
      complexityReasons: {
        elementCount: 0,
        charts: 0,
        interactions: 0,
        maxDepth: 0,
      },
      layoutMetadata: extractLayoutMetadata({
        ...sec,
        layout: { direction: 'VERTICAL', layoutMode: 'VERTICAL' },
      }),
      internalSubcomponents: [],
      shouldSplitInternally: false,
    };
  }

  const collapsed = isCollapsedListSection(sec);
  const rawType = collapsed ? String(sec.type || 'list') : deriveSectionType(sec);
  const title = sec.header?.title || sec.title || sec.name || '';
  const elementCount = collapsed
    ? Number(sec.itemCount) || (Array.isArray(sec.items) ? sec.items.length : 0)
    : countElements(sec);
  const responsibility = collapsed
    ? `${TYPE_RESPONSIBILITY[rawType] || '列表项布局区'}：1 个 item 模板 + v-for 渲染 ${elementCount} 项，禁止拆成 ${elementCount} 个子组件文件`
    : TYPE_RESPONSIBILITY[rawType] ||
      `${title || rawType || '区块'}（请按功能拆分）`;

  const scoreResult = calculateSplitScore(sec);
  const layoutMetadata = extractLayoutMetadata(sec);

  let internalSubcomponents = [];
  if (ctx.enableInternalSplit && scoreResult.shouldSplit && !collapsed) {
    internalSubcomponents = splitSectionInternally(sec, idx);
    ctx.allInternalSubcomponents.push(
      ...internalSubcomponents.map((sub) => ({
        ...sub,
        parentSectionId: sec.id || `section-${idx + 1}`,
        parentSectionTitle: title,
      })),
    );
  }

  const tabStructured = enforceTabStructure(sec);
  const tabOrientation = tabStructured.tabStructure?.orientation || 'vertical';
  const isHorizontalTab = tabStructured.tabStructure && tabOrientation === 'horizontal';

  const effectiveType = isHorizontalTab ? 'tabs' : rawType;
  const effectiveResponsibility = isHorizontalTab
    ? '标签页切换区（顶部横向 tab，下方为对应内容区，禁止竖向侧栏布局）'
    : responsibility;

  // 🛡️ 栅格列数事实透传（2026-09-14 · a612a9f7 实锤）：视觉分析
  //   preview-analysis.json 的 section 已含 `layout`（如 "grid"）与 `gridColumns`（如 3，
  //   schema 默认值 3），但原 buildEffectiveSection 只提取 layoutMetadata、把这两个字段丢了
  //   → 代码生成 prompt 的 `s.body.gridColumns` 恒为 null → LLM 自由发挥（真机偶发 4 列，
  //   设计稿 3 列）。这里把视觉事实原样透传，供 prompt-builder/constraint-reinforcement/
  //   code-structure-validator 消费（三处均已按 `section.body.gridColumns` 取值）。
  const rawLayout = String(sec.layout || sec.body?.layout || '').toLowerCase();
  const gridColumns = Number(
    sec.gridColumns ?? sec.body?.gridColumns ?? NaN,
  );
  const hasGridColumns = Number.isFinite(gridColumns) && gridColumns > 1;
  const layoutFact = rawLayout || (hasGridColumns ? 'grid' : '');

  return {
    id: sec.id || `section-${idx + 1}`,
    responsibility: effectiveResponsibility,
    elementCount,
    title: String(title).trim().slice(0, 30),
    type: effectiveType || undefined,
    // 🛡️ 布局事实（视觉分析原值）：'grid' | 'horizontal' | 'vertical' | ...
    ...(layoutFact ? { layout: layoutFact } : {}),
    // 🛡️ 栅格列数事实：仅当视觉分析明确给出才透传（缺失时下游保持自由发挥，不硬编码默认值）
    ...(hasGridColumns ? { gridColumns: Math.round(gridColumns) } : {}),
    collapsed,
    renderHint: collapsed ? 'v-for' : undefined,
    itemCount: collapsed ? elementCount : undefined,
    items: collapsed ? sec.items : undefined,
    // 🛡️ 下游消费契约：prompt-builder/constraint-reinforcement/code-structure-validator
    //   统一按 `section.body.gridColumns` 取值，故这里把脊柱字段收敛到 body。
    ...(layoutFact || hasGridColumns
      ? {
          body: {
            ...(layoutFact ? { layout: layoutFact } : {}),
            ...(hasGridColumns ? { gridColumns: Math.round(gridColumns) } : {}),
          },
        }
      : {}),
    // 🛡️ R1-1：归属的 Figma 节点 id 集合（供 dedupeDuplicateSections 做不依赖措辞的单一归属去重）
    sourceNodeIds: collectSourceNodeIds(tabStructured),
    complexityScore: scoreResult.score,
    complexityReasons: scoreResult.reasons,
    layoutMetadata,
    internalSubcomponents,
    shouldSplitInternally: collapsed ? false : scoreResult.shouldSplit,
    ...(tabStructured.tabStructure ? { tabStructure: tabStructured.tabStructure } : {}),
  };
}

function applyFlexGrowFallback(nodes) {
  const withHeight = [];
  const collect = (list) => {
    if (!Array.isArray(list)) return;
    for (const s of list) {
      if (s.layoutMetadata?.height > 0) withHeight.push(s);
      if (Array.isArray(s.children)) collect(s.children);
    }
  };
  collect(nodes);
  if (withHeight.length === 0) return;
  const avg =
    withHeight.reduce((sum, s) => sum + s.layoutMetadata.height, 0) / withHeight.length;
  const apply = (list) => {
    if (!Array.isArray(list)) return;
    for (const s of list) {
      const meta = s.layoutMetadata;
      if (meta && !(meta.flexGrow > 0) && meta.height > 0 && avg > 0) {
        meta.flexGrow = Math.round((meta.height / avg) * 1000) / 1000;
      }
      if (Array.isArray(s.children)) apply(s.children);
    }
  };
  apply(nodes);
}

/**
 * 🛡️ 治本（2026-09-14 · c-traffic-monitor-21e2afd6 实锤）：flex 比例改由 Figma 实测高度决定。
 *
 * 铁律：**事实源优先于 LLM 猜测**（同刀 16b「消费端事实优先于名字猜测」）。
 *
 * 实证：两张结构完全相同的双系列柱状图（2:7459 / 2:7628）Figma 高度**都是 131px**，
 *   而 vision 给出的 flexGrow 是 3.73 / 0.952（3.9 倍差）→ 原样写进 CSS →
 *   上一张图被拉高、下一张被压扁，是用户截图里「糟糕且可怕」的主要来源。
 *   prompt 契约里 flexGrow 的定义本就是「平均值为 1、比例 = 设计稿高度比」，
 *   Figma 实测高度是该定义唯一可靠的事实源，vision 的自报系数只能算猜测。
 *
 * 规则（逐层、可部分生效）：
 *   - 每一层独立归一：只统计本层「非 header 且能取到 Figma 高度」的 section；
 *   - 本层可测者 ≥ 2 → grow = 高度 / 本层平均高度（四舍五入 3 位），覆盖旧值；
 *   - 可测者 < 2 或取不到几何 → 保留原值（不动，交给 applyFlexGrowFallback 兜底）。
 *
 * @param {Array} nodes effectiveSections
 * @param {Map} figmaIndex indexFigmaNodes(figmaNodeData) 的产物
 * @returns {number} 被改写的 section 数（0 = 无事实源或不生效）
 */
function applyFigmaHeightGrow(nodes, figmaIndex) {
  if (!figmaIndex || typeof figmaIndex.get !== 'function' || figmaIndex.size === 0) {
    return 0;
  }
  let changed = 0;
  const apply = (list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const measured = [];
    for (const s of list) {
      // header section 归 base-panel 标题栏插槽，不参与列内 flex 分配，也不该污染平均值。
      if (s?.type === 'header') continue;
      const box = figmaSectionBox(s, figmaIndex);
      if (box && box.height > 0) measured.push({ s, height: box.height });
    }
    if (measured.length >= 2) {
      const avg =
        measured.reduce((sum, m) => sum + m.height, 0) / measured.length;
      if (avg > 0) {
        for (const { s, height } of measured) {
          const meta = s.layoutMetadata;
          if (!meta) continue;
          const next = Math.round((height / avg) * 1000) / 1000;
          if (meta.flexGrow !== next) {
            meta.flexGrow = next;
            changed += 1;
          }
        }
      }
    }
    for (const s of list) {
      if (Array.isArray(s.children)) apply(s.children);
    }
  };
  apply(nodes);
  return changed;
}

export class SubcomponentPlanner {
  /**
   * 基于 layoutStructure 产出子组件清单
   * 🎯 Phase 2 方案1: 增强子组件拆分 - 集成多维度评分和内部拆分策略
   *
   * @param {Object} layoutStructure - 来自 visual-parser 的结构化布局（含 sections[]）
   * @param {Object} [opts]
   * @param {number} [opts.minSectionsForced=3] - 至少多少有效 sections 才强制拆
   * @param {boolean} [opts.skipPanelHeaderFilter=false] - 是否跳过 panel-header 过滤
   *        微码流程用 false（默认），Vue3 流程用 true（Vue3 无 base-panel，header 要独立拆）
   * @param {boolean} [opts.enableInternalSplit=true] - 是否启用 section 内部拆分（Phase 2 新增）
   * @returns {{effectiveSections: Array, isForced: boolean, minFiles: number, reason: string, internalSubcomponents: Array}}
   */
  plan(layoutStructure, opts = {}) {
    const minSections = opts.minSectionsForced ?? 3;
    const skipPanelHeaderFilter = opts.skipPanelHeaderFilter ?? false;
    const enableInternalSplit = opts.enableInternalSplit ?? true;
    const diagnostics = summarizePipelineDiagnostics(opts.diagnostics || {});

    const rawSections =
      layoutStructure?.layout?.sections || layoutStructure?.sections || [];

    if (!Array.isArray(rawSections) || rawSections.length === 0) {
      return {
        effectiveSections: [],
        isForced: false,
        minFiles: 0,
        reason: 'layoutStructure 无 sections，跳过子组件规划',
        internalSubcomponents: [],
      };
    }

    // 过滤 panel-header（仅微码流程）
    // ⚠️ 刻意**不**在此复用 chrome-section-filter#isChromeOnlySection：实证（2026-09-14
    //   c-traffic-monitor-21e2afd6）raw section 全部为 role='inline-row' 且 children[].role='item'，
    //   而 hasBusinessBody 的业务正则为 /…|item|…/ → 恒为 true → 该过滤器对 inline-row 永远
    //   返回 false（死判据，加了也不生效）；且它命中即「整节剥离」，会连「当日总流量/流量预测
    //   tabs」一起删掉（上游 headerSlots 为 [] 无兜底），与「chrome 剥离仅微码」的既有契约冲突。
    //   真正的事实源在上游 visual-parser#_postProcessAnalysis 的 stripChromeSectionsInPlace。
    let sections = skipPanelHeaderFilter
      ? rawSections
      : rawSections.filter((sec) => !isPanelHeader(sec));

    const filteredCount = rawSections.length - sections.length;
    if (filteredCount > 0) {
      logger.info(`过滤 ${filteredCount} 个 panel-header section`);
    }

    // P2': 合并图例 section 到相邻图表 section
    sections = mergeLegendSections(sections);

    // 🛡️ 2026-09-10：同构重复卡片收成 list/grid（device 12 卡 + 12 装饰 → 1 个模板）
    const beforeCollapse = sections.length;
    sections = collapseRepeatedSiblingSections(sections);
    if (sections.length !== beforeCollapse) {
      logger.info('重复同构 section 已折叠为 list/grid', {
        before: beforeCollapse,
        after: sections.length,
        collapsed: sections
          .filter((s) => isCollapsedListSection(s))
          .map((s) => ({ id: s.id, type: s.type, itemCount: s.itemCount })),
      });
    }

    // 🛡️ A′ Phase 5：保留 container-rebuild 嵌套。容器不 flatten、不占独立 .vue 槽。
    const containerCount = sections.filter((s) => isLayoutContainerSection(s)).length;
    if (containerCount > 0) {
      logger.info('容器层级保留为嵌套 section', {
        containers: sections
          .filter((s) => isLayoutContainerSection(s))
          .map((s) => ({
            id: s.id,
            name: s.name,
            childIds: (s.children || []).map((c) => c.id),
          })),
      });
    }

    const allInternalSubcomponents = [];
    let effectiveSections = sections.map((sec, idx) =>
      buildEffectiveSection(sec, idx, { enableInternalSplit, allInternalSubcomponents }),
    );

    // 🛡️ 治本（2026-09-14 · c-traffic-monitor-34750940 实锤）：无归属壳锚定真实 Figma 节点。
    //   vision 用语义 id 起 section 名 → 真实 @echarts 图表节点被臆造成 src=[] 壳，
    //   下游判别力去重双输（真图表被当碎片杀、假壳被判超集留）。在裁决前先用 figma
    //   节点树（事实源）把壳锚定回真实节点；无 figmaNodeData 时零影响。
    if (opts.figmaNodeData && typeof opts.figmaNodeData === 'object') {
      const beforeAnchor = effectiveSections;
      effectiveSections = anchorPhantomSections(
        effectiveSections,
        opts.figmaNodeData,
      );
      if (effectiveSections !== beforeAnchor) {
        logger.info('无归属壳已锚定真实 Figma 节点', {
          anchored: effectiveSections
            .filter(
              (s, i) =>
                (beforeAnchor[i]?.sourceNodeIds || []).length === 0 &&
                (s?.sourceNodeIds || []).length > 0,
            )
            .map((s) => ({ id: s.id, sourceNodeIds: s.sourceNodeIds })),
        });
      }

      // 🛡️ 治本（2026-09-14 · c-traffic-monitor-21e2afd6 实锤）：按 Figma 视觉坐标重排。
      //   位置必须在 anchorPhantomSections **之后**（臆造图表壳此刻才拿到 sourceNodeIds）；
      //   planner 之后的所有下游——index.vue 组装、子组件命名、布局高度映射——全部按
      //   effectiveSections 顺序消费，这里不排就是全链路顺序错。
      //   实证：vision 数组序把「车型分布」(y=573) 排在两张柱状图 (y=287/428) 之前。
      const beforeSort = effectiveSections;
      effectiveSections = sortSectionsByFigmaY(
        effectiveSections,
        opts.figmaNodeData,
      );
      if (effectiveSections !== beforeSort) {
        logger.info('effectiveSections 已按 Figma 视觉坐标重排', {
          from: beforeSort.map((s) => s.id),
          to: effectiveSections.map((s) => s.id),
        });
      }

      // 🛡️ 治本：flex 比例同样以 Figma 实测高度为事实源（vision 自报 flexGrow 只作兜底）。
      const figmaIndex = indexFigmaNodes(opts.figmaNodeData);
      const growChanged = applyFigmaHeightGrow(effectiveSections, figmaIndex);
      if (growChanged > 0) {
        logger.info('flexGrow 已按 Figma 实测高度重新归一', {
          changed: growChanged,
          sections: effectiveSections
            .filter((s) => s.type !== 'header')
            .map((s) => ({ id: s.id, flexGrow: s.layoutMetadata?.flexGrow })),
        });
      }
    }

    applyFlexGrowFallback(effectiveSections);

    const leafSections = collectLeafSections(effectiveSections);
    const hasComplexSection = leafSections.some((s) => s.shouldSplitInternally);
    const isForced = leafSections.length >= minSections || hasComplexSection;
    const minFiles = isForced
      ? leafSections.length + allInternalSubcomponents.length
      : 0;

    const reason = isForced
      ? `有效叶子 sections=${leafSections.length} ≥ ${minSections} 或存在高复杂度 section → 强制拆分`
      : `有效叶子 sections=${leafSections.length} < ${minSections} 且无高复杂度 section → 不强制拆分`;

    const plan = {
      effectiveSections,
      isForced,
      minFiles,
      reason,
      internalSubcomponents: allInternalSubcomponents,
      diagnostics,
    };

    logger.info('子组件规划完成', {
      rawSectionsCount: rawSections.length,
      effectiveSectionsCount: effectiveSections.length,
      leafSectionsCount: leafSections.length,
      filteredCount,
      isForced,
      minFiles,
      sectionIds: effectiveSections.map((s) => s.id),
      leafSectionIds: leafSections.map((s) => s.id),
      internalSubcomponentsCount: allInternalSubcomponents.length,
      complexSections: leafSections
        .filter((s) => s.shouldSplitInternally)
        .map((s) => ({
          id: s.id,
          score: s.complexityScore,
          reasons: s.complexityReasons,
        })),
      diagnostics,
    });
    return plan;
  }
}

export const subcomponentPlanner = new SubcomponentPlanner();
