import {
  collectFigmaTextTruth,
  detectUnknownText,
  findClosestTruth,
} from './text-truth-guard.js'

/**
 * TEXT-TRUTH 回归测试：产物文字必须落在 Figma characters 真值集合内。
 *
 * 背景：2026-09-02 事故 mc-max-1788306653919-a57e4409（设备监测）——vision 把
 * 「监控」OCR 成「挖掘机」、「烟道机器人」成「烟雾机器人」、「交通诱导」成「交通设施」、
 * 臆造「控制」。do-not-invent-validator 是黑名单，防不了 vision 自误。本白名单检测
 * 「不在 Figma 真值里的中文」，确定性、无需位置配对。
 */

const figma = {
  type: 'FRAME',
  name: 'root',
  children: [
    { type: 'TEXT', name: 't-监控', characters: '监控' },
    { type: 'TEXT', name: 'd-照明', characters: '照明' },
    { type: 'TEXT', name: 't-烟道机器人', characters: '烟道机器人' },
    { type: 'TEXT', name: 'd-3/3740', characters: '3/3740' },
    { type: 'TEXT', name: 't-交通诱导', characters: '交通诱导' },
    { type: 'TEXT', name: 'empty', characters: '   ' },
  ],
}

describe('collectFigmaTextTruth', () => {
  it('提取非空 TEXT characters 真值', () => {
    const truth = collectFigmaTextTruth(figma)
    expect(truth.has('监控')).toBe(true)
    expect(truth.has('烟道机器人')).toBe(true)
    expect(truth.has('   ')).toBe(false) // 空/空白不入
    expect(truth.size).toBe(5)
  })

  it('figmaNodeData 缺失 → 空集合', () => {
    expect(collectFigmaTextTruth(null).size).toBe(0)
    expect(collectFigmaTextTruth(undefined).size).toBe(0)
  })
})

describe('detectUnknownText', () => {
  const files = [
    {
      path: 'package/components/LeftNav.vue',
      content: `<script setup>
// 导航数据（从 Figma 文本清单提取）
const navItems = ref([
  { id: 'a', label: '挖掘机' },   // ← OCR 误读，真值「监控」
  { id: 'b', label: '照明' },      // ← 正确
  { id: 'c', label: '控制' },      // ← 臆造
])
console.log('切换导航')
</script>`,
    },
  ]

  it('检出 OCR 误读/臆造文字（挖掘机/控制），正确文字（照明）不误报', () => {
    const unknown = detectUnknownText(files, figma)
    const texts = unknown.map((u) => u.text)
    expect(texts).toContain('挖掘机')
    expect(texts).toContain('控制')
    expect(texts).not.toContain('照明')
  })

  it('剥离注释：注释里的中文不误报', () => {
    const withComment = [
      {
        path: 'package/index.vue',
        content: `<template>
  <!-- 面板标题由 base-panel 外壳渲染 -->
  <div>监控</div>
</template>`,
      },
    ]
    const unknown = detectUnknownText(withComment, figma)
    const texts = unknown.map((u) => u.text)
    expect(texts).not.toContain('面板标题由')
    expect(texts).not.toContain('外壳渲染')
  })

  it('子串双向覆盖容错：真值截断不误报（3/3740 的子串）', () => {
    const f = [{ path: 'p.vue', content: '<span>3740</span>' }]
    // 「3740」是「3/3740」的子串 → 覆盖，不报
    expect(detectUnknownText(f, figma)).toHaveLength(0)
  })

  it('真值集合为空 → fail-open 返回空', () => {
    expect(detectUnknownText(files, null)).toHaveLength(0)
  })

  it('收窄：alt/title/aria-label 属性值不误报（2026-09-02 环境监测）', () => {
    const withAttrs = [
      {
        path: 'package/components/SectionControls.vue',
        content: `<template>
  <div title="图表视图" aria-label="列表视图"><img :src="icon" alt="信号图标" /></div>
</template>`,
      },
    ]
    const unknown = detectUnknownText(withAttrs, figma)
    const texts = unknown.map((u) => u.text)
    expect(texts).not.toContain('图表视图')
    expect(texts).not.toContain('列表视图')
    expect(texts).not.toContain('信号图标')
  })

  it('收窄：代码注释、console.log 参数、.less 文件里的 theme 文案不误报', () => {
    const withComment = [
      {
        path: 'package/index.vue',
        content: `<script setup>
// 组件加载完成后触发 onload 业务事件
console.log('[组件] 初始化图表')
</script>`,
      },
      {
        path: 'resources/styles/theme-vars.less',
        content: `// 浅色主题
// 深色主题
@theme-light: #ffffff;`,
      },
    ]
    const unknown = detectUnknownText(withComment, figma)
    const texts = unknown.map((u) => u.text)
    expect(texts).not.toContain('组件加载完成')
    expect(texts).not.toContain('组件')
    expect(texts).not.toContain('浅色主题')
    expect(texts).not.toContain('深色主题')
  })

  it('收窄：模板文本节点命中（<span> 之间的文字）', () => {
    const f = [{ path: 'p.vue', content: '<template><span>挖掘机</span></template>' }]
    const unknown = detectUnknownText(f, figma)
    expect(unknown.map((u) => u.text)).toContain('挖掘机')
  })

  it('空格归一化：真值「南北接线 设备」带空格 vs 产物「南北接线设备」无空格 → 不误报', () => {
    const figmaSpace = {
      type: 'FRAME',
      name: 'root',
      children: [
        { type: 'TEXT', name: 't-南北接线 设备', characters: '南北接线 设备' },
        { type: 'TEXT', name: 't-隧道设备', characters: '隧道设备' },
      ],
    }
    const f = [
      { path: 'p.vue', content: '<template><span>南北接线设备</span></template>' },
    ]
    const unknown = detectUnknownText(f, figmaSpace)
    expect(unknown.map((u) => u.text)).not.toContain('南北接线设备')
  })
})

/**
 * findClosestTruth 回归（2026-09-03，mc-max-1788413658506-08ed48ff 实锤）：
 * Figma TEXT 节点 2:8816 同时具备 rotation=π/2、两行文本、艺术字体三特征 → 预览图上
 * 是竖排旋转艺术字 → vision OCR 稳定误读「接」字（拦/拓/…每次不同）。BLOCK 报错必须
 * 给出「误读文字 → 应替换真值」映射，重试才有确定性修正指导，否则必然重复失败。
 */
describe('findClosestTruth', () => {
  const figmaVertical = {
    type: 'FRAME',
    name: 'root',
    children: [
      { type: 'TEXT', name: 't-南北接线 设备', characters: '南北接线\n设备' },
      { type: 'TEXT', name: 't-隧道设备', characters: '隧道设备' },
    ],
  }
  const truth = collectFigmaTextTruth(figmaVertical)

  it('OCR 单字误读（拓/拦 → 接）命中真值，给出可替换映射', () => {
    expect(findClosestTruth('南北拓线设备', truth)).toBe('南北接线\n设备')
    expect(findClosestTruth('南北拦线设备', truth)).toBe('南北接线\n设备')
  })

  it('臆造文字无近似真值 → null（调用方提示删除而非硬替换）', () => {
    expect(findClosestTruth('控制', truth)).toBeNull()
    expect(findClosestTruth('当前空气质量', truth)).toBeNull()
  })

  it('空输入 / 空真值集合 → null', () => {
    expect(findClosestTruth('', truth)).toBeNull()
    expect(findClosestTruth('南北拓线设备', new Set())).toBeNull()
  })

  it('detectUnknownText 透传 suggest 字段', () => {
    const f = [
      {
        path: 'p.vue',
        content:
          '<template><span>南北拓线设备</span><span>控制</span></template>',
      },
    ]
    const unknown = detectUnknownText(f, figmaVertical)
    const hit = unknown.find((u) => u.text === '南北拓线设备')
    const invented = unknown.find((u) => u.text === '控制')
    expect(hit?.suggest).toBe('南北接线\n设备')
    expect(invented?.suggest).toBeNull()
  })
})
