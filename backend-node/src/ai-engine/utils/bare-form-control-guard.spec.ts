import { scanBareFormControls, summarizeBareFormControls } from './bare-form-control-guard.js';

describe('bare-form-control-guard · 裸写原生表单控件判据', () => {
  it('阳性：裸 input/select/textarea 逐处命中并带行样本', () => {
    const code = `<template>
  <div><input class="c-x-input" /></div>
  <select class="c-x-sel"></select>
  <textarea class="c-x-ta"></textarea>
</template>`;
    const hits = scanBareFormControls(code);
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.tag)).toEqual(['input', 'select', 'textarea']);
    expect(hits[0].sample).toContain('c-x-input');
  });

  it('阴性：antd 组件标签（a-input/a-textarea/a-select/a-input-number）零命中', () => {
    const code = `<template>
  <a-input v-model:value="v" />
  <a-textarea />
  <a-select />
  <a-input-number />
</template>`;
    expect(scanBareFormControls(code)).toHaveLength(0);
  });

  it('阴性：script 内文本/字符串中的形似 token 不误报（如无 < 标签形态）', () => {
    const code = `<script setup>
const s = 'input select textarea'
</script>`;
    expect(scanBareFormControls(code)).toHaveLength(0);
  });

  it('边界：空输入/非字符串返回空数组', () => {
    expect(scanBareFormControls('')).toHaveLength(0);
    expect(scanBareFormControls(null)).toHaveLength(0);
    expect(scanBareFormControls(undefined)).toHaveLength(0);
    expect(scanBareFormControls(123)).toHaveLength(0);
  });

  it('摘要：按标签聚合计数降序', () => {
    const code = '<input/><input/><input/><textarea/><select/>';
    const s = summarizeBareFormControls(scanBareFormControls(code));
    expect(s).toBe('<input>×3、<textarea>×1、<select>×1');
  });

  it('真机对照：c-add-product-3f734e7a 形态（语义 class + 裸 input）必须命中', () => {
    const code = `<input class="c-add-product-input" type="text" placeholder="若不输入则系统自动生成" />`;
    expect(scanBareFormControls(code)).toHaveLength(1);
  });

  it('真机对照：mv-lite-1791600614695-397d13ce 形态（控件已 antd 但裸 <label> 行结构）必须命中', () => {
    const code = `<template>
  <div class="add-product-row">
    <label class="add-product-label add-product-required">产品编码</label>
    <a-input placeholder="若不输入则系统自动生成" />
  </div>
  <div class="add-product-row">
    <label class="add-product-label">产品型号</label>
    <a-input />
  </div>
</template>`;
    const hits = scanBareFormControls(code);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.tag === 'label')).toBe(true);
  });

  it('阴性：a-form-item label 属性/#label 插槽形态零命中', () => {
    const code = `<a-form><a-form-item label="产品编码"><a-input /></a-form-item>
  <a-form-item><template #label><span>型号</span></template><a-input /></a-form-item></a-form>`;
    expect(scanBareFormControls(code)).toHaveLength(0);
  });
});
