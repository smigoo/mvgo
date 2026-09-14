import { mkdtemp, mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
}), { virtual: true })

import { writeFiles, safeLessVarValue } from './file-writer.js'
import { NEUTRAL_LESS_COLOR } from '../../utils/less-color-funcs.js'

const less = require('less')

/**
 * 刀 16b 回归（2026-09-13）：**颜色函数实参的合成值必须可求值**
 *
 * 事故链：`@hint-strong` 是 LLM 臆造的变量 → 名字分支无匹配 → 兜底 `unset`
 * → `lighten(unset, 10%)` 在 LESS 编译期报
 * `Error evaluating function \`lighten\`: Argument cannot be evaluated to a color`
 * → 整个 `<style>` 块编译失败 → P1-4 坏文件隔离 → 子组件整块消失。
 *
 * 与刀 15（var() 透传）同源但**不同凶手**：这次没有任何 var()，只有兜底值不可求值。
 */
describe('safeLessVarValue —— 消费端事实（颜色函数实参）优先于名字猜测', () => {
  it('无消费端上下文时保持原行为（兜底 unset）', () => {
    expect(safeLessVarValue('@hint-strong')).toBe('unset')
  })

  it('被颜色函数消费 → 换成中立真颜色（不再是 unset）', () => {
    expect(
      safeLessVarValue('@hint-strong', {
        styleText: '.x{color:lighten(@hint-strong, 10%)}',
      }),
    ).toBe(NEUTRAL_LESS_COLOR)
    expect(
      safeLessVarValue('@hint-strong', { usedByColorFn: true }),
    ).toBe(NEUTRAL_LESS_COLOR)
  })

  it('名字分支给出**非颜色**（px/数值）时同样被纠正 —— 这是只看名字必漏的一类', () => {
    // @radius-x → 名字分支命中 /radius/ → '8px'（不可求值）
    expect(safeLessVarValue('@radius-x')).toBe('8px')
    expect(
      safeLessVarValue('@radius-x', { usedByColorFn: true }),
    ).toBe(NEUTRAL_LESS_COLOR)
    // @line-alpha → 名字分支命中 /alpha/ → '1'（不可求值）
    expect(safeLessVarValue('@line-alpha')).toBe('1')
    expect(
      safeLessVarValue('@line-alpha', { usedByColorFn: true }),
    ).toBe(NEUTRAL_LESS_COLOR)
  })

  it('名字分支已给出真颜色时保留更优猜测（不被中立色覆盖）', () => {
    expect(safeLessVarValue('@colorPrimary')).toBe('#409EFF')
    expect(
      safeLessVarValue('@colorPrimary', { usedByColorFn: true }),
    ).toBe('#409EFF')
  })

  it('未被颜色函数消费 → 不改变兜底（不制造无关变更）', () => {
    expect(
      safeLessVarValue('@hint-strong', {
        styleText: '.x{color:@hint-strong}',
      }),
    ).toBe('unset')
  })
})

describe('file-writer 写盘门禁：颜色函数实参兜底（刀 16b 端到端）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-colorfn-'))
    await mkdir(join(root, 'resources', 'styles'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const sfc = (lessBody: string) => [
    '<template>',
    '  <div class="c-demo-root">x</div>',
    '</template>',
    '<script setup>',
    'const a = 1;',
    '</script>',
    '<style lang="less" scoped>',
    lessBody,
    '</style>',
  ].join('\n')

  /** 把写盘后的 SFC 的 style 块交给 less 真编译 —— 直接编码「事故会怎样」 */
  async function renderStyle(written: string) {
    const block = (written.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || ''
    return less.render(block)
  }

  it('臆造变量被颜色函数引用 → 补全为可求值真颜色，样式块能编译通过', async () => {
    const body = '.c-demo-root {\n  color: lighten(@hint-strong, 10%);\n}'
    const result = writeFiles(
      { 'package/components/DemoSection.vue': sfc(body) },
      root,
      { logger: undefined } as any,
    )

    const written = await readFile(
      join(root, 'package/components/DemoSection.vue'),
      'utf-8',
    )
    // 1) 补全值必须是真颜色
    expect(written).toContain(`@hint-strong: ${NEUTRAL_LESS_COLOR};`)
    // 2) 绝不能是 unset（这正是事故形态）
    expect(written).not.toContain('@hint-strong: unset;')
    // 3) 该文件不应被写盘门禁跳过
    expect(result?.skippedFiles || []).toEqual([])
    // 4) 决定性证据：less 真编译通过
    await expect(renderStyle(written)).resolves.toBeTruthy()
  })

  it('对照：同样的臆造变量**未被**颜色函数引用 → 仍走 unset 兜底（不回归刷噪声）', async () => {
    const body = '.c-demo-root {\n  color: @hint-strong;\n}'
    writeFiles(
      { 'package/components/DemoSection.vue': sfc(body) },
      root,
      { logger: undefined } as any,
    )

    const written = await readFile(
      join(root, 'package/components/DemoSection.vue'),
      'utf-8',
    )
    expect(written).toContain('@hint-strong: unset;')
  })

  it('名字分支命中的颜色变量被颜色函数引用 → 保留更优真颜色（#409EFF）且可编译', async () => {
    const body = '.c-demo-root {\n  background: lighten(@brand-accent, 20%);\n}'
    writeFiles(
      { 'package/components/DemoSection.vue': sfc(body) },
      root,
      { logger: undefined } as any,
    )

    const written = await readFile(
      join(root, 'package/components/DemoSection.vue'),
      'utf-8',
    )
    expect(written).toContain('@brand-accent: #409EFF;')
    await expect(renderStyle(written)).resolves.toBeTruthy()
  })
})
