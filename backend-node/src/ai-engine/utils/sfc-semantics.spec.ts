import { parse as parseJavaScript } from '@babel/parser';
import { dedupeScriptDeclarations, extractScriptDeclarations } from './sfc-semantics.js';

describe('SFC script declaration dedupe', () => {
  it('removes a default import when the same binding already has an async declaration', () => {
    const source = `import { defineAsyncComponent, onMounted } from 'vue'
const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))
import MonitorStats from './components/MonitorStats.vue'
onMounted(() => {})`;

    const result = dedupeScriptDeclarations(source);

    expect(result).toContain('const MonitorStats = defineAsyncComponent');
    expect(result).not.toContain("import MonitorStats from './components/MonitorStats.vue'");
    expect(() => parseJavaScript(result, { sourceType: 'module' })).not.toThrow();
  });

  it('keeps unrelated imports and declarations unchanged', () => {
    const source = `import MonitorStats from './components/MonitorStats.vue'
const total = 1`;

    expect(dedupeScriptDeclarations(source)).toBe(source);
  });
});

describe('extractScriptDeclarations — defineProps 嵌套对象', () => {
  it('正确提取 defineProps 的所有 prop 键（含嵌套 default: () => ({})，防漏 activeTabBg 类误判）', () => {
    const source = `import { ref } from 'vue'
const props = defineProps({
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: 'co' },
  chartOption: { type: Object, default: () => ({}) },
  activeTabBg: { type: String, default: '' }
})`;

    const declared = extractScriptDeclarations(source);
    for (const k of ['props', 'ref', 'tabs', 'activeTab', 'chartOption', 'activeTabBg']) {
      expect(declared.has(k)).toBe(true);
    }
  });
});
