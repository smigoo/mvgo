// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../../config/backend-root.js', () => {
  const cwd = process.cwd()
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  }
}, { virtual: true })

// acorn-optional-loader 内部用 import.meta（ESM 形态），ts-jest CJS 下解析期即炸；
// 工厂 mock 内用 jest 的 require 真加载 acorn ⇒ 自由变量检测覆盖率不降，缺失时降级 null 与生产一致。
jest.mock('./acorn-optional-loader.js', () => {
  let acornParser = null
  let acornWalker = null
  try {
    acornParser = require('acorn')
    acornWalker = require('acorn-walk')
  } catch { /* 缺失降级，与生产语义一致 */ }
  return { acornParser, acornWalker }
}, { virtual: true })

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
