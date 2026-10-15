/**
 * 一体化健康度检查 M2-2 判据来源修正（2026-09-30）
 *
 * 症状：每次 mc 生成都报 `🏢 一体化健康度检查：1 项未通过 {failed:["M2-2: 缺少
 *   resources/images/mc-preview.png"]}`，但该 png **实际就在磁盘上**。
 *   实测：当日日志 M2-2 命中 18 次、前一日 230 次；同一份组件里
 *   M2-1/2-3/2-4/2-6 全部通过，唯 M2-2 恒失败 ⇒ 100% 系统性误报。
 *
 * 根因：`checkMcComponent(files)` 的 `files` 是**文本产物 map**
 *   （`microcode-engineer.js` 的 `finalTruthFiles = {...allFiles, ...fixedFiles}`），
 *   而 `resources/images/*.png` 等**二进制资源由 figma-connector 直接写盘**，
 *   从不进入该 map ⇒ 只查 `files` 必然查不到。
 *
 * 治本：判据来源改为「文本 map ∪ 磁盘探针」——新增可注入的
 *   `options.fileExists(relPath)`，调用方传 `existsSync(join(outputPath, rel))`。
 *   检查器保持纯函数（不 import fs），且**真缺失时仍然 fail**（强度不降）。
 */
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { checkMcComponent } from './mc-health-validator.js'

type Health = {
  passed: Array<{ id: string }>
  failed: Array<{ id: string; message: string }>
}

/** 最小可用产物集：让 M2 其余项都过，只有 M2-2 受本 spec 摆布 */
function minimalFiles(): Record<string, string> {
  return {
    'declare.json': JSON.stringify({
      componentId: 'c-demo-panel',
      componentName: 'demo-panel',
      version: 'v1.0.0',
    }),
    'declare.js': 'export default {}',
    'component.js': 'export default {}',
    'package/index.vue': '<template><div class="c-demo-panel" /></template>',
    'resources/config/css-vars.js': 'export const dark = {}',
    'resources/styles/themes/theme-vars.less': '.common() {}',
    'resources/styles/index.less': "@import './themes/theme-vars.less';",
  }
}

function m22(files: Record<string, string>, options?: Record<string, unknown>) {
  const r = checkMcComponent(files, null, options) as unknown as Health
  return {
    passed: r.passed.some((x) => x.id === 'M2-2'),
    failed: r.failed.find((x) => x.id === 'M2-2') || null,
  }
}

describe('M2-2 mc-preview.png 存在性判据', () => {
  it('🔴 回归守卫：files 无 png 但磁盘探针命中 → 通过（本次修复的不变量）', () => {
    const r = m22(minimalFiles(), { fileExists: () => true })
    expect(r.passed).toBe(true)
    expect(r.failed).toBeNull()
  })

  it('探针只对 png 返回 true 时也通过（不靠探针蒙混其它项）', () => {
    const r = m22(minimalFiles(), {
      fileExists: (rel: string) => rel === 'resources/images/mc-preview.png',
    })
    expect(r.passed).toBe(true)
  })

  it('真的缺失 → 仍 fail（检查强度不降）', () => {
    const r = m22(minimalFiles(), { fileExists: () => false })
    expect(r.passed).toBe(false)
    expect(r.failed?.message).toContain('mc-preview.png')
  })

  it('文本 map 里已有 png → 不依赖探针即可通过', () => {
    const files = minimalFiles()
    files['resources/images/mc-preview.png'] = '<binary-placeholder>'
    expect(m22(files).passed).toBe(true)
  })

  it('未注入探针 → 退化为只查 files（保持纯函数调用方的旧行为）', () => {
    expect(m22(minimalFiles()).passed).toBe(false)
  })

  it('探针收到的是仓库相对路径 resources/images/mc-preview.png', () => {
    const seen: string[] = []
    checkMcComponent(minimalFiles(), null, {
      fileExists: (rel: string) => {
        seen.push(rel)
        return true
      },
    })
    expect(seen).toContain('resources/images/mc-preview.png')
  })
})
