/**
 * 图管线拓扑定义文件
 *
 * 从 mc-component-graph-phase2.js / mc-component-graph-vue3.js 的真实图定义中提取，
 * 以 Workflow JSON 格式导出，供前端 WorkflowEditor 加载和显示。
 *
 * 特点：
 * - isOriginal: true 标记为原始拓扑，前端不可删除、不可覆盖
 * - 前端编辑后需"另存为"新名称保存
 * - 始终可通过 GET /api/workflows/graph/:type 获取最新原始拓扑
 *
 * 节点位置采用从左到右的主流程布局，条件分支向下偏移。
 */

// ============================================
// 节点位置常量（主流程 y=80, 分支 y=320, 兼容 y=560）
// ============================================
const Y_MAIN = 80
const Y_BRANCH = 320
const Y_LEGACY = 560
const X_STEP = 220
const X0 = 50

// ============================================
// Phase2 (微码组件) 管线拓扑
// ============================================
export const PHASE2_TOPOLOGY = {
  name: 'original-phase2',
  label: '微码组件生成管线 (Phase2)',
  description:
    'Figma 驱动的微码组件生成完整管线，含 L0-A 预览校验、L0-B 代码结构校验、L1 精修反馈、L2 智能路由（4路分发）',
  isOriginal: true,
  entryNode: 'init',
  nodes: [
    // ── 主流程 ──
    {
      id: 'init',
      label: '初始化',
      type: 'start',
      handler: '',
      position: { x: X0, y: Y_MAIN },
      config: {},
    },
    {
      id: 'figma-connector',
      label: 'Figma 数据获取',
      type: 'agent',
      handler: 'figma-connector',
      position: { x: X0 + X_STEP * 1, y: Y_MAIN },
      config: {},
    },
    {
      id: 'visual-parser',
      label: '视觉分析',
      type: 'agent',
      handler: 'visual-parser',
      position: { x: X0 + X_STEP * 2, y: Y_MAIN },
      config: {},
    },
    {
      id: 'preview-validator',
      label: 'L0-A 预览校验',
      type: 'condition',
      handler: '',
      position: { x: X0 + X_STEP * 3, y: Y_MAIN },
      config: {},
    },
    {
      id: 'parallel-analysis',
      label: '并行分析\n(布局审查+样式映射)',
      type: 'agent',
      handler: 'layout-reviewer',
      position: { x: X0 + X_STEP * 4, y: Y_MAIN },
      config: {},
    },
    {
      id: 'microcode-engineer',
      label: '代码生成',
      type: 'agent',
      handler: 'microcode-engineer',
      position: { x: X0 + X_STEP * 5, y: Y_MAIN },
      config: {},
    },
    {
      id: 'code-structure-validator',
      label: 'L0-B 代码校验',
      type: 'condition',
      handler: '',
      position: { x: X0 + X_STEP * 6, y: Y_MAIN },
      config: {},
    },
    {
      id: 'parallel-refine',
      label: '串行精修\n(布局→样式)',
      type: 'agent',
      handler: 'layout-reviewer',
      position: { x: X0 + X_STEP * 7, y: Y_MAIN },
      config: {},
    },
    {
      id: 'refine-feedback',
      label: 'L1 精修反馈',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 8, y: Y_MAIN },
      config: {},
    },
    {
      id: 'adversarial-checker',
      label: '对抗检查',
      type: 'agent',
      handler: 'adversarial-checker',
      position: { x: X0 + X_STEP * 9, y: Y_MAIN },
      config: {},
    },
    {
      id: 'revision-decision',
      label: 'L2 智能路由',
      type: 'condition',
      handler: '',
      position: { x: X0 + X_STEP * 10, y: Y_MAIN },
      config: {},
    },
    {
      id: 'complete',
      label: '完成',
      type: 'end',
      handler: '',
      position: { x: X0 + X_STEP * 11, y: Y_MAIN },
      config: {},
    },

    // ── L2 路由目标（分支层）──
    {
      id: 'style-refiner',
      label: '样式精修\n(L2路由)',
      type: 'agent',
      handler: 'style-mapper',
      position: { x: X0 + X_STEP * 8, y: Y_BRANCH },
      config: {},
    },

    // ── 兼容模式（minimal/off）──
    {
      id: 'layout-refiner-legacy',
      label: '布局精修\n(兼容模式)',
      type: 'agent',
      handler: 'layout-reviewer',
      position: { x: X0 + X_STEP * 6, y: Y_LEGACY },
      config: {},
    },
    {
      id: 'style-refiner-legacy',
      label: '样式精修\n(兼容模式)',
      type: 'agent',
      handler: 'style-mapper',
      position: { x: X0 + X_STEP * 7, y: Y_LEGACY },
      config: {},
    },
  ],
  edges: [
    // ── 主流程直连边 ──
    { id: 'e-init-figma', source: 'init', target: 'figma-connector' },
    { id: 'e-figma-vp', source: 'figma-connector', target: 'visual-parser' },
    { id: 'e-pa-me', source: 'parallel-analysis', target: 'microcode-engineer' },
    { id: 'e-me-csv', source: 'microcode-engineer', target: 'code-structure-validator' },
    { id: 'e-rf-ac', source: 'refine-feedback', target: 'adversarial-checker' },
    { id: 'e-ac-rd', source: 'adversarial-checker', target: 'revision-decision' },
    { id: 'e-sr-ac', source: 'style-refiner', target: 'adversarial-checker' },

    // ── 条件边: visual-parser → preview-validator | parallel-analysis ──
    {
      id: 'e-vp-pv',
      source: 'visual-parser',
      target: 'preview-validator',
      condition: 'l0_enabled',
      label: 'L0校验',
    },
    {
      id: 'e-vp-pa',
      source: 'visual-parser',
      target: 'parallel-analysis',
      condition: 'l0_disabled',
      label: '跳过L0',
    },

    // ── 条件边: preview-validator → parallel-analysis | visual-parser ──
    {
      id: 'e-pv-pa',
      source: 'preview-validator',
      target: 'parallel-analysis',
      condition: 'pass',
      label: '通过',
    },
    {
      id: 'e-pv-vp',
      source: 'preview-validator',
      target: 'visual-parser',
      condition: 'retry',
      label: '重试',
    },

    // ── 条件边: code-structure-validator → parallel-refine | microcode-engineer | layout-refiner-legacy ──
    {
      id: 'e-csv-pr',
      source: 'code-structure-validator',
      target: 'parallel-refine',
      condition: 'pass',
      label: '通过→精修',
    },
    {
      id: 'e-csv-me',
      source: 'code-structure-validator',
      target: 'microcode-engineer',
      condition: 'retry',
      label: '重试',
    },
    {
      id: 'e-csv-lrl',
      source: 'code-structure-validator',
      target: 'layout-refiner-legacy',
      condition: 'minimal',
      label: '兼容模式',
    },

    // ── 条件边: parallel-refine → refine-feedback | adversarial-checker ──
    {
      id: 'e-pr-rf',
      source: 'parallel-refine',
      target: 'refine-feedback',
      condition: 'l1_enabled',
      label: 'L1反馈',
    },
    {
      id: 'e-pr-ac',
      source: 'parallel-refine',
      target: 'adversarial-checker',
      condition: 'l1_disabled',
      label: '跳过L1',
    },

    // ── 条件边: revision-decision → complete | microcode-engineer | style-refiner | parallel-refine ──
    {
      id: 'e-rd-complete',
      source: 'revision-decision',
      target: 'complete',
      condition: 'pass',
      label: '完成',
    },
    {
      id: 'e-rd-me',
      source: 'revision-decision',
      target: 'microcode-engineer',
      condition: 'full',
      label: '全量修订',
    },
    {
      id: 'e-rd-sr',
      source: 'revision-decision',
      target: 'style-refiner',
      condition: 'stylistic',
      label: '样式修订',
    },
    {
      id: 'e-rd-pr',
      source: 'revision-decision',
      target: 'parallel-refine',
      condition: 'layout',
      label: '布局修订',
    },

    // ── 兼容模式链路 ──
    { id: 'e-lrl-srl', source: 'layout-refiner-legacy', target: 'style-refiner-legacy' },
    { id: 'e-srl-ac', source: 'style-refiner-legacy', target: 'adversarial-checker' },
  ],
}

// ============================================
// Vue3 组件管线拓扑
// 拓扑结构与 Phase2 完全一致，仅 label/description 不同
// ============================================
export const VUE3_TOPOLOGY = {
  ...PHASE2_TOPOLOGY,
  name: 'original-vue3',
  label: 'Vue3 组件生成管线',
  description:
    '独立 Vue3 SFC 组件生成管线，拓扑与 Phase2 一致，渲染器为 Vue3Engineer（标准 SFC，面板头部/背景真实还原，无微码结构）',
}

// ============================================
// 页面生成管线拓扑（页面级编排，内部逐组件调用 phase2）
// ============================================
export const PAGE_GENERATION_TOPOLOGY = {
  name: 'original-page-generation',
  label: '页面生成管线',
  description:
    'Figma 页面级批量生成管线：获取页面节点树 → 拆解 cp-* 组件 → 串行/并行批量调用 Phase2 生成 → 聚合结果',
  isOriginal: true,
  entryNode: 'init',
  nodes: [
    {
      id: 'init',
      label: '初始化',
      type: 'start',
      handler: '',
      position: { x: X0, y: Y_MAIN },
      config: {},
    },
    {
      id: 'fetch-figma-page',
      label: '获取 Figma 页面',
      type: 'agent',
      handler: 'figma-connector',
      position: { x: X0 + X_STEP * 1, y: Y_MAIN },
      config: {},
    },
    {
      id: 'decompose-page',
      label: '页面拆解\n(识别 cp-* 组件)',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 2, y: Y_MAIN },
      config: {},
    },
    {
      id: 'execution-mode',
      label: '执行模式\n(串行/并行)',
      type: 'condition',
      handler: '',
      position: { x: X0 + X_STEP * 3, y: Y_MAIN },
      config: {},
    },
    {
      id: 'batch-generate',
      label: '批量生成\n(逐组件调用 Phase2)',
      type: 'agent',
      handler: 'microcode-engineer',
      position: { x: X0 + X_STEP * 4, y: Y_MAIN },
      config: {},
    },
    {
      id: 'aggregate-results',
      label: '结果聚合\n(统计成功/失败)',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 5, y: Y_MAIN },
      config: {},
    },
    {
      id: 'complete',
      label: '完成\n(拷贝到 workspace)',
      type: 'end',
      handler: '',
      position: { x: X0 + X_STEP * 6, y: Y_MAIN },
      config: {},
    },
  ],
  edges: [
    { id: 'e-init-figma', source: 'init', target: 'fetch-figma-page' },
    { id: 'e-figma-decompose', source: 'fetch-figma-page', target: 'decompose-page' },
    { id: 'e-decompose-mode', source: 'decompose-page', target: 'execution-mode' },
    // 条件边: 执行模式 → 批量生成（串行/并行均进入）
    {
      id: 'e-mode-batch',
      source: 'execution-mode',
      target: 'batch-generate',
      condition: 'serial_or_parallel',
      label: '串行/并行',
    },
    { id: 'e-batch-aggregate', source: 'batch-generate', target: 'aggregate-results' },
    { id: 'e-aggregate-complete', source: 'aggregate-results', target: 'complete' },
  ],
}

// ============================================
// 接口生成管线拓扑（Apifox OpenAPI → 前端代码）
// ============================================
export const APIFOX_GENERATION_TOPOLOGY = {
  name: 'original-apifox-generation',
  label: '接口生成管线 (Apifox)',
  description:
    'Apifox OpenAPI 导出 → 解析过滤 → 生成 4 类前端文件（API函数/Mock/枚举/文档） → 打包 ZIP',
  isOriginal: true,
  entryNode: 'init',
  nodes: [
    {
      id: 'init',
      label: '初始化',
      type: 'start',
      handler: '',
      position: { x: X0, y: Y_MAIN },
      config: {},
    },
    {
      id: 'fetch-openapi',
      label: '导出 OpenAPI\n(Apifox API)',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 1, y: Y_MAIN },
      config: {},
    },
    {
      id: 'parse-filter',
      label: '解析过滤\n(按路径前缀)',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 2, y: Y_MAIN },
      config: {},
    },
    {
      id: 'generate-api-js',
      label: '生成 API 函数',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 3, y: 20 },
      config: {},
    },
    {
      id: 'generate-mock',
      label: '生成 Mock 数据',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 3, y: 140 },
      config: {},
    },
    {
      id: 'generate-enums',
      label: '生成枚举常量',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 4, y: 20 },
      config: {},
    },
    {
      id: 'generate-docs',
      label: '生成使用文档',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 4, y: 140 },
      config: {},
    },
    {
      id: 'package-zip',
      label: '打包 ZIP',
      type: 'agent',
      handler: '',
      position: { x: X0 + X_STEP * 5, y: Y_MAIN },
      config: {},
    },
    {
      id: 'complete',
      label: '完成\n(登记任务)',
      type: 'end',
      handler: '',
      position: { x: X0 + X_STEP * 6, y: Y_MAIN },
      config: {},
    },
  ],
  edges: [
    { id: 'e-init-fetch', source: 'init', target: 'fetch-openapi' },
    { id: 'e-fetch-parse', source: 'fetch-openapi', target: 'parse-filter' },
    // 并行分支: 解析过滤 → 4 个生成节点（并行执行）
    { id: 'e-parse-api', source: 'parse-filter', target: 'generate-api-js' },
    { id: 'e-parse-mock', source: 'parse-filter', target: 'generate-mock' },
    { id: 'e-parse-enums', source: 'parse-filter', target: 'generate-enums' },
    { id: 'e-parse-docs', source: 'parse-filter', target: 'generate-docs' },
    // 汇聚到打包
    { id: 'e-api-zip', source: 'generate-api-js', target: 'package-zip' },
    { id: 'e-mock-zip', source: 'generate-mock', target: 'package-zip' },
    { id: 'e-enums-zip', source: 'generate-enums', target: 'package-zip' },
    { id: 'e-docs-zip', source: 'generate-docs', target: 'package-zip' },
    { id: 'e-zip-complete', source: 'package-zip', target: 'complete' },
  ],
}

// ============================================
// 受保护的系统工作流名称列表
// 这些流程是网站当前使用的生产管线，不可编辑、不可删除
// ============================================
export const PROTECTED_WORKFLOW_NAMES: string[] = [
  PHASE2_TOPOLOGY.name,         // original-phase2 — 组件生成 & 页面生成内部使用
  VUE3_TOPOLOGY.name,            // original-vue3 — Vue3 组件生成
  PAGE_GENERATION_TOPOLOGY.name, // original-page-generation — 页面生成
  APIFOX_GENERATION_TOPOLOGY.name, // original-apifox-generation — 接口生成
]

/**
 * 判断工作流名称是否为受保护的系统管线
 */
export function isProtectedWorkflow(name: string): boolean {
  return PROTECTED_WORKFLOW_NAMES.includes(name)
}

// ============================================
// 导出拓扑类型映射
// ============================================
export const TOPOLOGY_MAP: Record<string, typeof PHASE2_TOPOLOGY> = {
  phase2: PHASE2_TOPOLOGY,
  vue3: VUE3_TOPOLOGY,
  'page-generation': PAGE_GENERATION_TOPOLOGY,
  'apifox-generation': APIFOX_GENERATION_TOPOLOGY,
}

/**
 * 获取所有原始拓扑列表（供 list 端点使用）
 */
export function getAllOriginalTopologies() {
  return [PHASE2_TOPOLOGY, VUE3_TOPOLOGY, PAGE_GENERATION_TOPOLOGY, APIFOX_GENERATION_TOPOLOGY]
}
