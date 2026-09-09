/**
 * ============================================================
 *  感智晓界工坊 — 功能开关配置 (Feature Flags)
 * ============================================================
 *
 *  使用说明：
 *  - 修改此文件中各项的 enabled 值即可控制功能是否开放
 *  - enabled = true  → 功能正常可用
 *  - enabled = false → 功能被隐藏/禁用（导航项不显示、路由不可达、按钮隐藏）
 *  - 无需重启服务，刷新浏览器即可生效（Vite HMR 自动热更新）
 *
 *  配置层级：
 *  1. 路由级 (route)  — 控制整个页面是否可访问
 *  2. 功能级 (feature) — 控制页面内某个按钮/区块是否显示
 *
 *  搭配使用：
 *  - 模板中用 v-feature="'git.push'" 指令控制元素显隐
 *  - 脚本中用 const { isEnabled } = useFeatureFlag() 查询
 *  - 路由 meta 中加 feature: 'screen' 字段，路由守卫自动拦截
 * ============================================================
 */

export default {
  /* ============================================================
   *  路由级 — 主导航菜单（顶部 Tab）
   * ============================================================ */
  routes: {
    'generator.component': { enabled: true, label: '组件开发' },
    'component.library': { enabled: true, label: '组件库' },
    'generator.page': { enabled: false, label: '页面生成' },
    'generator.api': { enabled: true, label: '接口生成' },
    'generator.pageSkeleton': { enabled: true, label: '页面开发' },
    tasks: { enabled: true, label: '任务中心' },
    screen: { enabled: false, label: '大屏布局' },
    'generator.workflow': { enabled: true, label: '工作流编排' }
  },

  /* ============================================================
   *  路由级 — 次导航菜单（右侧 Tab）
   * ============================================================ */
  subRoutes: {
    demo: { enabled: true, label: 'Playground' },
    workspace: { enabled: false, label: 'WorkSpace' },
    'generator.intro': { enabled: true, label: '架构介绍' },
    // 'generator.token-dashboard':   { enabled: false,  label: 'Token监控' },
    'generator.document-design': { enabled: false, label: '文档设计' },
    'generator.api-docs': { enabled: true, label: 'API 文档' }
  },

  /* ============================================================
   *  路由级 — 独立页面（不在导航栏，但可通过 URL 直接访问）
   *  设为 false 后，直接访问 URL 也会被路由守卫拦截
   * ============================================================ */
  pages: {
    admin: { enabled: true, label: '后台管理系统' },
    'mc-generator': { enabled: false, label: '微码开发' },
    debug: { enabled: true, label: '调试器' }
  },

  /* ============================================================
   *  功能级 — WorkSpace 子页面（侧边栏菜单）
   * ============================================================ */
  workspace: {
    'deep-research': { enabled: true, label: '深度研究' },
    chat: { enabled: false, label: '对话' },
    projects: { enabled: false, label: '项目' },
    'generate-api': { enabled: false, label: '生成接口' },
    'my-apis': { enabled: false, label: '我的接口' },
    shared: { enabled: false, label: '分享给我' },
    settings: { enabled: false, label: '设置' }
  },

  /* ============================================================
   *  功能级 — 页面内具体功能按钮 / 区块
   *  在模板中用 v-feature="'git.push'" 控制
   * ============================================================ */
  features: {
    // Git 推送 — AI WorkSpace 文档保存到 Git 按钮
    'git.push': { enabled: true, label: '推送到Git' },

    // Git 凭证配置 — AI WorkSpace 设置页的 Git 凭证卡片
    'git.credentials': { enabled: false, label: 'Git凭证配置' },

    // Figma 集成 — 组件/页面生成中的 Figma 链接输入
    'figma.integration': { enabled: true, label: 'Figma集成' },

    // 主题切换 — 顶部导航栏深色/浅色切换按钮
    'theme.toggle': { enabled: true, label: '主题切换' },

    // 组件预览独立页 — /preview/:componentId 路由
    'component.preview': { enabled: true, label: '组件预览页' }
  }
}
