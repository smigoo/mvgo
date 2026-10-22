/**
 * 🛡️ 刀 53 配套单测（2026-10-22 round-11 实锤）：确定性接管类的命名空间
 * `c-{sem}-fg-{header|grid}-{idSlug}` **不得进入样式 chunk 的类清单**。
 *
 * 病灶：样式 chunk 的「模板类硬约束」清单来自 extractTemplateClassNames；fg- 类
 * 一旦进清单，LLM 会为它们编造规则（`justify-content:space-between`、header 混入
 * 卡片底色），经 workspace 编译的 index.css 全量生效 ⇒ 内联没钉到的属性被它赢。
 *
 * 单一来源：过滤点在 extractTemplateClassNames **出口**统一执行（不逐处副本）。
 */
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（code-validator.class-gates 同款惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { extractTemplateClassNames } from './code-validator.js';

const files = {
  'package/index.vue':
    '<template><div class="c-demo-slot-con"><HeaderText /><CardGridList /></div></template>',
  // 刀 53 确定性产物形态
  'package/components/HeaderText.vue':
    '<template><div class="c-demo-fg-header-383137tailtext"><img class="c-demo-fg-header-383137tailtext-icon"><span class="c-demo-fg-header-383137tailtext-title">{{ title }}</span></div></template>',
  'package/components/CardGridList.vue':
    '<template><div class="c-demo-fg-grid-383167list"><div class="c-demo-fg-grid-383167list-card"></div></div></template>',
  // 普通 LLM 类必须在清单里（阳性对照，证明不是「全过滤」）
  'package/components/Other.vue':
    '<template><div class="c-demo-card-item"></div></template>',
};

describe('extractTemplateClassNames · 刀 53 命名空间排除', () => {
  it('阴性：fg-header/fg-grid 类不进清单', () => {
    const { fullList } = extractTemplateClassNames(files, 'demo', {});
    expect(fullList.some((c) => c.includes('-fg-header-'))).toBe(false);
    expect(fullList.some((c) => c.includes('-fg-grid-'))).toBe(false);
  });

  it('阳性对照：非 fg- 类照常进清单', () => {
    const { fullList } = extractTemplateClassNames(files, 'demo', {});
    expect(fullList).toContain('c-demo-slot-con');
    expect(fullList).toContain('c-demo-card-item');
  });
});
