/**
 * Phase 3 L8：flexDirection 推断逻辑集中化测试
 */
import { inferFlexDirection } from '../flex-direction-inferrer.js'

describe('Phase 3 L8 - inferFlexDirection', () => {
  const makeBox = (x, y, w, h) => ({
    absoluteBoundingBox: { x, y, width: w, height: h },
  })

  test('默认竖向：少于 2 个兄弟', () => {
    expect(inferFlexDirection([])).toBe('vertical')
    expect(inferFlexDirection([makeBox(0, 0, 100, 50)])).toBe('vertical')
  })

  test('水平布局：同行左右并列（y 重叠 + x 不相交）', () => {
    // 两个盒子在同一行，左右排列
    const siblings = [
      makeBox(0, 0, 100, 50),   // 左
      makeBox(120, 5, 100, 40), // 右（y 重叠 40px，x 不相交）
    ]
    expect(inferFlexDirection(siblings)).toBe('horizontal')
  })

  test('竖向布局：上下堆叠（y 不相交）', () => {
    // 两个盒子上下排列
    const siblings = [
      makeBox(0, 0, 100, 50),   // 上
      makeBox(0, 60, 100, 50),  // 下（y 不相交）
    ]
    expect(inferFlexDirection(siblings)).toBe('vertical')
  })

  test('竖向布局：x 重叠过大（真正重叠/嵌套）', () => {
    // 两个盒子 y 重叠但 x 也大幅重叠（嵌套关系）
    const siblings = [
      makeBox(0, 0, 100, 50),
      makeBox(10, 5, 80, 40), // x 重叠 80px > 15% * 80px = 12px
    ]
    expect(inferFlexDirection(siblings)).toBe('vertical')
  })

  test('水平布局：三个兄弟，两个左右并列', () => {
    const siblings = [
      makeBox(0, 0, 100, 50),    // 左
      makeBox(120, 5, 100, 40),  // 中
      makeBox(240, 0, 100, 50),  // 右
    ]
    expect(inferFlexDirection(siblings)).toBe('horizontal')
  })

  test('自定义阈值：严格模式（yOverlapRatio=0.8）', () => {
    const siblings = [
      makeBox(0, 0, 100, 50),
      makeBox(120, 30, 100, 50), // y 重叠 20px = 40% < 80%
    ]
    expect(inferFlexDirection(siblings, { yOverlapRatio: 0.8 })).toBe('vertical')
  })

  test('自定义阈值：宽松模式（xOverlapRatio=0.3）', () => {
    const siblings = [
      makeBox(0, 0, 100, 50),
      makeBox(80, 5, 100, 40), // x 重叠 20px = 25% < 30%
    ]
    expect(inferFlexDirection(siblings, { xOverlapRatio: 0.3 })).toBe('horizontal')
  })

  test('null/undefined 输入：返回默认竖向', () => {
    expect(inferFlexDirection(null)).toBe('vertical')
    expect(inferFlexDirection(undefined)).toBe('vertical')
  })

  test('无 bbox 的节点：忽略后少于 2 个，返回竖向', () => {
    const siblings = [
      { name: 'no-bbox' },
      makeBox(0, 0, 100, 50),
    ]
    expect(inferFlexDirection(siblings)).toBe('vertical')
  })
})
