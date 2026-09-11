# 0003-组件命名规范（c-* / v-*）

- **状态**：Accepted
- **日期**：2026-09-11

## 决策

- 目录名与 `declare.componentId` 必须是**规范 ID**：微码组件 `c-*`，普通 Vue 组件 `v-*`；**任务号不进**规范 ID。
- 任务号（`mc-lite-` / `mc-max-` / `mc-<ts>-`）只用于**任务标识**（任务记录/暂存目录），与组件规范 ID 分离。

## 背景 / 动机

- 曾出现「目录名或 declare.componentId 带任务号」的污染（mc-lite-/mc-max-/mc-<ts>-），导致：① 同一组件多份副本命名不一致；② 预览/下载/分享/更改等场景组件被识别失败（component-resolver 按 c-* 规范 ID 定位）。
- 命名不一致是「组件找不到 / 尾缀多命中」的直接来源（mvgo-component-naming-consistency 排障 skill 记载）。

## 方案与理由

- **规范 ID = 稳定契约**：`c-<semantic>[-<8位尾缀>]`（如 `c-device-monitor-4q5v3r5u`）；任务号不进入 ID，避免任务重跑产生新 ID。
- **单一事实源定位**：`component-resolver.js#resolveComponentDirStrict()` 按规范 ID 解析目录；预览候选根（custom-components + 前端镜像 + temp-components 回退）均以规范 ID 对齐。
- **存量治理**：一次性把历史目录名/declare 中的任务号前缀剥成规范 ID（已立项执行）；回收区 `_naming-cleanup-backup-*` 留作回滚。
- **否决替代**：让任务号进 ID → 任务重跑即换 ID、存量全乱；已否决。

## 影响面（当前）

- `component-resolver.js#resolveComponentDirStrict`
- `_deriveClassPrefix` / `_normalizeComponentId`（code-generator / microcode-engineer）
- 预览发布链路（workspace-preview-publisher，按 componentId 双副本同步）

## 后果

- 正面：定位单一事实源、预览/分享/下载稳定。
- 负面：存量迁移需一次性成本（已完成）。
- 债务：命名反转类变更（如改前缀规则）须同步 resolver + 预览链路 + 全量存量审计，走「影响面清单」。
