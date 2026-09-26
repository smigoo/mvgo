/**
 * 🛡️ P-11 计数文本分段着色（2026-09-26 · c-device-monitor-8d304bf9 实锤）
 *
 * 病灶：注入器只认 `{{ xxx.count }}` 绑定；而真实产物里计数文本是 **v-for 数据项**
 * （`value: '(2/484)'` + `{{ item.value }}`）→ 匹配不到 → 整体 fail-closed（真机实测 applied=false），
 * 尽管 Figma per-char 真值三色齐全（base=rgb(25,144,255) / abnormal=rgb(224,52,52) / normal=rgb(8,163,165)）。
 * 契约：数据驱动形态也要能装配；判据必须来自产物自身的数据字面量，不靠属性名猜语义。
 */
import { injectPerCharTextSegments } from '../post-process.js';

const truthOf = () => [
  {
    nodeId: '2:8443',
    characters: '(2/484)',
    segments: [
      { text: '(', color: 'rgb(25,144,255)', fontSize: 16, fontWeight: 500 },
      { text: '2', color: 'rgb(224,52,52)', fontSize: 18, fontWeight: 600 },
      { text: '/484)', color: 'rgb(25,144,255)', fontSize: 16, fontWeight: 500 },
    ],
  },
  {
    nodeId: '2:8472',
    characters: '(0/484)',
    segments: [
      { text: '(', color: 'rgb(25,144,255)', fontSize: 16, fontWeight: 500 },
      { text: '0', color: 'rgb(8,163,165)', fontSize: 18, fontWeight: 600 },
      { text: '/484)', color: 'rgb(25,144,255)', fontSize: 16, fontWeight: 500 },
    ],
  },
];

const consVue = () => `<template>
  <div class="c-x-cons" v-bind="$attrs">
    <div v-for="(item, index) in deviceList" :key="index" class="c-x-group">
      <div class="c-x-icon"><img :src="item.icon" class="c-x-icon-img" /></div>
      <div class="c-x-cons-text">
        <span class="c-x-cons-label">{{ item.label }}</span>
        <span class="c-x-cons-value">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import icon5 from '../../resources/images/icon-8444.png'
const deviceList = ref([
  { label: '摄像机', value: '(2/484)', icon: icon5 },
  { label: '超高检测器', value: '(0/484)', icon: icon5 },
])
</script>`;

describe('injectPerCharTextSegments：数据驱动计数文本（v-for 数组项）', () => {
  it('`{{ item.value }}` + 数据项字面量 `(2/484)` → 装配分段渲染 + 注入 helper', () => {
    const files = { 'package/components/ContentCons.vue': consVue() };
    const r = injectPerCharTextSegments(files, truthOf());
    expect(r.applied).toBe(true);
    const out = files['package/components/ContentCons.vue'];

    // ① 模板：绑定被替换为分段 v-for 渲染（沿用既有策略，不另起一套）
    expect(out).toContain('formatDeviceCountSegments(item.value)');
    expect(out).not.toContain('{{ item.value }}');
    // ② script：helper + 三色真值常量
    expect(out).toContain('const COUNT_SEG_BASE = \'rgb(25,144,255)\'');
    expect(out).toContain('const COUNT_SEG_ABNORMAL = \'rgb(224,52,52)\'');
    expect(out).toContain('const COUNT_SEG_NORMAL = \'rgb(8,163,165)\'');
    // ③ 非计数绑定不被误替换
    expect(out).toContain('{{ item.label }}');
  });

  it('既有路径不回归：`{{ device.count }}` 仍生效', () => {
    const src = `<template>\n  <div>{{ device.count }}</div>\n</template>\n<script setup>\nconst device = { count: '2/484' }\n</script>`;
    const files = { 'package/index.vue': src };
    const r = injectPerCharTextSegments(files, truthOf());
    expect(r.applied).toBe(true);
    expect(files['package/index.vue']).toContain('formatDeviceCountSegments(device.count)');
  });

  it('保守：只有非计数文本（label）→ 零改动', () => {
    const src = consVue().replace(/value: '\(2\/484\)'/, "value: '正常'").replace(/value: '\(0\/484\)'/, "value: '正常'");
    const files = { 'package/components/ContentCons.vue': src };
    const r = injectPerCharTextSegments(files, truthOf());
    expect(r.applied).toBe(false);
    expect(files['package/components/ContentCons.vue']).toBe(src);
  });

  it('幂等：第二次零改动', () => {
    const files = { 'package/components/ContentCons.vue': consVue() };
    injectPerCharTextSegments(files, truthOf());
    const once = files['package/components/ContentCons.vue'];
    const again = injectPerCharTextSegments(files, truthOf());
    expect(again.applied).toBe(false);
    expect(files['package/components/ContentCons.vue']).toBe(once);
  });

  it('fail-closed：真值为空 或无 abnormal 色 → 零改动', () => {
    const files = { 'package/components/ContentCons.vue': consVue() };
    expect(injectPerCharTextSegments(files, []).applied).toBe(false);
    const onlyZero = truthOf().filter((t) => t.characters.includes('(0/'));
    expect(injectPerCharTextSegments(files, onlyZero).applied).toBe(false);
    expect(files['package/components/ContentCons.vue']).toBe(consVue());
  });
});
