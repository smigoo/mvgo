/**
 * #139（N3）：`healFabricatedColorVarValues` —— 「名字说 gold、值是蓝」的真值矫正。
 *
 * 事故（e7a50be7 实锤）：
 *   theme-vars.less:49  `@color-accent-gold: #409EFF;  // 自愈：从 .common() 迁出`
 *   theme-vars.less:50  `@color-accent-mint: #409EFF;`
 *   ⇒ index.css 渲染成 `box-shadow: inset 0 0 16px #409EFF`（蓝色发光）+ `background: #409EFF`（蓝块）。
 *   根因 = `/(primary|accent)/ → #409EFF` 的按名猜色（safeLessVarValue 旧行为）。
 */
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFileSync } from 'fs'

jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(tmpdir(), 'mvgo-test-logs'),
}), { virtual: true })

import { LessVariableChecker } from './less-variable-checker.js'

const THEME_VARS = `.common() {
  @fontSize: var(--fontSize);
}

.theme-light() {
  @color-accent-gold: #409EFF; // 自愈：从 .common() 迁出
  @color-accent-mint: #409EFF; // 自愈：从 .common() 迁出
  @color-count-gold: #333333; // 自动添加（语义推断）
  @color-vendor-count-active: #333333; // 自动添加（语义推断）
}

.theme-theme_2() {
  @color-accent-gold: rgba(246, 218, 38, 1);
  @color-accent-mint: rgba(0, 222, 59, 1);
  @color-count-gold: #ffffff; // 自愈：跨稿真值矫正（原语义推断值被覆盖）
}

:root {
  .common();
  .theme-light();
  .theme-theme_2();
}
`

const COMMON_LESS = `
.c-a { box-shadow: inset 0px 0px 16px 0px @color-accent-gold; }
.c-b { background: @color-accent-mint; }
.c-c { color: @color-count-gold; }
.c-d { color: @color-vendor-count-active; }
`

const PALETTE = {
  backgrounds: ['rgba(226, 208, 132, 0.2)', '#fffdf1', 'rgba(216, 255, 233, 0.32)'],
  shadows: ['#ffc800', 'rgba(53, 190, 82, 0.82)', 'rgba(25, 181, 186, 0.67)'],
  borders: ['#e8e8e8'],
  texts: ['#b9a000', '#00ac2e', '#333333'],
}

async function setup(themeVars = THEME_VARS) {
  const root = await mkdtemp(join(tmpdir(), 'mvgo-heal-fabricated-'))
  await mkdir(join(root, 'resources', 'styles', 'themes'), { recursive: true })
  await mkdir(join(root, 'package'), { recursive: true })
  const themeVarsPath = join(root, 'resources', 'styles', 'themes', 'theme-vars.less')
  await writeFile(themeVarsPath, themeVars, 'utf8')
  await writeFile(join(root, 'resources', 'styles', 'common.less'), COMMON_LESS, 'utf8')
  return { root, themeVarsPath }
}

describe('healFabricatedColorVarValues（按 node 真值矫正按名猜色）', () => {
  test('名字色系 ≠ 值色系 ⇒ 按色板唯一真值矫正（蓝 → 金）', async () => {
    const { root, themeVarsPath } = await setup()
    const ctx = LessVariableChecker.buildTruthContext(root, { truthPalette: PALETTE })
    const res = LessVariableChecker.healFabricatedColorVarValues(themeVarsPath, ctx)
    const after = readFileSync(themeVarsPath, 'utf8')

    const gold = res.changed.find((c) => c.name === 'color-accent-gold')
    expect(gold).toBeTruthy()
    expect(gold!.from.toLowerCase()).toBe('#409eff')
    // box-shadow 消费 ⇒ shadows 桶 + gold 色系收窄 ⇒ #ffc800
    expect(gold!.to).toBe('#ffc800')
    expect(after).not.toMatch(/@color-accent-gold:\s*#409EFF/)

    await rm(root, { recursive: true, force: true })
  })

  test('色板不可判定时，回落到同文件其它 mixin 的同色系真值', async () => {
    const { root, themeVarsPath } = await setup()
    // mint 在 backgrounds 桶里有两个 green 候选（不唯一）⇒ 色板不可判定
    const ambiguous = {
      ...PALETTE,
      backgrounds: ['rgba(216, 255, 233, 0.32)', '#f6fff7'],
    }
    const ctx = LessVariableChecker.buildTruthContext(root, { truthPalette: ambiguous })
    const res = LessVariableChecker.healFabricatedColorVarValues(themeVarsPath, ctx)
    const mint = res.changed.find((c) => c.name === 'color-accent-mint')
    expect(mint).toBeTruthy()
    expect(mint!.to).toBe('rgba(0, 222, 59, 1)')
    await rm(root, { recursive: true, force: true })
  })

  test('名字无色系词 ⇒ 不动（无从判对错，交中性兜底）', async () => {
    const { root, themeVarsPath } = await setup()
    const ctx = LessVariableChecker.buildTruthContext(root, { truthPalette: PALETTE })
    const res = LessVariableChecker.healFabricatedColorVarValues(themeVarsPath, ctx)
    expect(res.changed.find((c) => c.name === 'color-vendor-count-active')).toBeUndefined()
    const after = readFileSync(themeVarsPath, 'utf8')
    expect(after).toMatch(/@color-vendor-count-active:\s*#333333/)
    await rm(root, { recursive: true, force: true })
  })

  test('幂等：第二次运行零改动', async () => {
    const { root, themeVarsPath } = await setup()
    const ctx = LessVariableChecker.buildTruthContext(root, { truthPalette: PALETTE })
    const first = LessVariableChecker.healFabricatedColorVarValues(themeVarsPath, ctx)
    expect(first.changed.length).toBeGreaterThan(0)
    const second = LessVariableChecker.healFabricatedColorVarValues(themeVarsPath, ctx)
    expect(second.changed).toEqual([])
    await rm(root, { recursive: true, force: true })
  })

  test('矫正后抹掉「自动添加（语义推断）」标注（防止后续把它当猜测值再覆盖）', async () => {
    const { root, themeVarsPath } = await setup()
    const ctx = LessVariableChecker.buildTruthContext(root, { truthPalette: PALETTE })
    LessVariableChecker.healFabricatedColorVarValues(themeVarsPath, ctx)
    const after = readFileSync(themeVarsPath, 'utf8')
    const line = after.split('\n').find((l) => l.includes('@color-count-gold: #b9a000'))!
    expect(line).toBeTruthy()
    expect(line).not.toContain('自动添加（语义推断）')
    expect(line).toContain('真值矫正')
    await rm(root, { recursive: true, force: true })
  })

  test('无色板也无兄弟真值 ⇒ 不改动（fail-closed，绝不猜）', async () => {
    const { root, themeVarsPath } = await setup(`.theme-light() {
  @color-accent-gold: #409EFF;
}
`)
    const ctx = LessVariableChecker.buildTruthContext(root, {})
    const res = LessVariableChecker.healFabricatedColorVarValues(themeVarsPath, ctx)
    expect(res.changed).toEqual([])
    const after = readFileSync(themeVarsPath, 'utf8')
    expect(after).toContain('#409EFF')
    await rm(root, { recursive: true, force: true })
  })
})
