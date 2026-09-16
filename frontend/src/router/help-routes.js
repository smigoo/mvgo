export const helpRoutes = [
  {
    name: 'HelpTokens',
    path: '/help/tokens',
    component: () => import('@/views/help/TokensGuide.vue'),
    meta: {
      title: '密钥接入指南'
    }
  },
  {
    // 更新日志：面向全体用户公开，不挂功能开关、不做管理员限制
    name: 'HelpChangelog',
    path: '/help/changelog',
    component: () => import('@/views/help/Changelog.vue'),
    meta: {
      title: '更新日志'
    }
  }
]
