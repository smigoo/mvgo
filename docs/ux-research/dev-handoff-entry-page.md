# 入口页（EntryPage）开发对接说明

> 把高保真原型 `prototype-component-generate-entry.html` 落地为真实可接入的 Vue3 SFC。
> 评审报告结论：综合 B+，可用于开发。本说明固化接入点与待接数据层。

## 一、产出文件

| 文件 | 变更 | 说明 |
|------|------|------|
| `frontend/src/views/generate/EntryPage.vue` | 新增 | 入口页真实组件（template + script setup + scoped style） |
| `frontend/src/router/generator-routes.js` | 修改 | `/generator` 从「重定向到工作台」改为指向 `EntryPage`；`/generator/components` 工作台保持不变 |

## 二、组件职责（只管"开始生成"）

1. 三输入源 Tab：截图 / Figma 链接 / 需求文档
2. 智能剪贴板识别：`Ctrl/⌘+V` 自动判断来源并切换 Tab、填充内容（Figma 链接 / 普通链接→Figma Tab；图片→截图 Tab；HTML 片段→文档 Tab）
3. 动态校验：Figma URL 格式、截图非空、文档非空（错误就近提示）
4. 代码类型（V3/MC）与生成规格（Lite/Max）选择
5. 调用 `generateLite` 拿到 `sessionId` → 跳转 `/tasks/:sessionId`，由**任务详情页接管进度与结果展示**

## 三、复用的项目能力（不重复造轮子）

- **API**：`@/api/lite` 的 `generateLite`，入参 `figmaUrl / imageBase64 / htmlContent / requirementDoc + componentType('vue3'|'microcode') + generationTier('lite'|'max')`，返回 `{ success, sessionId, ... }`
- **组件**：`@/components/common/TierToggle.vue`、`@/components/common/CodeTypeToggle.vue`（v-model 直接复用，保证规格/类型选择语义与全站一致）
- **设计系统**：全部样式引用 `tokens.css` 语义变量（蓝色品牌 + `--brand-cta` 绿色 CTA），无硬编码色值；圆角走项目 2/4/6/10/14 五档规范
- **路由目标**：`/tasks/:sessionId` 即现有 `TaskDetail` 路由（已在 `generate-route.js` 定义）

## 四、待接入的真实数据层

- **最近生成列表**：当前为 MVP 静态占位（`loadRecent()` 内 3 条示例，`// TODO 接入 GET /api/tasks?limit=5`）。真实数据应接 `GET /api/tasks?limit=5&sort=createdAt:desc`，可参考 `TaskCenter.vue` 的数据逻辑。
- **「今日概览」统计卡**：评审中建议放 v2（需后端聚合接口或前端从任务列表本地算），本次未做，保持首屏聚焦。

## 五、验证状态

- ✅ SFC 结构通过 `@vue/compiler-sfc` 解析（template / script setup / scoped style 均正确）
- ✅ API 签名、复用组件 props、路由目标均与实际代码对齐（已 grep 确认 `generateLite` @ lite.ts:131、`TierToggle`/`CodeTypeToggle` props、`TaskDetail` 路由）
- ⏳ 未做运行时 dev 验证：需 `npm run dev` 后在浏览器确认交互与跳转（`lsof -ti:2610` 复查端口，避免旧进程占用）

## 六、与原型的关系

`EntryPage.vue` 是 `prototype-component-generate-entry.html` 的生产化落地：移除了原型自包含的 token CSS（改用项目 tokens）、代码片段生成器、主题切换（项目已有主题机制），保留并强化了核心 UX（首屏即生成、智能识别、校验、状态过渡）。原型仍可作为高保真视觉参考。

## 七、下一步建议

1. 接真实「最近生成」数据（接 `GET /api/tasks`）
2. 启动 dev server 验证编译与跳转
3. 可选：把被中断的「API 调试台」原型（prototype-api-console.html）也落地为真实页面
