/**
 * 治本 E（2026-09-10）：v-if 与 v-for 同元素 fail-closed 自愈。
 * 验证 stripVIfOnVFor 把同元素共存改写为合法 Vue3 结构（template v-for + 内层 v-if）。
 */
jest.mock('../../../config/backend-root.js', () => ({
  getWorkspaceRoot: () => '/Users/smigoo/工作/mvgo/backend-node',
  getLogsDir: () => '/tmp/mvgo-test-logs',
  isDev: true,
}))

import { stripVIfOnVFor } from './code-healer.js'

describe('治本E stripVIfOnVFor', () => {
  test('同元素 v-if+v-for → 拆为 template v-for + 内层 v-if', () => {
    const vue = `<template>
  <div v-if="activeTab === tab.value" v-for="tab in tabList" :key="tab.value" class="item">{{ tab.label }}</div>
</template>
<script setup></script>`
    const out = stripVIfOnVFor(vue)
    // v-if 折叠进 v-for 数据源（filter），同元素不再共存
    expect(out).toMatch(/v-for="tab in tabList\.filter\(\(tab\) => activeTab === tab\.value\)"/)
    expect(out).not.toMatch(/<div[^>]*\bv-if\s*=/)
    // DOM 结构与 key 保持不变
    expect(out).toMatch(/:key="tab\.value"/)
    expect(out).toMatch(/\{\{ tab\.label \}\}/)
  })

  test('仅 v-for 无 v-if → 原样保留', () => {
    const vue = `<template><div v-for="x in list" :key="x.id">{{x}}</div></template>`
    expect(stripVIfOnVFor(vue)).toBe(vue)
  })

  test('仅 v-if 无 v-for → 原样保留', () => {
    const vue = `<template><div v-if="show" class="x">hi</div></template>`
    expect(stripVIfOnVFor(vue)).toBe(vue)
  })
})
