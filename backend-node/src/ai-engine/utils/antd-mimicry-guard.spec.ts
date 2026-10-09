import { scanAntdMimicry, summarizeAntdMimicryIssues } from './antd-mimicry-guard.js'

describe('antd-mimicry-guard：手写模仿 antd 结构指纹（U1 · 2026-10-09）', () => {
  it('实锤形态命中：c-c19746 的 antd-form-item / ant-design-vue-upload / ant-design-vue-button', () => {
    const files = {
      'package/components/ContentSection.vue': [
        '<template>',
        '  <div class="c-c19746-antd-form-item c-c19746-frame">',
        '    <span class="c-c19746-label-text">产品编码</span>',
        '    <a-input class="c-c19746-antd-input" />',
        '  </div>',
        '  <div class="c-c19746-ant-design-vue-upload">',
        '    <div class="c-c19746-upload-inner"><img :src="icon1" /></div>',
        '  </div>',
        '  <a-button class="c-c19746-ant-design-vue-button c-c19746-btn-save">保存</a-button>',
        '</template>',
      ].join('\n'),
    }
    const { issues } = scanAntdMimicry(files)
    const tokens = issues.map((i) => i.token)
    expect(tokens).toContain('c-c19746-antd-form-item')
    expect(tokens).toContain('c-c19746-ant-design-vue-upload')
    expect(tokens).toContain('c-c19746-ant-design-vue-button')
    // antd-input 也在指纹集
    expect(tokens).toContain('c-c19746-antd-input')
    // 正常业务 class 不报
    expect(tokens).not.toContain('c-c19746-frame')
    expect(tokens).not.toContain('c-c19746-label-text')
    expect(tokens).not.toContain('c-c19746-btn-save')
    // kind 判定
    expect(issues.every((i) => i.kind === 'template')).toBe(true)
  })

  it('样式选择器命中：.less 里的 .x-antd-form-item', () => {
    const files = {
      'resources/styles/common.less': '.c-x-antd-form-item { display: flex; }\n.c-x-normal { color: red; }',
    }
    const { issues } = scanAntdMimicry(files)
    expect(issues.map((i) => i.token)).toContain('c-x-antd-form-item')
    expect(issues.map((i) => i.token)).not.toContain('c-x-normal')
    expect(issues[0].kind).toBe('style')
  })

  it('不误伤：真组件 a-* 用法、正常业务命名、无 class 的文件', () => {
    const files = {
      'package/index.vue': [
        '<template>',
        '  <a-form class="c-ab12cd-form"><a-form-item label="名称"><a-input /></a-form-item></a-form>',
        '  <a-upload class="c-ab12cd-upload"><a-button>上传</a-button></a-upload>',
        '</template>',
      ].join('\n'),
      'resources/styles/common.less': '.c-ab12cd-form { width: 100%; }',
    }
    const { issues } = scanAntdMimicry(files)
    expect(issues).toHaveLength(0)
  })

  it(':class 动态绑定内容不参与指纹判定（WP4 同款负向排除）', () => {
    const files = {
      'package/components/X.vue': '<div :class="{ \'c-x-antd-hidden\': item.hidden }">t</div>',
    }
    // :class 的对象字面量同样可能被 class=" 正则漏过（无静态 class 属性）——
    // 该用例锁定「静态 class 之外的来源不误报也不漏报由运行时探针兜底」的边界口径
    const { issues } = scanAntdMimicry(files)
    expect(issues).toHaveLength(0)
  })

  it('🔴 数组形态接线回归（mc-max-1791528133746-17b69623 实锤）：graph 传 [{path,content}] 必须命中', () => {
    // 事故：scanAntdMimicry 最初只按 Record 形态设计，graph 接线传数组 →
    // Object.entries 拿索引 key、content 非字符串全跳过 → 运行时恒扫空，
    // 真产物 26 处 antd 指纹报 issues:[]。本用例 = 阳性对照，锁死双形态。
    const files = [
      {
        path: 'package/components/ContentSection.vue',
        content: '<template><div class="c-17b696-antd-form-item"><span class="c-17b696-input-placeholder">x</span></div></template>',
      },
      {
        path: 'package/index.vue',
        content: '<template><a-form class="c-17b696-form"><a-form-item /></a-form></template>',
      },
    ]
    const { issues } = scanAntdMimicry(files as any)
    expect(issues.map((i) => i.token)).toContain('c-17b696-antd-form-item')
    expect(issues.map((i) => i.token)).not.toContain('c-17b696-input-placeholder')
    expect(issues.map((i) => i.token)).not.toContain('c-17b696-form')
    // 对象形态同判（双形态一致性）
    const asRecord = Object.fromEntries(files.map((f) => [f.path, f.content]))
    expect(scanAntdMimicry(asRecord).issues.map((i) => i.token)).toEqual(
      issues.map((i) => i.token),
    )
  })

  it('summarizeAntdMimicryIssues：空集空串、非空带文件分布', () => {
    expect(summarizeAntdMimicryIssues([])).toBe('')
    const s = summarizeAntdMimicryIssues([
      { file: 'a/b/ContentSection.vue', token: 't1' },
      { file: 'a/b/ContentSection.vue', token: 't2' },
      { file: 'package/index.vue', token: 't3' },
    ])
    expect(s).toContain('3 处')
    expect(s).toContain('ContentSection.vue×2')
  })
})
