# HTML 上传功能继续执行计划

## 当前状态

### 已完成 ✅
- HTML 前端文件读取、类型校验、大小校验（2MB）、替换、删除
- HTML 后端 DTO 扩展（`htmlContent` / `htmlFileName`）
- HTML 后端安全渲染（Puppeteer → PNG）
- HTML 三选一校验（imageBase64 / figmaUrl / htmlContent）
- HTML 强制 Lite 档位
- 前端生产构建通过（6668 modules）
- 后端 TypeScript 编译通过
- Puppeteer HTML 渲染测试成功

### 待完成 ⏳
- 登录态浏览器中验证 HTML 上传完整交互
- 真实 HTML → Lite 生成 → Vue3/微码产物端到端验证
- 更新 overview 和今日项目日志
- 处理已知边界：
  - HTML 外链 CSS/图片/字体不加载
  - 设计尺寸来自渲染滚动尺寸，未提供 viewport 选择
  - 模型服务 429 / buffer overflow 稳定性

---

## 执行计划

### Phase 1：浏览器自动化验证（登录态复用）

**目标**：在不消耗模型配额前提下，验证 HTML 上传 → 请求发送 → 任务创建

#### Step 1.1：启动浏览器自动化环境
- 使用 Puppeteer 连接现有 Chrome 会话
- 导航到 `http://localhost:2610/generator/components`
- 检查登录态（若未登录，提示用户手动登录后继续）

#### Step 1.2：验证来源切换
- 点击 HTML 来源按钮
- 验证 `sourceMode` 状态切换
- 验证上传区显示（拖拽区 + 文件选择按钮）

#### Step 1.3：验证文件上传
- 选择测试 HTML 文件（< 2MB，自包含）
- 验证文件信息显示（文件名 + 大小）
- 验证替换和删除交互

#### Step 1.4：验证请求组装
- 点击"开始生成"
- 拦截网络请求，验证 payload：
  ```json
  {
    "htmlContent": "<!DOCTYPE html>...",
    "htmlFileName": "test.html",
    "componentType": "vue3",
    "generationTier": "lite"
  }
  ```
- 验证不包含 `imageBase64` 和 `figmaUrl`

#### Step 1.5：验证任务创建
- 检查后端日志：任务创建成功
- 检查前端：任务 ID 返回，进入 SSE 监听
- **在此处停止，不等待模型生成**（避免 429）

### Phase 2：端到端生成验证（可选，需模型稳定）

**目标**：验证完整 HTML → 组件产物链路

#### Step 2.1：准备测试 HTML
- 创建包含图表和表格的自包含 HTML
- 使用内联 CSS，无外部依赖
- 宽度 800px，高度 600px

#### Step 2.2：触发 Lite 生成
- 选择 Vue3 + Lite
- 上传测试 HTML
- 提交生成请求

#### Step 2.3：监控生成过程
- SSE 日志：precheck → analyzing → generating → complete
- 检查 Puppeteer PNG 渲染结果
- 检查 VisionAgent 分析结果（interactions 字段）

#### Step 2.4：验证产物
- Vue3 组件：`package/index.vue` + `<style lang="less">`
- 检查 ECharts 自动映射
- 检查基础交互（Tab/按钮/展开）
- 预览页验证（按设计比例展示）

#### Step 2.5：微码版本重复验证
- 切换组件类型为"微码"
- 重复 Step 2.2 - 2.4
- 验证 `<base-panel panelKey="default-panel">`
- 验证 `declare.json` 最小骨架

### Phase 3：边界场景验证

#### Step 3.1：错误输入
- 上传 > 2MB 文件 → 验证前端拦截
- 上传 `.txt` 文件 → 验证类型校验
- 空输入点击生成 → 验证 400 错误

#### Step 3.2：多来源冲突
- 手动构造请求同时包含 `htmlContent` + `imageBase64`
- 验证后端返回 400

#### Step 3.3：外链资源
- 上传包含 `<link href="https://...">` 的 HTML
- 验证 Puppeteer 不加载外链
- 验证渲染结果仅包含内联样式

### Phase 4：文档与记录

#### Step 4.1：更新 overview
- 记录 HTML 上传功能完整实现
- 记录验证结果和已知边界
- 记录后续优化建议

#### Step 4.2：更新今日项目日志
- 追加到 `/Users/smigoo/工作/mvgo/.workbuddy/memory/2026-08-05.md`
- 记录关键改动文件
- 记录验证通过项和待优化项

#### Step 4.3：输出交付摘要
- 结构化总结 HTML 上传功能
- 提供验证截图/日志片段
- 列出已知限制和优化方向

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 登录态失效 | 无法验证交互 | 提示用户手动登录，或使用 Cookie 注入 |
| 模型服务 429 | Phase 2 无法完成 | 跳过 Phase 2，仅交付 Phase 1 + Phase 3 |
| Puppeteer 渲染失败 | HTML → PNG 失败 | 检查 Chromium 路径，降级为提示用户 |
| SSE 断连 | 无法监听生成进度 | 已有重连机制，验证重连逻辑 |

---

## 验收标准

### 必须 ✅
- HTML 来源按钮可点击，上传区正常显示
- 文件上传、替换、删除交互正常
- 请求 payload 字段隔离正确
- 后端三选一校验生效
- 任务创建成功，SSE 监听启动

### 可选 🎯
- 完整 HTML → 组件产物端到端成功
- ECharts / a-table 自动映射正确
- 基础交互（Tab/按钮）可工作

### 不做 ❌
- Figma Max 完整生成（本轮聚焦 HTML Lite）
- 批量 HTML 上传（UI 未开放）
- HTML viewport 选择器（后续优化）

---

## 下一步

**立即执行 Phase 1**，验证 HTML 上传交互和请求组装。如果登录态可用且模型服务稳定，继续 Phase 2；否则交付 Phase 1 + Phase 3 + Phase 4。
