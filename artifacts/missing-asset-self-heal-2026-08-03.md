# 缺图自愈策略变更

## 本次完成
- 运行时预览发现缺图时，新增一次性自动自愈，不再直接进入全量修订。
- 若自愈后仍缺图，任务改为完成态并携带告警，不再标记失败。
- 生成结果页面新增“输出情况说明”，展示这类降级告警。
- Vue3 API 绑定运行时预检同步放宽为仅 `BLOCK` 才回滚，`WARN` 不再拦截。

## 后端改动
- `backend-node/src/ai-engine/roles/screenshot-renderer.js`
  - 新增缺图识别、自愈复制和一次性重试逻辑。
  - 仅对 `RUNTIME-007/RUNTIME-010` 这类纯缺图场景降级为 `WARN`。
- `backend-node/src/ai-engine/graphs/mc-component-graph-phase2.js`
  - Runtime gate 支持 `WARN` 直接收尾，不进入修订。
  - 完成结果新增 `warnings` 字段，供前端展示。
- `backend-node/src/ai-engine/graphs/mc-component-graph-vue3.js`
  - 与微码链路保持同样的 `WARN` 处理口径。
- `backend-node/src/vue3/api-binding.service.ts`
  - API 绑定预检仅在 `runtimeGate.status === 'BLOCK'` 时阻断。

## 前端改动
- `frontend/src/views/generator/Create.vue`
- `frontend/src/views/component/Create.vue`
  - 成功结果卡片新增“输出情况说明”。
  - 任务完成时从结果对象读取 `warnings` 并展示。

## 当前行为
1. 真实预览发现资源 404。
2. 后端尝试把 `outputPath` 中已有资源补到 preview workspace。
3. 自动重试一次真实预览。
4. 若仍是纯缺图问题：
   - 记录 warning
   - 任务继续完成
   - 最终结果展示“缺图自愈后仍缺失资源”的说明
5. 不再进入全量修订，不再因为这类问题把任务打成 failed。

## 仍未放宽的情况
- 页面异常、空白渲染、导航失败、真实脚本错误等仍保持 `BLOCK`。
- 只有纯缺图场景会走这次的一次性自愈降级。

## 验证
- 后端 `npm run build` 通过。
- 前端 `npm run build` 通过。

## 后续建议
- 下一步最好补一条真实缺图任务回放，确认 warning 文案、完成态落库和预览加载表现都符合预期。
