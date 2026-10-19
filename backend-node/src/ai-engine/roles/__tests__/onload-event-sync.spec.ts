/**
 * 🛡️ onload 事件名同源 + businessEvents kebab 门禁（2026-10-19，c-a579d-6a579df0 实锤）
 *
 * 事故：产物 declare.json 双 onload 并存（'c-a579d-onload' 规范 + '6a579d-onload' 违规），
 *   mc-check M3-3 判 error（'6a579d-onload' 数字开头不符合 kebab）。
 *
 * 根因（对抗循环）：
 *   - normalizeDeclareJson 的 strayOnloadKeys 折叠先把 '6a579d-onload' 删掉 ✅；
 *   - 紧接着 code-validator 的 alignEvents ③ 因**代码 publishEvent 用的是非规范短名**，
 *     把它当「无关新事件」**回填** declare ⇒ 折叠删一条、回填加一条，恒双 onload。
 *
 * 治本（A，code-validator#syncOnloadEventLiterals）：以 declare 规范槽为单一事实源——
 *   代码字面量确定性改写为规范名，非规范短名从事件集合移除（杜绝回填路径）。
 * 防御（B，component-naming#normalizeBusinessEventKeys，normalizeDeclareJson 调用）：
 *   businessEvents 键必须合法 kebab，违规 ⇒ 确定性改名 'c-' + slug 化。
 *
 * ⚠️ spec 不走 validateAndFixGeneratedFiles 主入口：其一内部有 `await import(...)`
 *   （jest CJS 沙箱禁动态 import 天堑），其二 import 链会拉进 backend-root 的
 *   `const __filename`（ts-jest CJS 包装器撞名）。两个被测目标都抽成了轻链纯函数。
 */
// 🔴 backend-root.js 顶层 `const __filename = fileURLToPath(import.meta.url)` 在 ts-jest
//   CJS 模块包装器下必撞名 ⇒ 链上任何模块加载它都会整套件 0 运行。工厂 mock（既有惯例）。
jest.mock('../../../config/backend-root.js', () => {
  const root = '/Users/smigoo/工作/mvgo/backend-node';
  return {
    backendRoot: root,
    projectRoot: '/Users/smigoo/工作/mvgo',
    workspaceRoot: `${root}/workspace`,
    customComponentsDir: `${root}/workspace/custom-components`,
    vue3ComponentsDir: `${root}/workspace/vue3-components`,
    resolveFrontendWorkspacePath: () => '/Users/smigoo/工作/mvgo/frontend/workspace',
    frontendCustomComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
    frontendVue3ComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/vue3-components',
    tempComponentsDir: '/Users/smigoo/工作/mvgo/temp-components',
    dataDir: `${root}/data`,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: `${root}/config`,
    chatAttachmentsDir: `${root}/temp-chat-attachments`,
    apifoxZipsDir: `${root}/data/apifox-zips`,
    apiCatalogsDir: `${root}/data/api-catalogs`,
  };
});

import { normalizeBusinessEventKeys } from '../../utils/component-naming.js';
import { syncOnloadEventLiterals } from '../microcode/code-validator.js';

const VUE_WITH_STRAY = `<template><div class="c-a579d-root"></div></template>
<script setup>
const { runtimeBuilder } = $mcComponentBuilder()
onMounted(() => {
  runtimeBuilder.publishEvent('6a579d-onload', { componentId: '6a579d', timestamp: Date.now() })
})
</script>`;

function mkCase() {
  const files: Record<string, string> = { 'package/index.vue': VUE_WITH_STRAY };
  const fixedFiles: Record<string, string> = {};
  const publishEvents = new Set(['6a579d-onload']);
  const listenEvents = new Set<string>();
  const fixes: string[] = [];
  const businessEvents = {
    'c-a579d-onload': { eventId: 'c-a579d-onload', eventName: '组件加载完成' },
  };
  return { files, fixedFiles, publishEvents, listenEvents, fixes, businessEvents };
}

describe('A · syncOnloadEventLiterals（打破折叠↔回填对抗循环）', () => {
  it('代码 publishEvent 短名被改写为 declare 规范槽名，并从事件集合移除（杜绝回填）', () => {
    const c = mkCase();
    syncOnloadEventLiterals(c);
    const vue = c.files['package/index.vue']!;
    expect(vue).toContain("publishEvent('c-a579d-onload'"); // 改写到位
    expect(vue).not.toContain("publishEvent('6a579d-onload'"); // 短名消失
    expect(c.fixedFiles['package/index.vue']).toBe(vue); // 落盘 map 同步
    expect(c.publishEvents.has('6a579d-onload')).toBe(false); // 回填路径已断
    expect(c.fixes.some((f) => f.includes("'6a579d-onload' → 'c-a579d-onload'"))).toBe(true);
  });

  it('双引号字面量同样改写（publishEvent("x-onload" / listenEvent）', () => {
    const c = mkCase();
    c.files['package/index.vue'] = `<script setup>
runtimeBuilder.publishEvent("6a579d-onload", {})
runtimeBuilder.listenEvent('6a579d-onload', () => {})
</script>`;
    c.listenEvents.add('6a579d-onload');
    syncOnloadEventLiterals(c);
    const vue = c.files['package/index.vue']!;
    expect(vue).toContain('publishEvent("c-a579d-onload"');
    expect(vue).toContain("listenEvent('c-a579d-onload'");
    expect(vue).not.toContain('6a579d-onload');
  });

  it('代码已用规范名 ⇒ 零改写（不误伤合规产物）', () => {
    const c = mkCase();
    c.files['package/index.vue'] = VUE_WITH_STRAY.replace(
      "publishEvent('6a579d-onload'",
      "publishEvent('c-a579d-onload'",
    );
    c.publishEvents.clear();
    c.publishEvents.add('c-a579d-onload');
    syncOnloadEventLiterals(c);
    expect(c.fixedFiles['package/index.vue']).toBeUndefined(); // 无改动
    expect(c.fixes).toHaveLength(0);
  });

  it('declare 无规范槽 ⇒ 完全不动（fail-open，不臆造规范名）', () => {
    const c = mkCase();
    (c.businessEvents as any) = {};
    syncOnloadEventLiterals(c);
    expect(c.files['package/index.vue']).toBe(VUE_WITH_STRAY);
    expect(c.publishEvents.has('6a579d-onload')).toBe(true);
  });

  it('非 onload 事件名不受影响（只管 -onload 语义）', () => {
    const c = mkCase();
    c.publishEvents.add('btn-click');
    c.files['package/index.vue'] = `<script setup>runtimeBuilder.publishEvent('btn-click', {})</script>`;
    syncOnloadEventLiterals(c);
    expect(c.files['package/index.vue']).toContain("publishEvent('btn-click'");
    expect(c.publishEvents.has('btn-click')).toBe(true);
  });
});

describe('B · normalizeBusinessEventKeys（M3-3 fail-closed，normalizeDeclareJson 调用同一函数）', () => {
  it('数字开头非 kebab 键 ⇒ 改名 c-+slug，eventId 同步', () => {
    const events: any = {
      'c-a579d-onload': { eventId: 'c-a579d-onload', eventName: '组件加载完成' },
      '2btn_Click_Ev': { eventId: '2btn_Click_Ev', eventName: '按钮点击' },
    };
    const r = normalizeBusinessEventKeys(events);
    expect(r.changed).toBe(true);
    expect(Object.keys(r.events)).toEqual(['c-a579d-onload', 'c-2btn-click-ev']);
    expect(r.events['c-2btn-click-ev'].eventId).toBe('c-2btn-click-ev');
  });

  it('改名与已有键碰撞 ⇒ 折叠保留已有键内容（不覆盖规范内容）', () => {
    const events: any = {
      'c-a579d-onload': { eventId: 'c-a579d-onload', eventName: '组件加载完成' },
      'A579D_Onload!': { eventId: 'A579D_Onload!', eventName: '野事件' }, // slug 后 = c-a579d-onload
    };
    const r = normalizeBusinessEventKeys(events);
    expect(Object.keys(r.events)).toEqual(['c-a579d-onload']);
    expect(r.events['c-a579d-onload'].eventName).toBe('组件加载完成');
  });

  it('全部键合法 ⇒ changed=false（幂等，不触发重写）', () => {
    const events: any = { 'btn-click': { eventId: 'btn-click', eventName: 'x' } };
    expect(normalizeBusinessEventKeys(events).changed).toBe(false);
  });

  it('null/数组 ⇒ 原样返回（fail-open 不崩）', () => {
    expect(normalizeBusinessEventKeys(null).changed).toBe(false);
    expect(normalizeBusinessEventKeys([] as never).changed).toBe(false);
  });
});
