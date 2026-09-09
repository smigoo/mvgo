// 进度条
import router from '@/router'
import NProgress from 'nprogress' // 导入 nprogress模块
import 'nprogress/nprogress.css' // 导入样式
import pinia, { useConfigStore, useUserStore } from '@/store'
import { useFeatureFlagsStore } from '@/stores/feature-flags'
import portletUtils from '@/utils/portlet'
import { message } from 'ant-design-vue'
NProgress.configure({ showSpinner: true }) // 显示右上角螺旋加载提示

/**
 * 路由路径 → 功能开关 key 映射表
 * 用于在路由守卫中拦截被关闭的页面（直接访问 URL 也不可达）
 */
const ROUTE_FEATURE_MAP = {
  '/generator/component':         'generator.component',
  '/generator/components':        'generator.component',
  '/generator/page':              'generator.page',
  '/generator/api':               'generator.api',
  '/generator/page-skeleton':    'generator.pageSkeleton',
  '/generator/workflow':          'generator.workflow',
  '/generator/intro':             'generator.intro',
  '/generator/token-dashboard':   'generator.token-dashboard',
  '/generator/document-design':   'generator.document-design',
  '/generator/api-docs':          'generator.api-docs',
  '/tasks':                       'tasks',
  '/screen':                      'screen',
  '/admin':                       'admin',
  '/mc-generator':                'mc-generator',
  '/debug':                       'debug',
  '/demo/c-mc-demo':              'demo',
  '/workspace':                   'workspace',
}

/**
 * 全局前置守卫
 */
router.beforeEach(async (to, from, next) => {
  // 判断不是本地环境 并且存在token
  // 判断父级是否存在token
  if (portletUtils.isPermission()) return

  // 其他不需要认证的页面直接放行
  if (to.meta?.noAuth) {
    next()
    NProgress.start()
    return
  }

  // 验证用户登录状态
  try {
    const userStore = useUserStore(pinia)
    // 通过 store 同步用户信息 + 权限
    const data = await userStore.fetchCurrentUser()

    if (!data.success) {
      // 门户内：刷新父页面由门户重新注入 token 完成鉴权（门户鉴权模式无登录页）
      if (portletUtils.reloadParentForReauth()) {
        NProgress.done()
        return
      }
      // 非门户（独立部署/本地）：无登录态时不跳首页（首页也需鉴权，会再次触发守卫→死循环），
      // 直接取消导航并提示，停留在当前/空白页，不再重定向。
      message.warning('登录已过期或未登录，请刷新页面重新鉴权')
      next(false)
      NProgress.done()
      return
    }

    // 路由级权限检查
    const requiredPermission = to.meta?.permission
    if (requiredPermission && !userStore.hasPermission(requiredPermission)) {
      message.error('您没有访问该页面的权限')
      next('/')
      NProgress.done()
      return
    }

    // 管理后台页面（操作日志 / 用户管理）：系统管理员可访问
    if (to.meta?.adminOnly && !userStore.isAdmin()) {
      message.error('仅管理员可访问该管理页面')
      next('/')
      NProgress.done()
      return
    }

    // 功能开关检查：被关闭的页面不可访问
    const featureStore = useFeatureFlagsStore(pinia)
    const featureKey = ROUTE_FEATURE_MAP[to.path]
    if (featureKey && !featureStore.isEnabled(featureKey)) {
      message.warning('该功能暂未开放')
      next('/')
      NProgress.done()
      return
    }

    // 已登录，继续正常流程
    const configStore = useConfigStore(pinia)
    // 获取页面id
    configStore.pageId = to.params.pageId || to.query.pageId
    // 获取组件实例
    configStore.pageElementSerial = to.params.pageElementSerial || to.query.pageElementSerial
    // 页面加载后赋值用户信息至window
    portletUtils.setAioPortlet(userStore.userInfo)
    next()
    NProgress.start()
  } catch (error) {
    console.error('验证登录状态失败:', error)
    // 门户内：刷新父页面重新鉴权
    if (portletUtils.reloadParentForReauth()) {
      NProgress.done()
      return
    }
    // 非门户：取消导航避免死循环，提示用户刷新重新鉴权
    message.warning('验证登录状态失败，请刷新页面')
    next(false)
    NProgress.done()
  }
})

// 全局后置钩子
router.afterEach((to) => {
  NProgress.done() // 完成进度条

  // 根据路由meta信息设置标题
  portletUtils.applyRouteTitle(to)

  // 通知父页面路由变化（用于iframe嵌入场景）
  portletUtils.routeChange(to.href)
  // 通知父页面路由变化（用于iframe嵌入场景）
  // if (window.parent !== window && !$isWujie) {
  //   window.parent.postMessage(
  //     {
  //       type: 'routeChange',
  //       params: {
  //         route: to.href
  //       }
  //     },
  //     '*'
  //   )
  // }
})
