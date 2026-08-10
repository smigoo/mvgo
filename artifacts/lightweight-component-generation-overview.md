# 轻量组件生成方案评审摘要

## 结论

需求已完成规划，建议新增“轻量生成”路径，不替换现有 Figma Full 链路。输入统一支持：截图、文档、截图+文档、HTML/HTML+资源，以及后续批量 HTML。

## 核心方案

- 截图/文档生成 `Draft` 初版，优先快速可运行和可预览。
- HTML 生成 `Migrated` 迁移版，先做确定性 DOM/CSS/资源解析，再由模型补充语义和交互。
- 微码和 Vue3 共用输入协议、任务状态、SSE、配额、预览、下载和 Playground，仅在目标转换器和门禁上区分。
- 批量任务使用 `batchId + itemId`，每项独立执行、失败隔离，复用已有批量限流计划 #206–#213。
- 轻量结果持续展示质量等级、证据来源、警告和“升级 Full”入口。

## 实施顺序

1. 统一 `GenerationEvidence` 中间表示和 `sourceType/profile` 协议。
2. 截图/文档 Draft 单任务。
3. HTML 单文件或 ZIP 迁移到微码/Vue3。
4. HTML 批量生成和任务中心恢复。
5. Draft/HTML 结果升级为 Figma Full。

## 关键安全边界

HTML/ZIP 只在隔离环境解析和预览；移除脚本、事件属性、危险 URL、iframe 和路径穿越风险。外部网络资源不默认抓取，所有跳过、清洗、降级项生成报告。

## 详细方案

见 `docs/plans/lightweight-component-generation-plan.md`。
