// backend-root.js 是 ESM 风格（const __filename = fileURLToPath(import.meta.url)），
// ts-jest CJS 转换下与模块包装器参数撞名（SyntaxError），logger 链一经加载整个套件即 0 运行。
// 既有惯例（resource-mounter.spec 等 30+ spec 同款）：工厂 mock 绕过真实文件。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}))

/**
 * 🛡️ 2026-11-06（mc-max-1793923099707-3e924a69 实锤）：插槽内容与 body 段重复 ⇒ 插槽让位。
 *
 * 真机：derived 插槽「江阴靖江长江隧道 江阴大桥」进了 #header-right（裸 span 简样式），
 * 而同文本 tabs 已由 body 段（ContentMonitor）真渲染 ⇒ 同内容两处、样式各异。
 * 插槽资格复核虽把该段撤出候选（emptyBodyAndItems ⇒ 段留 body），derived 插槽是独立机制
 * 不读撤单结果 ⇒ 需在唯一注入出口（T09 ensureHeaderSlots）做重复守卫：
 * slot 内容按空白分词后全部 token（≥2 字）都能在 body 组件文本中找到 ⇒ 跳过注入 + 计数。
 */
import { ensureHeaderSlots, isSlotContentDuplicatedInBody } from './resource-mounter.js'

const INDEX = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-x-slot-con"><ChildA /><ChildB /></div>
  </base-panel>
</template>`

const FILES_WITH_BODY_DUP = {
  'package/index.vue': INDEX,
  'package/components/ChildA.vue': `<template>
  <div class="c-a">
    <span v-for="t in tabs">{{ t.label }}</span>
  </div>
</template>
<script setup>
// tabs: 江阴靖江长江隧道 / 江阴大桥
const tabs = [{ label: '江阴靖江长江隧道' }, { label: '江阴大桥' }]
</script>`,
  'package/components/ChildB.vue': '<template><div class="c-b">其余内容</div></template>',
}

const FILES_CLEAN = {
  'package/index.vue': INDEX,
  'package/components/ChildA.vue': '<template><div class="c-a">无关内容</div></template>',
}

const OPTS = (files: Record<string, string>) => ({
  componentType: 'microcode',
  files,
  logger: { info: () => {}, warn: () => {} },
})

describe('T09 · 插槽内容与 body 段重复让位（3e924a69）', () => {
  it('⭐ 阳性：slot 文本全部 token 已被 body 组件表达 ⇒ 不注入 #header-right', () => {
    const out = ensureHeaderSlots(
      INDEX,
      { headerSlots: [{ slotType: 'header-right', elementType: 'label', content: '江阴靖江长江隧道 江阴大桥' }] },
      OPTS(FILES_WITH_BODY_DUP),
    )
    expect(out).not.toContain('#header-right')
    expect(out).not.toContain('由生成器按 Figma headerSlots 确定性补齐')
  })

  it('阴性：slot 文本 body 里没有 ⇒ 照常注入（真插槽不误伤）', () => {
    const out = ensureHeaderSlots(
      INDEX,
      { headerSlots: [{ slotType: 'header-right', elementType: 'statistic', content: '完好率 98%' }] },
      OPTS(FILES_CLEAN),
    )
    expect(out).toContain('#header-right')
    expect(out).toContain('完好率 98%')
  })

  it('阴性：部分 token 命中（如标题词）不算重复 ⇒ 仍注入', () => {
    const files = {
      'package/index.vue': INDEX,
      'package/components/ChildA.vue': '<template><div class="c-a">江阴靖江长江隧道卡片</div></template>',
    }
    const out = ensureHeaderSlots(
      INDEX,
      { headerSlots: [{ slotType: 'header-right', elementType: 'label', content: '江阴靖江长江隧道 江阴大桥' }] },
      OPTS(files),
    )
    expect(out).toContain('#header-right')
  })

  it('纯函数：全 token 命中 ⇒ true；部分/无命中 ⇒ false；无 files ⇒ false', () => {
    expect(isSlotContentDuplicatedInBody('江阴靖江长江隧道 江阴大桥', FILES_WITH_BODY_DUP)).toBe(true)
    expect(isSlotContentDuplicatedInBody('江阴靖江长江隧道 江阴大桥', FILES_CLEAN)).toBe(false)
    expect(isSlotContentDuplicatedInBody('完好率 98%', FILES_CLEAN)).toBe(false)
    expect(isSlotContentDuplicatedInBody('任意', undefined)).toBe(false)
  })
})
