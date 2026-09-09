// 组件生成 + 页面生成 + 接口生成 + 任务中心（统一 /generator/ 前缀）
export default [
  // ── 旧路径 redirect（向后兼容）──
  { path: '/generate', redirect: '/generator/components' },
  { path: '/generate-component', redirect: '/generator/components' },
  { path: '/generate-page', redirect: '/generator/page' },
  { path: '/generate-api', redirect: '/generator/api' },

  // ── 新路径 ──
  // ── 统一入口（推荐）──
  {
    path: '/generator/components',
    name: 'UnifiedGenerate',
    component: () => import('@/views/generate/components.vue'),
    meta: { title: '组件生成' }
  },
  {
    path: '/generator/component',
    name: 'ComponentGenerate',
    component: () => import('@/views/generate/component.vue'),
    meta: { title: '组件生成（旧）' }
  },
  {
    path: '/generator/page',
    name: 'PageGenerate',
    component: () => import('@/views/generate/page.vue'),
    meta: { title: '页面生成' }
  },
  {
    path: '/generator/api',
    name: 'ApiGenerate',
    component: () => import('@/views/workspace/GenerateApiView.vue'),
    meta: { title: '接口生成' }
  },
  {
    path: '/generator/api/catalog/:catalogId',
    name: 'ApiCatalogDetail',
    component: () => import('@/views/workspace/ApiCatalogDetail.vue'),
    meta: { title: 'API 目录详情' }
  },

  // ── 轻量生成 ──
  {
    path: '/generator/lite',
    name: 'LiteGenerate',
    component: () => import('@/views/lite/LiteGenerate.vue'),
    meta: { title: '轻量生成' }
  },

  // ── 页面骨架生成（独立于组件/任务管理）──
  {
    path: '/generator/page-skeleton',
    name: 'PageSkeleton',
    component: () => import('@/views/page-skeleton/index.vue'),
    meta: { title: '页面开发' }
  },

  // ── 任务中心 ──
  {
    path: '/tasks',
    name: 'TaskCenter',
    component: () => import('@/views/tasks/TaskCenter.vue'),
    meta: { title: '任务中心' }
  },
  {
    path: '/tasks/html-split/:batchId',
    name: 'HtmlSplitBatchDetail',
    component: () => import('@/views/tasks/HtmlSplitBatchDetail.vue'),
    meta: { title: 'HTML 拆分批次' }
  },
  {
    path: '/tasks/:sessionId',
    name: 'TaskDetail',
    component: () => import('@/views/tasks/TaskDetail.vue'),
    meta: { title: '任务详情' }
  },
]
