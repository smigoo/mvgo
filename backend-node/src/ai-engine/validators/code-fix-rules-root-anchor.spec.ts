/**
 * 🛡️ N4 中性化回归 spec（2026-08-31）
 *
 * 覆盖两类历史事故 + 中性锚定语义：
 *  - mc-max-1788258252381-9168ed08：lazy 正则跨进 <template #title_left> 具名插槽，
 *    把 8×8 装饰菱形 c-monitor-header-diamond 误判为根容器并写成 426×807px；
 *  - mc-max-1788248984779-862c6b29：旧 N4 写死 px（420×186）与后续轮次 width:100%
 *    反复拉锯（07:55 落盘 px，16:23 被改回 100%）；
 *  - root-container.md:13/:27 规范：根容器默认 100%，比例走 aspect-ratio Figma 真值。
 */
import { CodeFixPipeline, FIX_PHASE } from './code-fix-pipeline.js'
import {
  registerBuiltinFixRules,
  BUILTIN_RULE_IDS,
  detectRootContainerClass,
  anchorRootContainerInFiles,
} from './code-fix-rules.js'

const FIGMA_425x807 = {
  document: { absoluteBoundingBox: { width: 425.4, height: 807.2 } },
}
const FIGMA_TINY = {
  document: { absoluteBoundingBox: { width: 30, height: 40 } },
}
const PANEL_BG_MAPPING = [
  {
    previewAnalysisRole: 'bg',
    skipMount: true,
    resourceFile: 'resources/images/bg-7880.png',
  },
]

/** 9168ed08 事故结构复刻：装饰菱形藏在 base-panel 具名插槽内 */
const DIAMOND_INCIDENT_VUE = `<template>
  <base-panel title="环境监测">
    <template #title_left>
      <div class="c-monitor-header-diamond"></div>
    </template>
    <div class="c-monitor-root">
      <div class="c-env-monitor-content"></div>
    </div>
  </base-panel>
</template>
<script setup>
</script>
<style scoped>
.c-monitor-root {
  display: flex;
  background: #123456;
}
</style>
`

describe('detectRootContainerClass（rootCls 识别）', () => {
  it('9168ed08 事故：跳过具名插槽，不把装饰菱形误判为根容器', () => {
    expect(detectRootContainerClass(DIAMOND_INCIDENT_VUE)).toBe(
      'c-monitor-root',
    )
  })

  it('vue3 形态（无 base-panel，根直接带 class）', () => {
    const vue = `<template>\n  <div class="c-chart-panel"><span>hi</span></div>\n</template>\n<script>export default {}</script>`
    expect(detectRootContainerClass(vue)).toBe('c-chart-panel')
  })

  it('根元素自身无 class → 保守返回 null（宁可 no-op 不可误锚）', () => {
    const vue = `<template>\n  <div>\n    <div class="inner">x</div>\n  </div>\n</template>`
    expect(detectRootContainerClass(vue)).toBeNull()
  })

  it('兼容单引号属性（LLM 偶发输出形态）', () => {
    const vue = `<template>\n  <div class='c-single-quote'>x</div>\n</template>\n<script>export default {}</script>`
    expect(detectRootContainerClass(vue)).toBe('c-single-quote')
  })
})

describe('anchorRootContainerInFiles（中性锚定语义）', () => {
  it('蜂巢塌缩兜底：缺 width/height → 补 100% + aspect-ratio Figma 真值比例', () => {
    const files = { 'package/index.vue': DIAMOND_INCIDENT_VUE }
    const out = anchorRootContainerInFiles(files, {
      figmaNodeData: FIGMA_425x807,
    })
    const style = out['package/index.vue'].match(
      /<style[^>]*>([\s\S]*?)<\/style>/,
    )![1]
    expect(style).toContain('width: 100%;')
    expect(style).toContain('height: 100%;')
    // root-container.md:27 语义：比例来自 Figma 真值（425/807），非写死 px
    expect(style).toContain('aspect-ratio: 425 / 807;')
    // 规范禁止写死 px 锚定（旧 N4 病灶）
    expect(style).not.toMatch(/width:\s*425px/)
    expect(style).not.toMatch(/height:\s*807px/)
  })

  it('9168ed08 事故：菱形类不被锚定，根容器类被锚定', () => {
    const files = {
      'package/index.vue': DIAMOND_INCIDENT_VUE,
      'resources/styles/common.less':
        '.c-monitor-header-diamond { width: 8px; }\n.c-monitor-root { display: block; }',
    }
    const out = anchorRootContainerInFiles(files, {
      figmaNodeData: FIGMA_425x807,
    })
    const less = out['resources/styles/common.less']
    // 菱形保持原尺寸（不被写成 426×807px）
    expect(less).toContain('.c-monitor-header-diamond { width: 8px; }')
    expect(less).not.toMatch(/c-monitor-header-diamond[^}]*426/)
    // 根容器被中性锚定
    expect(less).toMatch(/c-monitor-root[^}]*aspect-ratio: 425 \/ 807/s)
  })

  it('862c6b29 拉锯根治：已有 width/height 不覆盖，且不注入无效 aspect-ratio', () => {
    const files = {
      'package/index.vue': DIAMOND_INCIDENT_VUE,
      'resources/styles/common.less':
        '.c-monitor-root { width: 420px; height: 186px; }',
    }
    const out = anchorRootContainerInFiles(files, {
      figmaNodeData: FIGMA_425x807,
    })
    const less = out['resources/styles/common.less']
    expect(less).toContain('width: 420px;')
    expect(less).toContain('height: 186px;')
    // 两者都全时 aspect-ratio 无效即噪声，不注入
    expect(less).not.toContain('aspect-ratio')
  })

  it('aspect-ratio 幂等：已有声明不重复注入', () => {
    const files = {
      'package/index.vue': DIAMOND_INCIDENT_VUE,
      'resources/styles/common.less':
        '.c-monitor-root { width: 100%; aspect-ratio: 425 / 807; }',
    }
    const out = anchorRootContainerInFiles(files, {
      figmaNodeData: FIGMA_425x807,
    })
    const less = out['resources/styles/common.less']
    expect(less.match(/aspect-ratio/g)?.length).toBe(1)
  })

  it('panelBg R7 剥离再注入：@var/纯色背景被剥，双文件路径按目标目录推导（R4）', () => {
    const files = {
      'package/index.vue': DIAMOND_INCIDENT_VUE,
      'resources/styles/common.less':
        '.c-monitor-root { display: block; background: @block-bg-image; }',
    }
    const out = anchorRootContainerInFiles(files, {
      figmaNodeData: FIGMA_425x807,
      resourceDomMapping: PANEL_BG_MAPPING,
    })
    // R7：LLM/Style Mapper 写入的背景声明（@var）被剥离
    expect(out['resources/styles/common.less']).not.toContain(
      '@block-bg-image',
    )
    // index.vue（package/ 下）→ '../resources/images/'
    expect(out['package/index.vue']).toContain(
      "background-image: url('../resources/images/bg-7880.png');",
    )
    // common.less（resources/styles/ 下）→ '../images/'（R4：杜绝 resources/resources/ 404）
    expect(out['resources/styles/common.less']).toContain(
      "background-image: url('../images/bg-7880.png');",
    )
  })

  it('幂等：二次执行内容不变', () => {
    const files = {
      'package/index.vue': DIAMOND_INCIDENT_VUE,
      'resources/styles/common.less':
        '.c-monitor-root { display: block; background: @block-bg-image; }',
    }
    const opts = {
      figmaNodeData: FIGMA_425x807,
      resourceDomMapping: PANEL_BG_MAPPING,
    }
    const once = anchorRootContainerInFiles(files, opts)
    const twice = anchorRootContainerInFiles(once, opts)
    expect(twice['package/index.vue']).toBe(once['package/index.vue'])
    expect(twice['resources/styles/common.less']).toBe(
      once['resources/styles/common.less'],
    )
  })

  it('缺 figmaNodeData no-op（generation-context 第三入口安全）', () => {
    const files = { 'package/index.vue': DIAMOND_INCIDENT_VUE }
    expect(anchorRootContainerInFiles(files)).toBe(files)
  })

  it('W/H≤50 no-op（旧 N4 门保留）', () => {
    const files = { 'package/index.vue': DIAMOND_INCIDENT_VUE }
    expect(
      anchorRootContainerInFiles(files, { figmaNodeData: FIGMA_TINY }),
    ).toBe(files)
  })
})

describe('registerBuiltinFixRules（STYLE 阶段接线）', () => {
  it('anchor-root-container 已注册进 BUILTIN_RULE_IDS', () => {
    expect(BUILTIN_RULE_IDS).toContain('anchor-root-container')
  })

  it('经 pipeline.apply 在 STYLE 阶段生效（engineer 缺方法仅致其他规则跳过，不阻断）', () => {
    const pipeline = new CodeFixPipeline({ context: {} })
    // engineer 传最小 stub：anchor 规则是纯函数不依赖 engineer；
    // 其他规则缺方法会抛异常，由 pipeline 逐条捕获跳过（设计行为）
    registerBuiltinFixRules(pipeline, {} as never, {
      figmaNodeData: FIGMA_425x807,
      resourceDomMapping: PANEL_BG_MAPPING,
    })
    const rule = pipeline.rules.find((r) => r.id === 'anchor-root-container')
    expect(rule).toBeDefined()
    expect(rule!.phase).toBe(FIX_PHASE.STYLE)

    const files = {
      'package/index.vue': DIAMOND_INCIDENT_VUE,
    }
    const res = pipeline.apply(files, {})
    expect(res.applied.some((a) => a.id === 'anchor-root-container')).toBe(
      true,
    )
    expect(res.files['package/index.vue']).toContain('aspect-ratio: 425 / 807;')
  })
})
