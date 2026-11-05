// meeting 开发工作台：dev / production 均注册（已移除环境门控）。
//
// 沿革：此前为了省掉 @huggingface/transformers 通过 import.meta.url 载入的
// 26.8MB ort-wasm 死重，曾在生产构建中整体排除本页（运行时门控 + vite alias
// 空 stub 双重手段）。现决定该工作台上生产，故两种手段均已撤除：
//   - 本文件不再判断 import.meta.env.DEV，路由恒注册；
//   - vite.config.js 的 alias 已还原为普通对象，不再指向空 stub。
// 注意：rollup 在 resolve 阶段本就会解析下方的动态 import，因此本页及其
// 依赖（含上述 wasm 资产）会一并进入生产产物 —— 这是预期行为。
//
// 当前已开放生产入口（页脚「会议工作台」），故不再标记 devOnly。
export const meetingRoute = [
  {
    name: 'MeetingDev',
    path: '/meeting',
    component: () => import('@/views/meeting/index.vue'),
    meta: {
      title: '会议纪要开发工作台'
    }
  }
]
