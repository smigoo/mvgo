export const basicRoutes = [
  {
    name: 'OldHome',
    path: '/home',
    redirect: '/generator/components',
    meta: {
      title: '首页'
    }
  },
  {
    name: 'container-page',
    path: '/container-page/:pageId',
    component: () => import('@/views/container-page/index.vue'),
    meta: {
      title: '实施页面'
    },
    children: [
      {
        name: 'router-page',
        path: ':containerId',
        component: () => import('@/views/container-page/index.vue')
      }
    ]
  },
  {
    name: 'mc-component',
    path: '/mc-component/:componentId/:pageId?/:pageElementSerial?',
    component: () => import('@/views/mc-component/index.vue'),
    meta: {
      title: '微码组件'
    }
  },
  {
    name: 'mc-preview',
    path: '/preview/:componentId',
    component: () => import('@/views/preview/index.vue'),
    meta: {
      title: '组件预览',
      noAuth: true // 独立预览页，无需登录，便于 iframe 嵌入和直接打开
    }
  },
  {
    name: 'Screen',
    path: '/screen',
    component: () => import('@/views/screen-layout/index.vue'),
    meta: {
      title: '大屏布局开发'
    }
  },
  {
    name: 'Admin',
    path: '/admin',
    component: () => import('@/views/admin/AdminGenerator.vue'),
    meta: {
      title: '后台管理系统'
    }
  },
  {
    name: 'Management',
    path: '/management',
    component: () => import('@/views/admin/ManagementView.vue'),
    meta: {
      title: '操作日志',
      adminOnly: true
    }
  },
  {
    name: 'Users',
    path: '/users',
    component: () => import('@/views/admin/UsersView.vue'),
    meta: {
      title: '用户管理',
      adminOnly: true
    }
  }
]
