/**
 * 🛡️ 2026-11-06（mc-max-1793918742773-f91aa545 实锤）：**坏 SFC 不放行**。
 *
 * 病灶：真机 TabsSection.vue / CardGrid.vue 模板表达式解析失败，写盘门禁只
 * `WARN + 已跳过`（文件不写、任务照旧成功），上层完全无从得知 ⇒ index 仍 import 它
 * ⇒ 预览 load-error ⇒ RUNTIME-004 判死，且结果里没有任何「产物不完整」证据。
 *
 * 本 spec 锁两件事：
 *  ① 解析失败的文件**不落盘**（磁盘上不存在该文件）；
 *  ② 返回值 `sfcBlocked` 明确列出被阻断文件（供上层计入 degraded / artifactIncomplete）。
 */
import { mkdtemp, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(process.cwd(), 'logs'),
}), { virtual: true })

import { writeFiles } from './file-writer.js'

describe('writeFiles · SFC 门禁阻断（f91aa545）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-sfc-'))
    await mkdir(join(root, 'package', 'components'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('⭐ 阳性：模板表达式非法 ⇒ 文件不落盘，且列入 sfcBlocked', () => {
    // `:style="{ background: it.bg, }` 里多出的逗号整体不是合法对象字面量（真机同类形态）
    const bad = `<template>
  <div :style="{ background: , paddingLeft: '4px' }">x</div>
</template>
<script setup>
const a = 1
</script>
`
    const r = writeFiles({ 'package/components/Bad.vue': bad }, root)
    expect(r.sfcBlocked.map((f: any) => f.path)).toContain('package/components/Bad.vue')
    expect(existsSync(join(root, 'package/components/Bad.vue'))).toBe(false)
  })

  it('反向：合法 SFC ⇒ sfcBlocked 为空且正常落盘', () => {
    const ok = `<template>
  <div class="a">x</div>
</template>
<script setup>
const a = 1
</script>
`
    const r = writeFiles({ 'package/components/Ok.vue': ok }, root)
    expect(r.sfcBlocked).toEqual([])
    expect(existsSync(join(root, 'package/components/Ok.vue'))).toBe(true)
  })
})
