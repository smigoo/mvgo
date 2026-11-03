import { hasNodeResourceDeclaration } from '../resource-declaration-truth.js'

describe('内容区子级资源声明判据', () => {
  test('真实逐项背景契约：bg.resourceFile 必须识别', () => {
    expect(hasNodeResourceDeclaration({
      bg: { resourceFile: '../resources/images/bg-125.png', recommendedUsage: 'backgroundBlock' },
    })).toBe(true)
  })

  test('children/items 递归中的逐项背景同样识别', () => {
    expect(hasNodeResourceDeclaration({
      children: [{ items: [{ bg: { resourceFile: '../resources/images/bg-124.png' } }] }],
    })).toBe(true)
  })

  test.each([
    [{ resourceFile: '../resources/images/bg.png' }],
    [{ bgResource: '../resources/images/bg.png' }],
    [{ backgroundImage: { src: '../resources/images/bg.png' } }],
  ])('既有资源声明形态保持识别：%j', (node) => {
    expect(hasNodeResourceDeclaration(node)).toBe(true)
  })

  test.each([
    [null],
    [{}],
    [{ bg: true }],
    [{ bg: { color: '#a6ceff' } }],
    [{ backgroundImage: {} }],
    [{ children: [{ items: [{ bg: false }] }] }],
  ])('无资源声明不误判：%j', (node) => {
    expect(hasNodeResourceDeclaration(node)).toBe(false)
  })
})
