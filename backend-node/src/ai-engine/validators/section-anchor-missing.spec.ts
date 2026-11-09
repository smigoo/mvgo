/**
 * 🛡️ S4（2026-11-09 · mc-max-1794233412869-25711e88 实锤）：段锚存在性硬闸
 *
 * 病灶：头部段整段未生成（4 条中文 + 2 个数值 + section 锚全丢），但 TEXT-COVERAGE 仍报 96%
 *   ⇒ Q4-c 只在 coverage<0.6 时评估，整段缺失完全逃逸。
 * 本 spec 锁三点：
 *   ① 阳性：某段文本 ≥2 条且承载率 <50%，且暗段文本量 ≥50% ⇒ SECTION-ANCHOR-MISSING BLOCK
 *   ② 阴性：段文本全部承载 ⇒ 零 BLOCK
 *   ③ 阴性：暗段文本量不足 50%（如 1 条文本的小段）⇒ 不 BLOCK（避免与 G1 布局问题混淆）
 */
jest.mock('../../config/backend-root.js', () => {
  const cwd = process.cwd();
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
  };
}, { virtual: true });

import { CodeStructureValidator } from './code-structure-validator.js';

const secText = (text: string) => ({ type: 'text', text });

/** 构造段树 + 产物语料。carried 决定哪些文案进产物。 */
function buildFixture(opts: { secATexts: string[]; secBTexts: string[]; carried: string[] }) {
  const sections = [
    { id: '1:100', name: 'head', header: { title: '设备监测' }, body: { children: opts.secATexts.map(secText) } },
    { id: '1:200', name: 'grid', body: { children: opts.secBTexts.map(secText) } },
  ];
  const spans = ['设备监测', ...opts.carried].map((t) => `<span>${t}</span>`).join('\n');
  const files = [
    {
      path: 'package/index.vue',
      content: `<template>\n<div class="root">\n${spans}\n</div>\n</template>\n\n<script setup>\nconst { componentProps } = $mcComponentBuilder()\n</script>\n\n<style lang="less" scoped>\n@import '../resources/styles/index.less';\n</style>\n`,
    },
  ];
  // S4 与 Q4-c 同处 TEXT-COVERAGE 的 try 内（figma 真值缺失时整块 fail-open），
  // 故 fixture 提供最小 figma 真值让该 try 正常执行。
  const figmaNodeData = {
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [
        {
          id: '1:1',
          type: 'FRAME',
          children: [{ id: '9:1', type: 'TEXT', characters: '设备监测' }],
        },
      ],
    },
  };
  return { files, layoutStructure: { layout: { sections } }, figmaNodeData };
}

function run(f: ReturnType<typeof buildFixture>) {
  return CodeStructureValidator.validate(f.files as any, 'c-test', {
    target: 'microcode',
    productFiles: f.files as any,
    layoutStructure: f.layoutStructure as any,
    figmaNodeData: f.figmaNodeData as any,
  });
}

describe('S4 · 段锚存在性硬闸', () => {
  it('① 阳性（25711e88 形态）：头段 6 条只承载 1 条 ⇒ BLOCK', () => {
    const f = buildFixture({
      secATexts: ['设备类型', '28', '设备总数', '68562', '完好率', '98%'],
      secBTexts: ['摄像机', '风速风向仪'],
      // 头段只承载「设备监测」（header.title），正文全丢
      carried: ['摄像机', '风速风向仪'],
    });
    const r = run(f);
    const gate = (r.issues || []).find((i: any) => i.id === 'SECTION-ANCHOR-MISSING');
    expect(gate).toBeTruthy();
    expect(gate.severity).toBe('BLOCK');
    expect(String(gate.message)).toContain('1:100');
  });

  it('② 阴性：段文本全部承载 ⇒ 零 BLOCK', () => {
    const all = ['设备类型', '28', '设备总数', '68562', '完好率', '98%', '摄像机', '风速风向仪'];
    const f = buildFixture({
      secATexts: all.slice(0, 6),
      secBTexts: all.slice(6),
      carried: all,
    });
    const r = run(f);
    expect((r.issues || []).some((i: any) => i.id === 'SECTION-ANCHOR-MISSING')).toBe(false);
  });

  it('③ 阴性：暗段文本量不足 50%（小段缺 1 条）⇒ 不 BLOCK（归 G1/布局，不误判内容缺失）', () => {
    const f = buildFixture({
      secATexts: ['设备类型', '28'],
      secBTexts: ['摄像机', '风速风向仪', '超高检测器', '烟道机器人'],
      // 头段 2 条全暗（占比 2/6 = 33% < 50%），但头段文本 ≥2 且承载率 0
      carried: ['摄像机', '风速风向仪', '超高检测器', '烟道机器人'],
    });
    const r = run(f);
    const stats = (r.issues || []).find((i: any) => i.id === 'SECTION-ANCHOR-STATS');
    expect(stats).toBeTruthy();
    // 头段 3 条文本（含 header.title）承载率 33% ⇒ 计为暗段，但总量 3/7=43% < 50% ⇒ 不 BLOCK
    expect((r.issues || []).some((i: any) => i.id === 'SECTION-ANCHOR-MISSING')).toBe(false);
  });

  it('④ fail-open：无 layoutStructure ⇒ 只出 STATS 不出 BLOCK', () => {
    const files = [{ path: 'package/index.vue', content: '<template><div>a</div></template>' }];
    const r = CodeStructureValidator.validate(files as any, 'c-test', {
      target: 'microcode',
      productFiles: files as any,
    });
    expect((r.issues || []).some((i: any) => i.id === 'SECTION-ANCHOR-MISSING')).toBe(false);
  });
});
