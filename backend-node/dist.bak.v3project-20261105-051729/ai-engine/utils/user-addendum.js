/**
 * 🔍 高级选项 P0（2026-11-02 抽出）：用户补充需求 prompt 段构建（纯函数，单一来源）。
 *
 * 消费方：microcode-engineer.js#appendGlobalGuidance —— 每个分块 codegen prompt 携带。
 * 从 microcode-engineer.js 原样平移（2026-10-09 引入），逐字未改；
 * 抽出动机 = engineer 整体不可被 jest 加载（base-agent ESM 转换冲突），
 * 纯函数落 utils 才能挂行为断言 spec（user-addendum.spec.ts）。
 *
 * 两项都可选；超长防御截断（extraPrompt ≤4000 字 / 文档文本 ≤20000 字——DTO 层已限，
 * 此处兜底防历史调用方绕过）。空内容返回空串（零开销）。
 * 优先级契约：Figma @技术栈 锚点契约 > 本段 > 平台默认规范；与设计稿视觉冲突时以设计稿为准。
 */
export function buildUserAddendumSection(extraPrompt, requirementDocText) {
  const ep = String(extraPrompt || '').trim().slice(0, 4000);
  const rd = String(requirementDocText || '').trim().slice(0, 20000);
  if (!ep && !rd) return '';
  let block = '\n\n# 📎 用户补充需求（高级选项，用户显式输入，必须遵守）\n\n';
  // 🔧 2026-11-02 契约句改写（tab 切换事故 mc-max-1793601934772-3c973404）：
  //  旧句「与设计稿视觉冲突时以设计稿为准」被模型泛化成「一切以设计稿为准」——
  //  设计稿平铺三张统计卡、无 tab，用户「上面使用 tab 切换」被判冲突而省略
  // （declare 层落了 tabConfig 但 vue 层照稿画静态卡，交互从未渲染）。
  //  新契约拆两层：视觉样式仍让位设计稿；交互/行为类显式要求必须落实。
  block += '> 优先级：Figma @技术栈 锚点契约 > 本段 > 平台默认规范。\n\n';
  block += '> 视觉样式（颜色/尺寸/布局/字体）与设计稿冲突时以设计稿为准；但本段的交互/行为类显式要求（tab 切换、轮播、折叠展开、点击联动等）必须落实，不得以「设计稿没有」为由省略；交互态未在设计稿出现时，沿用设计稿的配色与形态风格实现。\n\n';
  if (ep) block += `## 补充提示词\n\n${ep}\n\n`;
  if (rd) block += `## 需求文档（用户上传，要点必须落实）\n\n${rd}\n\n`;
  return block;
}
