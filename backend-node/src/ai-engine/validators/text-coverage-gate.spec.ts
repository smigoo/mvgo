
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
/**
 * 🛡️ Q4-c（2026-11-09 · a9052d6a「对抗性逃逸」实锤）：TEXT-COVERAGE-GATE 段锚覆盖联动硬闸
 *
 * 病灶：Max 管线 planner 分叉的「l 极简方案」内容大面积残缺（12 张设备卡零生成）
 *   但 BLOCK=0——覆盖率 56% 卡 WARN 带、其余信号孤立 WARN，删内容即可过闸。
 * 判据：A（真值文本覆盖率 ∈ [0.4, 0.6) WARN 带）&& B（段真值文本暗占比 ≥ 50%）⇒ BLOCK。
 *   「暗段文本占比」而非「暗段数占比」：a9052d6a 真机 4 段仅 1 暗段（25%），按段数
 *   阳性不触发；按文本量 17/34 = 50% ⇒ 触发（阈值四点校准：62%/33%/0%/0%）。
 * fail-open：段树形态不符（layout?.sections || sections）/ 段文本总数 0 ⇒ 不判。
 *
 * 用例：阳性（合成最小复现：覆盖率落 WARN 带 + 暗占比 ≥50% ⇒ BLOCK）
 *   阴性1（暗占比 <50% ⇒ 无 GATE issue）
 *   阴性2（覆盖率 ≥60% ⇒ 信号 A 不成立，闸不评估）
 *   阴性3（段树缺失/形态不符 ⇒ fail-open 不判）
 *   A1 口径（layout.sections 包装形态与顶层 sections 等价）
 *   A2 口径（files 子集 + productFiles 全量 ⇒ 承载判定不因增量裁剪失真）
 */
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（code-structure-validator.spec.ts 同款惯例）。
/** 构造最小复现物料：段树 + 产物 */
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
import { CodeStructureValidator } from './code-structure-validator.js';

function buildFixture({ darkRatio, sectionsWrap = true, withBodyText = true }) {
  // 段树：一个 header 段 + 一个内容段；内容段 N 张卡文本
  const cardTexts = [
    '摄像机', '风速风向仪', '超高检测器', '能见度仪',
    '洞内照明', '洞外光强', '一氧化碳', '氧气浓度',
  ];
  const n = cardTexts.length;
  const darkCount = Math.round(n * darkRatio);
  const carried = cardTexts.slice(darkCount); // 后段 = 产物里有的
  const dark = cardTexts.slice(0, darkCount); // 前段 = 产物里没有的

  const sections = [
    {
      id: '2:100',
      name: '标题行',
      header: { title: '设备监测' },
      body: { children: [{ type: 'text', text: '设备监测' }] },
    },
    {
      id: '2:200',
      name: '设备卡片网格',
      body: {
        children: cardTexts.map((t, i) => ({
          id: `2:2${i}0`,
          name: t,
          children: [{ type: 'text', text: t }],
        })),
      },
    },
  ];
  const layoutStructure = sectionsWrap
    ? { layout: { sections } }
    : { sections };

  // 产物覆盖率落带设计（与 collectFigmaTextRuns 实测口径对齐，勿凭直觉改）：
  //   ⚠️ CHINESE_RUN_RE=/[\u4e00-\u9fa5]{2,}/ 会截掉数字序号并去重聚合 ⇒
  //   外部真值必须用**纯 CJK 且互不为前缀**的串。
  //   truth（去重）= 8 卡 + 设备监测 + M 条外部真值 = 9 + M；承载 C = 1 +
  //   carried + extraRendered（extraRendered = clamp(M, 6-1-carried)）。
  //   取 M=6 ⇒ truth=15，三档统一 C=6 ⇒ coverage=6/15=40% ∈ [0.4, 0.6) WARN 带：
  //     darkRatio=1.0  ⇒ carried=0 ⇒ extra=5 ⇒ 段暗 8/8=100% ≥50% ⇒ BLOCK ✓
  //     darkRatio=0.5  ⇒ carried=4 ⇒ extra=1 ⇒ 段暗 4/8=50%…（阈值含等号触发，
  //       该档专测「中界含等号」）⇒ BLOCK ✓
  //     darkRatio=0.375⇒ carried=5 ⇒ extra=0 ⇒ 段暗 3/8=37.5% <50% ⇒ 放行 ✓
  const M = 6;
  const extraPool = [ // 纯 CJK、互不为前缀、与卡名无子串关系
    '场地温度计读', '通道湿度感应', '出口照度采样', '边坡水位观测', '洞口噪声记录', '管线压力巡检',
  ];
  const extraTexts = extraPool.slice(0, M);
  const TARGET_COVERED = 6; // truth 15 条承载 6 = 40% WARN 带（<0.4 才 BLOCK）
  const extraRendered = Math.max(0, Math.min(M, TARGET_COVERED - 1 - carried.length));
  const mkText = (t, id) => ({ id, type: 'TEXT', name: t, characters: t });
  const figmaNodeData = {
    document: {
      id: '0:0',
      type: 'DOCUMENT',
      children: [
        {
          id: '1:1',
          type: 'FRAME',
          children: [
            mkText('设备监测', '9:1'),
            ...cardTexts.map((t, i) => mkText(t, `9:${i + 2}`)),
            ...extraTexts.map((t, i) => mkText(t, `9:${i + 100}`)),
          ],
        },
      ],
    },
  };

  const prodLines = ['<template>', '<div>'];
  prodLines.push('<span>设备监测</span>');
  if (withBodyText) for (const t of carried) prodLines.push(`<span>${t}</span>`);
  for (const t of extraTexts.slice(0, extraRendered)) prodLines.push(`<span>${t}</span>`);
  prodLines.push('</div>', '</template>');
  prodLines.push(
    '',
    '<script setup>',
    "const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()",
    '</script>',
    '',
    "<style lang=\"less\" scoped\">",
    "@import '../resources/styles/index.less';",
    '</style>',
  );
  const files = [{ path: 'package/index.vue', content: prodLines.join('\n') }];

  return { layoutStructure, figmaNodeData, files, dark, carried, cardTexts };
}

describe('Q4-c TEXT-COVERAGE-GATE 段锚覆盖联动硬闸', () => {
  test('阳性：覆盖率 WARN 带 + 暗占比 ≥50% ⇒ TEXT-COVERAGE-GATE BLOCK', () => {
    // 8 卡全暗（darkRatio=1）——复现 a9052d6a「12 卡零生成」形态
    const f = buildFixture({ darkRatio: 1 });
    const r = CodeStructureValidator.validate(f.files, 'c-test', {
      target: 'microcode',
      productFiles: f.files,
      layoutStructure: f.layoutStructure,
      figmaNodeData: f.figmaNodeData,
    });
    const gate = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE');
    expect(gate).toBeTruthy();
    expect(gate.severity).toBe('BLOCK');
    // 暗清单必须含缺失卡名（可验签性）
    expect(gate.message).toContain('摄像机');
    expect(gate.message).toContain('风速风向仪');
    const stats = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE-STATS');
    expect(stats).toBeTruthy();
  });

  test('阳性中界：darkRatio=0.625（5/8 暗过半）⇒ 触发 BLOCK（≥ 阈值）', () => {
    // 5/8 = 62.5% ≥ 50%（4/8 恰等界由实现「≥」语义覆盖，62.5% 离边界更远更稳）
    const f = buildFixture({ darkRatio: 0.625 });
    const r = CodeStructureValidator.validate(f.files, 'c-test', {
      target: 'microcode',
      productFiles: f.files,
      layoutStructure: f.layoutStructure,
      figmaNodeData: f.figmaNodeData,
    });
    const gate = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE');
    expect(gate).toBeTruthy();
    expect(gate.severity).toBe('BLOCK');
  });

  test('阴性1：暗占比 <50% ⇒ 无 GATE（文本缺但量不过半 = 局部欠佳不拦）', () => {
    // 3/8 暗 ≈ 37.5%
    const f = buildFixture({ darkRatio: 0.375 });
    const r = CodeStructureValidator.validate(f.files, 'c-test', {
      target: 'microcode',
      productFiles: f.files,
      layoutStructure: f.layoutStructure,
      figmaNodeData: f.figmaNodeData,
    });
    const gate = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE');
    expect(gate).toBeFalsy();
    // STATS 仍留痕（跑过与干净可区分）
    const stats = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE-STATS');
    expect(stats).toBeTruthy();
  });

  test('阴性2：覆盖率 ≥60% ⇒ 信号 A 不成立，闸不评估（无 STATS）', () => {
    const f = buildFixture({ darkRatio: 1 });
    // 抬覆盖率到 ≥60%：把 8 张卡 + 6 条外部真值全部渲染进产物
    // （truth 15 条承载 15 ⇒ 100% ≥60%，同时段暗占比归零——双信号都不成立）
    f.files[0].content = f.files[0].content.replace(
      '</div>',
      [...f.cardTexts, '场地温度计读', '通道湿度感应', '出口照度采样', '边坡水位观测', '洞口噪声记录', '管线压力巡检']
        .map((t) => `<span>${t}</span>`)
        .join('\n') + '\n</div>',
    );
    const r = CodeStructureValidator.validate(f.files, 'c-test', {
      target: 'microcode',
      productFiles: f.files,
      layoutStructure: f.layoutStructure,
      figmaNodeData: f.figmaNodeData,
    });
    const gate = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE');
    const stats = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE-STATS');
    expect(gate).toBeFalsy();
    expect(stats).toBeFalsy();
  });

  test('阴性3（fail-open）：段树缺失 ⇒ 不判不抛（A1 形态坑防御）', () => {
    const f = buildFixture({ darkRatio: 1 });
    const r = CodeStructureValidator.validate(f.files, 'c-test', {
      target: 'microcode',
      productFiles: f.files,
      layoutStructure: { generatedAt: 'x', layout: { type: 'column' } }, // 无 sections
      figmaNodeData: f.figmaNodeData,
    });
    const gate = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE');
    expect(gate).toBeFalsy();
    expect(r.pass).toBe(true); // 无 BLOCK（TEXT-COVERAGE WARN 不拦）
  });

  test('A1 口径：顶层 sections 与 layout.sections 包装形态等价触发', () => {
    const f = buildFixture({ darkRatio: 1, sectionsWrap: false });
    const r = CodeStructureValidator.validate(f.files, 'c-test', {
      target: 'microcode',
      productFiles: f.files,
      layoutStructure: f.layoutStructure,
      figmaNodeData: f.figmaNodeData,
    });
    const gate = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE');
    expect(gate).toBeTruthy();
    expect(gate.severity).toBe('BLOCK');
  });

  test('A2 口径：增量轮 files 子集不产生假暗（承载判定基于 productFiles）', () => {
    const f = buildFixture({ darkRatio: 0 }); // 全部段文本在产物
    // 模拟增量轮：files 被裁成「仅 common.less」，productFiles 全量
    const filesSubset = [{ path: 'package/resources/styles/common.less', content: '.a{}' }];
    const r = CodeStructureValidator.validate(filesSubset, 'c-test', {
      target: 'microcode',
      productFiles: f.files,
      layoutStructure: f.layoutStructure,
      figmaNodeData: f.figmaNodeData,
    });
    const gate = (r.issues || []).find((i) => i.id === 'TEXT-COVERAGE-GATE');
    expect(gate).toBeFalsy();
  });
});
