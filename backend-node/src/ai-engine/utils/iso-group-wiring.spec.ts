/**
 * 🧬 刀 66-P3 · 四象限同步接线契约（本 spec 是「只改一边」不再复发的唯一判据）
 *
 * 背景（2026-11-12 · adbd1b3d）：同构段收敛此前**只接了 mc/max** ——
 *  `mc-component-graph-phase2.js` → `MicrocodeEngineer` → `microcode/prompt-builder.js`。
 * vue3/max 是另一张图 + 另一个 prompt builder，两个 lite 是 `lite.service.ts` 单 agent
 * 双分支。任何「只改 mc/max」的迭代都会让四象限行为漂移，而编译/单测全绿。
 *
 * 判据设计（照 `lite.font-size-guard-wiring.spec.ts` 的源码断言范式）：
 *  - 不做运行时集成，直接读源码断言**接线符号成对出现**（import + 调用 + 日志象限）；
 *  - 象限名必须互不重复 ⇒ 真机日志可归因，不是「四处都打同一行」；
 *  - **阳性对照**：故意破坏任一接线，检测函数必须返回 false
 *    （否则这份 spec 自己就是假的：把源码全删了也能过）。
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf-8');
const SRC = {
  graphMc: read('../graphs/mc-component-graph-phase2.js'),
  graphV3: read('../graphs/mc-component-graph-vue3.js'),
  parser: read('../roles/visual-parser.js'),
  engMc: read('../roles/microcode-engineer.js'),
  engV3: read('../roles/vue3-engineer.js'),
  promptMc: read('../roles/microcode/prompt-builder.js'),
  promptV3: read('../roles/microcode/vue3-prompt.js'),
  lite: read('../../lite/lite.service.ts'),
  iso: read('./isomorphic-section-group.js'),
  healer: read('./layout-truth-healer.js'),
  contract: read('./iso-template-contract.js'),
  liteBlock: read('./iso-lite-prompt.js'),
};
const SCHEMA = read('../../../references/schemas/preview-analysis-schema.md');
const SCHEMA_DIST = read('../../../dist/references/schemas/preview-analysis-schema.md');

/** 所有 token 都出现才算接上；阳性对照用同一函数验「删一处必红」。 */
const hasAll = (src: string, tokens: string[]) => tokens.every((t) => src.includes(t));

describe('刀66-P3 · L0 事实层接线（两图 + 实时/缓存双路径）', () => {
  it('真值注入函数落在 layout-truth-healer（与另两个 inject*Truth 同源）', () => {
    expect(SRC.healer).toContain('export function injectIsomorphicSectionTruth');
    expect(SRC.healer).toContain('parsed.isoSectionTruth = truth');
  });

  it('visual-parser 实时路径挂点 + 恒打计数行', () => {
    expect(SRC.parser).toContain('injectIsomorphicSectionTruth(parsed, figmaData)');
    expect(SRC.parser).toContain('🧬 VISION-ISO sections=');
  });

  it('🔴 两张图的缓存命中路径都补跑（A4/headerSlots 踩过的坑）', () => {
    expect(SRC.graphMc).toContain('VISION-ISO cache sections=');
    expect(SRC.graphV3).toContain('VISION-ISO cache(vue3) sections=');
    expect(SRC.graphMc).toContain("from '../utils/layout-truth-healer.js'");
    expect(SRC.graphV3).toContain("from '../utils/layout-truth-healer.js'");
  });

  it('schema 主副本与 dist 副本同步（含两个新字段）', () => {
    for (const s of [SCHEMA, SCHEMA_DIST]) {
      expect(s).toContain('`isomorphicSectionGroups`');
      expect(s).toContain('`isoSectionTruth`');
    }
    expect(SCHEMA).toBe(SCHEMA_DIST);
  });
});

describe('刀66-P3 · L1/L2 两个 max 象限接线', () => {
  const ENGINE_TOKENS = [
    'collectIsomorphicSectionGroups(',
    'validateIsoTemplateProps(',
    'renderIsoWrapperSfc(',
    'rewriteIndexRepeatGroups(',
    'pruneRepeatMemberArtifacts(',
    'requireTheme:',
    'isoContract:',
  ];

  /**
   * 🔴 必须锁**评估调用整块**，不能只 grep `flattenOneLevel: true`：
   * ISO-PROBE 探针里也有同名参数（`{ flattenOneLevel: true }`），
   * 只查裸 token ⇒ 真把调用块改坏也仍是绿的（假绿，2026-11-12 实测触发）。
   */
  const ISO_CALL_RE =
    /collectIsomorphicSectionGroups\([^)]*\{\s*flattenOneLevel:\s*true,\s*truth:\s*_isoTruth,\s*declaredGroups:\s*_isoDeclared,/;

  it('mc/max 与 vue3/max 用同一组判据/渲染/改写符号', () => {
    expect(hasAll(SRC.engMc, ENGINE_TOKENS)).toBe(true);
    expect(hasAll(SRC.engV3, ENGINE_TOKENS)).toBe(true);
  });

  it('两象限的同构评估调用块参数齐备（展平 + 真值 + 视觉候选）', () => {
    expect(ISO_CALL_RE.test(SRC.engMc)).toBe(true);
    expect(ISO_CALL_RE.test(SRC.engV3)).toBe(true);
  });

  it('象限日志各自独立且 0 命中也恒打', () => {
    expect(SRC.engMc).toContain('ISO-CONVERGE quadrant=mc/max');
    expect(SRC.engV3).toContain('ISO-CONVERGE quadrant=vue3/max');
    expect(SRC.engMc).not.toContain('quadrant=vue3/max');
    expect(SRC.engV3).not.toContain('quadrant=mc/max');
  });

  it('两个 prompt builder 都委托同一份共享契约文本', () => {
    expect(SRC.promptMc).toContain("from '../../utils/iso-template-contract.js'");
    expect(SRC.promptV3).toContain("from '../../utils/iso-template-contract.js'");
    expect(SRC.promptV3).toContain('buildIsoTemplateContract(chunkSpec)');
    expect(SRC.contract).toContain('export function buildIsoTemplateContractText');
  });

  it('🔴 vue3 runChunk 必须展开 chunk，否则 isoContract 静默丢失', () => {
    expect(SRC.engV3).toContain('...chunk,');
  });

  it('阳性对照：删掉 mc 的评估调用块展平参数后检测必须变红', () => {
    // 只删「调用块里」的那一处（探针里的同名参数保留）⇒ 必须红
    const broken = SRC.engMc.replace(/(collectIsomorphicSectionGroups\([^)]*\{\s*)flattenOneLevel:\s*true,\s*/, '$1');
    expect(ISO_CALL_RE.test(broken)).toBe(false);
  });
});

describe('刀66-P3 · 两个 lite 象限接线（语义同步，不同机制）', () => {
  it('lite 从单一来源 import 规则块，两分支都注入', () => {
    expect(SRC.lite).toContain("from '../ai-engine/utils/iso-lite-prompt.js'");
    const calls = SRC.lite.match(/buildLiteIsoPromptBlock\(brief\)/g) || [];
    expect(calls.length).toBe(2);
    const inserts = SRC.lite.match(/\$\{isoBlock\.block\}/g) || [];
    expect(inserts.length).toBe(2);
  });

  it('两分支日志象限互不重复且与 max 区分', () => {
    expect(SRC.lite).toContain("formatLiteIsoLog('vue3/lite'");
    expect(SRC.lite).toContain("formatLiteIsoLog('mc/lite'");
    expect(SRC.lite).not.toContain("formatLiteIsoLog('vue3/max'");
  });

  it('规则块含「只写一份 + v-for + 配色变量 + 禁止硬编码 + 不强行合并」', () => {
    expect(SRC.liteBlock).toContain('只允许写一份模板 + 一个 v-for 数据数组');
    expect(SRC.liteBlock).toContain('--iso-accent');
    expect(SRC.liteBlock).toContain('把任一段的配色硬编码进共用样式');
    expect(SRC.liteBlock).toContain('不要强行合并');
  });

  it('lite 不复制 max 的薄包装/index 改写（单文件 SFC 无装配能力）', () => {
    expect(SRC.lite).not.toContain('renderIsoWrapperSfc');
    expect(SRC.lite).not.toContain('rewriteIndexRepeatGroups');
  });

  it('阳性对照：删掉 mc/lite 的注入后检测必须变红', () => {
    const broken = SRC.lite.replace(/\$\{isoBlock\.block\}/g, '');
    expect((broken.match(/\$\{isoBlock\.block\}/g) || []).length).toBe(0);
    expect(hasAll(SRC.lite, ['buildLiteIsoPromptBlock(brief)', '${isoBlock.block}'])).toBe(true);
    expect(hasAll(broken, ['buildLiteIsoPromptBlock(brief)', '${isoBlock.block}'])).toBe(false);
  });
});

describe('刀66-P3 · 判据单一来源与 fail-open 纪律', () => {
  it('分组只在 isomorphic-section-group.js 裁决；L0 不含分组逻辑', () => {
    expect(SRC.iso).toContain('export function collectIsomorphicSectionGroups');
    expect(SRC.healer).not.toContain('collectIsomorphicSectionGroups(');
  });

  it('展平默认关闭（零行为变更），由调用方显式打开', () => {
    // 刀 66-P0（2026-11-12）后展平收敛到唯一入口 isoSectionTrack（访问器+下钻+展平一处裁决）
    expect(SRC.iso).toContain(
      'entries: options.flattenOneLevel === true ? flattenPureGroupEntries(entries) : entries',
    );
  });

  it('刀66-P0 · 同构判据吃全保真段（不让归一化口把 body 藏起来）', () => {
    // mc：解析入口必须走 resolveIsoPlanSections（prefers subComponentPlan）
    expect(SRC.engMc).toContain('microcodePrompt.resolveIsoPlanSections(input)');
    // 判据侧：内容访问器兼容 body / declaredContent 两种建模
    expect(SRC.iso).toContain('sec?.body ?? sec?.declaredContent');
    expect(SRC.iso).toContain('export function isoSectionTrack');
    // 阳性对照：删掉访问器的 declaredContent 退回 ⇒ 判据在归一化口恒 no-body
    const broken = SRC.iso.replace('sec?.body ?? sec?.declaredContent', 'sec?.body');
    expect(broken).not.toContain('sec?.body ?? sec?.declaredContent');
  });

  it('视觉声明只作候选，不豁免资格', () => {
    expect(SRC.iso).toContain('export function verifyIsoCandidate');
    expect(SRC.iso).toContain('declared-not-eligible');
  });
});
