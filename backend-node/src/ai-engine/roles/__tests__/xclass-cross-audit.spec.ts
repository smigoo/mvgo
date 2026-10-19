/**
 * 🎯 T-②/D-③（2026-10-19 · c-a579d-6a579df0 实锤）：模板类 ↔ 样式规则跨前缀交叉审计。
 *
 * 事故：产物三套前缀家族并存（规范 c-a579d- / 自造 c-6a579d- / antd 接管 c-component-antd-*），
 *   CLASS-MUST-EXIST / NO-NEW-RENAME-CLASS 只认规范前缀 ⇒ 双向门禁空转，两个真缺陷零告警：
 *   ① 模板 label 类 c-component-antd-form-item-label-text 样式侧零规则（深色下文字不可读）；
 *   ② .dark .c-6a579d-form-label { color:#fff } 模板零引用（正确颜色规则成死码）。
 *
 * 治本：auditTemplateStyleClassCrossRef 前缀无关交叉审计（只报不改，reportOnly），
 *   挂 validateClassNames 尾部，独立计数（不进 fallback、不混 mismatch 门禁）。
 */
// 🔴 backend-root.js 顶层 `const __filename`（import.meta 派生）在 ts-jest CJS 包装器下
//   必撞名 ⇒ 链上任何模块加载它都会整套件 0 运行。工厂 mock（既有惯例）。
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
    distDir: `${root}/dist`,
    srcDir: `${root}/src`,
  };
});

import {
  auditTemplateStyleClassCrossRef,
  validateClassNames,
} from '../microcode/code-validator.js';

// 真机形态复刻（c-a579d-6a579df0）：三套前缀家族 + label 类零规则 + 孤儿 form-label 规则
const DRIFT_FILES: Record<string, string> = {
  'package/index.vue': `<template>
  <div class="c-6a579d-slot-con">
    <div class="c-6a579d-frame">
      <div class="c-component-antd-form-item">
        <label class="c-component-antd-form-item-label-text">设备名称</label>
        <a-input class="c-component-antd-input" />
      </div>
      <div class="c-6a579d-content">正文</div>
    </div>
  </div>
</template>`,
  'resources/styles/common.less': `.c-6a579d-slot-con { color: @color-text-base; }
.c-6a579d-frame { display: flex; }
.c-6a579d-content { color: @color-text-base; }
.c-6a579d-form-label { color: @color-text-base; }
.c-component-antd-form-item { display: flex; }
.c-component-antd-input { width: 100%; }
`,
};

describe('auditTemplateStyleClassCrossRef（跨前缀交叉审计）', () => {
  it('① XCLASS-001：模板 label 类零规则被逮（既有门禁判据域外）', () => {
    const { warnings } = auditTemplateStyleClassCrossRef(DRIFT_FILES, { prefixId: 'c-a579d' });
    const hit = warnings.filter((w: any) => w.gate === 'XCLASS-001');
    expect(hit.map((w: any) => w.className)).toContain('c-component-antd-form-item-label-text');
    // 有规则的类不误报
    expect(hit.map((w: any) => w.className)).not.toContain('c-component-antd-form-item');
    expect(hit.map((w: any) => w.className)).not.toContain('c-6a579d-content');
  });

  it('② XCLASS-002：孤儿规则 .c-6a579d-form-label 被逮（边界匹配防长类名假命中）', () => {
    const { warnings } = auditTemplateStyleClassCrossRef(DRIFT_FILES, { prefixId: 'c-a579d' });
    const hit = warnings.filter((w: any) => w.gate === 'XCLASS-002');
    expect(hit.map((w: any) => w.className)).toContain('c-6a579d-form-label');
    // 模板真实引用的规则不误报
    expect(hit.map((w: any) => w.className)).not.toContain('c-6a579d-slot-con');
    expect(hit.map((w: any) => w.className)).not.toContain('c-component-antd-input');
  });

  it('③ XCLASS-003：两套非规范前缀家族各报一条（c-6a579d / c-component）', () => {
    const { warnings } = auditTemplateStyleClassCrossRef(DRIFT_FILES, { prefixId: 'c-a579d' });
    const fams = warnings.filter((w: any) => w.gate === 'XCLASS-003').map((w: any) => w.className);
    expect(fams).toContain('c-6a579d');
    expect(fams).toContain('c-component');
  });

  it('④ 干净组件（规范前缀双向闭环）零告警', () => {
    const clean: Record<string, string> = {
      'package/index.vue': `<template>
  <div class="c-x-root">
    <div class="c-x-item" :class="{ 'c-x-item--active': on }">A</div>
  </div>
</template>`,
      'resources/styles/common.less': `.c-x-root { display: flex; }
.c-x-item { color: @color-text-base; }
.c-x-item--active { color: @color-primary; }
`,
    };
    const { warnings } = auditTemplateStyleClassCrossRef(clean, { prefixId: 'c-x' });
    expect(warnings).toHaveLength(0);
  });

  it('⑤ --state 动态拼接豁免：模板 c-x-item + 样式仅 --active 规则不报 001/002', () => {
    const files: Record<string, string> = {
      'package/index.vue': `<template><div class="c-x-item" :class="{ 'c-x-item--active': on }">A</div></template>`,
      'resources/styles/common.less': `.c-x-item--active { color: @color-primary; }\n`,
    };
    const { warnings } = auditTemplateStyleClassCrossRef(files, { prefixId: 'c-x' });
    expect(warnings.filter((w: any) => w.gate === 'XCLASS-001')).toHaveLength(0);
    expect(warnings.filter((w: any) => w.gate === 'XCLASS-002')).toHaveLength(0);
  });

  it('⑥ XCLASS-004：a-form-item 接管但无 label 颜色声明 ⇒ 报；补声明后 ⇒ 不报', () => {
    const noColor: Record<string, string> = {
      'package/index.vue': `<template><a-form-item label="名称"><a-input /></a-form-item></template>`,
      'resources/styles/common.less': `.c-x-form { width: 100%; }\n`,
    };
    const withColor: Record<string, string> = {
      'package/index.vue': noColor['package/index.vue'],
      'resources/styles/common.less': `.c-x-form { width: 100%; }\n.c-x-form .ant-form-item-label { color: @color-text-base; }\n`,
    };
    expect(
      auditTemplateStyleClassCrossRef(noColor, { prefixId: 'c-x' })
        .warnings.filter((w: any) => w.gate === 'XCLASS-004'),
    ).toHaveLength(1);
    expect(
      auditTemplateStyleClassCrossRef(withColor, { prefixId: 'c-x' })
        .warnings.filter((w: any) => w.gate === 'XCLASS-004'),
    ).toHaveLength(0);
  });

  it('⑦ 空输入/无样式 fail-open 零告警', () => {
    expect(auditTemplateStyleClassCrossRef({}, {}).warnings).toHaveLength(0);
    expect(
      auditTemplateStyleClassCrossRef({ 'package/index.vue': '<template><div/></template>' }, {}).warnings,
    ).toHaveLength(0);
  });

  it('⑧ 集成：validateClassNames 透出 crossRefWarnings（独立于 mismatch 计数）', () => {
    const r: any = validateClassNames(DRIFT_FILES, 'c-a579d-6a579df0', null, null, {});
    // 既有双向门禁只认 c-a579d- 前缀 ⇒ 该产物上 mismatches 应为空（空转实锤）
    expect(r.mismatches).toHaveLength(0);
    const gates = new Set((r.crossRefWarnings || []).map((w: any) => w.gate));
    expect(gates).toContain('XCLASS-001');
    expect(gates).toContain('XCLASS-002');
    expect(gates).toContain('XCLASS-003');
    // reportOnly 标记：消费端据此与门禁级 mismatch 区分
    expect((r.crossRefWarnings || []).every((w: any) => w.reportOnly === true)).toBe(true);
  });
});
