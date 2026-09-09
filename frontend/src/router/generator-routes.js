/**
 * Generator 路由模块
 * 微码组件生成相关页面路由
 */

export default [
  {
    // 入口页已合并进工作台：/generator 直接重定向到 components 画布
    path: '/generator',
    redirect: '/generator/components'
  },
  {
    path: '/generator/workflow',
    name: 'WorkflowEditor',
    component: () => import('@/views/generator/WorkflowEditor.vue'),
    meta: {
      title: '工作流编辑',
      icon: 'NodeIndexOutlined'
    }
  },
  {
    path: '/generator/intro',
    name: 'GeneratorIntro',
    component: () => import('@/views/generator/Intro.vue'),
    meta: {
      title: '使用介绍',
      icon: 'FileTextOutlined'
    }
  },
  {
    path: '/generator/api-docs',
    name: 'ApiDocs',
    component: () => import('@/views/generator/ApiDocs.vue'),
    meta: {
      title: 'API 文档',
      icon: 'BookOutlined'
    }
  },
  {
    path: '/generator/logs',
    name: 'GeneratorLogs',
    component: () => import('@/views/generator/Logs.vue'),
    meta: {
      title: '生成日志',
      icon: 'UnorderedListOutlined'
    }
  },
  {
    path: '/generator/token-dashboard',
    name: 'TokenDashboard',
    component: () => import('@/views/generator/TokenDashboard.vue'),
    meta: {
      title: 'Token 用量',
      icon: 'DashboardOutlined'
    }
  },
  {
    path: '/generator/document-design',
    name: 'DocumentDesign',
    component: () => import('@/views/generator/DocumentDesign.vue'),
    meta: {
      title: '文档设计',
      icon: 'FileMarkdownOutlined'
    }
  }
]
