import { mkdtemp, mkdir, rm } from 'fs/promises'
import { writeFileSync, readFileSync, statSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
}), { virtual: true })

import { shouldSkipWrite, writeFiles } from './file-writer.js'

describe('P1-Slice1 · writeFiles 写前 diff（增量补丁 tracer bullet）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-diff-'))
    await mkdir(join(root, 'resources', 'styles'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('shouldSkipWrite 纯函数', () => {
    it('磁盘不存在该文件 → 必须写入（absent）', () => {
      const p = join(root, 'resources', 'styles', 'nope.less')
      const r = shouldSkipWrite(p, '.a { color: red; }')
      expect(r.skip).toBe(false)
      expect(r.reason).toBe('absent')
    })

    it('磁盘存在且内容完全相同 → 跳过写入（identical）', () => {
      const p = join(root, 'resources', 'styles', 'same.less')
      writeFileSync(p, '.a { color: red; }', 'utf-8')
      const r = shouldSkipWrite(p, '.a { color: red; }')
      expect(r.skip).toBe(true)
      expect(r.reason).toBe('identical')
    })

    it('磁盘存在但内容不同 → 必须写入（differs）', () => {
      const p = join(root, 'resources', 'styles', 'diff.less')
      writeFileSync(p, '.a { color: red; }', 'utf-8')
      const r = shouldSkipWrite(p, '.a { color: blue; }')
      expect(r.skip).toBe(false)
      expect(r.reason).toBe('differs')
    })

    it('读取异常时保守写入，不因兜底吞掉真实产物（read_error）', () => {
      // 目录当文件读 → readFileSync 抛 EISDIR
      const dir = join(root, 'resources', 'styles')
      const r = shouldSkipWrite(dir, 'anything')
      expect(r.skip).toBe(false)
      expect(r.reason).toBe('read_error')
    })
  })

  describe('writeFiles 集成：同名文件未变化则不再重写', () => {
    it('第二次写相同内容时跳过写盘（不进 written、保留 mtime）', () => {
      const raw = '.c-demo-root {\n  display: flex;\n}\n'
      const rel = 'resources/styles/demo.less'

      const first = writeFiles({ [rel]: raw }, root)
      expect(first.written).toContain(rel)

      // 落盘内容已被 sanitize（末尾换行被 trim），以磁盘实际内容为准
      const full = join(root, rel)
      const onDisk = readFileSync(full, 'utf-8')

      // 人为把 mtime 拨到过去，用于验证「未被重写」
      const past = new Date(Date.now() - 600000)
      utimesSync(full, past, past)
      const mtimeBefore = statSync(full).mtimeMs

      const second = writeFiles({ [rel]: raw }, root)
      // 内容未变化 → 跳过写盘：不在 written，mtime 保持
      expect(second.written).not.toContain(rel)
      expect(statSync(full).mtimeMs).toBe(mtimeBefore)
      expect(readFileSync(full, 'utf-8')).toBe(onDisk)
    })

    it('内容变化时仍照常写入（不因增量优化丢失更新）', () => {
      const rel = 'resources/styles/demo.less'
      const v1 = '.a { color: red; }'
      const v2 = '.a { color: blue; }'

      writeFiles({ [rel]: v1 }, root)
      expect(readFileSync(join(root, rel), 'utf-8')).toBe(v1)

      const res = writeFiles({ [rel]: v2 }, root)
      expect(res.written).toContain(rel)
      expect(readFileSync(join(root, rel), 'utf-8')).toBe(v2)
    })
  })
})
