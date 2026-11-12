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

// ═══════════════════════════════════════════════════════════════════
// 🛡️ 连字符裸标识符（2026-11-11 · c-vehicle-monitor-4cf5135f 实锤）：
//   `:class="c-vehicle-monitor-cardClass"` 旧提取正则认不出 ⇒ 门禁放行 ⇒
//   Vue 编译为减法链 ⇒ ReferenceError ⇒ 卡片子树全灭。
import { validateVueScriptSemantics, findHyphenatedTemplateRefs } from './sfc-semantics.js';

describe('连字符裸标识符判据（模板绑定整值）', () => {
  const SFC_BAD =
    '<template><div :class="c-vehicle-monitor-cardClass">x</div></template>\n<script setup>\nconst props = defineProps({})\n</script>';
  const SFC_OK_ARITH =
    '<template><div :style="{ width: a - b }">x</div></template>\n<script setup>\nconst a = 1\nconst b = 2\n</script>';
  const SFC_OK_PLAIN =
    '<template><div :class="cardClass">x</div></template>\n<script setup>\nconst cardClass = "x"\n</script>';

  it('阳性：指令绑定连字符标识符且段未声明 ⇒ 报 issue 并给出驼峰化指导', () => {
    const r = validateVueScriptSemantics(SFC_BAD, 'package/components/StatCardItem.vue');
    const hit = r.issues.find((s) => s.includes('连字符标识符'));
    expect(hit).toBeTruthy();
    expect(hit).toContain('c-vehicle-monitor-cardClass');
    expect(hit).toContain('驼峰');
  });

  it('阴性①：连字符但各段均已声明（合法减法运算）⇒ 不报', () => {
    const r = validateVueScriptSemantics(SFC_OK_ARITH, 'a.vue');
    expect(r.issues.filter((s) => s.includes('连字符'))).toHaveLength(0);
  });

  it('阴性②：普通合法标识符绑定 ⇒ 不报', () => {
    const r = validateVueScriptSemantics(SFC_OK_PLAIN, 'a.vue');
    expect(r.issues.filter((s) => s.includes('连字符'))).toHaveLength(0);
  });

  it('插值形态 {{ X-Y }} 同样拦截', () => {
    const tpl = '<template><div>{{ c-vehicle-monitor-cardClass }}</div></template>';
    const r = validateVueScriptSemantics(
      tpl + '\n<script setup>\nconst props = defineProps({})\n</script>',
      'a.vue',
    );
    expect(r.issues.some((s) => s.includes('连字符'))).toBe(true);
  });

  it('findHyphenatedTemplateRefs 无 declared 时返回全部整值 token', () => {
    expect(findHyphenatedTemplateRefs('<div :data-x="a-b">')).toEqual(['a-b']);
    expect(findHyphenatedTemplateRefs('<div :data-x="ab">')).toEqual([]);
  });
});

// 🔴 回归锚 2026-11-12（mc-refine-max-1794459143011-2b586ef5 实锤）：
//   精修轮把子组件 ListSection.vue 的 <script setup> 连同 FG_LIST_ITEMS 数据块整段删掉
//   （42 行→20 行），旧守卫 `templateContent && scriptBody` 在 scriptBody='' 时直接跳过
//   模板引用检查 ⇒ 门禁放行、列表渲染为空、组件主体整块消失。
//   修法：完整 SFC（含 <template>）但没有 <script> 时，模板硬引用一律判未声明。
describe('子组件删掉整个 <script> 段（模板引用无处声明）', () => {
  const SFC_TEMPLATE_ONLY =
    '<template><div><div v-for="(it, i) in FG_LIST_ITEMS" :key="i">{{ it.t }}</div></div></template>\n';
  const SFC_WITH_SCRIPT =
    '<template><div><div v-for="(it, i) in FG_LIST_ITEMS" :key="i">{{ it.t }}</div></div></template>\n<script setup>\nconst FG_LIST_ITEMS = [{ t: "a" }]\n</script>\n';
  const SFC_STATIC_ONLY = '<template><div>纯静态文本</div></template>\n';
  const SFC_BUILTIN_ONLY =
    '<template><Transition><div v-if="true">x</div></Transition></template>\n';

  it('阳性：模板引用 FG_LIST_ITEMS 但无 <script> 段 ⇒ 报缺失并点名标识符', () => {
    const r = validateVueScriptSemantics(SFC_TEMPLATE_ONLY, 'package/components/ListSection.vue');
    const hit = r.issues.find((s) => s.includes('<script setup>'));
    expect(hit).toBeTruthy();
    expect(hit).toContain('FG_LIST_ITEMS');
  });

  it('阴性①：补回 <script setup> 并声明 ⇒ 不报', () => {
    const r = validateVueScriptSemantics(SFC_WITH_SCRIPT, 'package/components/ListSection.vue');
    expect(r.issues).toHaveLength(0);
  });

  it('阴性②：纯静态模板无 script（无硬引用）⇒ 不报', () => {
    const r = validateVueScriptSemantics(SFC_STATIC_ONLY, 'package/components/ListSection.vue');
    expect(r.issues).toHaveLength(0);
  });

  it('阴性③：无 script 但只用 Vue 内置组件 ⇒ 不误报', () => {
    const r = validateVueScriptSemantics(SFC_BUILTIN_ONLY, 'a.vue');
    expect(r.issues).toHaveLength(0);
  });
});
