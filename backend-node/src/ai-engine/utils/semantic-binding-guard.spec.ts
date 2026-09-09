/**
 * 🛡️ 语义元素归属校验测试（SEMANTIC-BINDING，2026-09-07）
 *
 * 事故实证：设备监测 ViewSwitch.vue:40 将角标 `3/3740` 绑定到 progress 字段
 */

import { detectSemanticBindingErrors } from './semantic-binding-guard.js';

describe('detectSemanticBindingErrors', () => {
  describe('角标数据绑定到 progress 字段', () => {
    it('⭐ 检测 progress 字段绑定角标数据（数字/数字模式）', () => {
      const files = [
        {
          path: 'package/components/ViewSwitch.vue',
          content: `
<template>
  <div class="switch-card">
    <div v-if="tab.progress" class="progress">{{ tab.progress }}</div>
  </div>
</template>
<script setup>
const tabs = ref([
  { id: 'tunnel', title: '隧道设备', progress: '3/3740' }
]);
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('BLOCK');
      expect(issues[0].file).toBe('package/components/ViewSwitch.vue');
      expect(issues[0].message).toContain('语义元素错绑');
      expect(issues[0].message).toContain('3/3740');
      expect(issues[0].message).toContain('progress');
    });

    it('检测多个 progress 字段绑定角标数据', () => {
      const files = [
        {
          path: 'package/components/Card.vue',
          content: `
<script setup>
const data = [
  { progress: '12/100', percent: '50/200' }
];
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(2);
      expect(issues[0].message).toContain('12/100');
      expect(issues[0].message).toContain('progress');
      expect(issues[1].message).toContain('50/200');
      expect(issues[1].message).toContain('percent');
    });
  });

  describe('其他语义字段', () => {
    it('检测 percent 字段绑定角标数据', () => {
      const files = [
        {
          path: 'package/components/Stats.vue',
          content: `
<script setup>
const stats = { percent: '99/100' };
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('percent');
    });

    it('检测 percentage 字段绑定角标数据', () => {
      const files = [
        {
          path: 'package/components/Chart.vue',
          content: `
<script setup>
const chart = { percentage: '75/100' };
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('percentage');
    });

    it('检测 ratio 字段绑定角标数据', () => {
      const files = [
        {
          path: 'package/components/Metric.vue',
          content: `
<script setup>
const metric = { ratio: '3/7' };
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('ratio');
    });

    it('检测 rate 字段绑定角标数据', () => {
      const files = [
        {
          path: 'package/components/Rate.vue',
          content: `
<script setup>
const rate = { rate: '15/20' };
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('rate');
    });
  });

  describe('不误报正常场景', () => {
    it('角标数据在 badge 字段不报错', () => {
      const files = [
        {
          path: 'package/components/Tab.vue',
          content: `
<script setup>
const tabs = [
  { id: 'monitor', badge: '3/3740' }
];
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(0);
    });

    it('progress 字段绑定普通数字不报错', () => {
      const files = [
        {
          path: 'package/components/Progress.vue',
          content: `
<script setup>
const progress = { progress: 75 };
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(0);
    });

    it('progress 字段绑定百分比字符串不报错', () => {
      const files = [
        {
          path: 'package/components/Bar.vue',
          content: `
<script setup>
const bar = { progress: '75%' };
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(0);
    });

    it('非 .vue 文件不检测', () => {
      const files = [
        {
          path: 'package/utils/data.js',
          content: `
const data = { progress: '3/3740' };
`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(0);
    });

    it('无 script 标签不报错', () => {
      const files = [
        {
          path: 'package/components/Empty.vue',
          content: `
<template>
  <div>Empty</div>
</template>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(0);
    });
  });

  describe('边界情况', () => {
    it('空文件数组返回空', () => {
      const issues = detectSemanticBindingErrors([]);
      expect(issues).toHaveLength(0);
    });

    it('null/undefined 文件返回空', () => {
      const issues = detectSemanticBindingErrors([null, undefined]);
      expect(issues).toHaveLength(0);
    });

    it('文件无 path/content 返回空', () => {
      const issues = detectSemanticBindingErrors([{ path: '', content: '' }]);
      expect(issues).toHaveLength(0);
    });

    it('异常时 fail-open 返回空', () => {
      // 模拟异常：传入非数组
      const issues = detectSemanticBindingErrors('not an array' as any);
      expect(issues).toHaveLength(0);
    });
  });

  describe('行号提取', () => {
    it('正确提取错误行号', () => {
      const files = [
        {
          path: 'package/components/View.vue',
          content: `
<template>
  <div>{{ data.progress }}</div>
</template>
<script setup>
const line1 = 'a';
const line2 = 'b';
const data = { progress: '3/3740' };
</script>`,
        },
      ];

      const issues = detectSemanticBindingErrors(files);

      expect(issues).toHaveLength(1);
      expect(issues[0].line).toBeDefined();
      expect(issues[0].line).toBeGreaterThan(0);
    });
  });
});
