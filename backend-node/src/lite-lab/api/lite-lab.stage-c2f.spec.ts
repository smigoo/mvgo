/**
 * 🛡️ 闸③ 落地阶段 —— **接线契约**（本 spec 是「阶段位置不再被静默覆盖」的唯一判据）
 *
 * 为什么必须钉在源码上：
 *   `lite-lab.service.ts` 有 6 个会改产物 CSS 的写盘阶段（planApply / C2 / C2b / C2c / C2d / C2e）。
 *   闸④ 检测早在 planApply 阶段（`unsourced = detectUnsourcedStyles(...)`）就跑过一次，
 *   但那份结果**只用于日志**；真正的落地（C2f）必须排在**最后一个 CSS 写盘者之后**。
 *   若把 C2f 上移，`C2c` 会把颜色写回来、`C2e` 会清根内容背景 ⇒ 闸③ 的修改被覆盖，
 *   而且「报告 = 磁盘」不再成立 —— 但**不会报错**，只会悄悄回到原样。
 *
 * 判据设计（结构计数，不做行为模拟）：
 *   ① `applyUnsourcedStyles(` 恰好 1 处 —— 唯一落地入口，多一处就有两套写盘判据；
 *   ② `PLAN_MD_FILE` 的写入恰好 1 处 —— 报告单点。写在计划阶段 = 与最终落盘不符（本 spec 防的就是它）；
 *   ③ `Stage C2e` 必须在 `Stage C2f` 之前 —— 顺序即正确性；
 *   ④ `detectUnsourcedStyles(` 恰好 3 处 —— 计划阶段快照 1 + C2f 落地前 1 + 落地后收敛 1；
 *      少了任何一处都会让「收敛断言」变成摆设；
 *   ⑤ `countAutoApplicable(` 恰好 1 处 —— 收敛断言必须复用 `isAutoApplicable`（单一来源），
 *      另写一份判据就会出现「落地 A、断言 B」的自证假绿。
 *
 * 阳性对照：以下任一标记被改名/删除，计数会掉到 0 或顺序反转 ⇒ 本 spec 立刻打红（不会静默通过）。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(__dirname, 'lite-lab.service.ts'), 'utf-8')

function count(src: string, needle: string): number {
  let n = 0
  let i = 0
  while ((i = src.indexOf(needle, i)) !== -1) {
    n += 1
    i += needle.length
  }
  return n
}

describe('闸③ 落地（Stage C2f）接线契约', () => {
  it('① 落地入口唯一', () => {
    expect(count(SRC, 'applyUnsourcedStyles(')).toBe(1)
  })

  it('② 人读版报告只有一处写入', () => {
    expect(count(SRC, 'writeFileSync(join(cacheDir, PLAN_MD_FILE)')).toBe(1)
  })

  it('③ C2f 必须排在 C2e（最后一个 CSS 写盘者）之后', () => {
    const c2e = SRC.indexOf('Stage C2e')
    const c2f = SRC.indexOf('Stage C2f：闸③')
    expect(c2e).toBeGreaterThan(-1)
    expect(c2f).toBeGreaterThan(-1)
    expect(c2f).toBeGreaterThan(c2e)
  })

  it('④ 检测三处齐全（计划快照 / 落地前 / 收敛复检）', () => {
    expect(count(SRC, 'detectUnsourcedStyles(')).toBe(3)
    expect(count(SRC, 'const after = detectUnsourcedStyles(')).toBe(1)
  })

  it('⑤ 收敛断言复用单一判据', () => {
    expect(count(SRC, 'countAutoApplicable(')).toBe(1)
    // 收敛结果必须进 stats（否则面板/看板读不到「是否为 0」）
    expect(count(SRC, 'unsourcedRemainingAuto')).toBe(1)
  })

  it('落地后有告警通道（remainingAuto>0 必须吵出来，不许静默）', () => {
    expect(SRC).toContain('闸③ 收敛断言失败')
  })
})
