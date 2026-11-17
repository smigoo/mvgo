/**
 * 🛡️ 2026-11-17 路线 A：VISUAL-002 判据 alpha 合成口径修复 · 结构性阴阳对照
 *   方案：docs/2026-11-17-UI还原度判据缺陷诊断-执行拦截.md（路线 A）
 *
 * 根因：旧实现 `removeAlpha()` 直接丢弃 alpha 通道、保留半透明像素原始 RGB。
 *   设计稿 Figma 预览图带大面积半透明背景，产物是浏览器截图（实色无 alpha）。
 *   实证「设计稿按白底完美渲染」vs「removeAlpha 设计稿」仅 0.6602（应 pass 却 block）。
 *
 * 说明：判据本体 `await import('sharp')` 动态导入在 jest CJS 环境需 --experimental-vm-modules
 *   才能真实执行（否则被 catch 吞成 score=0），与既有 VISUAL-002 系列 spec 同一约束，
 *   故沿用项目约定采用**源码结构断言**：只读文本，不复用改者正则，不加载重依赖。
 *   行为级阴阳对照（完美渲染=1.0 / 纯黑vs纯白=0.0）由独立可复现 node 脚本实证，
 *   记录在 docs/2026-11-17-UI还原度判据缺陷诊断-执行拦截.md §六 与交付说明。
 *
 * 覆盖：口径替换 / 合成底色单一事实源 / 阈值未放水 / no-op 安全性 / 早退分支未动。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../render-fidelity-gate.js'), 'utf8');
const at = (needle: string) => SRC.indexOf(needle);
/** 去掉整行注释，只留可执行代码 —— 防止注释提及旧符号造成假阳性/假阴性 */
const CODE = SRC.split('\n')
  .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
  .join('\n');

describe('VISUAL-002 alpha 合成口径修复 · 结构断言', () => {
  it('⭐ 阳性（核心）：亮度直方图入口用 flatten(白底) 替代 removeAlpha', () => {
    // 可执行代码里不得残留 removeAlpha
    expect(CODE).not.toMatch(/removeAlpha\s*\(/);
    // 必须走 flatten 且底色来自单一常量
    expect(CODE).toContain('.flatten({ background: COMPOSITE_BACKGROUND })');
    expect(at('.flatten({ background: COMPOSITE_BACKGROUND })')).toBeGreaterThan(-1);
  });

  it('⭐ 阳性：合成底色是单一事实源，值为白（浏览器渲染自然口径）', () => {
    expect((CODE.match(/COMPOSITE_BACKGROUND\s*=/g) || []).length).toBe(1);
    expect(CODE).toContain("const COMPOSITE_BACKGROUND = '#ffffff'");
  });

  it('⭐ 阳性（no-op 安全）：flatten 只影响带 alpha 图；注释记录了不误伤产物的判据', () => {
    // 文档化判据必须在头注释留痕（可辩驳性）
    expect(SRC).toContain('逐字节 no-op');
    expect(SRC).toContain('0.6602');
    expect(SRC).toContain('1.0000');
  });

  it('阴性防放水：阈值定义未改（PASS=0.85 / WARN=0.6）', () => {
    expect(SRC).toContain('PASS: 0.85');
    expect(SRC).toContain('WARN: 0.6');
    expect(CODE).not.toMatch(/FIDELITY_THRESHOLDS.*(0\.9|0\.95|1\.0)/);
  });

  it('阴性防误伤：早退分支（文件不存在 → 0/block）与 diff/score 计算未动', () => {
    expect(CODE).toContain("error: 'rendered not found'");
    expect(CODE).toContain("error: 'design not found'");
    expect(CODE).toContain('const diff = histogramL1(renderedHist, designHist)');
    expect(CODE).toContain('const score = 1 - diff');
    expect(CODE).toContain('FIDELITY_VERDICTS.BLOCK');
  });

  it('阴性防误伤：改动范围限定在直方图采图函数，不触碰调用点/判定阈值分档', () => {
    // 判定分档三行原样
    expect(CODE).toContain('if (score >= FIDELITY_THRESHOLDS.PASS) verdict = FIDELITY_VERDICTS.PASS');
    expect(CODE).toContain('else if (score >= FIDELITY_THRESHOLDS.WARN) verdict = FIDELITY_VERDICTS.WARN');
    // 仍是对两张图调用同一个直方图函数（口径对称）
    expect((CODE.match(/blockLuminanceHistogram\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
