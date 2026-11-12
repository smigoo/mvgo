/**
 * 🧩 v20261110.28 P0-1 / P0-3：Figma 结构契约识别与注入段（纯函数，单一事实源）。
 *
 * 背景（评审结论，均基于代码证据）：
 *  ① 插件「结构契约 → mvgo」把契约全文塞进 `requirementDocText`；
 *     mc-component-graph-phase2.js#init 的 `_docTextSource` 兜底会把它当成【需求文档】
 *     送进 D0/D1+D2 文档子管线，microcode-engineer.js#_buildDocDesignBlock 再注入
 *     events / 数据对接 / interactions 五维权威段 ⇒ 模型据契约臆造树里不存在的交互。
 *     修复方式不是新增字段（DTO/controller/图白名单四处改动 + 老前端不兼容），
 *     而是在唯一的文本来源上识别契约头标记，让文档子管线跳过、addendum 仍注入。
 *  ② user-addendum.js 的「视觉样式（含布局）让位设计稿」会被泛化成整套骨架让位
 *     （同 2026-11-02 tab 事故）。这里对契约文本单独声明结构约束优先级例外。
 *
 * 消费方：
 *  - utils/user-addendum.js             → 用独立标题 + 硬约束段落替换「需求文档」小节
 *  - graphs/mc-component-graph-phase2.js → `_docTextSource` 排除契约，避免触发 docAnalysis
 */
export const STRUCTURE_CONTRACT_RE = /^\s*#\s*Figma 整理后结构契约/m;

/** 只读判据：契约头首行稳定标识（ui.html/PLUGIN_VERSION 变化不影响此行）。 */
export function isStructureContract(text) {
  const s = String(text || '');
  return s.length >= 20 && STRUCTURE_CONTRACT_RE.test(s);
}

/**
 * 生成结构契约专用 prompt 段。
 * 注意：外层 addendum 的通用让位条款仍在，本段用「优先级例外」显式收窄其适用范围；
 * 结构约束与 @技术栈锚点同级，纯视觉样式才让位设计稿。
 */
export function buildStructureContractSection(text) {
  const body = String(text || '').trim();
  return [
    '',
    '## 📐 Figma 结构契约（节点整理输出，必须遵守）',
    '',
    '> 优先级例外：本段是【结构契约】，不是需求文档。结构约束（组件边界 / 分区划分 / 循环判定 / 图表 vs 静态图形 / 资源实现）优先级等同 Figma @技术栈锚点契约，**不让位设计稿**；仅颜色、字号、间距等纯视觉样式可让位设计稿。',
    '',
    '> 禁止据此分析业务需求、臆造交互事件、数据接口或树中不存在的节点。契约行尾 `#1-283` 是 Figma nodeId，仅用于回填已有同名 section，不得据此新建节点；虚拟骨架行（header / bg / slot-con / section-*）不带 nodeId。',
    '',
    '> `# @meta` 是机器可读摘要；truncated=true 或出现「[省略 N 行]」表示结构不完整，勿推断缺失模块。',
    '',
    body,
    '',
  ].join('\n');
}
