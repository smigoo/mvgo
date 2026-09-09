import { mkdtemp, mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
}), { virtual: true })

import { writeFiles } from './file-writer.js'

describe('file-writer 写盘自愈', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-less-'))
    await mkdir(join(root, 'resources', 'styles'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('写盘即补全 standalone less 缺失的右大括号，避免坏文件流入下游门禁', () => {
    // 根选择器打开后紧跟一个未缩进的新规则：LLM 漏写了根选择器的闭合 `}`
    const brokenLess = [
      '.c-demo-root {display: flex;',
      '  width: 420px;',
      '  height: 186px;',
      '.c-demo-child {',
      '  color: red;',
      '}',
    ].join('\n')

    const result = writeFiles(
      { 'resources/styles/common.less': brokenLess },
      root,
      { logger: undefined } as any,
    )

    const target = join(root, 'resources/styles/common.less')
    expect(existsSync(target)).toBe(true)
    const written = require('fs').readFileSync(target, 'utf-8') as string
    const open = (written.match(/{/g) || []).length
    const close = (written.match(/}/g) || []).length
    expect(open).toBe(close)
    // 自愈后根选择器应已闭合，子规则不再被根规则吞掉
    expect(written).toMatch(/\}\s*\n\.c-demo-child/)
    expect(result?.skippedFiles || []).toEqual([])
  })

  it('正常 less 不被改写', async () => {
    const goodLess = '.a {\n  color: red;\n}\n'
    writeFiles({ 'resources/styles/common.less': goodLess }, root, {} as any)
    const written = await readFile(join(root, 'resources/styles/common.less'), 'utf-8')
    expect(written.trim()).toBe(goodLess.trim())
  })
})
