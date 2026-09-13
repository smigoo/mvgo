import {
  isFileArray,
  toFileArray,
  mergeFileArray,
} from '../file-collection.js'

/**
 * 刀 13-C · 产物文件集形态归一（单一事实源）回归
 *
 * 事故背景：`pruneDuplicateStyleDecls` 只认数组，而管线传对象 map → 早退且静默。
 * 本模块是「形态互转」的唯一实现，必须对两种形态都给出一致语义。
 */

describe('toFileArray', () => {
  it('数组原引用返回（不做无谓拷贝）', () => {
    const arr = [{ path: 'a.vue', content: 'x' }]
    expect(isFileArray(arr)).toBe(true)
    expect(toFileArray(arr)).toBe(arr)
  })

  it('对象 map → [{path, content}]，保持插入顺序', () => {
    const map = { 'package/index.vue': 'A', 'resources/styles/common.less': 'B' }
    expect(toFileArray(map)).toEqual([
      { path: 'package/index.vue', content: 'A' },
      { path: 'resources/styles/common.less', content: 'B' },
    ])
  })

  it('非法输入 → 空数组（不抛错）', () => {
    expect(toFileArray(null)).toEqual([])
    expect(toFileArray(undefined)).toEqual([])
    expect(toFileArray(42 as never)).toEqual([])
  })
})

describe('mergeFileArray', () => {
  it('基准为对象 map 且有变更 → 新 map 仅回写变更项', () => {
    const base = { 'a.vue': 'old', 'b.vue': 'same' }
    const out = mergeFileArray(base, [
      { path: 'a.vue', content: 'new' },
      { path: 'b.vue', content: 'same' },
    ])
    expect(out).toEqual({ 'a.vue': 'new', 'b.vue': 'same' })
    expect(out).not.toBe(base)
  })

  it('基准为对象 map 且无变更 → 返回基准原引用（供管线判定 applied）', () => {
    const base = { 'a.vue': 'x' }
    expect(mergeFileArray(base, [{ path: 'a.vue', content: 'x' }])).toBe(base)
  })

  it('基准为数组 → 返回处理后的数组（离线脚本路径）', () => {
    const base = [{ path: 'a.vue', content: 'old' }]
    const list = [{ path: 'a.vue', content: 'new' }]
    expect(mergeFileArray(base, list)).toBe(list)
  })

  it('忽略无 path / 非字符串 content 的条目（不制造脏键）', () => {
    const base = { 'a.vue': 'x' }
    const out = mergeFileArray(base, [
      { path: '', content: 'z' },
      { path: 'b.vue', content: undefined as never },
    ])
    expect(out).toBe(base)
  })
})
