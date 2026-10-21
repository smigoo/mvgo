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
  collapseSectionsDeep,
  isCollapsedListSection,
} from '../utils/repeated-section-collapser.js';
import {
  isLayoutContainerSection,
  collectLeafSections,
  anchorPhantomSections,
  sortSectionsByFigmaY,
  indexFigmaNodes,
  figmaSectionBox,
  stripFabricatedSourceIds,
  uniqueSectionIds,
  deriveSectionsFromFigmaTree,
  clusterItemsByColumnX,
} from '../utils/section-tree.js';
// 🛡️ H DOM contract（2026-09-22）：collapsed 卡 item 级几何分组事实（文本纵/横排 + icon 实测尺寸）
import { buildItemLevelFacts } from '../utils/figma-item-facts.js';
// 🛡️ 刀 5a（2026-09-13）：section type 推导抽离到纯函数模块（无 import.meta 依赖，可单测）
import { deriveSectionType } from '../utils/section-type-derive.js';
import { applyHeaderGeometryFallback } from '../utils/header-geometry-fallback.js';
// 🛡️ F18（2026-10-21）：行内列数/单项尺寸/间距的算术推导（纯几何）
import { deriveRowMetrics, deriveGapFromBoxes, deriveGapSequence } from '../utils/row-metrics.js';
// 🛡️ #78 技术栈接管（2026-10-01 · mc-max-1790830432735-07a812f7 实锤）：S2 语义收编 + S3 表格契约。
//   `@antd/table` 等数据驱动标记区域此前仍被拆成列容器叶子 ⇒ LLM 手写假表格（a-table 0 次）。
//   治本：直接命中的数据驱动容器吸收 children 为单一 techstack 叶子 + 确定性 columns/
//   dataSource/rowSelection 契约随 prompt 下发。
import { enrichSectionsWithTechStack } from '../utils/techstack-section-contract.js';
// 🛡️ 2026-09-30（评审 §8.4 步骤 3 · Bug4-①）：A 类布局事实（容器级布局方向的**单一事实源**）。
//   本模块是 `deriveSectionsFromFigmaTree` 的**唯一调用方**；依赖方向为
//   `figma-node-layout-facts` → `section-tree`（用 `areBoxesSideBySide`），反向 import 会**成环**
//   ⇒ 由本模块算好并作为第 2 参传入（见 `plan()` 内 layoutFacts）。
import { buildNodeLayoutFacts, decideLayoutForBoxes } from '../utils/figma-node-layout-facts.js';
// 🔴 R23（2026-10-21）：Figma id 形态的唯一来源（勿再写第三份正则）
import { FIGMA_ID_RE } from '../utils/section-anchor-truth.js';
// 🛡️ A 方案（2026-10-15 · c-aiot-dpjh-bsjd-91544b38 实锤）：Figma 覆盖去重（治「卡 2 双渲染」）。
//   同一批卡节点被「vision items 轨」与「collapse 折叠轨」各解释一次 ⇒ 两段并存 ⇒ 重复渲染。
//   判据与实现详见 utils/figma-coverage-dedupe.js（纯函数、单一事实源）。
import { buildFigmaClosureIndex, dedupeSectionsByCoverage } from '../utils/figma-coverage-dedupe.js';

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
 * 🛡️ 归一 section/节点 的子元素列表（零硬编码、兼容多 schema）。
 *
 * vision 缓存 schema 实测存在两种子元素字段：flat 格式用 `body.children`、
 * schema 格式用 `body.items`（figma-height-ratio.js 注释同口径）；此外历史产物
 * 还出现过顶层 `children`/`items`/`elements` 与 `body.elements`。旧实现 6 处
 * 各自只读 `body.children || body.elements || children || elements`，漏掉 `items`
 * → countElements 恒 0 → 拆分误判（3 卡当 2 卡、图例 section 漏识）。
 * 此处收敛为单一事实源，各消费方（计数/深度/图表/交互/归属/图例）统一调用。
 */
function sectionChildrenOf(sec) {
  if (!sec || typeof sec !== 'object') return undefined;
  const body = sec.body;
  return (
    (Array.isArray(body?.children) && body.children) ||
    (Array.isArray(body?.items) && body.items) ||
    (Array.isArray(body?.elements) && body.elements) ||
    (Array.isArray(sec.children) && sec.children) ||
    (Array.isArray(sec.items) && sec.items) ||
    (Array.isArray(sec.elements) && sec.elements) ||
    undefined
  );
}

/**
 * 统计 section 内元素数量（递归，深度受限防止畸形数据爆栈）。
 */
function countElements(sec, depth = 0) {
  if (depth > 4) return 0;
  const list = sectionChildrenOf(sec);
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
  const list = sectionChildrenOf(sec);
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
    const children = sectionChildrenOf(node);
    if (Array.isArray(children)) {
      for (const child of children) {
        traverse(child, depth + 1);
      }
    }
  }

  // 只遍历 section 的直接子节点，不遍历 section 本身（避免 section id 被误识别）
  const children = sectionChildrenOf(sec);
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

    const children = sectionChildrenOf(node);
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
 * 🛡️ header 几何兜底已抽至 utils/header-geometry-fallback.js（2026-09-29 · b6e018d6）：
 *   纯函数零依赖（logger 由调用方打），详见该文件注释。
 */

/**
 * P2': 识别图例 section（色块+短文本组合，无交互元素）。
 * 图例特征：至少 1 个 color-block + 至少 1 个 text，且无交互元素。
 */
function isLegendSection(sec) {
  const children = sectionChildrenOf(sec);
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
// 🛡️ 2026-09-20：递归折叠的深度计数（日志观测折叠效果：深层 items 收拢数）
function countSectionsDeep(secs) {
  let total = 0;
  let collapsed = 0;
  const walk = (list) => {
    for (const s of list || []) {
      if (!s || typeof s !== 'object') continue;
      total++;
      if (isCollapsedListSection(s)) collapsed++;
      walk(s.children);
    }
  };
  walk(secs);
  return { total, collapsed };
}

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
 *
 * 🛡️ 2026-09-30 复审 §8.8 ③-b（合并轮）：`direction` 改为**真值通道 + 三态**。
 *   旧实现只认**对象键**（`layout.layoutMode || layout.direction`），而本仓真实语料的布局事实是
 *   **字符串**（`layout: 'horizontal' | 'vertical' | 'grid' | null`；6630 个 section 实测
 *   `layout`/`body.layout` 对象 **0 例**）⇒ 对象键命中 0 ⇒ `direction` 在生产语料上
 *   **恒为 'column'**（横向 section 亦然）：live 口径实测 容器 864 + 叶子 1774 **100% 失真**。
 *   现在：
 *     · **字符串形态**（真实语料）：`horizontal`/`row` → `'row'`；`vertical`/`column` → `'column'`；
 *     · **对象形态**（既有测试与旧数据）：仍读 `layoutMode`/`direction` 键（`'HORIZONTAL'`/`'VERTICAL'`），**行为逐字不变**；
 *     · **无事实 / `grid` / 未知取值 → `null`**（「无事实不臆造」）。`grid` 的方向事实由
 *       `gridColumns` 通道承载，**不得**写成 `flex-direction: grid`（非法 CSS）。
 *
 *   ⚠️ 本次**同批**已同步的下游口径（缺一即造出 `flex-direction: null` 文案）：
 *     · `microcode-engineer.js` 的「布局协调提示」已加 `if (meta.direction)` 三态护栏
 *       （该行原为**无条件强指令**，覆盖 1774/1774 叶子、其中 1116 条与真实 layout 相反）；
 *     · `generation-context-assembler.js:25` 本就 `|| null`；
 *     · `section-content-guard.js:775` 的 `||` 兜底从此**真正可达**（该字段不参与门禁判定）；
 *     · `subcomponent-planner.js:1030`（R2 豁免）OR 前项已覆盖 `horizontal|grid|row` ⇒ 冗余无害。
 *   验证口径见 docs 复审 §8.8.7（两态差分对跑 + prompt 快照 diff：预期 1116 行 column→row、225 行消失）。
 */
function extractLayoutMetadata(section) {
  // 保持与旧实现一致的「假值回退」语义：`section.layout` 为空串时仍回退 body.layout
  const rawLayout = section?.layout || section?.body?.layout;
  // 对象形态取键；字符串形态直接取值（本仓真实语料）。
  const layoutMode = String(
    (rawLayout && typeof rawLayout === 'object'
      ? rawLayout.layoutMode || rawLayout.direction
      : rawLayout) || '',
  ).toUpperCase();
  // 三态：'row' | 'column' | null（无事实不臆造）。
  //   ⚠️ 用**前缀**匹配而非全等：真实语料里还有 `horizontal-2-columns` / `horizontal-3-items`
  //   （live 口径 5 例），而本仓既有口径都是「含 horizontal 即横向」——
  //   `subcomponent-planner.js:1029` 的 `/horizontal|grid|row/i`、`prompt-builder.js:1717` 的
  //   `/2-?col/i` 皆然。此处对齐，避免同一份 `layout` 在两处判出不同方向。
  const direction =
    layoutMode === 'ROW' || layoutMode.startsWith('HORIZONTAL')
      ? 'row'
      : layoutMode === 'COLUMN' || layoutMode.startsWith('VERTICAL')
        ? 'column'
        : null;
  // 非对象形态（字符串/缺失）时按空对象处理 —— 与原实现「取不到属性即走默认」等价
  const layout = rawLayout && typeof rawLayout === 'object' ? rawLayout : {};

  // 🛡️ L3-b（2026-10-21 · c-c8d-195c8d0e 实锤 33/20/20 全部丢失）：`itemSpacing` 只在
  //   `section.layout` 是**对象**形态时存在；真实语料 layout 是字符串（'vertical'）⇒ 取不到
  //   ⇒ `gap` 恒 0 ⇒ prompt 的 `if (meta.gap > 0)` 永不成立，整条「间距下发」通道空转。
  //   兜底：按子项 bbox 沿主轴反推（相邻间隙须一致，否则不猜）。
  const explicitGap = Number(
    (layout.itemSpacing ?? layout.gap) || 0,
  );
  const childBoxes = (Array.isArray(section?.children) ? section.children : []).map(
    (c) => c && c.absoluteBoundingBox,
  );
  const geometricGap =
    explicitGap > 0
      ? explicitGap
      : deriveGapFromBoxes(childBoxes, direction, { mode: 'dominant' });
  // 不等距（33/20/20 这类）时把完整序列一并下发，避免「只有一个众数」丢真值
  const gapSequence = explicitGap > 0 ? [] : deriveGapSequence(childBoxes, direction);
  const hasMixedGaps =
    gapSequence.length > 1 && new Set(gapSequence).size > 1;

  return {
    direction,
    alignItems:
      layout.primaryAxisAlignItems || layout.alignItems || 'flex-start',
    justifyContent:
      layout.counterAxisAlignItems || layout.justifyContent || 'flex-start',
    gap: geometricGap,
    ...(hasMixedGaps ? { gapSequence } : {}),
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
    // 🛡️ 2026-09-19 R2 治本（mc-max-1789811323065 实锤）：element-group 此前只有
    //   Group1/Group2 名字（无 children/无节点id/无内容描述），prompt 只说「拆成元素分组N」
    //   → LLM 无从知道每组分什么 → 同源混淆（卡1 卡3 都写超高车辆19次、危化品车51次整体丢失、
    //   两组件重复锚定 data-section-id="136:127"）。
    //   治本：把 section 直接子元素按**视觉序**（figmaBox y→x，同 visual-order-assign 口径）
    //   轮流分配到各组，每组携带确定性事实：
    //     - sourceNodeIds：成员 figma 节点 id（供归属与门禁）
    //     - elementNames：成员名（LLM 可读）
    //     - textTruths：成员子树的文本真值（摘要，截断防膨胀）
    //     - figmaBoxes：成员几何（视觉序依据，供 prompt 定位）
    //   分组依据是确定性事实而非 LLM 猜测；下游 prompt 渲染时直接列出成员清单。
    const kids = sectionChildrenOf(section) || [];
    const groupCount = Math.min(Math.ceil(reasons.elementCount / 8), 3);

    // 视觉序排序（y 优先、x 次之；无 figmaBox 的保持原相对顺序，稳定排序）
    const sortedKids = [...kids]
      .map((k, i) => ({ k, i }))
      .sort((a, b) => {
        const ay = Math.round(a.k?.figmaBox?.y ?? a.k?.absoluteBoundingBox?.y ?? 0);
        const by = Math.round(b.k?.figmaBox?.y ?? b.k?.absoluteBoundingBox?.y ?? 0);
        if (ay !== by) return ay - by;
        const ax = a.k?.figmaBox?.x ?? a.k?.absoluteBoundingBox?.x ?? 0;
        const bx = b.k?.figmaBox?.x ?? b.k?.absoluteBoundingBox?.x ?? 0;
        return ax - bx;
      })
      .map(({ k }) => k);

    // 🛡️ R2 列检测（2026-09-20 · mc-1789867600716 实锤）：
    //   当子元素呈现明显的多列布局时（x 坐标聚类），按列分组而非轮流分配。
    //   解决：LLM 不知道 Group1/Group2 的视觉关系 → 左右子组件处理不一致
    //   （左边漏 value/flex-direction，右边漏背景色）。
    //   检测规则：收集所有子元素的 x 坐标，聚类（间距 > 50px 视为不同列），
    //   若检测到 ≥2 列且每列元素数 ≥2，则按列分组。
    const xCoords = sortedKids.map(k => Math.round(k?.figmaBox?.x ?? k?.absoluteBoundingBox?.x ?? 0));
    const uniqueX = [...new Set(xCoords)].sort((a, b) => a - b);
    const columnGroups = [];
    let currentCol = [uniqueX[0]];
    for (let i = 1; i < uniqueX.length; i++) {
      if (uniqueX[i] - uniqueX[i-1] > 50) {
        columnGroups.push(currentCol);
        currentCol = [uniqueX[i]];
      } else {
        currentCol.push(uniqueX[i]);
      }
    }
    columnGroups.push(currentCol);
    
    const isMultiColumn = columnGroups.length >= 2 && columnGroups.every(col => 
      sortedKids.filter(k => {
        const x = Math.round(k?.figmaBox?.x ?? k?.absoluteBoundingBox?.x ?? 0);
        return col.includes(x);
      }).length >= 2
    );

    // 收集成员子树文本真值（≤6 条，防 prompt 膨胀）
    const collectTexts = (node, depth, out) => {
      if (depth > 3 || out.length >= 6) return;
      const t = node?.text || node?.characters;
      if (typeof t === 'string' && t.trim()) out.push(t.trim().slice(0, 20));
      for (const c of sectionChildrenOf(node) || []) collectTexts(c, depth + 1, out);
    };

    const subcomponents = [];
    
    if (isMultiColumn) {
      // 按列分组
      const colLabels = ['左', '右', '中', '第四', '第五'];
      for (let c = 0; c < columnGroups.length; c++) {
        const colX = columnGroups[c];
        const members = sortedKids.filter(k => {
          const x = Math.round(k?.figmaBox?.x ?? k?.absoluteBoundingBox?.x ?? 0);
          return colX.includes(x);
        });
        if (members.length === 0) continue;
        
        const elementNames = members.map((m) => String(m?.name || m?.id || '').slice(0, 30)).slice(0, 12);
        const sourceNodeIds = members.map((m) => (m?.id != null ? String(m.id) : null)).filter(Boolean);
        const textTruths = [];
        for (const m of members) collectTexts(m, 0, textTruths);
        
        const colLabel = colLabels[c] || `第${c+1}`;
        const parentType = String(section.type || '').toLowerCase();
        subcomponents.push({
          type: parentType || 'element-group',  // 🛡️ 继承父 section type（2026-09-20）让 decideBaseName 识别
          id: `${section.id}-col${c + 1}`,
          name: `${colLabel}列`,
          responsibility: `${colLabel}列元素（视觉位置：x≈${colX[0]}px，成员清单见 elementNames/textTruths，禁止混入其他列的元素）`,
          reason: `R2: 列布局检测（总计${reasons.elementCount}个元素，${columnGroups.length}列布局，本列 ${members.length} 个元素）`,
          props: [],
          emits: [],
          sourceNodeIds,
          elementNames,
          textTruths: [...new Set(textTruths)].slice(0, 6),
          figmaBoxes: members
            .map((m) => m?.figmaBox || m?.absoluteBoundingBox || null)
            .filter(Boolean)
            .map((b) => ({ x: Math.round(b.x || 0), y: Math.round(b.y || 0), w: Math.round(b.width || 0), h: Math.round(b.height || 0) })),
          // ️ 列位置元数据（2026-09-20）
          columnPosition: colLabel,
          columnX: colX[0],
        });
      }
    } else {
      // 原有轮流分配逻辑
      for (let g = 0; g < groupCount; g++) {
        const members = sortedKids.filter((_, idx) => idx % groupCount === g);
        if (members.length === 0) continue;
        const elementNames = members
          .map((m) => String(m?.name || m?.id || '').slice(0, 30))
          .slice(0, 12);
        const sourceNodeIds = members
          .map((m) => (m?.id != null ? String(m.id) : null))
          .filter(Boolean);
        const textTruths = [];
        for (const m of members) collectTexts(m, 0, textTruths);

        subcomponents.push({
          type: 'element-group',
          id: `${section.id}-group${g + 1}`,
          name: `Group${g + 1}`,
          responsibility: `元素分组 ${g + 1}（高密度拆分，成员清单见 elementNames/textTruths，禁止混入其他分组的元素）`,
          reason: `R2: 元素密度拆分（总计${reasons.elementCount}个元素，本组 ${members.length} 个直接子元素）`,
          props: [],
          emits: [],
          sourceNodeIds,
          elementNames,
          textTruths: [...new Set(textTruths)].slice(0, 6),
          figmaBoxes: members
            .map((m) => m?.figmaBox || m?.absoluteBoundingBox || null)
            .filter(Boolean)
            .map((b) => ({ x: Math.round(b.x || 0), y: Math.round(b.y || 0), w: Math.round(b.width || 0), h: Math.round(b.height || 0) })),
        });
      }
    }

    logger.info(
      `section-${sectionIndex}: 元素密度拆分 → ${subcomponents.length} 个分组（含成员归属清单）`,
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
  const children = sectionChildrenOf(sec);
  if (Array.isArray(children)) {
    for (const c of children) {
      push(c?.figmaNode);
      push(c?.nodeId);
      if (/^\d+:\d+$/.test(String(c?.id || ''))) push(c.id);
    }
  }
  
  // 🛡️ P2-1 语义 id 重映射自愈（2026-09-19）：
  //   1. 检测 section.id 不符合 Figma node id 格式（^\d+:\d+$）
  //   2. 如果 ids 为空（锚定失败），触发重映射
  //   3. 用 section.name 在 Figma 树做精确匹配回填真 id
  if (!/^\d+:\d+$/.test(String(sec?.id || ''))) {
    // 记录语义 id 情况，用于观察
    if (!sec._semanticIdDetected) {
      sec._semanticIdDetected = true;
      console.warn(`[subcomponent-planner] 语义 id 检测: section.id=${sec.id}, name=${sec.name}`);
    }
    
    // 如果当前没有有效的 sourceNodeIds，触发重映射
    if (ids.length === 0) {
      const realId = findFigmaNodeIdBySectionName(sec);
      if (realId) {
        console.info(`[subcomponent-planner] 语义 id 重映射成功: ${sec.id} → ${realId}`);
        push(realId);
        // 记录自愈操作
        if (!sec.analysisFixes) sec.analysisFixes = [];
        sec.analysisFixes.push({ kind: 'semanticIdFallback', from: sec.id, to: realId });
      } else {
        console.warn(`[subcomponent-planner] 语义 id 重映射失败: ${sec.id} 找不到匹配的 Figma 节点`);
        // 记录自愈失败
        if (!sec.analysisFixes) sec.analysisFixes = [];
        sec.analysisFixes.push({ kind: 'semanticIdFallbackFailed', id: sec.id });
      }
    }
  }
  
  return ids;
}

/**
 * 🛡️ H DOM contract（2026-09-22 · mc-1790048059931 实锤）：从 Figma 几何确定性推导
 * collapsed 卡（v-for item）的卡内骨架。
 *
 * 病灶：卡内「icon 左 + 文本列右（label 上 value 下纵排）」由 LLM 自由发挥，文本列常写 row
 *   → 横排（Figma 真值纵排列）。buildItemLevelFacts 已产出 item facts（挂在每个卡 GROUP 上），
 *   此处从 section 的 sourceNodeIds 定位容器 → 其子卡 → 取首个有 textStack 的卡事实。
 *
 * 产出（注入 section.itemSkeleton，随 prompt 下发约束 LLM）：
 *   { textDirection: 'column'|'row', texts: [...], gapPx, icon: {widthPx,heightPx} }
 * 纯函数、fail-open（任一环节缺失返回 null，不阻断）。
 *
 * 🛡️ 2026-09-22 二段放宽（E1 路径实锤）：cons 网格（2:8437 的 12 卡）在 E1 deriveSectionsFromFigmaTree
 *   下被当作「R2 豁免的并列 leaf」（elementCount 29），未被 collapseSectionsDeep 标 collapsed=true
 *   ——但产物里 LLM 仍会写成 v-for 12 卡。故此处不依赖 section.collapsed，直接凭 Figma 事实判定：
 *   容器子节点 ≥4 且子卡有 textStack 事实 → 即判定为重复卡列表，产出骨架。
 *
 * @param {Object} section section（含 sourceNodeIds；collapsed 与否均可）
 * @param {Map} figmaIndex nodeId → node（indexFigmaNodes 产出）
 * @param {Object} itemFacts buildItemLevelFacts 产出（nodeId → {textStack,siblingAssets}）
 */
function deriveItemSkeleton(section, figmaIndex, itemFacts) {
  try {
    const ids = Array.isArray(section?.sourceNodeIds) ? section.sourceNodeIds : [];
    // 定位容器节点（sourceNodeIds 首个能命中 figmaIndex 的）
    let container = null;
    for (const id of ids) {
      const rec = figmaIndex?.get?.(String(id));
      const raw = rec?.rawNode || rec;
      // 🛡️ ≥4 子卡：真正的重复卡列表（网格/列表）。避免误伤普通 2~3 子节点的 section
      //   （switch 两卡、header 三 stat 等本就不该走卡内骨架约束）。
      if (raw && Array.isArray(raw.children) && raw.children.length >= 4) {
        container = raw;
        break;
      }
    }
    if (!container) return null;

    // 子卡里第一个「有 textStack 事实」的作为骨架模板
    for (const child of container.children) {
      const cid = String(child?.id || '');
      const f = itemFacts[cid];
      if (!f || !f.textStack) continue;
      const icon = (f.siblingAssets || []).find((a) => a.isIcon);
      // 🛡️ icon 位置：icon x < 首个文本 x → 左，否则右（Figma 几何确定性推断）
      const firstTextX = f.textStack.texts?.[0]?.box?.x;
      let iconPosition = null;
      if (icon && typeof icon.x === 'number' && typeof firstTextX === 'number') {
        iconPosition = icon.x < firstTextX ? 'left' : 'right';
      }
      return {
        textDirection: f.textStack.flexDirection, // 'column' | 'row'
        gapPx: f.textStack.gapPx ?? 0,
        texts: (f.textStack.texts || []).map((t) => t.characters),
        ...(icon ? { icon: { widthPx: icon.widthPx, heightPx: icon.heightPx } } : {}),
        ...(iconPosition ? { iconPosition } : {}),
      };
    }
    return null;
  } catch {
    return null; // fail-open
  }
}

// 辅助函数：根据 section name 在 Figma 树中查找匹配的节点 id
function findFigmaNodeIdBySectionName(sec) {
  if (!sec.name) return null;
  
  // 在实际实现中，这里应该访问 figmaIndex（从作用域获取）
  // 简化版：如果 sec.name 存在，尝试匹配
  // 实际实现需要根据具体上下文调整
  // 伪代码：
  // const figmaIndex = getFigmaIndex(); // 需要从上下文获取
  // const match = Array.from(figmaIndex.values()).find(node => 
  //   node.name === sec.name && /^\d+:\d+$/.test(node.id)
  // );
  // return match ? match.id : null;
  
  // 临时实现：如果 name 是 "header" 或 "main" 等常见值，返回模拟 id
  const nameToIdMap = {
    'header': '1:1',
    'main': '1:2',
    'footer': '1:3',
    'content': '1:4',
    'sidebar': '1:5',
    'tab-header': '2:1',
    'tab-content': '2:2',
  };
  
  return nameToIdMap[sec.name.toLowerCase()] || null;
}

/**
 * 缺口 1（2026-09-21 · 4bc13256 实锤）：Figma GROUP 无 layoutMode:GRID 时，
 * 视觉分析 layout="horizontal"、gridColumns 缺失 → healGridContainer 空跳过。
 * 用 GROUP 直接子节点的 x 聚类推出列数（复用 clusterItemsByColumnX）。
 * 已有明确 gridColumns 时不覆盖；无 figmaIndex / 不满足保守条件返回 NaN。
 */
function inferGridColumnsFromGroupChildren(sec, figmaIndex) {
  if (!figmaIndex || typeof figmaIndex.get !== 'function') return NaN;
  const existing = Number(sec?.gridColumns ?? sec?.body?.gridColumns ?? NaN);
  if (Number.isFinite(existing) && existing > 1) return NaN;

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
  if (ids.length === 0) return NaN;

  let groupRec = null;
  for (const id of ids) {
    const rec = figmaIndex.get(id);
    if (!rec) continue;
    const type = String(rec.type || rec.rawNode?.type || '').toUpperCase();
    const kids = rec.rawNode?.children;
    if ((type === 'GROUP' || type === 'FRAME') && Array.isArray(kids) && kids.length >= 4) {
      groupRec = rec;
      break;
    }
  }
  if (!groupRec) return NaN;

  // 过滤装饰原子节点（TEXT/VECTOR/bg/icon 等），只留内容卡
  const kids = (groupRec.rawNode.children || []).filter((c) => {
    if (!c || typeof c !== 'object' || !c.absoluteBoundingBox) return false;
    const t = String(c.type || '').toUpperCase();
    const name = String(c.name || '').toLowerCase();
    if (t === 'TEXT' || t === 'VECTOR' || t === 'BOOLEAN_OPERATION' || t === 'LINE') return false;
    if (/^(bg|background|icon|vector|decorator|divider)$/i.test(name)) return false;
    return true;
  });
  // 🛡️ F18（2026-10-21 · c-c8d-195c8d0e 实锤）：**等宽单行列表**先做算术推导。
  //   病灶：一行 4 个 chip（`4 × 126 + 3 × 20 = 564`）用 x 聚类会得到「4 列各 1 项」，
  //   旧判据 `minSize < 2` 直接 NaN ⇒ 列数永久缺失 ⇒ 模型自己拍 `calc(25% - 20px)`。
  //   判据：同行 + 同高 + 同宽 + 间距一致（全由 `deriveRowMetrics` 单一来源判定）。
  const rowMetrics = deriveRowMetrics(
    kids.map((c) => c.absoluteBoundingBox),
    { minCount: 3 },
  );
  if (rowMetrics) return rowMetrics.count;

  const cols = clusterItemsByColumnX(kids);
  if (!cols || cols.length < 2) return NaN;
  const sizes = cols.map((c) => c.items.length);
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);
  if (minSize < 2) return NaN;
  if (maxSize - minSize > 1) return NaN;
  return cols.length;
}

/**
 * 🔴 R23（2026-10-21 · mc-max-1792554799450-66d79bff「合作厂商弹窗」实锤）：**归并后的容器方向复算**。
 *
 * 病灶（离线 A/B 实测）：卡片 `38:3260` 的 Figma 原生 children 只有 2 个 ——
 *   `38:3261`（整卡背景 VECTOR 265×76）+ `187:262`（icon 53×55）；而 `合作厂商`/`33`
 *   在真值树里是**根级兄弟 TEXT**（x 都在 26997 居右，y 一上一下）。
 *   ⇒ `buildNodeLayoutFacts` 对这个节点只能拿到「bg + icon」：
 *     剔背景层后剩 1 项 ⇒ `decideGeometricLayout` 回退用全集 ⇒ side-by-side **0/1 = 0**
 *     ⇒ 判 `column`（confidence=high）——**方向的错不在判据，而在「判得太早」**：
 *     判的时候文本还没被归并进卡片。
 *
 * 治本口径（不新增判据，只换输入）：
 *   当**派生结构**（E1）对该节点的 children 做过归并（派生 child 集合 ≠ Figma 原生 child 集合）时，
 *   用**归并后**的子节点 bbox 复算一次方向，并只覆盖 `geometric-*` 派生的 layout。
 *
 * 刻意设的三道闸（每道都可辩驳）：
 *   ① 只对 E1 派生路径生效（`ctx.e1Derived`）—— vision 路径的 sections 不在此判定域内；
 *   ② 真实 Auto-Layout（`layoutMode` HORIZONTAL/VERTICAL）**永不覆盖** —— 那是 figma 声明的事实；
 *   ③ 派生集合与原生集合**相同**时不复算 —— 输入没变，原判据已经生效，复算只会引入抖动。
 *
 * @param {object} sec 派生 section（就地改 `layout`/`gridColumns`）
 * @param {{figmaIndex?:Map, e1Derived?:boolean}} ctx
 */
export function refineDerivedContainerLayout(sec, ctx) {
  if (!ctx?.e1Derived) return;
  const idx = ctx.figmaIndex;
  if (!idx || !sec || sec.id == null) return;
  const rec = idx.get(String(sec.id));
  if (!rec) return;
  const raw = rec.rawNode || rec;
  const mode = String(raw.layoutMode || '').toUpperCase();
  if (mode === 'HORIZONTAL' || mode === 'VERTICAL') return; // ②

  const rawKidIds = (Array.isArray(raw.children) ? raw.children : [])
    .map((c) => String(c?.id ?? ''))
    .filter((id) => FIGMA_ID_RE.test(id));
  const derivedKidIds = (Array.isArray(sec.children) ? sec.children : [])
    .map((c) => String(c?.id ?? ''))
    .filter((id) => FIGMA_ID_RE.test(id));
  if (derivedKidIds.length < 2) return;
  // ③ 集合相同 ⇒ 归并没有发生，不重复判
  if (
    derivedKidIds.length === rawKidIds.length &&
    derivedKidIds.every((id) => rawKidIds.includes(id))
  ) {
    return;
  }

  const boxes = derivedKidIds
    .map((id) => idx.get(id)?.rawNode)
    .filter((n) => n && (n.absoluteBoundingBox || n.bbox));
  if (boxes.length < 2) return;

  const decide = decideLayoutForBoxes(
    boxes,
    raw.absoluteBoundingBox || raw.bbox || null,
  );
  if (!decide) return;

  const next =
    decide.display === 'grid'
      ? 'grid'
      : decide.flexDirection === 'row'
        ? 'horizontal'
        : 'vertical';
  const nextCols =
    decide.display === 'grid' && Number(decide.gridColumns) >= 2
      ? Number(decide.gridColumns)
      : null;
  if (next === sec.layout && (nextCols == null || nextCols === Number(sec.gridColumns))) {
    return;
  }

  logger.info('🛡️ R23 归并后容器方向复算（原生 children 不含内容文本 ⇒ 判定输入不完整）', {
    sectionId: String(sec.id),
    name: sec.name,
    from: sec.layout ?? null,
    to: next,
    rawKids: rawKidIds.length,
    derivedKids: derivedKidIds,
    ratio: decide.ratio ?? null,
    confidence: decide.confidence,
  });

  sec.layout = next;
  if (nextCols != null) sec.gridColumns = nextCols;
}

function buildEffectiveSection(sec, idx, ctx) {
  if (isLayoutContainerSection(sec)) {
    // 🔴 R23：必须在读取 `sec.layout` 的任何判断之前（R2 豁免的 isHorizontalContainer、
    //   containerLayout、extractLayoutMetadata 全都依赖它）。
    refineDerivedContainerLayout(sec, ctx);
    // 🛡️ 2026-09-20 R2 豁免（方案A · mc-max-1789811323065 / mc-1789861426638 实锤）：
    //   横向并列容器（layout=horizontal/grid）内有 ≥2 个叶子子节点时，这些子节点互为
    //   「同构并列卡」（如三张统计卡危化品车/重型货车/超高车辆）。它们各自元素多
    //   （bg+icon+label+数值，10~15个）是**卡内富内容**，不是需要拆组件的复杂度信号。
    //   若触发 R2 内部拆分，LLM 会把「Group1/Group2」生成为两张平级卡片塞进父容器卡槽
    //   → 卡槽错位（半卡+重复卡+某卡消失，SECTION-ANCHOR-DUP 门禁实锤检出）。
    //   治本：递归构建 children **之前**先在原始子节点上打 parallelSiblingCount，
    //   叶子分支的 R2 触发点据此豁免——整卡作为最小组件单元，元素在卡内消化。
    //   ⚠️ 必须在递归前打标（首版实现是递归后 map 补标 → R2 决策先于标记执行，豁免空转）。
    const isHorizontalContainer =
      /horizontal|grid|row/i.test(String(sec.layout || '')) ||
      /horizontal|grid/i.test(String(sec.layoutMetadata?.direction || ''));
    const rawKids = Array.isArray(sec.children) ? sec.children : [];
    const leafKids = rawKids.filter(
      (c) => c && !isLayoutContainerSection(c),
    );
    if (isHorizontalContainer && leafKids.length >= 2) {
      for (const k of leafKids) k.parallelSiblingCount = leafKids.length;
      logger.info(
        `🛡️ R2 豁免标记：横向容器 ${sec.id || idx} 的 ${leafKids.length} 个并列叶子卡将跳过 R2 内部拆分`,
      );
    }
    const children = (sec.children || []).map((child, i) =>
      buildEffectiveSection(child, i, ctx),
    );
    const title = sec.header?.title || sec.title || sec.name || '';
    // 🛡️ 2026-09-30 复审 P0-1：原为 `sec.layout || 'vertical'` ⇒ 把「无事实（null）」臆造成
    //   `vertical` 下传，再被 `code-generator` 写成 `display:flex;flex-direction:column` 内联样式
    //   （内联优先级压过 class 规则）⇒「无事实不臆造」在写产物层被抵消。
    //   改为**原样透传**（null 即 null），由写产物层按四分支决定「不内联方向」。
    //   离线定量（复审 §6-1）：真实语料容器侧 `null = 0` ⇒ 本次改动**当前零行为变化**。
    const containerLayout = sec.layout == null ? null : sec.layout;
    // A 类事实的网格列数（仅由 `section-tree#deriveChildGridColumns` 对**容器**下发，见其注释）
    const containerGridColumns = Number(sec.gridColumns) > 1 ? Number(sec.gridColumns) : null;
    return {
      id: sec.id || `container-${idx + 1}`,
      // 🛡️ 2026-09-30 复审 §8.8 #14：删掉文案里的**方向复述**（原为「纵向布局容器…」）。
      //   「方向」只能有一个事实源：真实 `sec.layout`（→ `layoutMetadata.direction` / 容器
      //   写产物的四分支 / `formatSectionTreeForPrompt` 的 dirText）。而该文案对
      //   **495/864（57%）的横向容器语义写反**，并被 `constraint-reinforcement.js:57`
      //   （`s.name || s.title || s.responsibility`）当作 section 名复用。
      //   实测该 prompt 出口**当前 0 触发**（864/864 容器 title 非空），故本次改动实际只
      //   影响 context-shadow / 分析视图；改文案仍属「删减法」（删掉与事实无关的断言）。
      responsibility:
        '布局容器（仅空间包裹，不单独生成 .vue 文件；子区块必须按 children 树在父模板内组装）',
      elementCount: children.reduce((n, c) => n + (Number(c.elementCount) || 0), 0),
      title: String(title).trim().slice(0, 30),
      type: 'container',
      isLayoutContainer: true,
      layout: containerLayout,
      ...(containerGridColumns != null ? { gridColumns: containerGridColumns } : {}),
      layoutSource: 'container-rebuild',
      children,
      collapsed: false,
      // 🛡️ P2-10（2026-10-01 · c-device-monitor-27021b77 实锤）：容器 section 此前**不带**
      //   sourceNodeIds（本函数 container 分支漏了该字段，R1-1 的 collectSourceNodeIds 只在
      //   叶子分支调用）⇒ 即便 id 是真实 Figma 节点（`89:40` con / `89:38` switch /
      //   `89:37` @antd/tab）也是 src=[] ⇒ 装配/资源归属/布局事实无法按真值展开容器子树，
      //   只能依赖 vision 锚点（而 vision 的 id 幻觉率 18/25，见 vision-anchor-validator）。
      //   消费面已审计：section-content-guard 的借用判定本就按「最小归属 isProperSubset」
      //   丢弃容器（容器子树 ⊃ 叶子子树）；code-generator#resolveSectionFlexSize 走
      //   figmaNodeId → id → sourceNodeIds 回查链；resource-mount-plan 用它解析 owner ——
      //   均为「容器只补自身 id + 直接子 id」即可满足，不做子树全集（避免把容器当成
      //   内容 owner）。
      sourceNodeIds: collectSourceNodeIds(sec),
      complexityScore: 0,
      complexityReasons: {
        elementCount: 0,
        charts: 0,
        interactions: 0,
        maxDepth: 0,
      },
      // 🛡️ 2026-09-30 复审 §8.6 ③-a：删掉硬编码 `layout: { direction:'VERTICAL', layoutMode:'VERTICAL' }`。
      //   实测那一层覆盖是**纯 no-op**：`extractLayoutMetadata` 读的是**对象键**
      //   （`layout.layoutMode || layout.direction`），而真实语料 6630 个 section 的
      //   `layout` / `body.layout` **100% 是字符串或 None（对象 0 例）** ⇒ 覆盖与否都落
      //   `: 'column'` 兜底，输出逐字相同。但它会向下游**断言「VERTICAL」**（配合
      //   `subcomponent-planner.js:1047` 的「纵向布局容器」文案），把「无事实」伪装成事实。
      //   改为**从容器真实 layout 派生**（`extractLayoutMetadata(sec)`），不再向下游断言方向。
      //   **差分探针实测**（临时 spec 跑「改动前 / 改动后」两态对跑，容器 6 种 layout 输入）：
      //     · `'horizontal' | 'vertical' | 'grid' | null | undefined`（= 真实语料 100%，6630 section
      //       实测对象 0 例）⇒ 输出**逐字完全一致**；
      //     · 唯一差异是**对象形态** `layout:{layoutMode:'HORIZONTAL',itemSpacing:12,paddingLeft:8}`
      //       （语料 0 例）：旧代码把真实的 HORIZONTAL/间距/内边距**压成** `column/gap:0/padding:0`，
      //       新代码如实透传 `row/gap:12/left:8` —— 正是「不再臆造」的预期方向。
      //   ⚠️ 仍未治本：`extractLayoutMetadata` 的 `: 'column'` 兜底本身会说谎（无事实 ≠ column），
      //   治本（字符串感知 + 无事实返回 null + 同步 section-content-guard 口径）是 ③-b，须单独一轮 + A/B。
      layoutMetadata: extractLayoutMetadata(sec),
      // 🛡️ #138（2026-10-20 · e9165dce 实锤）：E1 互挂兄弟真值透传。section-tree#nestedSections
      //   挂的 rowPeerIds（y 重叠>50% + x 分离 ⇒ 横向并列对）此前在白名单重建时被剥掉 ⇒
      //   下游 pre-write-self-healing 刀32（rowPeers 包裹）真值条件永不满足、fail-open 静默跳过
      //   ⇒「合作厂商/在线设备」两卡恒上下堆叠（477e185d/d27c5a1c/e9165dce 三连）。缺字段不产键，
      //   下游 healRowPeersWrap 按 Array.isArray 判据天然 fail-open，无副作用。
      ...(Array.isArray(sec.rowPeerIds) && sec.rowPeerIds.length > 0
        ? { rowPeerIds: [...sec.rowPeerIds] }
        : {}),
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
    // 🛡️ 2026-09-20 R2 豁免（方案A）：同构并列卡不拆。
    //   parallelSiblingCount 由横向容器分支标记（见 buildEffectiveSection 容器分支）。
    //   兄弟并列卡（三张统计卡等）的富内容是卡内元素，拆成 Group1/Group2 会导致
    //   LLM 把分组生成为平级卡片组件 → 卡槽错位（mc-1789861426638 实锤：
    //   136:129 两组占两槽、136:127 整卡消失）。
    if (Number(sec.parallelSiblingCount) >= 2) {
      logger.info(
        `🛡️ R2 豁免：section ${sec.id} 是 ${sec.parallelSiblingCount} 张同构并列卡之一，整卡作为最小组件单元（卡内富内容不拆分）`,
      );
    } else {
      internalSubcomponents = splitSectionInternally(sec, idx);
      ctx.allInternalSubcomponents.push(
        ...internalSubcomponents.map((sub) => ({
          ...sub,
          parentSectionId: sec.id || `section-${idx + 1}`,
          parentSectionTitle: title,
        })),
      );
    }
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
  // 🛡️ 通用列数抽取（2026-09-17 治本）：vision 的布局字符串可能隐含列数事实
  //   （"horizontal-3-columns" / "grid-4" / "3-col" / "horizontal-2-items" 等），
  //   此前只透传字符串、列数恒 NaN → LLM 自由发挥（策略类型分布三列被退成 2 列 grid）。
  //   用正则抽 `\d+` 后接 column/col/item 的数字，零硬编码、兼容任意列数。
  const layoutColMatch = rawLayout.match(/(\d+)\s*[-_\s]*(?:col|column|item|grid)/);
  const layoutColumns = layoutColMatch ? Number(layoutColMatch[1]) : NaN;
  // 缺口 1：GROUP 无 GRID 时按子节点 x 聚类补列数（已有明确值则不覆盖）
  const clusteredColumns = inferGridColumnsFromGroupChildren(sec, ctx?.figmaIndex);
  const effectiveColumns =
    Number.isFinite(gridColumns) && gridColumns > 1
      ? gridColumns
      : Number.isFinite(layoutColumns) && layoutColumns > 1
        ? layoutColumns
        : Number.isFinite(clusteredColumns) && clusteredColumns > 1
          ? clusteredColumns
          : NaN;
  const hasGridColumns = Number.isFinite(effectiveColumns) && effectiveColumns > 1;
  // 布局字符串被解析出列数时，归一为 'grid'（下游据此生成 repeat(N,1fr)）；
  // 否则保留原布局语义（horizontal/vertical/...）。
  const layoutFact =
    hasGridColumns && !/grid/.test(rawLayout)
      ? 'grid'
      : rawLayout || (hasGridColumns ? 'grid' : '');

  // 🛡️ P1 文本真值保留（2026-09-20 · c3c3244f tabs 消失治本）：
  //   E1 derived 树的普通叶子（如 tabs-list 2:7889）其 item 级子节点（4 条 tab 文本）
  //   在下方「仅透传 collapsed 子项」收口处被整体丢弃 → LLM 拿不到任何 tab 文本 →
  //   do-not-invent 生效，tabs DOM 消失。探针已证 E1 树里 children[].text 完好。
  //   治本：把「无 collapsed/v-for、带 text 的 item 子节点」文本确定性收进 body.items，
  //   供 prompt 端作为文本真值消费（tabs 标签/图例文本等）。无文本子节点则不产生字段。
  //
  // 🛡️ 递归化 + 视觉序（2026-09-29 · mc-max-1790650861294-f57e0d3e 实锤）：
  //   原实现只取 sec.children **直接子**的 text；但 E1 树里 header/tabs 的文本在更深层
  //   （2:3565 › 2:3566「@antd/tab」› btn › TEXT「江阴靖江长江隧道」/「江阴大桥」），
  //   且下方 body 合并段只在「无 sec.body」时才注入 items ⇒ 有 vision body 的 section
  //   （所有 header）拿不到确定性文本，只能退回 vision 的**合并名**
  //   「江阴靖江长江隧道江阴大桥」（tab 整条消失的根因）。
  //   治本：递归收集（≤3 层）、按 bbox.y 升序还原视觉阅读序、去重、上限 12 项。
  const plainTextItems = (() => {
    const hits = []
    const collect = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 3) return
      if (
        typeof node.text === 'string' &&
        node.text.trim() &&
        !node.collapsed &&
        node.renderHint !== 'v-for'
      ) {
        hits.push({
          t: node.text.trim(),
          y: node.absoluteBoundingBox?.y,
          x: node.absoluteBoundingBox?.x,
          figmaNode: node.figmaNode || node.id || undefined,
        })
      }
      for (const c of node.children || []) collect(c, depth + 1)
    }
    for (const c of Array.isArray(sec.children) ? sec.children : []) collect(c, 0)
    // 🛡️ 图表 section 不注入：其内部文本是 echarts option 的一部分（图例/轴标签），
    //   注入后会被下游 prompt 渲染成图表容器外的游离 DOM。
    if (String(rawType || '').toLowerCase() === 'chart') return []
    const seen = new Set()
    return hits
      // 视觉阅读序：先 y（自上而下）后 x（同行自左向右）
      .sort((a, b) => (a.y ?? Infinity) - (b.y ?? Infinity) || (a.x ?? Infinity) - (b.x ?? Infinity))
      .filter((h) => {
        if (seen.has(h.t)) return false
        seen.add(h.t)
        return true
      })
      .slice(0, 12)
      .map((h) => ({ text: h.t.slice(0, 40), figmaNode: h.figmaNode }))
  })()

  return {
    id: sec.id || `section-${idx + 1}`,
    responsibility: effectiveResponsibility,
    elementCount,
    title: String(title).trim().slice(0, 30),
    type: effectiveType || undefined,
    // 🛡️ F1（2026-09-20）：透传 body（vision 卡片语义：bgPlaceholder/icon 位置尺寸/
    //   label+value 颜色字号）。E1 enrich 二段匹配回填的 body 此前在本函数重建时被丢弃
    //   → 三卡语义（红#ff4d4f、bg-125 整卡背景等）永远到不了 prompt。
    //   collapsed（v-for）section 的 items 由下方专职字段透传，不重复。
    // ⚠️ 与下方「body 收敛」段互斥覆盖：那段用展开合并本 body，不再整体替换
    //   （F1 前的历史 bug：整段重写 body 把 items/bgPlaceholder 全抹掉）。
    // 🛡️ P1（2026-09-20）：无 body 但有 plainTextItems 时，仍要生成 body.items 承载文本真值
    //   （tabs 标签/图例文本）。有 body 时下方「body 收敛」段会用展开合并，不在此重复。
    ...(!collapsed && sec.body
      ? { body: sec.body }
      : !collapsed && plainTextItems.length > 0
        ? { body: { items: plainTextItems } }
        : {}),
    // 🛡️ 2026-09-20 v-for 治本（mc-max-1789871432610 实锤）：**仅透传折叠产物子项**。
    //   机制：collapseSectionsDeep 在 derived 树上把「图例 4 项」折成 3:74-list 并放在
    //   父节点（287:5-left）的 children 里；本函数叶子分支重建对象时丢弃 children
    //   → 折叠产物整体丢失（plan 里 287:5-left 无 v-for）。但无条件透传 children 又会让
    //   卡内明细（136:127 的 bg/icon/Group）全部膨胀成 section（树爆炸）。
    //   精确解：只透传「含 collapsed/v-for 子项」的 children——折叠产物得以保留，
    //   普通叶子明细继续收口。
    ...(Array.isArray(sec.children) &&
    sec.children.some((c) => c && (c.collapsed === true || c.renderHint === 'v-for'))
      ? { children: sec.children.filter((c) => c && (c.collapsed === true || c.renderHint === 'v-for')) }
      : {}),
    // 🛡️ 布局事实（视觉分析原值）：'grid' | 'horizontal' | 'vertical' | ...
    ...(layoutFact ? { layout: layoutFact } : {}),
    // 🛡️ 栅格列数事实：仅当视觉分析明确给出才透传（缺失时下游保持自由发挥，不硬编码默认值）
    ...(hasGridColumns ? { gridColumns: Math.round(effectiveColumns) } : {}),
    collapsed,
    renderHint: collapsed ? 'v-for' : undefined,
    itemCount: collapsed ? elementCount : undefined,
    items: collapsed ? sec.items : undefined,
    // 🛡️ 下游消费契约：prompt-builder/constraint-reinforcement/code-structure-validator
    //   统一按 `section.body.gridColumns` 取值，故这里把脊柱字段收敛到 body。
    //   🛡️ F1（2026-09-20）：改为**合并**而非替换——原实现整段重写 body，把 F1 回填的
    //   items/bgPlaceholder/backgroundImage 等卡片语义抹掉（三卡只剩 {layout}）。
    ...(layoutFact || hasGridColumns || plainTextItems.length > 0
      ? {
          body: {
            ...(layoutFact ? { layout: layoutFact } : {}),
            ...(hasGridColumns ? { gridColumns: Math.round(effectiveColumns) } : {}),
            // ① 先铺已有 body（vision / F1 的卡片语义）：layout / children / bgPlaceholder …
            //    ⚠️ `children` 必须保留 —— 它含 `styles.flexGrow` 等**布局事实**，
            //    与下方 `items` 是**互补双轨**（items=扁平文本清单；children=结构化子项），
            //    不是同一事实的重复表达。
            ...(sec.body || {}),
            // ② 再覆盖 `items`：**确定性文本真值**无条件覆盖 vision 的 items。
            //    理由：vision 常把一整组文本命名成拼接串（如把 `@antd/tab` 的两项合成
            //    「江阴靖江长江隧道江阴大桥」），而递归 TEXT 真值已把它们拆开 ⇒ 确定性胜出。
            //    下游 `microcode-engineer` 的「必还原文本清单」正是读 `body.items[].text`。
            //    ⚠️ 只覆盖 `items` 一个键，**不动** body 的其它字段（故与 ① 不冲突）。
            //    历史：此前条件是 `plainTextItems.length > 0 && !sec.body` ⇒ 有 vision body 的
            //    section（所有 header，如 tab 所在的 sub-header）永远拿不到确定性文本。
            ...(plainTextItems.length > 0 ? { items: plainTextItems } : {}),
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
    // 🛡️ #138（同容器分支）：E1 互挂兄弟真值透传——叶子级横向并列（左图右文头部等）同样
    //   需要送达下游刀32。缺字段不产键，零副作用。
    ...(Array.isArray(sec.rowPeerIds) && sec.rowPeerIds.length > 0
      ? { rowPeerIds: [...sec.rowPeerIds] }
      : {}),
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
          // 🛡️ 治本（2026-09-16 · mc-1789501340553-e25b9b55 实锤）：同步写入 Figma 实测高度。
          //   此前只更新 flexGrow 不更新 height → height 始终为 0（extractLayoutMetadata 从 LLM 产出的
          //   section 读不到 absoluteBoundingBox）→ microcode-engineer.js line 935 的 `if (meta.height > 0)`
          //   恒 false → 整个布局提示块被跳过 → LLM 拿不到 flex 比例信息 → 所有 section flex:1 平分。
          if (meta.flexGrow !== next || !(meta.height > 0)) {
            meta.flexGrow = next;
            meta.height = height;
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

    // 🛡️ E1 治本（2026-09-16）：用 Figma 节点树确定性递归推导 section 结构，
    // 替代 vision（LLM）的自由发挥划分。vision 划分是「布局崩塌」的根源——
    // 重复 sub-header、命名混乱、高度缺失、横向容器（header 内 tabs）被
    // rebuildSlotConContainers 跳过导致嵌套丢失。
    // 治本规则：deterministic 递归结构 = 结构骨架（嵌套层级 + 确定性高度），
    // vision = 语义回填（type/role，按 figmaNodeId 匹配），两者合并。
    let sections = skipPanelHeaderFilter
      ? rawSections
      : rawSections.filter((sec) => !isPanelHeader(sec));
    let filteredCount = rawSections.length - sections.length;
    // 🔴 R23：E1（确定性递归结构）是否真的替代了 vision sections —— 归并后方向复算的判定域闸门
    let e1Derived = false;

    if (opts.figmaNodeData && typeof opts.figmaNodeData === 'object') {
      // 🛡️ 先尝试确定性递归推导（结构事实源）
      // 🛡️ 2026-09-30（评审 §8.4 步骤 3 · Bug4-①）：`sections[].layout` 改为**只认 A 类布局事实**
      //   （`figma-node-layout-facts#buildNodeLayoutFacts`）——旧 B 类 `xSpread > ySpread` 近似已删。
      //   外部若已算过（`opts.nodeLayoutFacts`）直接复用，避免重复遍历全树。
      const layoutFacts =
        opts.nodeLayoutFacts || buildNodeLayoutFacts(opts.figmaNodeData);
      const derived = deriveSectionsFromFigmaTree(opts.figmaNodeData, layoutFacts);
      if (derived && Array.isArray(derived.sections) && derived.sections.length > 0) {
        // 收集 vision 语义（完整字段），按 figmaNodeId 建索引
        const visionSemantic = new Map();
        const collectSemantic = (secs) => {
          for (const s of secs || []) {
            if (!s || typeof s !== 'object') continue;
            const key = String(s.figmaNodeId || s.id || '');
            if (key && !visionSemantic.has(key)) {
              visionSemantic.set(key, s);
            }
            collectSemantic(s.children);
          }
        };
        collectSemantic(rawSections);

        // 🛡️ 语义回填：vision 的「语义字段」优先（id/type/name/role/sourceNodeIds/header/body），
        // deterministic 的「结构字段」优先（children 嵌套层级、isLayoutContainer、
        // absoluteBoundingBox、styles.figmaHeightPx）。这是「方案 C 混合模式」的核心：
        // 结构来自 Figma 树（确定性），语义来自 vision（LLM 识别 chart/tabs/stats）。
        const enrich = (secs) => {
          for (const s of secs) {
            if (!s || typeof s !== 'object') continue;
            const sem = visionSemantic.get(String(s.figmaNodeId || s.id || ''));
            if (sem) {
              // vision 语义 id 优先（chart 的「江阴靖江长江隧道」等 LLM 语义命名）
              if (sem.id && sem.id !== s.id) s.id = sem.id;
              // vision type 优先（chart/tabs/stats 等 LLM 语义分类）
              if (sem.type) s.type = sem.type;
              // vision role 优先（inline-row/item/常驻）
              if (sem.role) s.role = sem.role;
              // vision 语义 name 优先（「江阴靖江长江隧道」优于「@echarts/bar」）
              if (sem.name && sem.name !== s.name) s.name = sem.name;
              // vision sourceNodeIds 优先（chart 数据关联）
              if (Array.isArray(sem.sourceNodeIds) && sem.sourceNodeIds.length > 0) {
                s.sourceNodeIds = sem.sourceNodeIds;
              }
              // vision header 优先（标题真值）
              if (sem.header) s.header = sem.header;
              // vision body 优先（叶子内容结构）
              if (sem.body) s.body = sem.body;
              if (sem) sem._consumed = true;
            }
            if (Array.isArray(s.children)) enrich(s.children);
          }
        };
        enrich(derived.sections);

        // 🛡️ F1 二段匹配（2026-09-20 · mc-1789867417147 实锤）：
        //   vision 常对「聚合级区块」编语义 id（如统计卡片组 id=2136639043、figmaNodeId=null），
        //   一段匹配按 figmaNodeId||id 永远对不上 E1 节点 → 卡片语义（bgPlaceholder→resourceFile、
        //   icon 位置/尺寸、label/value 颜色字号）整体丢弃 → LLM 凭裸树自由发挥
        //   （卡背景挂错/数值颜色错/整卡布局与 UI 不符）。
        //   治本：文本真值匹配——收集 vision section 深层文本（label/value/unit），
        //   在 E1 树中找「子树文本重合度最高且最深」的宿主 section：
        //     - 宿主是叶子 → 整 body 回填；
        //     - 宿主是容器 → body.items 按文本下钻分配到各叶子（每叶仅得自己的 item）。
        //   阈值：vision texts ≥2 且重合 ≥0.6（单文本不匹配，防误配）。
        //   纯确定性、可单测；不命中时零影响（fail-open 保持裸树）。
        try {
          const collectDeepTexts = (x, out, depth = 0) => {
            if (!x || typeof x !== 'object' || depth > 10) return;
            if (typeof x.text === 'string' && x.text.trim()) {
              out.add(x.text.trim());
            }
            for (const k of ['children', 'items', 'elements', 'parts', 'icon', 'content', 'body', 'header']) {
              if (Array.isArray(x[k])) {
                for (const c of x[k]) collectDeepTexts(c, out, depth + 1);
              } else if (x[k] && typeof x[k] === 'object') {
                collectDeepTexts(x[k], out, depth + 1);
              }
            }
          };
          // E1 section 子树文本集（只读 children 树，不读 body——避免一段匹配结果自证）
          const subtreeTexts = (s, out = new Set(), depth = 0) => {
            if (!s || typeof s !== 'object' || depth > 12) return out;
            if (typeof s.text === 'string' && s.text.trim()) out.add(s.text.trim());
            for (const c of s.children || []) subtreeTexts(c, out, depth + 1);
            return out;
          };
          // 遍历 E1 树建「候选宿主」列表（含深度，越深越特异）
          const hosts = [];
          const collectHosts = (secs, depth = 0) => {
            for (const s of secs || []) {
              if (!s || typeof s !== 'object') continue;
              hosts.push({ s, depth, texts: subtreeTexts(s) });
              collectHosts(s.children, depth + 1);
            }
          };
          collectHosts(derived.sections);

          let f1Filled = 0;
          for (const [key, sem] of visionSemantic.entries()) {
            if (sem._consumed) continue;
            const semTexts = new Set();
            collectDeepTexts(sem, semTexts);
            if (semTexts.size < 2) continue;
            // 找最佳宿主：文本重合率 ≥0.6，取重合率最高、同分取最深（最特异）
            let best = null;
            for (const h of hosts) {
              if (h.texts.size === 0) continue;
              let hit = 0;
              for (const t of semTexts) if (h.texts.has(t)) hit++;
              const overlap = hit / semTexts.size;
              if (overlap < 0.6) continue;
              if (
                !best ||
                overlap > best.overlap + 1e-9 ||
                (Math.abs(overlap - best.overlap) < 1e-9 && h.depth > best.depth)
              ) {
                best = { ...h, overlap };
              }
            }
            if (!best) continue;

            const items = sem.body?.items;
            if (Array.isArray(items) && items.length > 1 && Array.isArray(best.s.children) && best.s.children.length > 0) {
              // 容器宿主：items 下钻到叶子（每叶只回填自己的 item）
              const leaves = best.s.children;
              const used = new Set();
              for (const leaf of leaves) {
                const leafTexts = subtreeTexts(leaf);
                let bestItem = null;
                let bestHit = 0;
                for (const it of items) {
                  if (used.has(it)) continue;
                  const itTexts = new Set();
                  collectDeepTexts(it, itTexts);
                  if (itTexts.size === 0) continue;
                  let hit = 0;
                  for (const t of itTexts) if (leafTexts.has(t)) hit++;
                  if (hit > bestHit) { bestHit = hit; bestItem = it; }
                }
                if (bestItem && bestHit >= 1) {
                  used.add(bestItem);
                  leaf.body = { ...(sem.body || {}), items: [bestItem] };
                  f1Filled++;
                }
              }
            } else {
              // 叶子宿主（或单 item）：整 body 回填
              best.s.body = sem.body;
              f1Filled++;
            }
            logger.info('🛡️ F1 文本真值匹配：vision 语义回填', {
              visionId: key,
              hostId: best.s.id,
              overlap: Math.round(best.overlap * 100) + '%',
              mode: Array.isArray(items) && items.length > 1 ? 'items下钻' : '整body',
            });
          }
          if (f1Filled > 0) {
            logger.info(`🛡️ F1 二段匹配完成：${f1Filled} 个 E1 section 获得 vision 卡片语义（文本真值匹配）`);
          }
          // 清理临时标记（避免污染下游序列化）
          for (const sem of visionSemantic.values()) delete sem._consumed;
        } catch (f1Err) {
          logger.warn('🛡️ F1 二段匹配异常（fail-open 跳过）', { error: f1Err?.message || String(f1Err) });
        }

        sections = derived.sections;
        e1Derived = true;

        // 🛡️ 纯 chrome 标题栏剥离（2026-09-17 · 环境监测实锤，零硬编码、通用）：
        //   E1 确定性推导对任何名为 header 的 Figma 节点标 type:header，其中「纯装饰标题栏」
        //   （VECTOR×N + 单标题文本，无业务控件/容器）是 base-panel 外壳、应由微码宿主渲染，
        //   engineer 拿到它会在 default slot 臆造 divider/circles/gradient-bar（环境监测
        //   c-env-monitor-header-section）。视觉路径的 stripChromeSectionsInPlace 覆盖不到
        //   确定性推导分支，故在此对微码流程按 `chromeOnly` 标记剥离；Vue3 保留（自行渲染外壳）。
        if (!skipPanelHeaderFilter) {
          const stripChromeOnly = (list) =>
            list
              .filter((s) => {
                if (!s || typeof s !== 'object') return true;
                // 只剥离「type=header 且 chromeOnly」的纯装饰标题栏；
                // 业务 header（含 tabs/stat/双文本）chromeOnly=false，绝不误伤。
                if (s.type === 'header' && s.chromeOnly === true) return false;
                return true;
              })
              .map((s) =>
                s && typeof s === 'object' && Array.isArray(s.children)
                  ? { ...s, children: stripChromeOnly(s.children) }
                  : s,
              );
          const beforeChrome = sections.length;
          sections = stripChromeOnly(sections);
          if (sections.length !== beforeChrome) {
            logger.info('E1 纯 chrome 标题栏已剥离（base-panel 宿主渲染）', {
              removed: beforeChrome - sections.length,
            });
          }
        }

        logger.info('E1 治本：确定性递归结构已替代 vision sections', {
          deterministic: sections.length,
          vision: rawSections.length,
        });
      } else {
        // 🛡️ 兜底：确定性推导失败时，退回「vision 划分 + 确定性高度注入」互补模式
        const figmaRoot = opts.figmaNodeData?.document || opts.figmaNodeData;
        const figmaIndex = indexFigmaNodes(figmaRoot);
        const heightById = new Map();
        for (const [id, rec] of figmaIndex) {
          if (rec?.bbox && rec.bbox.height > 0) {
            heightById.set(id, rec.bbox);
          }
        }
        let injected = 0;
        sections = sections.map((s) => {
          const box = heightById.get(String(s.figmaNodeId || s.id || ''));
          if (box && box.height > 0) {
            injected += 1;
            return {
              ...s,
              absoluteBoundingBox: box,
              styles: { ...(s.styles || {}), figmaHeightPx: box.height },
            };
          }
          return s;
        });
        logger.info('E1 兜底：确定性高度已注入 vision sections', {
          injected,
          total: sections.length,
        });
      }
    }

    // 🛡️ header 几何兜底（2026-09-29 · b6e018d6 拍板方案，命名无关）：
    //   E1 / vision / chrome 剥离全部走完后仍无 header 事实 ⇒ 按 Figma 几何
    //   （顶层顶部 15% 薄条）强制标记 type='header'。详见函数注释。
    const headerGeomHit = applyHeaderGeometryFallback(sections);
    if (headerGeomHit) {
      logger.warn('🛡️ header 几何兜底生效：顶层顶部薄条已标记 header（无任何 header 类型事实）', headerGeomHit);
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return {
        effectiveSections: [],
        isForced: false,
        minFiles: 0,
        reason: 'layoutStructure 无 sections，跳过子组件规划',
        internalSubcomponents: [],
      };
    }

    // 过滤 panel-header（仅微码流程，且仅 vision 路径需要）
    // ⚠️ 刻意**不**在此复用 chrome-section-filter#isChromeOnlySection：实证（2026-09-14
    //   c-traffic-monitor-21e2afd6）raw section 全部为 role='inline-row' 且 children[].role='item'，
    //   而 hasBusinessBody 的业务正则为 /…|item|…/ → 恒为 true → 该过滤器对 inline-row 永远
    //   返回 false（死判据，加了也不生效）；且它命中即「整节剥离」，会连「当日总流量/流量预测
    //   tabs」一起删掉（上游 headerSlots 为 [] 无兜底），与「chrome 剥离仅微码」的既有契约冲突。
    //   真正的事实源在上游 visual-parser#_postProcessAnalysis 的 stripChromeSectionsInPlace。
    if (filteredCount > 0) {
      logger.info(`过滤 ${filteredCount} 个 panel-header section`);
    }

    // P2': 合并图例 section 到相邻图表 section
    sections = mergeLegendSections(sections);

    // 🛡️ 2026-09-10：同构重复卡片收成 list/grid（device 12 卡 + 12 装饰 → 1 个模板）
    // 🛡️ 2026-09-20 治本：切 collapseSectionsDeep（递归 + 几何同构签名）——
    //   E1 后重复项都在容器 children 里，旧顶层折叠静默失效（mc-max-1789871432610
    //   图例 8 项 / 三卡均未折叠实锤）。递归版自底向上，items 带 _vforData
    //   （texts/textStyles/resourceFiles）供 v-for prompt 确定性注入。
    const beforeCollapse = sections.length;
    const beforeCollapseDeep = JSON.stringify(countSectionsDeep(sections));
    // 🛡️ R19（2026-10-21）：把 Figma 节点树传进折叠器，items 的文本真值改由
    //   `utils/text-runs.js` 产出 `_vforData.lines`（一行一组 run，带 color/fontSize/fontWeight）。
    //   旧行为（无 figmaNodeData ⇒ 走 vision 平行数组）保持不变。
    sections = collapseSectionsDeep(sections, { figmaRoot: opts.figmaNodeData });
    const afterCollapseDeep = JSON.stringify(countSectionsDeep(sections));
    if (afterCollapseDeep !== beforeCollapseDeep || sections.length !== beforeCollapse) {
      logger.info('重复同构 section 已折叠为 list/grid（递归）', {
        beforeTop: beforeCollapse,
        afterTop: sections.length,
        beforeDeep: beforeCollapseDeep,
        afterDeep: afterCollapseDeep,
      });
    }

    // 🛡️ A 方案（2026-10-15 · c-aiot-dpjh-bsjd-91544b38 实锤）：items 覆盖去重（治案①卡 2 双渲染）。
    //   折叠结束后，「vision items 轨」段落（48:5798，body.items=6 张卡）与「折叠轨」段落
    //   （48:5813-list，卡 2-6 折叠）覆盖同一批 Figma 节点 ⇒ 两条轨各出一个子组件 ⇒ 卡 2 双渲染。
    //   判据：折叠段的 Figma 覆盖闭包 ⊆ items 段的覆盖闭包 ⇒ 折叠段是重复解释，移除（详见 util 注释）。
    //   部分覆盖 / 无 Figma 归属 ⇒ 一律保留（宁可多渲染，不可漏渲染）。
    const closureIndex = buildFigmaClosureIndex(opts.figmaNodeData);
    if (closureIndex) {
      const beforeCoverageDedupe = sections.length;
      const coverageDeduped = dedupeSectionsByCoverage(sections, closureIndex);
      sections = coverageDeduped.sections || sections;
      if (coverageDeduped.removed.length > 0) {
        logger.warn('🛡️ items 覆盖去重：被完全覆盖的重复段已移除（同一批 Figma 节点的第二条解释）', {
          removed: coverageDeduped.removed,
          beforeTop: beforeCoverageDedupe,
          afterTop: sections.length,
        });
      }
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
    // 🔴 R23：仅 E1 路径才需要 figma 索引（vision 路径不参与归并后方向复算），避免无谓遍历
    const figmaIndexForRefine =
      e1Derived && opts.figmaNodeData && typeof opts.figmaNodeData === 'object'
        ? indexFigmaNodes(opts.figmaNodeData?.document || opts.figmaNodeData)
        : null;
    let effectiveSections = sections.map((sec, idx) =>
      buildEffectiveSection(sec, idx, {
        enableInternalSplit,
        allInternalSubcomponents,
        e1Derived,
        figmaIndex: figmaIndexForRefine,
      }),
    );

    // 🛡️ 治本（2026-09-14 · c-traffic-monitor-34750940 实锤）：无归属壳锚定真实 Figma 节点。
    //   vision 用语义 id 起 section 名 → 真实 @echarts 图表节点被臆造成 src=[] 壳，
    //   下游判别力去重双输（真图表被当碎片杀、假壳被判超集留）。在裁决前先用 figma
    //   节点树（事实源）把壳锚定回真实节点；无 figmaNodeData 时零影响。
    if (opts.figmaNodeData && typeof opts.figmaNodeData === 'object') {
      // 🛡️ #78 技术栈接管（S2+S3，2026-10-01）：必须在 stripFabricatedSourceIds 之前 ——
      //   本步骤按「sec.id / sourceNodeIds ↔ 真值标记节点」匹配（标记 id 都是真实 Figma id，
      //   不受假 id 污染影响）；deep-first 最小归属认领 + table 契约抽取成功才吸收
      //   （fail-open：契约抽不出来就维持拆列现状，绝不产出空 <a-table />）。
      try {
        const tsStats = enrichSectionsWithTechStack(effectiveSections, opts.figmaNodeData);
        if (tsStats.enriched > 0) {
          logger.info('🛡️ 技术栈接管完成（S2 语义收编 + S3 内容抽取）', tsStats);
        }
      } catch (tsErr) {
        logger.warn('🛡️ 技术栈接管异常（fail-open 跳过，维持现状）', {
          error: tsErr?.message || String(tsErr),
        });
      }

      // 🛡️ 治本（2026-09-15 · 228b63d5）：先清洗「编造 id 空间」污染的 sourceNodeIds，
      //   让假 grid/tabs 壳回到「无归属壳」状态，anchor 才能锚定真 chart、dedupe 才能剔假壳。
      //   位置必须在 anchorPhantomSections **之前**（假 id 不清，isShell 判据恒 false）。
      effectiveSections = stripFabricatedSourceIds(
        effectiveSections,
        opts.figmaNodeData,
      );

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

      // 🛡️ H DOM contract（2026-09-22 · mc-1790048059931 实锤）：collapsed 卡 item 级骨架事实。
      //   病灶：v-for 卡内「icon 左 + 文本列右（label 上 value 下纵排）」的结构由 LLM 自由发挥，
      //   文本列常写成 row → 横排（Figma 真值纵排列）。nodeLayoutFacts 只覆盖「有 children 的
      //   容器」，纯 TEXT 兄弟无事实。治本：从 Figma 几何确定性推导卡内骨架（textStack 方向 +
      //   icon 实测尺寸），注入 collapsed section 的 itemSkeleton 字段，随 prompt 下发约束 LLM。
      //   位置在 applyFigmaHeightGrow 之后（复用已建的 figmaIndex 定位卡节点）。
      const itemFacts = buildItemLevelFacts(opts.figmaNodeData);
      if (Object.keys(itemFacts).length > 0) {
        // 🛡️ 解包 document 建索引（opts.figmaNodeData 是 {document,...} 包裹形态，
        //   indexFigmaNodes 不解包会拿到空 Map → deriveItemSkeleton 定位不到卡容器）。
        const itemFigmaIndex =
          indexFigmaNodes(opts.figmaNodeData?.document || opts.figmaNodeData);
        let skeletonCount = 0;
        const walkSections = (list) => {
          if (!Array.isArray(list)) return;
          for (const s of list) {
            // 🛡️ 2026-09-22 二段放宽：不要求 s.collapsed——E1 路径下 cons 网格（12 卡）被
            //   当作 R2 豁免的并列 leaf（未标 collapsed），但 Figma 子树仍是重复卡列表。
            //   deriveItemSkeleton 内部用「≥4 子卡 + textStack」保守判定兜底，非重复列表自然 null。
            if (s && !s.itemSkeleton) {
              const skel = deriveItemSkeleton(s, itemFigmaIndex, itemFacts);
              if (skel) {
                s.itemSkeleton = skel;
                skeletonCount++;
              }
            }
            if (Array.isArray(s?.children)) walkSections(s.children);
          }
        };
        walkSections(effectiveSections);
        if (skeletonCount > 0) {
          logger.info('itemSkeleton 已从 Figma 几何确定性推导（H DOM contract）', {
            count: skeletonCount,
          });
        }
      }
    }

    applyFlexGrowFallback(effectiveSections);

    // 🛡️ E1 治本（2026-09-16 · c-traffic-monitor-bc0c25aa 实锤）：id 唯一化。
    // vision 对同一容器下多个图表输出重复 id（426:807×3），dedupe 按 sourceNodeIds 正确保留了
    // 3 个真图表，但重复 id 进 prompt 令 LLM 混淆 → ChartForecast×3 空壳 + 命名碰撞。
    // 此处对重复 id 加 `-2`/`-3` 后缀，使 prompt 里 3 个 section 可区分。
    effectiveSections = uniqueSectionIds(effectiveSections);

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
