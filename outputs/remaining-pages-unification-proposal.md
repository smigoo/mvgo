# 接口与架构页设计统一化建议

> 针对用户提供的 3 张截图：API 接口目录详情页、API 接口生成页、系统架构介绍页。
> 统一策略：**接口两页纳入「后台工具」语言；架构介绍页纳入「文档内容」语言；全站复用同一套 PageHeader / Card / Badge / Button / Form 体系**。

## 一、接口目录详情页（ApiCatalogDetail.vue）

### 当前问题

| 问题 | 位置 |
|---|---|
| 分隔线写错 token | `.tree-header { border-bottom: 1px solid var(--bg-alt) }` —— 用背景色当边框色 |
| 服务标签硬编码颜色 | `.service-tag { color:#6366f1; background:#eef2ff }` |
| HTTP 方法色硬编码 | `.method-get { color:#166534 }`、`.method-post { color: ... }` 等 |
| 函数卡片没有状态边条 | 与任务中心 `.task-card`（左边框状态色）不一致 |
| 页头直接手写 | 没有复用统一的 `.page-header` / `PageHeader` 组件 |
| 模块树图标是 inline svg | 与全站图标体系不统一 |

### 统一建议

1. **接入统一页头**
   - 使用 `PageHeader` 组件：icon + 标题/描述 + 操作区
   - 面包屑：`接口开发 > 江阴 > 接口目录`
   - 右侧操作：`下载 ZIP`

2. **左侧模块树统一**
   - 分隔线改为 `var(--border-light)`
   - 模块图标改为项目图标库
   - 选中态与全局导航选中态一致（`brand-bg` + `brand` 左边框）
   - 模块计数 badge 用统一 `.count-badge`

3. **HTTP 方法色接入语义 token**
   - `GET` → `var(--http-get)` / `var(--http-get-bg)`
   - `POST` → `var(--http-post)` / `var(--http-post-bg)`
   - `PUT` → `var(--http-put)` / `var(--http-put-bg)`
   - `DELETE` → `var(--http-delete)` / `var(--http-delete-bg)`
   - 这些应进 `tokens.css` 成体系，而不是页面内硬编码

4. **函数卡片复用 `.list-card` / `.task-card` 语言**
   - 白底卡片 + `border-light` + `radius-md`
   - 左边框加 2px 方法色条（`border-left-color: var(--http-get)`）
   - 悬停：`border-strong` + `shadow-sm`
   - 移除 `.service-tag` 硬编码，改用统一 tag 组件

5. **函数详情弹窗统一**
   - 使用项目 `Modal` / `Drawer` 组件
   - 参数表格样式与全局表格一致
   - 代码块用统一 `.code-inline` / `.code-block`

---

## 二、API 接口生成页（GenerateApiView.vue）

### 当前问题

| 问题 | 位置 |
|---|---|
| 使用大量 ant-design 原生组件 | `a-button`、`a-tabs`、`a-collapse`、`a-alert`、`a-tag` |
| 靠 `:deep()` 覆盖 ant 样式 | 维护成本高，且不同页面覆盖口径不一致 |
| 卡片圆角过大 | `--radius-xl` 频繁出现，与其他页面 `--radius-md` 不统一 |
| 历史卡片使用 `a-tag color="blue"` | 硬编码 ant 颜色 |
| 页头结构与其他页面不一致 | `.page-header-icon` 尺寸 42px，TaskCenter 是 32px |
| 历史卡片悬停 translateY(-1px) | 与任务中心、接口详情卡片不一致 |
| 配置状态 warn 色 fallback | `var(--warning-text, #fa8c16)` 仍保留硬编码兜底 |
| 输入框背景色自定义 | `color-mix(in srgb, var(--bg-hover) 62%, var(--bg-card) 38%)` 与全站 input 可能不一致 |

### 统一建议

1. **页头接入 PageHeader 组件**
   - icon 尺寸统一 32px
   - 标题/描述/操作区结构与 TaskCenter 一致
   - 面包屑：`接口开发 > API 接口生成`

2. **按钮全部替换为项目自定义按钮**
   - 主按钮 `.btn-primary`
   - 次按钮 `.btn-secondary`
   - 文字按钮 `.btn-text`
   - 彻底移除 `a-button` 依赖（或仅保留无样式的 wrapper）

3. **Tabs 接入统一 Tab 组件**
   - 全量生成 / 单模块生成 两个 tab
   - 胶囊/线型 tab 与全站一致
   - 移除 `:deep(.ant-tabs-nav)` 大段覆盖

4. **卡片圆角统一为 `--radius-md`**
   - 配置栏、模式面板、结果卡片、历史卡片全部收敛
   - 大圆角只保留在模态框/特殊营销卡片

5. **历史卡片复用 `.history-card` / `.list-card` 语言**
   - 与接口详情函数卡片、任务中心 task-card 同族
   - 类型 badge 用统一 `.type-badge`，不要 `a-tag color="blue"`
   - 悬停效果统一为 border+shadow，不要 translateY

6. **表单输入框统一**
   - 高度 32px、圆角 `--radius-sm`、边框 `--border-default`
   - 背景默认 `var(--bg-card)`，focus `var(--brand)`
   - 与全站 `input` 样式一致

7. **Alert / 结果提示统一**
   - 使用项目 `AlertBanner` 组件
   - 成功结果卡片用统一 `.result-card--success`
   - 移除 `a-alert`

---

## 三、系统架构介绍页（Intro.vue）

### 当前问题

| 问题 | 位置 |
|---|---|
| 大量行内 style | 几乎每个 agent-card、highlight-box 都有 `style="..."` |
| emoji 图标混用 | ♻️ ⚔️ 等表情符号，与全站图标体系不一致 |
| 渐变色直接使用 `--c-*` 硬编码 | `linear-gradient(135deg, var(--warning-light) 0%, var(--c-yellow-400) 100%)` 等 |
| 卡片悬停 translateY(-4px) | 与全站不一致 |
| 页面级 tab 自定义实现 | `.tabs-header .tab-btn` 与全站 tab 组件不统一 |
| 又引入一个 `AppHeader` | 顶部 `<AppHeader />` 与全局导航叠加，截图里主导航已经存在，疑似重复 |
| 多种 highlight-box 变体 | warn/success/brand 各自写样式，未复用统一 alert/info 组件 |
| 页面标题样式独特 | `.page-header h1` 与全站 page-title 不一致 |

### 统一建议

1. **移除顶部 `<AppHeader />`**
   - 全局导航已由外层布局提供，不需要页面内再引一次
   - 避免 double header

2. **页头接入 PageHeader 组件**
   - 标题：`感智晓界系统架构介绍`
   - 副标题：`智能体协助开发平台设计思路`
   - 返回：`← 返回开发界面`

3. **页面级 tab 接入统一 Tab 组件**
   - 第一代架构 / 第二代架构 / 技术选型对比 / 平台能力拓扑图
   - 与 GenerateApiView 模式 tab 同族

4. **内容组件化**
   - 架构图：抽成 `ArchitectureDiagram.vue`，节点/连线/颜色统一
   - 流程步骤：抽成 `StepFlow.vue`，与 IdlePanel「快速上手」时间线同族
   - 高亮提示框：统一用 `.info-box` / `.warning-box` / `.success-box`
   - 角色卡片：统一用 `.agent-card`（与任务中心/接口页卡片同族）
   - 对比表格：统一用 `.comparison-table`（已存在，但需确认表头/行 hover 与全站表格一致）

5. **图标统一**
   - 所有 emoji 替换为项目图标库（ant icon 或自定义 svg）
   - 角色/能力图标按语义分类：AI → brain/robot，脚本 → terminal，渲染 → camera 等

6. **颜色统一**
   - 渐变色全部进 `tokens.css` 的 `--gradient-*` 系列
   - 角色卡片边框色用 `--component-*` 或 `--role-*` 语义 token
   - 移除行内 `style="border-left-color: var(--c-purple-500)"`

7. **卡片悬停统一**
   - 与任务中心/接口详情一致：border+shadow
   - 不要 translateY

---

## 四、三页共用统一组件清单

建议优先抽以下公共组件/类：

| 组件/类 | 用途 | 覆盖页面 |
|---|---|---|
| `PageHeader.vue` | 统一页头（面包屑/icon/标题/描述/操作） | 全部 |
| `ListCard.vue` / `.list-card` | 可点击列表卡片 | 任务中心、接口详情、接口生成历史 |
| `StatusBadge.vue` / `.status-badge` | 状态/类型 badge | 全部 |
| `HttpMethodBadge.vue` | HTTP 方法色 badge | 接口详情、接口生成 |
| `TabNav.vue` / `.tab-nav` | 页面级 tab | 接口生成、架构介绍 |
| `AlertBanner.vue` | 警告/成功提示条 | 接口生成、架构介绍 |
| `EmptyState.vue` | 空状态 | 接口生成、任务中心 |
| `CodeInline.vue` / `.code-inline` | 行内代码 | 接口详情、架构介绍 |
| `StepFlow.vue` | 步骤流程 | 架构介绍、IdlePanel |
| `SectionTitle.vue` / `.section-title` | 内容区块标题 | 架构介绍 |

---

## 五、新增 Token 建议

在 `tokens.css` 中补充以下语义 token，避免页面硬编码：

```css
/* HTTP 方法色 */
--http-get: #16a34a;
--http-get-bg: #dcfce7;
--http-get-text: #166534;
--http-post: #3b82f6;
--http-post-bg: #dbeafe;
--http-post-text: #1e40af;
--http-put: #f59e0b;
--http-put-bg: #fef3c7;
--http-put-text: #92400e;
--http-delete: #ef4444;
--http-delete-bg: #fee2e2;
--http-delete-text: #991b1b;

/* 文档内容 */
--info-box-bg: ...;
--info-box-border: ...;
--warning-box-bg: ...;
--warning-box-border: ...;
--success-box-bg: ...;
--success-box-border: ...;

/* 渐变色 */
--gradient-agent: ...;
--gradient-validator: ...;
--gradient-generator: ...;
```

---

## 六、落地优先级

- **P0（立刻消除割裂）**：
  1. 统一 PageHeader（三页全部接入）
  2. ApiCatalogDetail 分隔线 token 修复 + HTTP 方法色 token 化
  3. GenerateApiView 卡片圆角收敛 + 历史卡片 `a-tag` 替换
  4. Intro.vue 移除 `<AppHeader />`

- **P1（体系统一）**：
  1. GenerateApiView ant-design 组件替换为自定义组件
  2. 接口详情函数卡片与任务中心卡片同族化
  3. Intro.vue 行内 style 收敛 + 图标统一

- **P2（组件沉淀）**：
  1. 抽离 `PageHeader`、`ListCard`、`StatusBadge`、`HttpMethodBadge`、`TabNav`、`AlertBanner`
  2. 统一 EmptyState、CodeInline、StepFlow、SectionTitle
  3. 新增 HTTP/文档 token 并替换所有硬编码

---

## 七、改动文件清单

| 文件 | 改动 |
|---|---|
| `frontend/src/views/ai-workspace/ApiCatalogDetail.vue` | 接入 PageHeader、修复 tree-header 边框、HTTP 方法 token 化、函数卡片同族化 |
| `frontend/src/views/ai-workspace/GenerateApiView.vue` | 接入 PageHeader、替换 ant 组件、统一按钮/tabs/cards、圆角收敛 |
| `frontend/src/views/generator/Intro.vue` | 移除 AppHeader、接入 PageHeader、tab 组件化、内容组件化、行内 style 清理 |
| 新建 `frontend/src/components/common/PageHeader.vue` | 统一页头组件 |
| 新建 `frontend/src/components/common/ListCard.vue` | 统一列表卡片 |
| 新建 `frontend/src/components/common/StatusBadge.vue` | 统一状态/类型 badge |
| 新建 `frontend/src/components/common/HttpMethodBadge.vue` | HTTP 方法 badge |
| 新建 `frontend/src/components/common/TabNav.vue` | 统一 tab 组件 |
| 新建 `frontend/src/components/common/AlertBanner.vue` | 统一 alert 提示 |
| `frontend/src/assets/styles/ui-components.less` | 补充 `.page-header`、`.list-card`、`.status-badge`、`.tab-nav`、`.alert-banner`、`.code-inline`、`.section-title` 等 |
| `frontend/src/assets/styles/themes/tokens.css` | 补充 `--http-*`、`--info-box-*`、`--warning-box-*`、`--success-box-*`、`--gradient-*` |
