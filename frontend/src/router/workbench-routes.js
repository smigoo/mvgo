export const workbenchRoutes = [
  {
    path: '/workbench',
    name: 'Workbench',
    component: () => import('@/views/workbench/index.vue'),
    meta: {
      title: '工作台',
      feature: 'workbench',
    },
  },
  {
    path: '/workbench/:conversationId',
    name: 'WorkbenchConversation',
    component: () => import('@/views/workbench/index.vue'),
    meta: {
      title: '工作台对话',
      feature: 'workbench',
    },
  },
];
