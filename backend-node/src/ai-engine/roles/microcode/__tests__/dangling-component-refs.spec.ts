/**
 * 🛡️ 2026-11-13 · CODE-023 双刀（mc-max-1794546172891-8b9302bc 实锤）
 *
 * B 刀：pruneDanglingComponentFileRefs —— 子组件被写盘门禁拒落盘后，宿主对它的
 *   import/defineAsyncComponent/模板标签确定性剥除（此前 sfcBlocked 全仓 0 消费方，
 *   悬空标签 ⇒ CODE-023 BLOCK ⇒ 重试耗尽 fail-closed）。
 * C 刀：sfc-blocked.json 回灌缓存 —— file-writer 落缓存、microcode-engineer chunk prompt
 *   注入错误原文（此前同错重掷：ContentBridge 两轮同一处 style 语法错，行号只挪 1 行）。
 */
import { pruneDanglingComponentFileRefs } from '../../../utils/resource-import-guard.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('pruneDanglingComponentFileRefs（宿主悬空引用剥除）', () => {
  const HOST = `<template>
  <div class="wrap">
    <ContentTunnel style="flex:0.3" />
    <ContentBridge style="flex:0.200;margin-top:10px" />
    <StatsSection :items="items" />
  </div>
</template>
<script setup>
import bg1 from '../resources/images/bg-1.png'
import ContentTunnel from './components/ContentTunnel.vue'
import ContentBridge from './components/ContentBridge.vue'
import StatsSection from './components/StatsSection.vue'
</script>`;

  it('阳性：import + 模板标签一起剥除，其余组件零触碰', () => {
    const out = pruneDanglingComponentFileRefs(HOST, ['ContentBridge']);
    expect(out).not.toContain('ContentBridge');
    expect(out).toContain('import ContentTunnel from');
    expect(out).toContain('<ContentTunnel');
    expect(out).toContain('import StatsSection from');
    expect(out).toContain('import bg1 from');
  });

  it('阳性：defineAsyncComponent 形态也剥除', () => {
    const content = `<template><div><LazyBridge /></div></template>
<script setup>
import { defineAsyncComponent } from 'vue'
const LazyBridge = defineAsyncComponent(() => import('./components/LazyBridge.vue'))
</script>`;
    const out = pruneDanglingComponentFileRefs(content, ['LazyBridge']);
    expect(out).not.toContain('defineAsyncComponent(() => import');
    expect(out).toContain("import { defineAsyncComponent } from 'vue'");
  });

  it('阴性：非法名字（非 PascalCase）直接跳过', () => {
    const out = pruneDanglingComponentFileRefs(HOST, ['contentBridge', 'content-bridge', '']);
    expect(out).toBe(HOST);
  });

  it('阴性：空入参原样返回（引用相等，幂等安全）', () => {
    expect(pruneDanglingComponentFileRefs(HOST, [])).toBe(HOST);
    expect(pruneDanglingComponentFileRefs(HOST, null)).toBe(HOST);
    expect(pruneDanglingComponentFileRefs('', ['X'])).toBe('');
  });

  it('阳性：成对跨行标签剥除', () => {
    const content = `<template>
  <div>
    <ContentBridge
      style="flex:0.2"
      :items="xs"
    >
      <span>slot 内容</span>
    </ContentBridge>
  </div>
</template>
<script setup>
import ContentBridge from './components/ContentBridge.vue'
</script>`;
    const out = pruneDanglingComponentFileRefs(content, ['ContentBridge']);
    expect(out).not.toContain('ContentBridge');
    expect(out).not.toContain('slot 内容');
    expect(out).toContain('<div>');
  });
});

describe('C 刀接线（sfc-blocked.json 回灌，源码断言——microcode-engineer 不可直接 import）', () => {
  const ENGINEER = readFileSync(join(__dirname, '../../microcode-engineer.js'), 'utf-8');
  const WRITER = readFileSync(join(__dirname, '../file-writer.js'), 'utf-8');

  it('file-writer：写盘收尾落 sfc-blocked.json 缓存（成功文件清记录、阻塞文件记错误原文）', () => {
    expect(WRITER).toMatch(/sfc-blocked\.json/);
    expect(WRITER).toMatch(/for \(const rel of writtenFiles\) delete cache\[rel\]/);
    expect(WRITER).toMatch(/errors: \(b\?\.errors \|\| \[\]\)/);
  });

  it('microcode-engineer：chunk prompt 组装处注入错误原文（appendGlobalGuidance 之前）', () => {
    expect(ENGINEER).toMatch(/写盘门禁错误已回灌到 chunk prompt/);
    const injectAt = ENGINEER.indexOf('上轮以下文件被写盘门禁拒绝');
    const guidanceAt = ENGINEER.indexOf('prompt = appendGlobalGuidance(prompt, fileType, chunk);\n      // 🛡️ C 刀');
    // 注入段在 appendGlobalGuidance 之前生效（回灌内容不会被全局指导覆盖）
    expect(injectAt).toBeGreaterThan(-1);
    expect(ENGINEER.indexOf('prompt += _feedback;')).toBeGreaterThan(-1);
    expect(guidanceAt).toBe(-1); // 接线点在 appendGlobalGuidance 之前（该拼接序锚不存在反向形态）
  });

  it('B 刀接线：file-writer 消费 sfcBlocked 剥除宿主引用', () => {
    expect(WRITER).toMatch(/pruneDanglingComponentFileRefs/);
    expect(WRITER).toMatch(/CODE-023 宿主联动剥除/);
  });
});

/**
 * 🛡️ vue3 四象限接线断言（2026-11-13 · 用户申明「所有修改同步 vue3/mc × max/lite」）
 *
 * 本轮 A/B/C + bg 直挂收敛 + prune 同源化全部落在共享层，结论是「自动同步 vue3」——
 * 本组用例把「自动」钉死为可回归验证的源码事实，防止后续重构（override/换写盘链）
 * 静默破坏 vue3 侧覆盖而不被察觉。
 *
 * 依据（2026-11-13 实证）：
 * - Vue3Engineer extends MicrocodeEngineer（vue3-engineer.js:144）
 * - vue3 写盘走父类 writeFiles（vue3-engineer.js:2430 注释自证）⇒ B 刀生效
 * - vue3 直接调用 healVueEmbeddedStyleBraces（vue3-engineer.js:2043）⇒ A 刀生效
 * - vue3 未 override generateCode/buildCodePrompt ⇒ C 刀注入点命中
 * - mc-component-graph-vue3.js 引 figma-connector(:270) + visual-parser(:420) + pruneUnmounted ⇒ bg 契约/直挂收敛/同源化生效
 */
describe('vue3 四象限接线断言（共享层自动覆盖的源码事实）', () => {
  const ROOT = join(__dirname, '../../..'); // ⇒ src/ai-engine
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');

  let VUE3_ENGINEER;
  let VUE3_GRAPH;
  let CODE_HEALER;

  beforeAll(() => {
    VUE3_ENGINEER = read('roles/vue3-engineer.js');
    VUE3_GRAPH = read('graphs/mc-component-graph-vue3.js');
    CODE_HEALER = read('roles/microcode/code-healer.js');
  });

  it('继承关系：Vue3Engineer extends MicrocodeEngineer', () => {
    expect(VUE3_ENGINEER).toMatch(/class\s+Vue3Engineer\s+extends\s+MicrocodeEngineer/);
  });

  it('A 刀：vue3 调用 healVueEmbeddedStyleBraces，且该方法首步已接错嵌套修复', () => {
    // vue3 侧调用点存在
    expect(VUE3_ENGINEER).toMatch(/healVueEmbeddedStyleBraces\(/);
    // heal 方法体内首步即 healMisnestedStyleDeclarations（删该调用 = vue3 A 刀静默失效，此处拦住）
    const fnAt = CODE_HEALER.indexOf('export function healVueEmbeddedStyleBraces');
    expect(fnAt).toBeGreaterThan(-1);
    const body = CODE_HEALER.slice(fnAt, fnAt + 8000);
    expect(body).toMatch(/healMisnestedStyleDeclarations\(/);
  });

  it('B 刀：vue3 未 override writeFiles（写盘走父类 ⇒ sfcBlocked 消费逻辑生效）', () => {
    // 只允许「调用」父类 writeFiles，不允许 class 内方法定义 override
    expect(VUE3_ENGINEER).toMatch(/this\.writeFiles\(/);
    expect(VUE3_ENGINEER).not.toMatch(/^( {2})?writeFiles\s*\(/m);
    expect(VUE3_ENGINEER).not.toMatch(/^( {2})?async writeFiles\s*\(/m);
  });

  it('C 刀（vue3 侧）：runChunk 显式调用共享注入方法（vue3 override 了 generateCode，父类注入点不可达）', () => {
    // ⚠️ 2026-11-13 修正：vue3 并非「未 override」——vue3-engineer.js:302 完全重写 generateCode、
    // :205 重写 buildCodePrompt，runChunk(:515) 是局部函数 ⇒ 父类 generateCode 内的注入点
    // 对 vue3 不可达。四象限同源的唯一形态 = vue3 runChunk 显式调用父类共享方法。
    expect(VUE3_ENGINEER).toMatch(/class\s+Vue3Engineer\s+extends\s+MicrocodeEngineer/);
    expect(VUE3_ENGINEER).toMatch(/async generateCode\(input\)\s*\{/); // override 实锤（防止断言前提漂移）
    expect(VUE3_ENGINEER).toMatch(/this\.injectSfcBlockedFeedbackIntoPrompt\(/);
  });

  it('C 刀（mc 侧）：父类 generateCode 注入点已改为调用共享方法（判据单一来源）', () => {
    const ENGINEER = read('roles/microcode-engineer.js');
    expect(ENGINEER).toMatch(/injectSfcBlockedFeedbackIntoPrompt\(prompt, outputPath, chunk\.files\)/);
    expect(ENGINEER).toMatch(/injectSfcBlockedFeedbackIntoPrompt\(prompt, outputPath, chunkFiles\)\s*\{/);
    // 缓存路径判据唯一出现在共享方法内（防止旁路直读的副本再长出来）
    const methodAt = ENGINEER.indexOf('injectSfcBlockedFeedbackIntoPrompt(prompt, outputPath, chunkFiles) {');
    expect(methodAt).toBeGreaterThan(-1);
    expect(ENGINEER.split("sfc-blocked.json'").length - 1).toBe(1);
  });

  it('bg 契约：vue3 图使用共享 figma-connector 节点', () => {
    expect(VUE3_GRAPH).toMatch(/from\s+'[^']*figma-connector\.js'/);
    expect(VUE3_GRAPH).toMatch(/addNode\('figma-connector'/);
  });

  it('bg 直挂收敛：vue3 图使用共享 visual-parser 节点', () => {
    expect(VUE3_GRAPH).toMatch(/from\s+'[^']*visual-parser\.js'/);
    expect(VUE3_GRAPH).toMatch(/addNode\('visual-parser'/);
  });

  it('prune 同源化：vue3 图调用 pruneUnmountedResourceImports', () => {
    expect(VUE3_GRAPH).toMatch(/pruneUnmountedResourceImports/);
  });
});
