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
  }
]
