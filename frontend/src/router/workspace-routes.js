/**
 * WorkSpace 路由模块
 * 深度研究 — AI 编程助手平台
 */

export default [
  {
    path: '/workspace',
    name: 'Workspace',
    component: () => import('@/layouts/WorkspaceLayout.vue'),
    children: [
      {
        path: '',
        name: 'WorkspaceDeepResearch',
        component: () => import('@/views/workspace/DeepResearchView.vue'),
        meta: { title: '深度研究' }
      }
    ]
  }
]
