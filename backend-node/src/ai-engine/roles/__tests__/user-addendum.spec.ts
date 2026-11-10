/**
 * 🔍 高级选项 P0 · 补充提示词接入行为 spec（2026-11-02）。
 *
 * 背景：extraPrompt 全链路 = 前端 components.vue → DTO(:179/:243) → phase2.service
 * (:223/:370/:603/:762) → graph initialState(:6119) → engineer(:1733) →
 * buildUserAddendumSection → 分块 prompt。本 spec 锁最后一环（纯函数行为），
 * 防止后续重构把注入段改空/改丢。
 *
 * 断言口径 = buildUserAddendumSection 的**真实返回值**（非源码 grep，
 * 规避「改的人=验的人用同一正则=假绿」）。阳性对照：空入参必须返回空串。
 */
import { buildUserAddendumSection } from '../../utils/user-addendum.js';
import { isStructureContract, buildStructureContractSection } from '../../utils/structure-contract.js';

describe('高级选项 P0 · buildUserAddendumSection（用户补充需求段注入）', () => {
  it('阳性：extraPrompt ⇒ 含「用户补充需求」标题 + 补充提示词小节 + 原文', () => {
    const out = buildUserAddendumSection('标题必须显示 XYZ-EXTRA-TEST', '');
    expect(out).toContain('# 📎 用户补充需求');
    expect(out).toContain('## 补充提示词');
    expect(out).toContain('XYZ-EXTRA-TEST');
    expect(out).not.toContain('## 需求文档');
  });

  it('阳性对照反转：双空入参 ⇒ 空串（零开销，不污染 prompt）', () => {
    expect(buildUserAddendumSection('', '')).toBe('');
    expect(buildUserAddendumSection('   ', null as any)).toBe('');
    expect(buildUserAddendumSection(null as any, undefined as any)).toBe('');
  });

  it('requirementDocText ⇒ 文档小节，且不带补充提示词小节', () => {
    const out = buildUserAddendumSection('', '要点A：隧道流量按小时聚合');
    expect(out).toContain('## 需求文档');
    expect(out).toContain('要点A：隧道流量按小时聚合');
    expect(out).not.toContain('## 补充提示词');
  });

  it('双字段齐发 ⇒ 两小节都在', () => {
    const out = buildUserAddendumSection('禁用动画', '要点B');
    expect(out).toContain('## 补充提示词');
    expect(out).toContain('禁用动画');
    expect(out).toContain('## 需求文档');
    expect(out).toContain('要点B');
  });

  it('超长防御截断：extraPrompt 4001 字 ⇒ 4000 字（DTO 层已限，此处兜底）', () => {
    const long = 'A'.repeat(4001);
    const out = buildUserAddendumSection(long, '');
    expect(out).toContain('A'.repeat(4000));
    expect(out).not.toContain('A'.repeat(4001));
  });

  it('优先级契约行恒在：Figma 锚点 > 本段 > 默认规范', () => {
    const out = buildUserAddendumSection('任意', '');
    expect(out).toContain('优先级');
    expect(out).toContain('锚点契约');
  });

  it('交互/行为类 carve-out 恒在（2026-11-02 tab 切换事故 mc-max-1793601934772-3c973404）：必须落实 + 仅视觉样式让位设计稿', () => {
    const out = buildUserAddendumSection('顶部统计卡使用 tab 切换', '');
    expect(out).toContain('必须落实');
    expect(out).toContain('以设计稿为准');
    // 旧契约句「与设计稿视觉冲突时以设计稿为准」单句存在 = 模型泛化为一切让位设计稿，禁止回退
    expect(out).toContain('不得以「设计稿没有」为由省略');
    expect(out).toContain('tab 切换');
  });
});

/**
 * 🧩 v20261110.28 P0-1/P0-3：Figma 结构契约分流行为。
 * 契约全文走 requirementDocText，但不能被标成「需求文档（要点必须落实）」，
 * 也不能被文档子管线当业务需求分析；结构约束必须显式声明不让位设计稿。
 */
const CONTRACT_TEXT = [
  '# Figma 整理后结构契约（组件骨架）',
  '# @meta version=20261110.28; sections=3; loops=1; slots=9; nodes=42; truncated=false; ids=on; quality=58/100',
  '',
  '- cp-event-analysis  #1-283',
  '  - header',
  '  - slot-con',
  '    - section-type-distribution',
].join('\n');

describe('v20261110.28 · Figma 结构契约分流', () => {
  it('识别：契约头 true，普通需求文档 / 空 / 过短片段 false', () => {
    expect(isStructureContract(CONTRACT_TEXT)).toBe(true);
    expect(isStructureContract('要点A：隧道流量按小时聚合，需要按日汇总')).toBe(false);
    expect(isStructureContract('')).toBe(false);
    expect(isStructureContract('# Figma 结构契约')).toBe(false); // <20 字，防误判
  });

  it('addendum：契约走独立段落，不带「需求文档」小节', () => {
    const out = buildUserAddendumSection('', CONTRACT_TEXT);
    expect(out).toContain('## 📐 Figma 结构契约');
    expect(out).toContain('- cp-event-analysis  #1-283');
    expect(out).not.toContain('## 需求文档');
  });

  it('addendum：结构约束不让位设计稿 + 禁止臆造交互 + nodeId 只回填不新建', () => {
    const out = buildUserAddendumSection('', CONTRACT_TEXT);
    expect(out).toContain('不让位设计稿');
    expect(out).toContain('禁止据此分析业务需求');
    expect(out).toContain('不得据此新建节点');
    expect(out).toContain('仅颜色、字号、间距等纯视觉样式可让位设计稿');
  });

  it('addendum：契约与 extraPrompt 可共存，普通需求文档路径不受影响', () => {
    const both = buildUserAddendumSection('禁用动画', CONTRACT_TEXT);
    expect(both).toContain('## 补充提示词');
    expect(both).toContain('## 📐 Figma 结构契约');
    const doc = buildUserAddendumSection('', '要点A：隧道流量按小时聚合');
    expect(doc).toContain('## 需求文档');
    expect(doc).not.toContain('## 📐 Figma 结构契约');
  });

  it('独立段落自带契约原文与 @meta 说明', () => {
    const section = buildStructureContractSection(CONTRACT_TEXT);
    expect(section).toContain('@meta');
    expect(section).toContain('truncated=true');
    expect(section).toContain(CONTRACT_TEXT.trim());
  });
});
