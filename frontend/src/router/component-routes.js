// 组件管理路由配置
export default [
  {
    path: '/components',
    name: 'ComponentLibrary',
    component: () => import('../views/components/ComponentLibrary.vue'),
    meta: {
      title: '我的组件库'
    }
  },
  {
    path: '/components/:id',
    name: 'ComponentDetail',
    component: () => import('../views/components/ComponentDetail.vue'),
    meta: {
      title: '组件预览'
    }
  }
]
