/**
 * 🛡️ 2026-11-16（真机 mc-max-1794763435996-f96c9b9b 实锤）：**SFC 阻断要留证据**。
 *
 * 病灶：`sfc-blocked.json` 只存 `errors`（`path:line:col`）与 `reason`，不存出错行原文。
 *   真机 index.vue 报 `18:145 / 27:147 SFC: Duplicate attribute`，缓存里拿不到原文 ⇒
 *   「哪个属性重复、第二个从哪来」无从判断，只能重跑复现。
 *
 * 本 spec 只锁 `buildBlockedSample` 的**取行语义**（纯函数，不参与任何判定）：
 *  ① 取**首个带行列号**的错误对应的那一行（错误列表里前面可能有无行列号的条目）；
 *  ② 取不到行号 / 行号越界 / 空内容 ⇒ 空串（绝不抛错，fail-open）；
 *  ③ 输出 trim 且截断 400（避免把整行模板塞进缓存）。
 */
import { join } from 'path'

// 🔴 backend-root 必须 mock（否则 logger 链会二次声明 __filename，整套件 0 运行）
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(process.cwd(), 'logs'),
}))

import { buildBlockedSample } from './file-writer.js'

const SFC = [
  '<template>',
  '  <div class="c-x-slot-con">',
  '    <div class="c-x-sech-1" data-section-id="2:8787" style="flex:1">',
  '  </div>',
  '</template>',
].join('\n')

describe('buildBlockedSample · 阻断证据取行', () => {
  test('取首个带行列号错误的那一行（跳过无行列号的前置条目）', () => {
    const sample = buildBlockedSample(SFC, [
      'index.vue: SFC 解析失败',
      'index.vue:3:5 SFC: Duplicate attribute.',
      'index.vue:9:2 SFC: Duplicate attribute.',
    ])
    expect(sample).toBe('<div class="c-x-sech-1" data-section-id="2:8787" style="flex:1">')
  })

  test('无行列号 / 空内容 / 越界行号 ⇒ 空串（fail-open 不抛错）', () => {
    expect(buildBlockedSample(SFC, ['index.vue: SFC 解析失败'])).toBe('')
    expect(buildBlockedSample('', ['index.vue:1:1 Duplicate attribute'])).toBe('')
    expect(buildBlockedSample(SFC, ['index.vue:999:1 Duplicate attribute'])).toBe('')
    expect(buildBlockedSample(SFC, [])).toBe('')
  })

  test('输出 trim 且截断 400 字符', () => {
    const long = `<div ${'a'.repeat(600)}>`
    const sample = buildBlockedSample(`\n${long}\n`, ['x.vue:2:1 Duplicate attribute'])
    expect(sample.length).toBe(400)
    expect(sample.startsWith('<div aaaa')).toBe(true)
    expect(sample).not.toMatch(/^\s/)
  })
})
