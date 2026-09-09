# API 接口生成页 · 原型设计规范 v2

> 配套原型：`../../prototypes/api-gen-prototype.html`（可浏览器直接打开，含浅/深色切换）
> 范围：API 接口生成页（左侧工作台 + 右侧边栏「概览 / 历史」）
> 设计基线：对齐项目 `frontend/src/assets/styles/themes/tokens.css`（Layer1 原始色板 + Layer2 语义令牌）

## 1. 设计目标

原截图痛点：右侧边栏「乱七八糟」——区块贴太紧、概览 horizontal 卡三段平铺主次不清、历史卡三个文字按钮横挤、两块大区无视觉分层。

优化方向（与已落地代码一致，原型进一步固化）：

| 维度 | 处理 |
|---|---|
| 结构分层 | 整栏拆两个 `<section>`（`gap:22px`）；概览区固定，历史区 `flex:1` 内部滚动 |
| 区块标题 | 「生成概览 / 生成历史」→ `<header>` + 右上 `rp-badge`（总览 / N 条） |
| 最近项目 | 弃用 horizontal StatCard 三段平铺 → 专用卡片：图标 + 上下结构（eyebrow「最近项目」/ 大字项目名）+ 全量/单模块类型 tag + 左侧品牌强调线 |
| 历史头部 | 白卡化（icon 盒 + 标题/副标题 + 刷新按钮），与概览卡统一语言 |
| 历史卡片 | 默认只显示「类型 tag + 项目名 + 时间 + 接口/文件数」；操作（查看/下载/删除）**hover / focus 才显形**，卡片默认安静 |
| 滚动区 | `.rp-scroll` 在第二个 section 内独占 `flex:1`，`gap:12px` 让 header / list 自然分层 |

## 2. 设计令牌（关键值，直接复用 tokens.css）

| 类别 | Token | 浅色 | 深色 |
|---|---|---|---|
| 背景 | `--bg-page` | `#f0f4fa` | `#0b1120` |
| 背景 | `--bg-card` | `#fff` | `#1a2332` |
| 品牌 | `--brand` | `#2563eb` | `#3b82f6` |
| 品牌底 | `--brand-bg` | `#eff6ff` | `rgba(59,130,246,.12)` |
| 文字 | `--text-primary/secondary/tertiary/quaternary` | `#0f172a / #475569 / #64748b / #6b7280` | `#e2e8f0 / #94a3b8 / #64748b / #6b7a94` |
| 边框 | `--border-light / --border-strong` | `#e5e5e5 / #cbd5e1` | `#334155 / #3b4a63` |
| 成功 | `--success` | `#15803d` | `#bbf7d0` |
| 圆角 | `--radius-xs/sm/md/lg/xl/full` | `2/4/6/10/14/999` | 同 |
| 阴影 | `--shadow-sm/md` | `0 2px 8px /.08` / `0 8px 16px /.08` | 弱化至 `.2/.25` 黑底 |
| 过渡 | `--transition-fast/base` | `.15s` / `.2s` | 同 |

> 所有颜色、圆角、阴影**一律走 Token，禁止硬编码**（项目治理红线）。

## 3. 布局与断点（移动优先）

| 断点 | 行为 |
|---|---|
| ≥1100px（默认桌面） | 工作台 `flex:1` + 右侧栏固定 `340px`，左右分栏 |
| ≤1100px | 上下堆叠，右侧栏 `width:100%` + `max-height:48vh`，`border-top` 替代 `border-left` |
| ≤768px | 单列；配置条 / 历史头 / 操作行改为纵向堆叠；历史卡头允许换行 |

## 4. 组件清单

1. `config-bar` — Apifox 连接状态条（connected 态用成功色描边 + 浅绿底）
2. `config-form` — 项目参数卡（输入 + 字段提示 + 缺失 Token 警告）
3. `source-tabs` — 全量 / 单模块分段切换（segmented control，active 白卡浮起）
4. `config-card` — 当前模式配置卡（标题 + 说明 + 表单）
5. `cta` — 主生成按钮（品牌渐变 + 阴影 + hover 上浮 1px）
6. `result-card` — 成功结果卡（图标 + 模块 tag + 下载/目录）
7. `stat-grid` / `stat-card` — 概览双卡（大数字 + 标签，品牌/成功色）
8. `latest-card` — 最近项目高亮卡（icon + eyebrow + 名 + 类型 tag + 左强调线）
9. `history-header` — 最近导出头部（icon 盒 + 标题/副标题 + 刷新）
10. `history-card` — 历史条目（类型 tag + 名称 + 时间 + 子模块 + 接口/文件 badge + hover 操作）

## 5. 微交互（仅 `transform` / `opacity`，GPU 加速）

| 元素 | 状态 | 参数 |
|---|---|---|
| 卡片 / 按钮 | hover | `box-shadow: var(--shadow-sm)` / `transform: translateY(-1px)`，`.2s` |
| 历史操作按钮 | 默认→hover/focus | `opacity 0→1` + `translateY(2px)→0`，`.15s` |
| 主 CTA | hover / active | 上浮 1px / 回落；阴影加深 |
| Tab active | 切换 | 白卡浮起 + 字重 600 |
| 焦点 | `:focus-visible` / `:focus-within` | `box-shadow: var(--shadow-focus)`（品牌 2px 环） |

## 6. 无障碍（WCAG 2.2 AA）

- 正文对比度 ≥ 4.5:1，大字号 / UI 组件 ≥ 3:1（无需改色，Token 已满足）
- 语义结构：`<main>` / `<aside>` / `<section>` / `<header>` / `<h1-h2>` 层级清晰
- 交互元素可键盘操作：历史卡 `tabindex="0"`，`focus-within` 显形操作按钮；Tab 用 `role="tab"` + `aria-selected`
- 图标按钮保留 `title` + 非装饰 SVG（hover 仍有文字提示，不依赖颜色传达）
- 不滥用 ARIA：图标 `aria-hidden`，仅装饰

## 7. 与已实现代码的差异点（原型进一步确认）

- 历史卡片操作改为**默认隐藏、hover/focus 显形**——比当前已上线的「常驻 icon-only 按钮组」更安静，减少视觉噪音（建议采纳）。
- 概览区 `stat-grid` 与 `latest-card` 间距统一为 `gap:12px`。
- 深色模式 Token 直接引用，无需额外适配。

> 下一步：确认原型方向后，我将把上述差异点落到 `GenerateApiView.vue`（历史卡 hover 显形逻辑），并跑 `vite build` 验证。
