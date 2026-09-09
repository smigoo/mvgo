/**
 * 约束强化模块测试
 * Phase 2 方案5: 规则约束强化
 */

import { describe, it, expect } from '@jest/globals'
import {
  buildLayoutConstraintReinforcement,
  buildResourceConstraintReinforcement,
  buildStyleConstraintReinforcement,
  buildAllConstraintReinforcements
} from '../constraint-reinforcement.js'

describe('约束强化模块', () => {
  describe('buildLayoutConstraintReinforcement', () => {
    it('空 layoutStructure 返回空字符串', () => {
      const result = buildLayoutConstraintReinforcement(null)
      expect(result).toBe('')
    })

    it('无 sections 返回空字符串', () => {
      const result = buildLayoutConstraintReinforcement({ sections: [] })
      expect(result).toBe('')
    })

    it('生成布局约束强化文本包含关键元素', () => {
      const layoutStructure = {
        sections: [
          {
            name: 'header',
            layout: 'horizontal',
            body: { children: [{ type: 'stat' }, { type: 'stat' }, { type: 'stat' }] }
          },
          {
            name: 'content',
            layout: 'grid',
            body: { layout: 'grid', gridColumns: 3 }
          }
        ]
      }
      const result = buildLayoutConstraintReinforcement(layoutStructure)

      expect(result).toContain('🚫 布局约束铁律')
      expect(result).toContain('禁止臆造的三大场景')
      expect(result).toContain('统计卡片区域')
      expect(result).toContain('列表/表格列数')
      expect(result).toContain('图表数量')
      expect(result).toContain('布局方向铁律')
      expect(result).toContain('自检清单')
    })

    it('横向布局生成正确的约束规则', () => {
      const layoutStructure = {
        sections: [
          { name: 'stats', layout: 'horizontal' }
        ]
      }
      const result = buildLayoutConstraintReinforcement(layoutStructure)

      expect(result).toContain('flex-direction: row')
      expect(result).toContain('❌ 禁止改为竖向堆叠')
    })

    it('网格布局生成正确的列数约束', () => {
      const layoutStructure = {
        sections: [
          { name: 'grid', layout: 'grid', body: { gridColumns: 4 } }
        ]
      }
      const result = buildLayoutConstraintReinforcement(layoutStructure)

      expect(result).toContain('repeat(4, 1fr)')
      expect(result).toContain('❌ 禁止改为 flex 布局')
      expect(result).toContain('❌ 禁止改变列数为 4 之外的值')
    })

    it('自检清单包含正确的 Section 数量', () => {
      const layoutStructure = {
        sections: [
          { name: 'header', layout: 'horizontal' },
          { name: 'content', layout: 'vertical' },
          { name: 'footer', layout: 'horizontal' }
        ]
      }
      const result = buildLayoutConstraintReinforcement(layoutStructure)

      expect(result).toContain('Section 数量 === layoutStructure.sections.length (3个)')
    })
  })

  describe('buildResourceConstraintReinforcement', () => {
    it('无资源时返回警告文本', () => {
      const result = buildResourceConstraintReinforcement([])

      expect(result).toContain('⚠️ 资源约束')
      expect(result).toContain('本组件无可用资源变量')
      expect(result).toContain('禁止在代码中使用')
    })

    it('生成资源白名单包含所有资源', () => {
      const resources = [
        { assignedVarName: 'bg1' },
        { assignedVarName: 'bg2' },
        { assignedVarName: 'icon1' },
        { assignedVarName: 'icon2' },
        { assignedVarName: 'icon3' }
      ]
      const result = buildResourceConstraintReinforcement(resources)

      expect(result).toContain('🖼️ 资源约束铁律')
      expect(result).toContain('可用资源变量白名单')
      expect(result).toContain('本次仅以下 5 个资源变量可用')
      expect(result).toContain('背景图')
      expect(result).toContain('bg1')
      expect(result).toContain('bg2')
      expect(result).toContain('图标')
      expect(result).toContain('icon1')
      expect(result).toContain('icon2')
      expect(result).toContain('icon3')
    })

    it('包含正确用法示例', () => {
      const resources = [{ assignedVarName: 'icon1' }]
      const result = buildResourceConstraintReinforcement(resources)

      expect(result).toContain('正确用法（模板插值）')
      expect(result).toContain('<img :src="icon1"')
      expect(result).toContain(':style="{ backgroundImage:')
    })

    it('包含错误用法示例', () => {
      const resources = [{ assignedVarName: 'bg1' }]
      const result = buildResourceConstraintReinforcement(resources)

      expect(result).toContain('错误用法（写进CSS）- 会导致LESS编译崩溃')
      expect(result).toContain('url(\\${bg1})')
      expect(result).toContain('url(@bg1)')
      expect(result).toContain('url($bg1)')
    })

    it('包含自检清单', () => {
      const resources = [{ assignedVarName: 'icon1' }]
      const result = buildResourceConstraintReinforcement(resources)

      expect(result).toContain('自检清单')
      expect(result).toContain('所有资源变量都在白名单内')
      expect(result).toContain('<style> 块中没有任何 url(')
    })
  })

  describe('buildStyleConstraintReinforcement', () => {
    it('生成样式约束强化文本包含关键元素', () => {
      const result = buildStyleConstraintReinforcement()

      expect(result).toContain('🎨 样式约束铁律')
      expect(result).toContain('common.less 必须写在根层')
      expect(result).toContain('Class 命名约束')
      expect(result).toContain('子组件样式约束')
      expect(result).toContain('自检清单')
    })

    it('包含 common.less 错误示例', () => {
      const result = buildStyleConstraintReinforcement()

      expect(result).toContain('🔴 错误示例（被外层选择器包裹）')
      expect(result).toContain('.dark {')
      expect(result).toContain('❌ 错误：被 .dark 包裹')
    })

    it('包含 common.less 正确示例', () => {
      const result = buildStyleConstraintReinforcement()

      expect(result).toContain('✅ 正确示例（写在根层）')
      expect(result).toContain('✅ 正确：直接写在文件根层')
    })

    it('包含 class 命名规范', () => {
      const result = buildStyleConstraintReinforcement()

      expect(result).toContain('必须使用 .c- 前缀')
      expect(result).toContain('.c-vehicle-card')
      expect(result).toContain('禁止使用实例ID作为前缀')
      expect(result).toContain('c-f0abee-container')
    })

    it('包含父子组件职责划分', () => {
      const result = buildStyleConstraintReinforcement()

      expect(result).toContain('父组件职责')
      expect(result).toContain('布局协调（位置、间距、尺寸约束）')
      expect(result).toContain('子组件职责')
      expect(result).toContain('内部样式（颜色、边框、内边距）')
      expect(result).toContain('width: 100%; height: 100%;')
    })
  })

  describe('buildAllConstraintReinforcements', () => {
    it('组合所有约束强化文本', () => {
      const layoutStructure = {
        sections: [{ name: 'header', layout: 'horizontal' }]
      }
      const availableResources = [
        { assignedVarName: 'bg1' },
        { assignedVarName: 'icon1' }
      ]

      const result = buildAllConstraintReinforcements({
        layoutStructure,
        availableResources
      })

      expect(result).toContain('🔴 关键约束铁律（生成前必读）')
      expect(result).toContain('🚫 布局约束铁律')
      expect(result).toContain('🖼️ 资源约束铁律')
      expect(result).toContain('🎨 样式约束铁律')
    })

    it('无 layoutStructure 时跳过布局约束', () => {
      const result = buildAllConstraintReinforcements({
        availableResources: [{ assignedVarName: 'bg1' }]
      })

      expect(result).toContain('🔴 关键约束铁律')
      expect(result).not.toContain('🚫 布局约束铁律')
      expect(result).toContain('🖼️ 资源约束铁律')
      expect(result).toContain('🎨 样式约束铁律')
    })

    it('无资源时仍生成资源警告', () => {
      const result = buildAllConstraintReinforcements({
        layoutStructure: { sections: [{ name: 'header' }] }
      })

      expect(result).toContain('🔴 关键约束铁律')
      expect(result).toContain('⚠️ 资源约束')
    })
  })
})
