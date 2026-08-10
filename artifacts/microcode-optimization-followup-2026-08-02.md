# 微码耗时优化跟进（2026-08-02）

## 本次新增完成
- 复核了第三刀后处理补丁已真实落地：
  - `package/index.vue` 自动补 `scoped`
  - 自动补 `@import '../resources/styles/index.less';`
  - 明显可点击图标容器 `div -> button`
  - `base-panel` 场景自动剥离 `bg-layer` 和部分 `header/panel-header` 外壳泄漏
- 继续补了一刀：`backend-node/src/ai-engine/roles/adversarial-checker.js` 在修订/重试轮不再强制把复杂度抬成 `medium`，改为继续按真实文件特征评估。
- 已执行 `backend-node` 下的 `npm run build`，构建通过。

## 对历史 45 分钟任务的验证结论
目标任务：`mc-1785691981393-80b24053`

从 `backend-node/data/tasks.json` 和 `backend-node/logs/app-2026-08-02.log` 可确认：
- 这条任务首轮后确实进入了 `needs_revision`。
- 第二轮确实再次进入 `microcode-engineer`，并继续执行了后续质量链，耗时被显著拉长。
- 历史 critiques 中明确命中了本次第三刀覆盖的问题：
  - 缺少 `<style lang="less" scoped>`
  - 缺少 `index.less` 引入
  - `div/button` 语义问题
  - `base-panel` 标题/外壳泄漏
- 因此第三刀并不是拍脑袋补丁，而是对准了这类慢任务的真实高频返工点。

## 仍未被本轮消灭的主要耗时来源
- 45 分钟任务的最大纯耗时仍然是长时间的 `microcode-engineer` 调用本身。
- 该任务还存在图表逻辑类问题（如 `chartRef` / ECharts 初始化），这类问题不属于第三刀的“机械修补”范围。
- 仓库内没有现成的 session/checkpoint 回放产物，当前只能做“历史任务证据命中验证”，还做不了真正的整链回放对比。

## 当前判断
- 第三刀已经足以减少一批首轮规范类 critique，降低再次掉回 full engineer 的概率。
- 新增的 `adversarial-checker` 复杂度收口，可以避免简单组件在修订轮被额外放大检查成本。
- 下一步最值得继续的是：
  1. 做 `chartRef` / ECharts 初始化类高频问题的首轮模板化补齐
  2. 找一个当前可重跑的简单微码组件做真实耗时对比
  3. 继续收紧 `assessComplexity()`，让“视觉简单但结构略碎”的组件更早走低成本路径
