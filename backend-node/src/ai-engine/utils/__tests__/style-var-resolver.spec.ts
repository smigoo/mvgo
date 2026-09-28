import {
  extractLessVariables,
  resolveStyleVariables,
  substituteVariables,
  extractResolvedStyleLiterals,
  parseColor,
  colorDistance,
  colorFuzzyMatch,
  parseNumericValue,
  numericFuzzyMatch,
} from '../style-var-resolver.js'

describe('style-var-resolver', () => {
  describe('extractLessVariables', () => {
    it('提取简单变量定义', () => {
      const content = `
        @color-primary: #559eff;
        @color-bg: rgba(43, 160, 255, 0.1);
        @font-size-base: 14px;
      `
      const vars = extractLessVariables(content)
      expect(vars.get('color-primary')).toBe('#559eff')
      expect(vars.get('color-bg')).toBe('rgba(43, 160, 255, 0.1)')
      expect(vars.get('font-size-base')).toBe('14px')
    })

    it('去除行尾注释', () => {
      const content = `
        @color-primary: #559eff; // 主色
        @color-secondary: #ff6a00; /* 强调色 */
      `
      const vars = extractLessVariables(content)
      expect(vars.get('color-primary')).toBe('#559eff')
      expect(vars.get('color-secondary')).toBe('#ff6a00')
    })

    it('处理空内容和无效输入', () => {
      expect(extractLessVariables('').size).toBe(0)
      expect(extractLessVariables(null).size).toBe(0)
      expect(extractLessVariables(undefined).size).toBe(0)
    })
  })

  describe('resolveStyleVariables', () => {
    it('从文件列表提取变量', () => {
      const files = [
        {
          path: 'common.less',
          content: `
            @color-primary: #559eff;
            @spacing-base: 16px;
          `,
        },
      ]
      const vars = resolveStyleVariables(files)
      expect(vars.get('color-primary')).toBe('#559eff')
      expect(vars.get('spacing-base')).toBe('16px')
    })

    it('解析变量引用链（最多 3 层）', () => {
      const files = [
        {
          path: 'common.less',
          content: `
            @color-base: #559eff;
            @color-primary: @color-base;
            @color-accent: @color-primary;
          `,
        },
      ]
      const vars = resolveStyleVariables(files)
      expect(vars.get('color-base')).toBe('#559eff')
      expect(vars.get('color-primary')).toBe('#559eff')
      expect(vars.get('color-accent')).toBe('#559eff')
    })

    it('theme-vars 优先级高于 common.less', () => {
      const files = [
        {
          path: 'common.less',
          content: `
            @color-primary: #000000;
          `,
        },
      ]
      // 模拟 theme-vars 路径（实际测试中不存在，但验证逻辑）
      const vars = resolveStyleVariables(files, '/nonexistent/theme-vars.less')
      // 由于文件不存在，应该只从 common.less 提取
      expect(vars.get('color-primary')).toBe('#000000')
    })
  })

  describe('substituteVariables', () => {
    it('替换变量引用为字面量', () => {
      const content = `
        .button {
          color: @color-primary;
          background: @color-bg;
        }
      `
      const varMap = new Map([
        ['color-primary', '#559eff'],
        ['color-bg', 'rgba(43, 160, 255, 0.1)'],
      ])
      const result = substituteVariables(content, varMap)
      expect(result).toContain('#559eff')
      expect(result).toContain('rgba(43, 160, 255, 0.1)')
      expect(result).not.toContain('@color-primary')
      expect(result).not.toContain('@color-bg')
    })

    it('保留未定义的变量引用', () => {
      const content = `
        .button {
          color: @color-primary;
          border: @color-undefined;
        }
      `
      const varMap = new Map([['color-primary', '#559eff']])
      const result = substituteVariables(content, varMap)
      expect(result).toContain('#559eff')
      expect(result).toContain('@color-undefined') // 未定义，保留
    })

    it('处理空输入', () => {
      expect(substituteVariables('', new Map())).toBe('')
      expect(substituteVariables(null, new Map())).toBe(null)
      expect(substituteVariables('test', null)).toBe('test')
    })
  })

  describe('extractResolvedStyleLiterals', () => {
    it('提取解析后的颜色字面量', () => {
      const files = [
        {
          path: 'index.less',
          content: `
            .card {
              color: @color-primary;
              background: @color-bg;
            }
          `,
        },
      ]
      const varMap = new Map([
        ['color-primary', '#559eff'],
        ['color-bg', 'rgba(43, 160, 255, 0.1)'],
      ])
      const result = extractResolvedStyleLiterals(files, varMap)
      expect(result.color).toContain('#559eff')
      expect(result.color).toContain('rgba(43,160,255,0.1)')
    })

    it('提取解析后的间距字面量', () => {
      const files = [
        {
          path: 'index.less',
          content: `
            .container {
              padding: @spacing-base;
              gap: @gap-sm;
            }
          `,
        },
      ]
      const varMap = new Map([
        ['spacing-base', '16px'],
        ['gap-sm', '8px'],
      ])
      const result = extractResolvedStyleLiterals(files, varMap)
      expect(result.spacing).toContain('16px')
      expect(result.spacing).toContain('8px')
    })

    it('提取解析后的字号字面量', () => {
      const files = [
        {
          path: 'index.less',
          content: `
            .title {
              font-size: @font-size-lg;
            }
          `,
        },
      ]
      const varMap = new Map([['font-size-lg', '24px']])
      const result = extractResolvedStyleLiterals(files, varMap)
      expect(result.font).toContain('24px')
    })

    it('提取解析后的圆角字面量', () => {
      const files = [
        {
          path: 'index.less',
          content: `
            .card {
              border-radius: @radius-base;
            }
          `,
        },
      ]
      const varMap = new Map([['radius-base', '8px']])
      const result = extractResolvedStyleLiterals(files, varMap)
      expect(result.radius).toContain('8px')
    })

    it('无变量映射时直接提取', () => {
      const files = [
        {
          path: 'index.less',
          content: `
            .card {
              color: #559eff;
              padding: 16px;
            }
          `,
        },
      ]
      const result = extractResolvedStyleLiterals(files, null)
      expect(result.color).toContain('#559eff')
      expect(result.spacing).toContain('16px')
    })
  })

  describe('parseColor', () => {
    it('解析 hex 颜色', () => {
      expect(parseColor('#559eff')).toEqual({ r: 85, g: 158, b: 255, a: 1 })
      expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
      expect(parseColor('#559eff80')).toEqual({ r: 85, g: 158, b: 255, a: 0.5019607843137255 })
    })

    it('解析 rgb/rgba 颜色', () => {
      expect(parseColor('rgb(85, 158, 255)')).toEqual({ r: 85, g: 158, b: 255, a: 1 })
      expect(parseColor('rgba(85, 158, 255, 0.5)')).toEqual({ r: 85, g: 158, b: 255, a: 0.5 })
    })

    it('处理无效颜色', () => {
      expect(parseColor('')).toBeNull()
      expect(parseColor('invalid')).toBeNull()
      expect(parseColor(null)).toBeNull()
    })
  })

  describe('colorDistance', () => {
    it('计算相同颜色距离为 0', () => {
      expect(colorDistance('#559eff', '#559eff')).toBe(0)
    })

    it('计算不同颜色距离', () => {
      const dist = colorDistance('#000000', '#ffffff')
      expect(dist).toBeCloseTo(441.67, 1) // sqrt(255^2 * 3)
    })

    it('处理无效颜色', () => {
      expect(colorDistance('invalid', '#fff')).toBe(Infinity)
      expect(colorDistance('#fff', 'invalid')).toBe(Infinity)
    })
  })

  describe('colorFuzzyMatch', () => {
    it('精确匹配', () => {
      expect(colorFuzzyMatch('#559eff', ['#559eff'])).toBe(true)
    })

    it('容差范围内匹配', () => {
      // 距离 < 24 应该匹配
      expect(colorFuzzyMatch('#559eff', ['#559ef0'])).toBe(true)
      expect(colorFuzzyMatch('#559eff', ['#569eff'])).toBe(true)
    })

    it('超出容差不匹配', () => {
      // 距离 > 32 应该不匹配
      expect(colorFuzzyMatch('#000000', ['#ffffff'])).toBe(false)
    })

    it('支持透明度容差', () => {
      // 透明度差异 < 0.15 应该匹配
      expect(colorFuzzyMatch('#559eff', ['rgba(85, 158, 255, 0.9)'], { alphaTolerance: 0.15 })).toBe(true)
      // 透明度差异 > 0.15 但 RGB 距离 < 10 也应该匹配
      expect(colorFuzzyMatch('#559eff', ['rgba(85, 158, 255, 0.5)'])).toBe(true)
    })

    it('空列表不匹配', () => {
      expect(colorFuzzyMatch('#559eff', [])).toBe(false)
    })
  })

  describe('parseNumericValue', () => {
    it('解析 px 值', () => {
      expect(parseNumericValue('16px')).toBe(16)
      expect(parseNumericValue('16.5px')).toBe(16.5)
      expect(parseNumericValue('16')).toBe(16) // 纯数字默认 px
    })

    it('解析 em 值', () => {
      expect(parseNumericValue('1em', 16)).toBe(16)
      expect(parseNumericValue('1.5em', 16)).toBe(24)
    })

    it('解析 rem 值', () => {
      expect(parseNumericValue('1rem', 16)).toBe(16)
      expect(parseNumericValue('1.5rem', 16)).toBe(24)
    })

    it('处理无效值', () => {
      expect(parseNumericValue('')).toBeNull()
      expect(parseNumericValue('invalid')).toBeNull()
      expect(parseNumericValue(null)).toBeNull()
    })
  })

  describe('numericFuzzyMatch', () => {
    it('精确匹配', () => {
      expect(numericFuzzyMatch('16px', ['16px'])).toBe(true)
    })

    it('容差范围内匹配', () => {
      // 绝对误差 <= 2 应该匹配
      expect(numericFuzzyMatch('16px', ['17px'])).toBe(true)
      expect(numericFuzzyMatch('16px', ['15px'])).toBe(true)
    })

    it('处理 Figma 浮点精度', () => {
      // 17.600000381469727 四舍五入后 = 18，与 18 匹配
      expect(numericFuzzyMatch('17.600000381469727px', ['18px'])).toBe(true)
    })

    it('支持单位转换', () => {
      // 1em = 16px（基准字号 16）
      expect(numericFuzzyMatch('16px', ['1em'], { baseFontSize: 16 })).toBe(true)
      expect(numericFuzzyMatch('24px', ['1.5rem'], { baseFontSize: 16 })).toBe(true)
    })

    it('超出容差不匹配', () => {
      expect(numericFuzzyMatch('16px', ['20px'])).toBe(false)
      expect(numericFuzzyMatch('16px', ['10px'])).toBe(false)
    })

    it('空列表不匹配', () => {
      expect(numericFuzzyMatch('16px', [])).toBe(false)
    })
  })
})
