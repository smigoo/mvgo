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
// 2026-11-12 页脚「会议工作台」入口恢复全环境可见（从 go-dev 移植回 main，
// 补齐合并时遗漏的移植项）。此前 2026-11-06 曾因生产域为 HTTP、
// getUserMedia / WebGPU 在非安全上下文被浏览器禁用而暂时隐藏该入口。
// ⚠️ 若生产仍为 HTTP，真实录音能力仍不可用（页面其余部分正常）；HTTPS 后完整恢复。
// ✅ 页面侧已有兜底：meeting/index.vue 用 asrEnvBlocked（非安全上下文）显式提示
// 「浏览器已禁用 getUserMedia / WebGPU，需 HTTPS 或 localhost」，不会白屏或静默失败。
// 路由恒注册，dev / 生产均可直连 /meeting。
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
