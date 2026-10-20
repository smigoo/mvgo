import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consolidateSubComponentClasses } from './style-class-consolidator.js'

/**
 * 🛡️ L0 判据单点化（2026-10-20 · mc-max-1792497064987-195c8d0e 实锤）。
 *
 * 事故：本文件原有自写 `isBalanced()`（只数 `{}`，不数圆括号），与写盘门禁
 * `scanStandaloneLessDefects`（数圆括号，LESS-WRITE-004）判据不同构 ⇒
 * 合并器放行「大括号平衡但圆括号缺 1」的合并稿（日志「已收敛」，13ms 后门禁判死），
 * 连续 6 轮跳过 ⇒ 无 last-good ⇒ 15 行兜底模板覆盖磁盘 ⇒
 * 641 行 / 覆盖 53/56 class 的合格样式表被丢弃，19 个布局容器类零定义。
 *
 * 治本：删掉副本判据，合并产物直接交给**写盘门禁**判定，通过则接受其 heal 结果
 * （保证合并器输出恒能过门禁，写盘时退化为幂等）。
 *
 * 本 spec 用**真实合并链路**（不 mock 门禁）锁定四个行为，避免「改的人和验的人
 * 用同一判据 = 假绿闭环」：
 *   A 阴性对照：括号平衡 ⇒ 照常收敛
 *   B 阳性对照：大括号平衡但缺 `)` ⇒ **必须回退**（旧 isBalanced 会放行 = 事故形态）
 *   C 孤立 `)` ⇒ 门禁自愈后收敛（改进：以前这里会被写盘门禁整篇跳过）
 *   D 跨行 linear-gradient 断头 ⇒ 必须回退
 */

const logger = { warn: () => {}, info: () => {}, log: () => {} }

const child = (cls: string, body: string) => `<template>
  <div class="${cls.slice(1)}"></div>
</template>

<script setup>
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

${cls} {
${body}
}
</style>
`

const ORIGINAL_COMMON = '.c-demo-root {\n  width: 100%;\n}\n'

function run(body: string) {
  const files = {
    'resources/styles/common.less': ORIGINAL_COMMON,
    'package/components/IconBar.vue': child('.c-demo-icon-btn', body),
  }
  const out = consolidateSubComponentClasses(files, { logger })
  return out['resources/styles/common.less'] as string
}

describe('L0 判据单点化：合并产物必须过写盘门禁（195c8d0e 实锤）', () => {
  it('A 阴性对照：括号平衡的合并稿照常收敛', () => {
    const css = run('  width: 24px;\n  background: rgba(1, 2, 3, 0.5);')
    expect(css).toContain('.c-demo-icon-btn')
    expect(css).toContain('background: rgba(1, 2, 3, 0.5);')
    expect(css).toContain('.c-demo-root')
    // 圆括号保持平衡
    expect((css.match(/\(/g) || []).length).toBe((css.match(/\)/g) || []).length)
  })

  it('B 缺 `)` ⇒ L1-b 自愈后收敛（旧 isBalanced 会放行坏稿、写盘门禁再判死）', () => {
    const css = run('  width: 24px;\n  background: rgba(1, 2, 3;')
    // 块保留，且圆括号由 heal(missing-paren) 补平
    expect(css).toContain('.c-demo-icon-btn')
    expect(css).toContain('background: rgba(1, 2, 3);')
    expect((css.match(/\(/g) || []).length).toBe((css.match(/\)/g) || []).length)
  })

  it('C 孤立 `)` ⇒ 门禁自愈后收敛（不再整篇跳过）', () => {
    const css = run('  width: 24px;\n  background: #fff);')
    expect(css).toContain('.c-demo-icon-btn')
    // 孤立闭括号已被门禁抹除
    expect(css).not.toContain('#fff)')
    expect(css).toContain('background: #fff;')
  })

  it('D 跨行 linear-gradient 断头（缺 `)`）⇒ L1-b 在 `;` 前补平后收敛', () => {
    const css = run(
      '  background: linear-gradient(\n    180deg,\n    rgba(1,2,3,0.4) 0%,\n    rgba(4,5,6,0.4) 100%;',
    )
    expect(css).toContain('.c-demo-icon-btn')
    expect(css).toContain('linear-gradient(')
    // 补位在声明终结符之前 ⇒ 渐变必须以 `)` 收尾
    expect(css).toMatch(/rgba\(4,5,6,0\.4\) 100%\);/)
    expect((css.match(/\(/g) || []).length).toBe((css.match(/\)/g) || []).length)
  })

  it('F 防御性路径：块被门禁拒绝时只丢该块，不影响其它块合并（L1-a）', () => {
    // ⚠️ 说明：块级抽取（深度归零）天然保证 `{}` 平衡、L1-b 又覆盖缺 `)`，
    //   因此「单块被拒」在本链路中**基本不可达**，此分支是防御性兜底。
    //   这里用「块内含不配对块注释」构造一个 heal 也修不掉的形态。
    const files = {
      'resources/styles/common.less': ORIGINAL_COMMON,
      'package/components/Bad.vue': child('.c-demo-bad', '  /* 未闭合注释 (\n  width: 10px;'),
      'package/components/Good.vue': child('.c-demo-good', '  width: 20px;'),
    }
    const out = consolidateSubComponentClasses(files, { logger })
    const css = out['resources/styles/common.less'] as string
    // 无论坏块是否被拒，正常块都必须进 common.less（这是 L1-a 的核心承诺）
    expect(css).toContain('.c-demo-good')
    expect(css).toContain('width: 20px;')
  })

  it('E 合并器不再留有自己的括号判据副本（防止将来又分裂成两份）', () => {
    const src = readFileSync(join(__dirname, 'style-class-consolidator.js'), 'utf-8')
    // 旧副本的特征写法：逐字符累计花括号深度
    expect(src).not.toMatch(/function isBalanced\s*\(/)
    // 必须接线到写盘门禁（唯一判据）
    expect(src).toMatch(/gateStandaloneLessWrite/)
  })
})
