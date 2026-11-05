export const devRoute = [
  {
    name: 'PipelineLab',
    path: '/pipeline-lab',
    component: () => import('@/views/pipeline-lab/index.vue'),
    meta: {
      title: 'v2 管线实验室'
    }
  },
  {
    name: 'Debug',
    path: '/debug',
    component: () => import('@/views/debug/index.vue'),
    meta: {
      title: '调试器'
    }
  },
  {
    name: 'demo',
    path: '/demo/:componentId?',
    component: () => import('@/views/demo/index.vue'),
    meta: {
      title: 'demo'
    }
  },
  {
    name: 'jaegerPermision',
    path: '/jaeger-permision',
    component: () => import('@/views/jaeger-permision/index.vue'),
    meta: {
      title: 'jaegerPermision'
    }
  },
  {
    // 新管线（ai-engine-v2）测试页：仅供本地调测，不挂任何导航入口
    // 后端 /api/v2/pipeline 由 DevOnlyGuard 把控，生产环境统一 404
    name: 'ComponentsTestV2',
    path: '/generator/components-test',
    component: () => import('@/views/components-test/index.vue'),
    meta: {
      title: '新管线测试台'
    }
  },
  {
    // 项目级管线（ai-engine-v3 / M1：S0 扫描 + S2 契约冻结）：仅供本地调测，不挂任何导航入口
    // 后端 /api/v3/project 由 ProjectDevOnlyGuard 把控，模块按 isV3ProjectExposed()
    // 条件注册 —— 生产环境连路由都不存在，统一 404
    name: 'ProjectLab',
    path: '/project-lab',
    component: () => import('@/views/project-lab/index.vue'),
    meta: {
      title: '项目级管线实验台'
    }
  }
]
