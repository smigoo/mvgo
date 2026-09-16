# Figma 视觉生成管线审查概览

## 已完成
- 追踪了尺寸不一致、虚构卡片样式、DOM/ECharts 重复图例的首次引入阶段。
- 审查了视觉可信度、Vue3/Phase2 主图、Style Mapper、AI 常见样式检测器、Visual Comparator 与最终质量状态。
- 输出了可实施的 P0/P1/P2 优化方案与验收指标。

## 核心结论
- 本次视觉覆盖率仅 44%～45%，布局审查为 `score=0 / degraded=true`，却仍进入自由代码生成。
- Figma 已有约 `425.83 × 807 CSS px` 的确定性尺寸与样式事实，但 Vision 错误推断的根背景、通用 fallback token 覆盖了可靠事实。
- 现有样式黑名单无法拦截任意颜色和透明度的虚构边框/阴影，且检测器未成为主生成图必经门禁。
- `completed + qualityGate:warned` 混淆了“代码生成完成”和“视觉通过”。

## 关键决策
1. Figma API 确定性事实优先于 Vision 和 Style Mapper fallback。
2. 低可信输入进入 restricted 受限生成，而不是直接整轮失败或自由生成。
3. 每个图表增加 `legend.owner`，保证 DOM/ECharts 单一所有权。
4. 增加设计证据式 CSS 校验、真实 CSS 尺寸与 DPR 契约。
5. 将 generated/runtime/visual/publish 状态分层。

## 后续
- 建议先实施第一批 P0：designFacts、三级可信度路由、fallback 隔离、legend owner、设计证据门禁。
- 本轮未修改管线源码，未构建或重启服务。