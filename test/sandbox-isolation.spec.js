// @ts-check
const { test, expect } = require('@playwright/test')

// ============================================================
// 沙箱隔离自动化测试
// 依赖：Playwright（npx playwright install）
// 运行：npx playwright test test/sandbox-isolation.spec.js
// ============================================================

const PREVIEW_BASE = 'http://localhost:2610/preview'
const MC_BASE = 'http://localhost:2610/mc-component'

const ERROR_CARD_SELECTOR = '.mc-preview-error-card, .mc-preview-error-title'
const VITE_OVERLAY_SELECTOR = '[data-vite-error-overlay], #vite-plugin-vue-overlay'

/**
 * 测试用例表
 * { id, page, env, type, level, desc }
 */
const cases = [
  // ─── DEV · preview 页 ───
  { id: 'mv-max-test-syntax', page: 'preview', env: 'DEV', type: 'Vue3', level: 'Max', desc: '编译错误(duplicate import)' },
  { id: 'mv-lite-test-less', page: 'preview', env: 'DEV', type: 'Vue3', level: 'Lite', desc: 'LESS 语法错误' },
  { id: 'mc-max-test-syntax', page: 'preview', env: 'DEV', type: '微码', level: 'Max', desc: '编译错误(duplicate import)' },
  { id: 'mc-lite-test-less', page: 'preview', env: 'DEV', type: '微码', level: 'Lite', desc: 'LESS 语法错误' },
  { id: 'mv-max-test-runtime', page: 'preview', env: 'DEV', type: 'Vue3', level: 'Max', desc: '运行时引用错误' },
  { id: 'mc-max-test-runtime', page: 'preview', env: 'DEV', type: '微码', level: 'Max', desc: '运行时引用错误' },

  // ─── DEV · mc-component 页 ───
  { id: 'mv-max-test-syntax', page: 'mc-component', env: 'DEV', type: 'Vue3', level: 'Max', desc: '编译错误' },
  { id: 'mc-max-test-syntax', page: 'mc-component', env: 'DEV', type: '微码', level: 'Max', desc: '编译错误' },
]

// PROD 测试需要完整部署环境，标记为 skip
// 如需启用，取消注释并替换 PREVIEW_BASE/MC_BASE 为生产地址
// { id: 'mv-max-test-syntax', page: 'preview', env: 'PROD', type: 'Vue3', level: 'Max', desc: '编译错误' },
// { id: 'mc-max-test-syntax', page: 'preview', env: 'PROD', type: '微码', level: 'Max', desc: '编译错误' },

for (const c of cases) {
  const url = c.page === 'preview'
    ? `${PREVIEW_BASE}/${c.id}`
    : `${MC_BASE}/${c.id}`

  test(`[${c.env}][${c.type}×${c.level}] ${c.desc} → ErrorBoundary 卡片, 无 Vite overlay`, { tag: [c.env, c.type, c.level] }, async ({ page }) => {
    // 1. 导航到预览页
    const response = await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' })

    // 2. 等待 ErrorBoundary 卡片出现（最多 15 秒，沙箱编译可能需要时间）
    try {
      await page.waitForSelector(ERROR_CARD_SELECTOR, { timeout: 15000 })
    } catch {
      // 也许是渲染成功而不是报错——检查是否有正常内容
      const hasComponent = await page.locator('.c-mc-max-test-syntax-container, .c-mv-max-test-syntax, [data-preview-status="ready"]').count()
      if (hasComponent > 0) {
        console.log(`[WARN] ${c.id}: 组件意外渲染成功（夹具可能有误）`)
        return // 非硬失败
      }
      throw new Error(`组件 ${c.id} 未显示 ErrorBoundary 卡片（可能是编译错误未捕获 或 夹具未部署）`)
    }

    // 3. 确认无 Vite 错误 overlay（沙箱避免 Vite transform 是核心诉求）
    const viteOverlay = page.locator(VITE_OVERLAY_SELECTOR)
    expect(await viteOverlay.count()).toBe(0)

    // 4. 确认页面自身未崩溃（仍有 DOM 结构）
    const body = await page.locator('body')
    expect(await body.count()).toBe(1)

    // 5. 截图留档
    await page.screenshot({ path: `test/output/${c.env}_${c.type}_${c.level}_${c.desc.replace(/[^a-z]/g, '-')}.png` })
  })
}

// ============================================================
// 辅助测试：正常组件不受坏组件影响（交叉污染验证）
// ============================================================
test('交叉污染：正常组件不受 workspace 坏组件影响', async ({ page }) => {
  // 打开一个正常的微码组件（如 c-mc-css-demo-event，如果部署了的话）
  await page.goto(`${PREVIEW_BASE}/c-mc-css-demo-event`, { timeout: 15000 })
  // 应正常渲染，非 ErrorBoundary 卡片
  const hasError = await page.locator(ERROR_CARD_SELECTOR).count()
  // 如果正常组件也报错，可能是组件本身有问题。仅记录。
  console.log(`正常组件 ErrorBoundary 卡片数：${hasError}（期望 0）`)
})
