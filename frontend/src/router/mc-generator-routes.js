// 微码开发统一入口路由
export const mcGeneratorRoutes = [
  {
    path: '/mc-generator',
    name: 'McGenerator',
    component: () => import('../views/mc-generator/index.vue'),
    meta: {
      title: '微码开发'
    }
  }
]

export default mcGeneratorRoutes
