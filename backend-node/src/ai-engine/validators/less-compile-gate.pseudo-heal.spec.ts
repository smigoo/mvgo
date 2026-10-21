import fs from 'node:fs'
import less from 'less'
import {
  healMangledPseudoSelectors,
  gateStandaloneLessWrite,
  scanStandaloneLessDefects,
} from './less-compile-gate.js'

/**
 * 🛡️ R20（2026-10-21 · mc-max-1792553283427-72ede0c9 实锤）：伪元素选择器损坏自愈。
 *
 * 真机坏样本（产物 `resources/styles/common.less:111`）：
 *   ```
 *   &: :-webkit-scrollbar {;
 *   }
 *   ```
 * less 报 `Unrecognised input` ⇒ L0-B `LESS-COMPILE-001` ×6 ⇒ BLOCK=8 ⇒ 6 轮重试全败。
 *
 * 为什么此前无出口：`healLessSource` 只数 `{}` 与分号，圆括号族只数 `()`，
 * **伪元素选择器的损坏对所有现有判据完全透明** —— 对这份坏文件 `healLessSource`
 * 返回 `changed:false`（自愈器认为文件是好的，编译却必败 = 假绿）。
 *
 * 本 spec 的**硬判据是真编译**（`less.render` 能过），不是「gate 自己说 ok」——
 * 避免「判据与实现同源 = 假绿闭环」。
 */

describe('R20 healMangledPseudoSelectors（伪元素 `::` 被拆开 / `{;` 孤立分号）', () => {
  it('`&: :xxx` ⇒ `&::xxx`，且 less 真能编译', async () => {
    const src = '.c-list {\n  overflow-y: auto;\n  &: :-webkit-scrollbar {\n    width: 6px;\n  }\n}\n'
    const r = healMangledPseudoSelectors(src)
    expect(r.changed).toBe(true)
    expect(r.fixedPseudo).toBe(1)
    expect(r.source).toContain('&::-webkit-scrollbar {')
    await expect(less.render(r.source)).resolves.toBeTruthy()
  })

  it('`{;` ⇒ `{`，且 less 真能编译', async () => {
    const src = '.c-list {\n  &::-webkit-scrollbar {;\n  }\n}\n'
    const r = healMangledPseudoSelectors(src)
    expect(r.changed).toBe(true)
    expect(r.fixedStraySemi).toBe(1)
    expect(r.source).not.toContain('{;')
    await expect(less.render(r.source)).resolves.toBeTruthy()
  })

  it('真机坏样本（两种损坏同时出现）⇒ 一步修到可编译', async () => {
    const src =
      '.c-list {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  overflow-y: auto;\n  &: :-webkit-scrollbar {;\n}\n\n}\n'
    const before = await less.render(src).then(() => null).catch((e) => e)
    expect(before).toBeTruthy() // 阳性对照：修之前必须编译失败

    const r = healMangledPseudoSelectors(src)
    expect(r.changed).toBe(true)
    expect(r.fixedPseudo).toBe(1)
    expect(r.fixedStraySemi).toBe(1)
    await expect(less.render(r.source)).resolves.toBeTruthy()
  })

  it('合法声明 `color: #fff` / `background: linear-gradient(` 零改动（不误伤）', () => {
    const src =
      '.a {\n  color: #fff;\n  background: linear-gradient(180deg, #111, #222);\n  transition: color .2s ease;\n}\n'
    const r = healMangledPseudoSelectors(src)
    expect(r.changed).toBe(false)
    expect(r.source).toBe(src)
  })

  it('幂等：修后二次调用零改动', () => {
    const src = '.c-list {\n  &: :-webkit-scrollbar {;\n  }\n}\n'
    const once = healMangledPseudoSelectors(src)
    const twice = healMangledPseudoSelectors(once.source)
    expect(twice.changed).toBe(false)
  })

  it('伪类簇 `&: :hover` / `&: :not(.x)` 按名单分类：伪类单冒号、伪元素双冒号', async () => {
    const src = '.a {\n  &: :hover {\n    color: red;\n  }\n  &: :not(.b) {\n    color: blue;\n  }\n  &: :before {\n    content: "";\n  }\n}\n'
    const r = healMangledPseudoSelectors(src)
    expect(r.fixedPseudo).toBe(3)
    // 伪类必须还原成单冒号（写成 `::hover` 会变成不存在的伪元素 ⇒ 样式静默消失）
    expect(r.source).toContain('&:hover')
    expect(r.source).toContain('&:not(.b)')
    // 伪元素必须双冒号
    expect(r.source).toContain('&::before')
    await expect(less.render(r.source)).resolves.toBeTruthy()
  })

  it('`&: hover`（伪类单冒号被空格拆开）同样纠正', async () => {
    const src = '.a {\n  &: hover {\n    color: red;\n  }\n}\n'
    const r = healMangledPseudoSelectors(src)
    expect(r.changed).toBe(true)
    expect(r.source).toContain('&:hover {')
    await expect(less.render(r.source)).resolves.toBeTruthy()
  })
})

describe('R20 gateStandaloneLessWrite 集成：坏样本不再判坏跳过', () => {
  it('真机坏样本过门禁 ⇒ ok:true 且产物能编译', async () => {
    const src =
      '.c-list {\n  display: flex;\n  gap: 8px;\n  overflow-y: auto;\n  &: :-webkit-scrollbar {;\n}\n\n}\n'
    const g = gateStandaloneLessWrite(src, 'resources/styles/common.less')
    expect(g.ok).toBe(true)
    expect(g.fixes.join(',')).toMatch(/heal\(pseudo:1,stray-semi:1\)/)
    await expect(less.render(g.content)).resolves.toBeTruthy()
  })

  it('残留判据 LESS-WRITE-006：未修形态必须被扫出', () => {
    const defects = scanStandaloneLessDefects('.a {\n  &: :hover { color: red; }\n}\n')
    expect(defects.some((d) => d.id === 'LESS-WRITE-006')).toBe(true)
    expect(defects.find((d) => d.id === 'LESS-WRITE-006').line).toBe(2)
  })

  it('干净文件零缺陷、零 fixes（阴性对照）', () => {
    const src = '.a {\n  color: #fff;\n  &::-webkit-scrollbar {\n    width: 6px;\n  }\n}\n'
    const g = gateStandaloneLessWrite(src, 'x.less')
    expect(g.ok).toBe(true)
    expect(g.fixes).toHaveLength(0)
  })
})

describe('R20 真实产物回归（72ede0c9 落盘文件）', () => {
  const DIR =
    '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components/c-aiot-dpjh-bsjd-72ede0c9/resources/styles'

  it('磁盘坏文件修后，整条 index.less 编译链可编译（存在才跑）', async () => {
    if (!fs.existsSync(`${DIR}/common.less`)) return
    const src = fs.readFileSync(`${DIR}/common.less`, 'utf8')

    // 阴性对照：原文件必须编译失败（否则本用例无意义）
    const tmpBefore = fs.mkdtempSync('/tmp/r20-before-')
    fs.cpSync(DIR, tmpBefore, { recursive: true })
    const errBefore = await less
      .render(fs.readFileSync(`${tmpBefore}/index.less`, 'utf8'), {
        filename: `${tmpBefore}/index.less`,
        paths: [tmpBefore],
      })
      .then(() => null)
      .catch((e) => e)
    expect(String(errBefore?.message || '')).toMatch(/Unrecognised input/)

    const g = gateStandaloneLessWrite(src, 'common.less')
    expect(g.ok).toBe(true)
    expect(g.fixes.join(',')).toMatch(/heal\(pseudo:\d+,stray-semi:\d+\)/)

    const tmp = fs.mkdtempSync('/tmp/r20-after-')
    fs.cpSync(DIR, tmp, { recursive: true })
    fs.writeFileSync(`${tmp}/common.less`, g.content, 'utf8')
    await expect(
      less.render(fs.readFileSync(`${tmp}/index.less`, 'utf8'), {
        filename: `${tmp}/index.less`,
        paths: [tmp],
      }),
    ).resolves.toBeTruthy()
  })
})
