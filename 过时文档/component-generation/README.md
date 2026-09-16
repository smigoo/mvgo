# 组件生成文档

本目录包含微码组件和 Vue3 组件生成相关的技术规范、优化方案和管线设计。

---

## 📋 核心文档

- ⭐⭐⭐⭐⭐ [规则约束与优化方案](./rules-and-optimization.md) - **组件生成完整规范**
- [管线节点文档](./pipeline-nodes.md) - 微码/Vue3 管线节点整理
- [复杂组件优化方案](./complex-component-optimization.md) - 超限组件优化策略

---

## 🏗️ 架构设计

### Figma 管线
- [Figma 管线优化](./figma-pipeline-optimization-plan.md) - 视觉生成管线优化方案
- [管线审查概览](./overview.md) - Figma 视觉生成管线审查结论

### 上下文管理
- [P1 上下文清单 Schema](./p1-context-manifest-schema.md) - Context Manifest 规范
- [文件生命周期跟踪](./file-lifecycle-tracking.md) - 文件生命周期管理

### 节点清单
- [节点清单](./node-inventory.md) - 管线节点清单

---

## 📊 基线数据

基线数据用于回归测试和性能对比：

- [Context Assembler 基线 (2026-08-20)](./baselines/context-assembler-baseline-20260820.json)
- [Context Shadow 回归测试 (2026-08-20)](./baselines/context-shadow-regression-20260820.json)

---

## 🎯 快速导航

### 我是新手，从哪里开始？
1. 先读 [规则约束与优化方案](./rules-and-optimization.md) - 了解完整规范
2. 再看 [管线节点文档](./pipeline-nodes.md) - 理解管线流程

### 我遇到了组件生成超限问题
查看 [复杂组件优化方案](./complex-component-optimization.md)

### 我需要优化 Figma 视觉生成
查看 [Figma 管线优化](./figma-pipeline-optimization-plan.md)

### 我要了解上下文管理机制
查看 [P1 上下文清单 Schema](./p1-context-manifest-schema.md)

---

## 📚 相关文档

- **系统架构**: [../architecture/系统架构文档.md](../architecture/系统架构文档.md)
- **部署指南**: [../operations/部署指南.md](../operations/部署指南.md)
- **质量门禁**: [../quality/](../quality/)
- **产品设计**: [../product/](../product/)

---

**最后更新**: 2026-08-28  
**维护团队**: AI Engine Team
