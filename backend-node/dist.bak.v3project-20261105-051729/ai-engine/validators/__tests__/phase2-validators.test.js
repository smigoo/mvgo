/**
 * Phase 2 方案6: L0-B校验增强测试
 * 测试新增的 LAYOUT-001, STYLE-001, STYLE-002, STYLE-003 校验规则
 */

import { describe, it, expect } from '@jest/globals'
import { CodeStructureValidator } from '../code-structure-validator.js'

describe('Phase 2 方案6: L0-B校验增强', () => {
  describe('LAYOUT-001: 布局方向校验', () => {
    it('检测横向布局被改为竖向', () => {
      const generatedFiles = [
        {
          path: 'package/index.vue',
          content: `
<template>
  <div class="c-root" style="flex-direction: column;">
    <div>内容</div>
  </div>
</template>
<script setup>
</script>
<style>
.c-root { display: flex; flex-direction: column; }
</style>
          `,
        },
      ]

      const options = {
        layoutStructure: {
          sections: [{ name: 'header', layout: 'horizontal' }],
        },
      }

      const result = CodeStructureValidator.validate(
        generatedFiles,
        options,
        false,
      )
      const layoutIssue = result.issues.find((i) => i.id === 'LAYOUT-001')
      expect(layoutIssue).toBeDefined()
      expect(layoutIssue.severity).toBe('BLOCK')
      expect(layoutIssue.message).toContain('横向布局')
      expect(layoutIssue.message).toContain('flex-direction: column')
    })

    it('检测网格布局列数不匹配', () => {
      const generatedFiles = [
        {
          path: 'package/index.vue',
          content: `
<template>
  <div class="c-root" style="display: grid; grid-template-columns: repeat(4, 1fr);">
    <div>1</div><div>2</div><div>3</div><div>4</div>
  </div>
</template>
          `,
        },
      ]

      const options = {
        layoutStructure: {
          sections: [
            { name: 'grid', layout: 'grid', body: { gridColumns: 3 } },
          ],
        },
      }

      const result = CodeStructureValidator.validate(
        generatedFiles,
        options,
        false,
      )
      const layoutIssue = result.issues.find((i) => i.id === 'LAYOUT-001')
      expect(layoutIssue).toBeDefined()
      expect(layoutIssue.severity).toBe('BLOCK')
      expect(layoutIssue.message).toContain('3 列网格布局')
    })

    it('正确的布局方向不报错', () => {
      const generatedFiles = [
        {
          path: 'package/index.vue',
          content: `
<template>
  <div class="c-root" style="flex-direction: row;">
    <div>左</div><div>右</div>
  </div>
</template>
          `,
        },
      ]

      const options = {
        layoutStructure: {
          sections: [{ name: 'header', layout: 'horizontal' }],
        },
      }

      const result = CodeStructureValidator.validate(
        generatedFiles,
        options,
        false,
      )
      const layoutIssue = result.issues.find((i) => i.id === 'LAYOUT-001')
      expect(layoutIssue).toBeUndefined()
    })
  })

  describe('STYLE-001: common.less 外层选择器包裹检测', () => {
    it('检测被 .dark 包裹的 class', () => {
      const generatedFiles = [
        {
          path: 'package/resources/styles/common.less',
          content: `
.dark {
  .c-root {
    background: #1a1a1a;
  }
  .c-header {
    color: #fff;
  }
}
          `,
        },
      ]

      const result = CodeStructureValidator.validate(
        generatedFiles,
        {},
        false,
      )
      const styleIssue = result.issues.find((i) => i.id === 'STYLE-001')
      expect(styleIssue).toBeDefined()
      expect(styleIssue.severity).toBe('BLOCK')
      expect(styleIssue.message).toContain('外层选择器包裹')
    })

    it('检测被 .light 包裹的 class', () => {
      const generatedFiles = [
        {
          path: 'package/resources/styles/common.less',
          content: `
.light {
  .c-root { background: #fff; }
}
          `,
        },
      ]

      const result = CodeStructureValidator.validate(
        generatedFiles,
        {},
        false,
      )
      const styleIssue = result.issues.find((i) => i.id === 'STYLE-001')
      expect(styleIssue).toBeDefined()
      expect(styleIssue.severity).toBe('BLOCK')
    })

    it('正确的根层 class 不报错', () => {
      const generatedFiles = [
        {
          path: 'package/resources/styles/common.less',
          content: `
.c-root {
  background: #1a1a1a;
}
.c-header {
  color: #fff;
}
          `,
        },
      ]

      const result = CodeStructureValidator.validate(
        generatedFiles,
        {},
        false,
      )
      const styleIssue = result.issues.find((i) => i.id === 'STYLE-001')
      expect(styleIssue).toBeUndefined()
    })
  })

  describe('STYLE-002: class 实例ID前缀检测', () => {
    it('检测使用实例ID的 class', () => {
      const generatedFiles = [
        {
          path: 'package/resources/styles/common.less',
          content: `
.c-f0abee-container {
  width: 100%;
}
.c-mc-max-1234567890-header {
  height: 60px;
}
.c-f0abee-footer {
  height: 40px;
}
          `,
        },
      ]

      const result = CodeStructureValidator.validate(
        generatedFiles,
        {},
        false,
      )
      const styleIssue = result.issues.find((i) => i.id === 'STYLE-002')
      expect(styleIssue).toBeDefined()
      expect(styleIssue.severity).toBe('WARN')
      expect(styleIssue.message).toContain('实例ID')
      expect(styleIssue.message).toContain('c-f0abee-')
    })

    it('语义化命名的 class 不报错', () => {
      const generatedFiles = [
        {
          path: 'package/resources/styles/common.less',
          content: `
.c-env-monitor-root {
  width: 100%;
}
.c-env-monitor-header {
  height: 60px;
}
.c-vehicle-card {
  padding: 12px;
}
          `,
        },
      ]

      const result = CodeStructureValidator.validate(
        generatedFiles,
        {},
        false,
      )
      const styleIssue = result.issues.find((i) => i.id === 'STYLE-002')
      expect(styleIssue).toBeUndefined()
    })
  })

  describe('STYLE-003: 子组件 margin 检测', () => {
    it('检测子组件根元素设置 margin', () => {
      const generatedFiles = [
        {
          path: 'package/components/StatCard.vue',
          content: `
<template>
  <div class="c-stat-card">
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-stat-card {
  padding: 12px;
  margin: 16px;
}
</style>
          `,
        },
      ]

      const result = CodeStructureValidator.validate(
        generatedFiles,
        {},
        false,
      )
      const styleIssue = result.issues.find((i) => i.id === 'STYLE-003')
      expect(styleIssue).toBeDefined()
      expect(styleIssue.severity).toBe('WARN')
      expect(styleIssue.message).toContain('子组件根元素')
      expect(styleIssue.message).toContain('margin')
    })

    it('子组件只使用 padding 不报错', () => {
      const generatedFiles = [
        {
          path: 'package/components/StatCard.vue',
          content: `
<template>
  <div class="c-stat-card">
    <div>内容</div>
  </div>
</template>
<style scoped>
.c-stat-card {
  width: 100%;
  height: 100%;
  padding: 12px;
}
</style>
          `,
        },
      ]

      const result = CodeStructureValidator.validate(
        generatedFiles,
        {},
        false,
      )
      const styleIssue = result.issues.find((i) => i.id === 'STYLE-003')
      expect(styleIssue).toBeUndefined()
    })
  })

  describe('综合测试', () => {
    it('同时检测多个问题', () => {
      const generatedFiles = [
        {
          path: 'package/index.vue',
          content: `
<template>
  <div class="c-root" style="flex-direction: column;">内容</div>
</template>
          `,
        },
        {
          path: 'package/resources/styles/common.less',
          content: `
.dark {
  .c-f0abee-root { background: #000; }
}
          `,
        },
        {
          path: 'package/components/Card.vue',
          content: `
<template><div class="c-card">卡片</div></template>
<style>.c-card { margin: 10px; }</style>
          `,
        },
      ]

      const options = {
        layoutStructure: {
          sections: [{ name: 'header', layout: 'horizontal' }],
        },
      }

      const result = CodeStructureValidator.validate(
        generatedFiles,
        options,
        false,
      )

      expect(result.issues.find((i) => i.id === 'LAYOUT-001')).toBeDefined()
      expect(result.issues.find((i) => i.id === 'STYLE-001')).toBeDefined()
      expect(result.issues.find((i) => i.id === 'STYLE-002')).toBeDefined()
      expect(result.issues.find((i) => i.id === 'STYLE-003')).toBeDefined()

      const blockIssues = result.issues.filter((i) => i.severity === 'BLOCK')
      expect(blockIssues.length).toBeGreaterThanOrEqual(2) // LAYOUT-001 + STYLE-001
      expect(result.pass).toBe(false)
    })
  })
})
