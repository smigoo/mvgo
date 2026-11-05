/**
 * 🛡️ 2026-11-05 C3′ → C2：VISUAL-002 门禁 ReferenceError 修复 + 分数观测 + 降级启用
 *   方案：docs/2026-11-05-VISUAL-002门禁ReferenceError根因与G1G2真机验签.md §3.4（C3′）/ §7.5（C2）
 *
 * 背景（真机 `mc-1793861285711-6702353c` 实锤）：
 *   `finalizePreviewResult` 引用 `previewState`(`:760`) 与 `issues`(`:613`)——两者都定义在
 *   `renderViaPreviewPage`，而本函数在 `renderScreenshot`(`:1229`) 内 ⇒ 闭包不可达 ⇒
 *   `compareRenderedVsDesign` 成功后必抛 ReferenceError，被 catch 吞掉 ⇒
 *   `evaluated` 恒 0、**VISUAL-002 自 08-02（commit 8cc3b11）起从未进入 runtimeGate**。
 *
 * C3′（15:0x）：修引用错配 + 只观测（开关 false），3 样本验证零行为变化。
 * **C2（15:1x，用户裁决「继续c2」）：开关 true，VISUAL-002 以 `WARN` 进 gate。**
 *   依据：真机 score `0.4014/0.5303/0.5459`，3/3 `verdict=block`、`renderBroken=0`
 *   ⇒ 真实视觉差异而非渲染失败；若沿用 BLOCK 会经 fallback ⇒ `fail` ⇒ 100% 拒收。
 *
 * 说明：本模块带 Puppeteer 重依赖，直接 import 会挂；沿用 G2 的**源码结构断言**，
 * 只读文本、不加载依赖。注释行在断言前剥离，避免「注释里提到旧符号」被误判为残留引用。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../../roles/screenshot-renderer.js'), 'utf8');
const at = (needle: string) => SRC.indexOf(needle);
/** 去掉整行注释，只留可执行代码 —— 防止注释里的旧符号造成假阳性/假阴性 */
const CODE = SRC.split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('C3′ VISUAL-002 引用错配修复 + 分数观测', () => {
  it('⭐ 阳性：引用错配已修 —— finalizePreviewResult 内不再出现裸 previewState / 裸 issues', () => {
    // 只约束本函数作用域：`previewState` 在 renderViaPreviewPage 内是**正常代码**，不得全文件禁用
    const start = at('const finalizePreviewResult');
    const end = at('if (allowMissingAssetSelfHeal && previewResult.runtimeGate');
    const block = CODE.slice(start, end);
    expect(block.length).toBeGreaterThan(1000);
    expect(block).not.toMatch(/\bpreviewState\b/);
    // `issues` 只允许作为 `result.runtimeGate.issues` 或 `gateIssues` 的形态出现
    expect(block).not.toMatch(/(^|[^.\w])issues\.(some|filter|map|find)\(/m);
  });

  it('⭐ 阳性：renderBroken 续接既有事实源（RUNTIME-004），不新造判据', () => {
    expect(SRC).toContain(
      'const gateIssues = Array.isArray(result?.runtimeGate?.issues) ? result.runtimeGate.issues : []',
    );
    expect(SRC).toContain("const renderBroken = gateIssues.some((i) => i?.id === 'RUNTIME-004')");
    // 位置关系：gateIssues 必须在 compareRenderedVsDesign 之后取（result 已就绪）
    expect(at('const gateIssues = ')).toBeGreaterThan(at('await compareRenderedVsDesign('));
    expect(at('const renderBroken = gateIssues.some')).toBeGreaterThan(at('const gateIssues = '));
  });

  it('⭐ 阳性：C2 —— VISUAL-002 已启用，但两档一律 WARN（不 fail）', () => {
    expect(SRC).toContain('const VISUAL_002_EMIT_ENABLED = true');
    expect(SRC).toContain(
      'if (VISUAL_002_EMIT_ENABLED && fidelity.verdict === FIDELITY_VERDICTS.BLOCK) {',
    );
    expect(SRC).toContain(
      '} else if (VISUAL_002_EMIT_ENABLED && fidelity.verdict === FIDELITY_VERDICTS.WARN) {',
    );
    // 两处 push 都必须在开关守护之下
    const pushes = SRC.match(/id: 'VISUAL-002'/g) || [];
    expect(pushes.length).toBe(2);
    const guard = at('if (VISUAL_002_EMIT_ENABLED && fidelity.verdict === FIDELITY_VERDICTS.BLOCK)');
    expect(at("id: 'VISUAL-002'")).toBeGreaterThan(guard);
    // 🔴 C2 核心：VISUAL-002 范围内不得残留 severity:'BLOCK'，且恰好两处 WARN
    const first = at("id: 'VISUAL-002'");
    const last = SRC.lastIndexOf("id: 'VISUAL-002'");
    const visBlock = SRC.slice(first - 200, last + 200);
    expect(visBlock.match(/severity: 'BLOCK'/g) || []).toHaveLength(0);
    expect((visBlock.match(/severity: 'WARN'/g) || []).length).toBe(2);
  });

  it('阴性防误伤：只降 VISUAL-002 —— RUNTIME-012 等运行时阻断仍为 BLOCK', () => {
    // 空白截图是真阻断，不得被 C2 顺手降级
    expect(SRC).toContain("id: 'RUNTIME-012'");
    const r012 = SRC.slice(at("id: 'RUNTIME-012'"), at("id: 'RUNTIME-012'") + 200);
    expect(r012).toContain("severity: 'BLOCK'");
    expect(SRC).toContain('const RUNTIME_BLOCK_IDS = new Set([');
  });

  it('⭐ 阳性：分数计数行四键齐全，未比对打 `-` 与 score=0 可区分', () => {
    expect(SRC).toContain('visualFidelityScore:score=');
    expect(SRC).toContain("score=${vfScore.score === null ? '-' : vfScore.score}");
    for (const key of ['verdict=${vfScore.verdict}', 'renderBroken=${vfScore.renderBroken}', 'emitted=${VISUAL_002_EMIT_ENABLED ? 1 : 0}']) {
      expect(SRC).toContain(key);
    }
    expect(SRC).toContain("const vfScore = { score: null, verdict: 'none', renderBroken: 0 }");
  });

  it('⭐ 阳性：每次 finalizePreviewResult 恰好一行 score —— 早退与正常出口各一次', () => {
    const calls = SRC.match(/logVisualFidelityScore\(\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const early = at('if (!result?.renderedImage)');
    const earlyLog = SRC.indexOf('logVisualFidelityScore()', early);
    const normalLog = SRC.lastIndexOf('logVisualFidelityScore()');
    expect(early).toBeGreaterThan(-1);
    expect(earlyLog).toBeGreaterThan(early);
    expect(normalLog).toBeGreaterThan(earlyLog);
  });

  it('⭐ 阳性：score / verdict 取自 compareRenderedVsDesign 的真实返回', () => {
    expect(SRC).toContain('vfScore.score = typeof fidelity.score === \'number\' ? fidelity.score : null');
    expect(SRC).toContain("vfScore.verdict = String(fidelity.verdict || 'none')");
    expect(SRC).toContain('vfScore.renderBroken = renderBroken ? 1 : 0');
    expect(at('vfScore.score = ')).toBeGreaterThan(at('const fidelity = await compareRenderedVsDesign('));
  });

  it('阴性防误伤：不改阈值定义、不改阻断名单', () => {
    expect(SRC).toContain("severity: 'BLOCK'");
    expect(SRC).toContain("severity: 'WARN'");
    expect(SRC).toContain('const RUNTIME_BLOCK_IDS = new Set([');
    // 阈值定义不在此文件（唯一事实源 = render-fidelity-gate.js），不得就地新增一份
    expect(SRC).not.toMatch(/FIDELITY_THRESHOLDS\s*=/);
    expect(SRC).toContain("import { compareRenderedVsDesign, FIDELITY_VERDICTS } from '../utils/render-fidelity-gate.js'");
  });

  it('阴性防误伤：vfScore 不写进 result、不改渲染结果', () => {
    expect(SRC).not.toMatch(/result\.(vfScore|visualFidelityScore)\s*=/);
    expect(SRC).not.toMatch(/visualFidelityScore:\s*result/);
  });

  it('阴性防误伤：无任务 id / 组件名 / 文件名硬编码', () => {
    const start = at('const finalizePreviewResult');
    const end = at('if (allowMissingAssetSelfHeal && previewResult.runtimeGate');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = SRC.slice(start, end);
    expect(block.length).toBeGreaterThan(1000);
    expect(block).toContain('visualFidelityScore:score=');
    expect(block).not.toMatch(/mc-max-|mc-\d{13}|c-[a-z]+-[0-9a-f]{8}|1793861285711/);
  });
});
