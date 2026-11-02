/**
 * R8-2 透明容器臆造背景：WARN 审计升级为确定性修复（2026-11-02 · mc-max-1793607696780-50d7793f 实锤立项）
 *
 * 病灶：LLM chunk 给 section 宿主类臆造「卡片壳」（background: @color-card-bg + border +
 *   border-radius），设计稿真值 fills=[]（底色应由宿主透出）。既有 TRANSPARENT-CONTAINER-BG
 *   守卫（2026-10-20 · 5ef650ff）**检测到了但只 WARN 留痕不修**（注释「只报不改」）⇒ 三张
 *   臆造卡壳直接落盘（用户实拍截图：UI 上没有的三张白卡）。
 *
 * R8-2（评审定案的收窄刀口）：
 *   · 只确定性剥除透明容器宿主类规则块顶层的 `background(-color): X;` 声明；
 *   · **border / border-radius 本刀不碰**（真值源是 strokes/cornerRadius，越权即重蹈
 *     「按单加守卫」覆辙），挂观测；
 *   · 审计留痕（summary.transparentContainerBg + meta failOpen WARN）全部保留，
 *     新增 `summary.transparentContainerBgHealed` 修复计数（计数行铁律：0 也必须出现，
 *     summary 固定形状显式初始化）。
 *
 * 阳性对照：50d7793f 三件套卡壳复刻（当前漏修）。
 * 变异对照：摘修复（回退 WARN-only）⇒ ① 必红（background 残留落盘）。
 */
// 🚨 与 pre-write-self-healing.spec.ts 同口径：import 链经 techstack-tag-enforcer →
//    element-coverage-validator → logger → config/backend-root.js（import.meta.url，
//    jest CJS 报 `Identifier '__filename' has already been declared`）⇒ virtual mock 掉。
jest.mock('../../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
  chatAttachmentsDir: process.cwd() + '/temp-chat-attachments',
  apifoxZipsDir: process.cwd() + '/data/apifox-zips',
  apiCatalogsDir: process.cwd() + '/data/api-catalogs',
  resolveFrontendWorkspacePath: () => process.cwd(),
  frontendCustomComponentsDir: () => process.cwd(),
  frontendVue3ComponentsDir: () => process.cwd(),
}), { virtual: true });
import { runPreWriteSelfHealing } from '../pre-write-self-healing.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  log: () => {},
};

/** 50d7793f 宿主类三件套复刻（background + border + radius；本刀只剥 background） */
function makeFiles() {
  return {
    'package/index.vue':
      '<template><div class="c-device-content-header" data-section-id="801:3"><span/></div></template>',
    'package/components/ContentHeader.vue':
      '<template><div class="c-device-content-header" data-section-id="801:3"><span/></div></template>\n<style lang="less" scoped>\n.c-device-content-header { color: #333; }\n</style>',
    'resources/styles/common.less': `.c-device-content-header {
  width: 100%;
  display: flex;
  background: @color-card-bg;
  border: 1px solid @color-card-border;
  border-radius: @border-radius-base;
  padding: 16px;
}`,
  };
}

const CTX = () => ({
  layoutStructure: {
    transparentContainerTruth: { transparentIds: ['801:3'], total: 3 },
  },
});

describe('R8-2 透明容器臆造背景修复化（50d7793f 实锤）', () => {
  it('① 阳性：透明容器宿主类的 background 被确定性剥除，border/radius 保留', () => {
    const files = makeFiles();
    const { files: out, summary } = runPreWriteSelfHealing(files, CTX() as any, { logger: noopLogger as any });
    const less = out['resources/styles/common.less'];
    expect(less).toBeDefined();
    expect(less).not.toMatch(/background\s*:\s*@color-card-bg/);
    // 收窄刀口断言：本刀不碰 border / border-radius（评审定案：真值源不同，越权即按单加守卫）
    expect(less).toContain('border: 1px solid @color-card-border');
    expect(less).toContain('border-radius: @border-radius-base');
    // 其余声明不扰
    expect(less).toContain('padding: 16px');
    expect(less).toContain('display: flex');
    // 修复计数 + 审计留痕并存
    expect(summary.transparentContainerBgHealed).toBe(1);
    expect(Array.isArray(summary.transparentContainerBg)).toBe(true);
  });

  it('② background-color 形态同样剥除', () => {
    const { files: out, summary } = runPreWriteSelfHealing(
      {
        'package/index.vue': '<template><div class="c-x-root" data-section-id="38:3134"/></template>',
        'package/common.less': '.c-x-root { background-color: #fff; padding: 8px; }',
      },
      {
        layoutStructure: {
          transparentContainerTruth: { transparentIds: ['38:3134'], total: 1 },
        },
      } as any,
      { logger: noopLogger as any },
    );
    expect(out['package/common.less']).not.toMatch(/background-color\s*:\s*#fff/);
    expect(out['package/common.less']).toContain('padding: 8px');
    expect(summary.transparentContainerBgHealed).toBe(1);
  });

  it('③ 阴性（回归保护）：非透明容器（无真值）background 逐字不动', () => {
    const files = {
      'package/index.vue': '<template><div class="c-x-root" data-section-id="38:3134"/></template>',
      'package/common.less': '.c-x-root { background: #1f1f1f; }',
    };
    const { files: out, summary } = runPreWriteSelfHealing(files, {} as any, { logger: noopLogger as any });
    expect(out['package/common.less']).toContain('background: #1f1f1f');
    expect(summary.transparentContainerBgHealed).toBe(0);
  });

  it('④ 阴性：background: transparent 不剥不计数（既有行为逐字不变）', () => {
    const { files: out, summary } = runPreWriteSelfHealing(
      {
        'package/index.vue': '<template><div class="c-x-root" data-section-id="38:3134"/></template>',
        'package/common.less': '.c-x-root { background: transparent; }',
      },
      {
        layoutStructure: {
          transparentContainerTruth: { transparentIds: ['38:3134'], total: 1 },
        },
      } as any,
      { logger: noopLogger as any },
    );
    expect(out['package/common.less']).toContain('background: transparent');
    expect(summary.transparentContainerBgHealed).toBe(0);
  });

  it('⑤ 计数行恒在：无真值 ⇒ transparentContainerBgHealed 恒 0（0 也必须出现）', () => {
    const { summary } = runPreWriteSelfHealing(
      { 'package/common.less': '.a { color: red; }' },
      {} as any,
      { logger: noopLogger as any },
    );
    expect(summary.transparentContainerBgHealed).toBe(0);
  });

  it('⑥ meta 留痕：修复后 failOpen WARN 事件仍写入（审计与修复并存）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r82-tc-'));
    try {
      runPreWriteSelfHealing(makeFiles(), { ...CTX(), outputPath: dir } as any, { logger: noopLogger as any });
      const metaPath = join(dir, 'component-meta.json');
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        expect(
          (meta.failOpenEvents || []).some(
            (e: any) => e.rule === 'TRANSPARENT-CONTAINER-BG' && e.severity === 'WARN',
          ),
        ).toBe(true);
      }
      // meta 写入为 best-effort（无 outputPath 时跳过），存在则必含留痕
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
