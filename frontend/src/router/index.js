import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { basicRoutes } from './basic-routes'
import { devRoute } from './dev-route'
import { mcRoutes } from '@microcode/designer'
import generatorRoutes from './generator-routes'
import componentRoutes from './component-routes'
import pageGeneratorRoutes from './page-generator-routes'
import mcGeneratorRoutes from './mc-generator-routes'
import workspaceRoutes from './workspace-routes'
import generateRoute from './generate-route'
import { helpRoutes } from './help-routes'

// 修正 @microcode/designer 的 mcRoutes：根路径重定向到项目实际首页
const fixedMcRoutes = mcRoutes.map(route => {
  if (route.path === '/' && route.redirect === '/page-manager') {
    return { ...route, redirect: '/generator/components' }
  }
  return route
})

const routes = [
  ...basicRoutes,
  ...devRoute,
  ...fixedMcRoutes,
  ...generatorRoutes,
  ...componentRoutes,
  ...pageGeneratorRoutes,
  ...mcGeneratorRoutes,
  ...workspaceRoutes,
  ...generateRoute,
  ...helpRoutes
]

export const router = createRouter({
  history:
    $config.routerMode === 'history'
      ? createWebHistory(import.meta.env.BASE_URL)
      : createWebHashHistory(),
  routes
})

/**
 * 静默处理导航 Promise 中的"预期中止/重复"错误，避免控制台噪音；预期错误降级为 console.debug 留痕，真实错误仍 reject：
 * - `Navigation aborted`：由路由守卫 `next(false)` 主动取消导航触发（如未登录取消跳转、停留在当前页），属正常业务行为。
 * - `NavigationDuplicated` / `cancelled`：重复跳转同一路由或导航被新导航取代，属无害噪音。
 * 真实导航错误（如异步组件加载失败、守卫内抛异常）仍正常 reject，便于排查（如接 Sentry 等全局监控不漏真实错误）。
 * 注意：本 patch 覆盖所有 `router.push` / `router.replace` 调用（含 `this.$router.push` 与 `useRouter().push`，均指向同一实例）。
 */
const _rawPush = router.push.bind(router)
const _rawReplace = router.replace.bind(router)
const _isExpectedNavError = (err) =>
  !!err &&
  (err.name === 'NavigationDuplicated' ||
    (typeof err.message === 'string' &&
      /Navigation (aborted|duplicated|cancelled)/i.test(err.message)))
/**
 * 预期内的导航中止/重复：属正常业务行为，用 console.debug 留痕但不抛错（避免未捕获 reject / 控制台红字）。
 * 真实导航错误（异步组件加载失败、守卫内抛异常）仍向上 reject。
 */
const _silenceExpectedNavError = (err) => {
  if (_isExpectedNavError(err)) {
    console.debug('[router] 导航被取消/重复（预期内，已静默）:', err?.message || err?.name || err)
    return
  }
  throw err
}
router.push = (...args) => {
  const res = _rawPush(...args)
  return res && typeof res.catch === 'function' ? res.catch(_silenceExpectedNavError) : res
}
router.replace = (...args) => {
  const res = _rawReplace(...args)
  return res && typeof res.catch === 'function' ? res.catch(_silenceExpectedNavError) : res
}

export async function setupRouter(app) {
  app.use(router)
  // 关键：在路由实例创建后，立即恢复动态路由
  // restoreDynamicRoutes()
  await router.isReady()
}
/**
 * 根据workspace文件下的组件 自动生成路由
 */
export const eventComponentAddRoute = () => {
  const regex = /-v[0-9]+(?:\.[0-9]+)*/g
  // 感动组件库组件 vue import时不需要{ eager: true } 如果写了会报错loader
  const businessComponentAsyncload = import.meta.glob('../components/**/component.js')
  // 生产构建只纳入正式发布的 Vue3 workspace 组件；custom-components 仅本地/测试预览使用，不参与生产发版
  const workspaceVue3ComponentAsyncload = import.meta.glob(
    '../workspace/vue3-components/**/component.js'
  )
  // 合并
  const businessComponentAsync = {
    ...businessComponentAsyncload,
    ...workspaceVue3ComponentAsyncload
  }
  Object.keys(businessComponentAsync).forEach((componentPath) => {
    const path = componentPath.split('/')
    const componentId = path[path.length - 2]
    const component = businessComponentAsync[componentPath]
    let newComponentId = componentId
    if (regex.test(componentId)) {
      // 重新设置 lastIndex 以确保正确匹配
      regex.lastIndex = 0
      // 截取版本号之前的部分
      newComponentId = componentId.replace(regex, '')
    }
    router.addRoute({
      name: newComponentId,
      path: '/' + newComponentId,
      component
    })
  })
}

export default router
