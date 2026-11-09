/**
 * 🛡️ R2（2026-11-09 · loop-verify R2 轮）：刀53 终裁覆写点的**快照语法校验**。
 *
 * 病灶（mc-max-1794142741765-e239c8c3 真机实锤）：file-writer `:1470` 的 SFC 写盘门禁
 * 验的是被换掉的 sanitizedContent（before:1053 合法通过），`:2169` 终裁覆写后的 locked
 * 快照（after:1395）不再过任何校验直接落盘 ⇒ 78ms 后被标「SFC 编译失败已隔离降级」，
 * degradedFiles=['TabsSection.vue']、产物完整性假阳。
 *
 * 治本：覆写点对 locked 快照跑同一 validateVueSfc（判据同源，不新增第二套 SFC 解析），
 * 非法 ⇒ 弃快照、保留 heal 版本（该内容已过门禁验证）落盘 + 计数行。
 *
 * ⚠️ 已知 harness 边界：file-writer 全链依赖（logger 工厂/backend-root/写盘副作用）在
 * ts-jest CJS 下需整链 mock，同 file-writer.spec.ts 头注惯例。本 spec 用工厂 mock 覆盖
 * logger 链 + 临时目录真实写盘（与 diff-skip.spec 同款 tracer bullet）。
 */
import { mkdtemp, mkdir, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(process.cwd(), 'logs'),
}), { virtual: true })

import { writeFiles } from './file-writer.js'

// 极简合法 SFC：模板 + 空脚本（真机快照即此形态，folding-grid 渲染器输出）
const VALID_SNAPSHOT = [
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

// 非法 SFC：表达式残缺（e239c8c3 门禁报的形态族：Error parsing JavaScript expression）
const INVALID_SNAPSHOT = [
  '<template>',
  '  <div :style="{ color: t.color, fontSize: t.fs }">',
  '    {{ t.text',
  '  </div>',
  '</template>',
].join('\n')

const HEALED_CONTENT = [
  '<template>',
  '  <div class="c-x-healed">',
  '    <div>healed</div>',
  '  </div>',
  '</template>',
].join('\n')

describe('R2 · 刀53 终裁快照校验（file-writer 覆写点）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-r2snap-'))
    await mkdir(join(root, 'package', 'components'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('阴性·合法快照：照常终裁覆写（落盘内容 === 快照），行为逐字同旧版', async () => {
    const rel = 'package/components/CardGrid.vue'
    const out = writeFiles(
      { [rel]: HEALED_CONTENT },
      root,
      { fgTakeoverFiles: new Map([[rel, VALID_SNAPSHOT]]) },
    )
    const onDisk = await readFile(join(root, rel), 'utf-8')
    expect(onDisk).toBe(VALID_SNAPSHOT)
    expect(out.written).toContain(rel)
  })

  it('阳性·非法快照：弃快照，heal 版本落盘（不落坏文件）', async () => {
    const rel = 'package/components/TabsSection.vue'
    const out = writeFiles(
      { [rel]: HEALED_CONTENT },
      root,
      { fgTakeoverFiles: new Map([[rel, INVALID_SNAPSHOT]]) },
    )
    const onDisk = await readFile(join(root, rel), 'utf-8')
    expect(onDisk).toBe(HEALED_CONTENT)
    expect(onDisk).not.toBe(INVALID_SNAPSHOT)
    expect(out.written).toContain(rel)
    expect(out.sfcBlocked ?? []).toHaveLength(0) // heal 版合法 ⇒ 不进阻断清单
  })

  it('阳性·快照校验抛异常：同样弃快照保 heal 版（fail-closed 于快照侧）', async () => {
    const rel = 'package/components/Broken.vue'
    // 制造 validateVueSfc 抛错的输入：快照非字符串被前置过滤，这里用合法包裹下的
    // 畸形 SFC 结构（template 未闭合）触发解析异常路径而非仅 invalid 布尔
    const THROWING = '<template>\n  <div>\n</template>\n</template>\n<script>export default'
    const out = writeFiles(
      { [rel]: HEALED_CONTENT },
      root,
      { fgTakeoverFiles: new Map([[rel, THROWING]]) },
    )
    const onDisk = await readFile(join(root, rel), 'utf-8')
    expect(onDisk).toBe(HEALED_CONTENT)
    expect(out.written).toContain(rel)
  })

  // 🛡️ R5（2026-11-09）：终裁覆写成功 ⇒ 该文件快照登记冻结。真机 dc734b85 时序：
  //   覆写成功(1395)回写内存 ⇒ 修复轮 filesForWrite 含 1395 ⇒ 修复 pass 改坏 ⇒
  //   门禁 :1470 拦下（走不到终裁点）⇒ 判死降级。冻结救回 = 判死分支发现该文件有
  //   合法快照 ⇒ 回退快照落盘而非降级。两次 writeFiles 模拟真实调用序列。
  it('R5 阳性：修复轮改坏接管文件 ⇒ 门禁判死分支救回快照落盘（不降级）', async () => {
    const rel = 'package/components/TabsSection.vue'
    const SNAPSHOT = new Map([[rel, VALID_SNAPSHOT]])
    // 第一轮：heal 版入口 + 合法快照 ⇒ 覆写成功，磁盘=快照
    writeFiles({ [rel]: HEALED_CONTENT }, root, { fgTakeoverFiles: SNAPSHOT })
    expect(await readFile(join(root, rel), 'utf-8')).toBe(VALID_SNAPSHOT)
    // 第二轮（修复轮）：入口=快照（回写链），被修复 pass 改坏 ⇒ 门禁应拦下并救回快照
    const BROKEN_BY_FIX = VALID_SNAPSHOT.replace(
      ':key="i"', ':key="i" :style="{ color: t.color',
    )
    const out2 = writeFiles({ [rel]: BROKEN_BY_FIX }, root, { fgTakeoverFiles: SNAPSHOT })
    const onDisk2 = await readFile(join(root, rel), 'utf-8')
    expect(onDisk2).toBe(VALID_SNAPSHOT) // 救回真值，不是改坏版
    expect(out2.sfcBlocked ?? []).toHaveLength(0) // 不计入降级（假阳消除）
  })

  it('R5 边界：无快照的普通文件被改坏 ⇒ 仍走既有判死降级（零回归）', async () => {
    const rel = 'package/components/Plain.vue'
    const BAD = '<template>\n  <div :style="{ broken'
    const out = writeFiles({ [rel]: BAD }, root, { fgTakeoverFiles: new Map() })
    const exists = await readFile(join(root, rel), 'utf-8').then(() => true, () => false)
    expect(exists).toBe(false) // 不落盘
    expect((out.sfcBlocked ?? []).map((x) => x.path)).toContain(rel)
  })
})
