import { mkdtemp, mkdir, rm } from 'fs/promises'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
}), { virtual: true })

import { pickCachedChunkLastGood } from './cached-chunk-last-good.js'

/**
 * 🛡️ L2-a（2026-10-20 · mc-max-1792497064987-195c8d0e 实锤）：写盘门禁判坏时的
 * last-good 回退。

 * 事故：降级链只认「磁盘 last-good」。首次写盘磁盘为空 ⇒ `_hasLastGood=false`
 * ⇒ 块注释配平复检仍失败 ⇒ `skippedFiles.push` ⇒ `code-validator` 用 15 行兜底
 * 模板覆盖。而本轮 LLM 的合格产物其实躺在 `.mc-gen/cache/code-chunks/` 里
 * （195c8d0e：641 行、括号 26:26、覆盖 53/56 class、gate ok:true）没人用。
 *
 * 三道判据（任一不过即淘汰该候选）：
 *   ① chunk-meta.json 有登记（不扫目录 ⇒ 不会误取上一次运行的遗留分块）
 *   ② 候选自身过 gateStandaloneLessWrite（与写盘门禁同一实现）
 *   ③ 候选与本轮输出的 class 前缀一致（防旧前缀分块）
 */

const REL = 'resources/styles/common.less'
const GOOD = (cls: string) => `${cls} {\n  width: 100%;\n  height: 100%;\n}\n`

describe('pickCachedChunkLastGood（L2-a 分块缓存 last-good 回退）', () => {
  let root: string
  let chunkDir: string
  const writeMeta = (files: Record<string, Array<{ index: number; file: string }>>) => {
    writeFileSync(join(chunkDir, 'chunk-meta.json'), JSON.stringify({ completed: [], files }), 'utf-8')
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-cache-'))
    chunkDir = join(root, '.mc-gen', 'cache', 'code-chunks')
    await mkdir(chunkDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('命中：meta 登记 + 候选过门禁 + 前缀一致 ⇒ 返回候选内容', () => {
    writeFileSync(
      join(chunkDir, '17-resources_styles_common.less'),
      GOOD('.c-195c8d-slot-con'),
      'utf-8',
    )
    writeMeta({ [REL]: [{ index: 17, file: '17-resources_styles_common.less' }] })
    const got = pickCachedChunkLastGood(root, REL, '.c-195c8d-slot-con {\n  display: flex;\n}\n')
    expect(got).toContain('.c-195c8d-slot-con')
    expect(got).toContain('width: 100%;')
  })

  it('阳性对照 · 前缀不一致（上一次运行的遗留分块）⇒ 拒绝', () => {
    // 旧分块用 .c-component-* 前缀（真实存在：2-resources_styles_common.less）
    writeFileSync(
      join(chunkDir, '2-resources_styles_common.less'),
      GOOD('.c-component-cp-slot'),
      'utf-8',
    )
    writeMeta({ [REL]: [{ index: 2, file: '2-resources_styles_common.less' }] })
    const got = pickCachedChunkLastGood(root, REL, '.c-195c8d-slot-con {\n  display: flex;\n}\n')
    expect(got).toBeNull()
  })

  it('缺 `)` 的候选 ⇒ 门禁 L1-b 自愈后仍可用（返回补平的文本）', () => {
    writeFileSync(
      join(chunkDir, '17-resources_styles_common.less'),
      '.c-195c8d-slot-con {\n  background: rgba(1, 2, 3;\n}\n',
      'utf-8',
    )
    writeMeta({ [REL]: [{ index: 17, file: '17-resources_styles_common.less' }] })
    const got = pickCachedChunkLastGood(root, REL, '.c-195c8d-slot-con { display: flex; }')
    expect(got).toContain('.c-195c8d-slot-con')
    expect((got!.match(/\(/g) || []).length).toBe((got!.match(/\)/g) || []).length)
  })

  it('阳性对照 · 候选自身过不了门禁（多余 `}`，heal 无法确定性修）⇒ 拒绝', () => {
    writeFileSync(
      join(chunkDir, '17-resources_styles_common.less'),
      '.c-195c8d-slot-con {\n  width: 100%;\n}}}\n',
      'utf-8',
    )
    writeMeta({ [REL]: [{ index: 17, file: '17-resources_styles_common.less' }] })
    expect(pickCachedChunkLastGood(root, REL, '.c-195c8d-slot-con { display: flex; }')).toBeNull()
  })

  it('阳性对照 · 未被 meta 登记的孤立分块 ⇒ 不扫目录、拒绝', () => {
    // 文件存在但 meta 没登记（模拟上一次运行的遗留）
    writeFileSync(
      join(chunkDir, '99-resources_styles_common.less'),
      GOOD('.c-195c8d-slot-con'),
      'utf-8',
    )
    writeMeta({})
    expect(pickCachedChunkLastGood(root, REL, '.c-195c8d-slot-con { display: flex; }')).toBeNull()
  })

  it('阳性对照 · 无 chunk-meta.json ⇒ null（保守退回原降级链）', () => {
    writeFileSync(
      join(chunkDir, '17-resources_styles_common.less'),
      GOOD('.c-195c8d-slot-con'),
      'utf-8',
    )
    expect(pickCachedChunkLastGood(root, REL, '.c-195c8d-slot-con { display: flex; }')).toBeNull()
  })

  it('多分块按倒序取（后写的优先）', () => {
    writeFileSync(join(chunkDir, 'a-old.less'), GOOD('.c-195c8d-a'), 'utf-8')
    writeFileSync(join(chunkDir, 'b-new.less'), GOOD('.c-195c8d-b'), 'utf-8')
    writeMeta({
      [REL]: [
        { index: 2, file: 'a-old.less' },
        { index: 17, file: 'b-new.less' },
      ],
    })
    const got = pickCachedChunkLastGood(root, REL, '.c-195c8d-x { display: flex; }')
    expect(got).toContain('.c-195c8d-b')
    expect(got).not.toContain('.c-195c8d-a')
  })
})
