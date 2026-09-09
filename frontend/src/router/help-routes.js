export const helpRoutes = [
  {
    name: 'HelpTokens',
    path: '/help/tokens',
    component: () => import('@/views/help/TokensGuide.vue'),
    meta: {
      title: '密钥接入指南'
    }
  }
]
