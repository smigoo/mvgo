/**
 * 🛡️ 2026-11-17（快照落后根治 · P1-C/P1-D 复检实锤）：`writeFiles` 回传**写盘出口定稿 map**。
 *
 * 病灶（代码事实）：
 *   ① `MicrocodeEngineer.writeFiles` 包装层把入参 map 换成**新对象**——类名方言归一
 *      （`class-dialect-normalizer.js:616 const next = {...files}`）与子组件类收敛
 *      （`style-class-consolidator.js:1492 const next = {...files}`）都返回副本；
 *   ② file-writer 内所有就地回写（sanitized 回写 / 刀 53 终裁覆写 / S6·bg 挂载注入）
 *      因此只落在 `targetFiles` 上，调用方 `finalTruthFiles`（execute:10316）保持旧引用；
 *   ③ 终态补偿「写盘自愈回读」（execute:10951）只覆盖最后一趟 `written` 列表
 *      ⇒ 上一趟已写、或本轮 `identical` 跳过的文件永不回读。
 *   真机证据 `mc-max-1794852551062-e95f5990`：磁盘三段标题图标 import + `:src` 齐备
 *   （mtime 02:10:28，早于验收 02:10:29），验收 E2-v3 仍判「3 张前景资源零消费」、
 *   resConserve `imported=2,notImported=3` ⇒ 假 FAIL 触发降级交付 + 待补清单误报。
 *
 * 本 spec 的回归锚（取自实测行为，不取自注释）：
 *   · `finalFiles` 必须等于磁盘终态（含刀 53 覆写 / identical 跳过两条路径）；
 *   · **调用方原对象可以陈旧** —— 这正是「必须采纳 finalFiles」的理由，也是本 bug 的形态；
 *   · 不传 `fgTakeoverFiles` 时行为逐字不变（纯附加字段，零回归）。
 *
 * harness 惯例同 `file-writer.r2-snapshot-validate.spec.ts`：工厂 mock 覆盖 logger 链 +
 * 临时目录真实写盘。
 */
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(process.cwd(), 'logs'),
}), { virtual: true })

import { writeFiles } from './file-writer.js'

// 极简合法 SFC（与真机接管渲染器输出同形态：模板 + 空脚本）
const LOCKED_SNAPSHOT = [
  '<template>',
  '  <div class="c-x-fg-grid-21" style="display:grid;">',
  '    <div v-for="(it, i) in items" :key="i">{{ it.text }}</div>',
  '  </div>',
  '</template>',
  '',
  '<script>',
  'export default {',
  '  data() { return { items: [{ text: "a" }] } },',
  '};',
  '</script>',
].join('\n')

// 写盘前的内存版本（与快照不同：缺接管结构），用于区分「陈旧」与「定稿」
const MEMORY_BEFORE = [
  '<template>',
  '  <div class="c-x-healed">',
  '    <div>healed</div>',
  '  </div>',
  '</template>',
].join('\n')

describe('快照落后根治 · writeFiles 回传 finalFiles（内存=磁盘）', () => {
  let root: string
  const rel = 'package/components/CardGrid.vue'

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-finalfiles-'))
    await mkdir(join(root, 'package', 'components'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('刀 53 终裁覆写路径：finalFiles 取定稿快照（不是写盘前内存版）', async () => {
    const out = writeFiles(
      { [rel]: MEMORY_BEFORE },
      root,
      { fgTakeoverFiles: new Map([[rel, LOCKED_SNAPSHOT]]) },
    )
    const onDisk = await readFile(join(root, rel), 'utf-8')
    expect(onDisk).toBe(LOCKED_SNAPSHOT)
    expect(out.finalFiles?.[rel]).toBe(LOCKED_SNAPSHOT)
  })

  it('identical 跳过路径：未写盘（不在 written），但 finalFiles 仍等于磁盘终态', async () => {
    // 先让磁盘已是定稿版本（模拟「上一趟已写盘」）
    await writeFile(join(root, rel), LOCKED_SNAPSHOT, 'utf-8')
    const out = writeFiles(
      { [rel]: MEMORY_BEFORE },
      root,
      { fgTakeoverFiles: new Map([[rel, LOCKED_SNAPSHOT]]) },
    )
    expect(out.written).not.toContain(rel) // 增量补丁跳过
    expect(await readFile(join(root, rel), 'utf-8')).toBe(LOCKED_SNAPSHOT)
    expect(out.finalFiles?.[rel]).toBe(LOCKED_SNAPSHOT)
  })

  it('病灶形态：调用方原对象保持陈旧（故调用方必须采纳 finalFiles）', async () => {
    const callerFiles: Record<string, string> = { [rel]: MEMORY_BEFORE }
    // 模拟 engineer 包装层的归一化：变换器返回 `{...files}` 副本 ⇒ 对象身份断裂
    const targetFiles: Record<string, string> = { ...callerFiles }
    expect(targetFiles).not.toBe(callerFiles)

    const out = writeFiles(
      targetFiles,
      root,
      { fgTakeoverFiles: new Map([[rel, LOCKED_SNAPSHOT]]) },
    )
    // ① 磁盘已定稿
    expect(await readFile(join(root, rel), 'utf-8')).toBe(LOCKED_SNAPSHOT)
    // ② 调用方原对象**没有**拿到写盘层结果 —— 不采纳 finalFiles 就永久落后
    expect(callerFiles[rel]).toBe(MEMORY_BEFORE)
    // ③ 唯一事实源 = finalFiles
    expect(out.finalFiles?.[rel]).toBe(LOCKED_SNAPSHOT)
  })

  it('纯附加契约：不传 fgTakeoverFiles 时行为逐字不变，finalFiles 就是入参 map', () => {
    const files: Record<string, string> = { 'resources/styles/a.less': '.a { color: red; }' }
    const out = writeFiles(files, root)
    expect(out.written).toContain('resources/styles/a.less')
    expect(out.finalFiles).toBe(files)
  })

  it('零回归：既有返回字段齐全（written/skipped/sfcBlocked/blade41Stats/imgSrcHealStats）', () => {
    const out = writeFiles({ 'resources/styles/b.less': '.b { color: blue; }' }, root)
    expect(Array.isArray(out.written)).toBe(true)
    expect(Array.isArray(out.skipped)).toBe(true)
    expect(Array.isArray(out.sfcBlocked)).toBe(true)
    expect(out.blade41Stats).toBeTruthy()
    expect(out.imgSrcHealStats).toBeTruthy()
  })
})
