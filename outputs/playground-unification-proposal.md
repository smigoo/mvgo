# Playground 页面设计统一化建议

> 目标：让 Playground 看起来仍是「感智晓界」的一部分，而不是另一个独立工具。
> 策略：**保留 IDE 沉浸式骨架，统一控件、颜色、信息层级、主题跟随**。

## 当前问题（基于截图与代码）

| 区域 | 当前状态 | 问题 |
|---|---|---|
| 全局入口 | 顶部主导航直接进入全屏三栏 | 缺少面包屑/上下文，用户不知道自己从哪来、这是哪个任务 |
| 顶部工具栏 | `a-button type="primary"` + 普通 `a-button` | 按钮风格与任务中心/接口开发的自定义按钮不一致 |
| 中间标签页 | `a-tabs type="editable-card"` | 使用 ant-design 默认样式，高度/圆角/关闭按钮与全站不统一 |
| 代码编辑器 | Monaco 固定 `theme="vs-dark"` | 浅色主题下代码区是“黑洞”，视觉断裂最严重 |
| 编辑器按钮 | `.editor-btn.save-btn` / `.revert-btn` | 自定义样式，与全站按钮体系不统一 |
| 左侧文件树 | 已改语义 token，但缺少统一文件类型图标/未保存指示 | 文件树风格与全局资源树不一致 |
| 右侧 AI 助手 | 已改浅色 token，但仍是独立实现 | 与组件生成页 AI 面板没有复用关系 |
| 底部配置面板 | `a-tabs type="card"` + ant 表单 | 折叠条、tab、输入控件与全站表单区不统一 |
| 错误/警告 | 质量警告横幅、AI 错误提示 | 颜色/图标/排版未接入统一 alert 体系 |

## 统一方案

### 1. 顶部加“工作路径条”（最重要，解决割裂感）

Playground 不应从主导航直接全屏展开，应保留一条上下文路径条：

```
[← 返回任务中心]  组件开发  /  mc-lite-17859...5d  /  Playground      [下载组件] [推送到 GitLab]
```

- 左侧：面包屑（组件开发 > 任务号）+ 组件名
- 中间：组件类型 badge（微码/Vue3）、档位 badge（Lite/Max）、状态 badge
- 右侧：统一按钮（下载、推送 GitLab）

这样用户明确知道自己仍在「任务-组件」链路里。

### 2. 代码编辑器跟随全局主题

- Monaco 主题由固定 `vs-dark` 改为根据 `html[data-theme]` 动态切换 `vs` / `vs-dark`。
- 这是浅色主题下视觉统一的关键，解决当前最大的“黑洞”问题。

### 3. 统一按钮体系

将 Playground 内所有按钮归到全站按钮类：

| 当前 | 建议 |
|---|---|
| 画布顶部 `a-button type="primary"` | `.btn-primary`（品牌实心） |
| 画布顶部普通 `a-button` | `.btn-secondary`（白底描边） |
| `.editor-btn.save-btn` | `.btn-primary.small` |
| `.editor-btn.revert-btn` | `.btn-secondary.small` |
| AI 输入区 `ant-btn-primary` | `.btn-primary` |
| AI 区「后退/恢复初始/下载 ZIP/清空对话」 | `.btn-secondary.small` / `.btn-text` |

### 4. 统一标签页

中间画布标签页改用项目自定义 tab 样式：

- tab 高度 36px，圆角 `--radius-sm` 顶部
- 未激活：`bg-card` + `border-default`
- 激活：`bg-page` + `brand` 上边框或下划线
- 关闭按钮统一尺寸和 hover 色
- 未保存文件 tab 加统一“修改圆点”

底部配置区 `a-tabs type="card"` 也按同样风格覆盖。

### 5. 统一文件树

左侧文件树：

- 文件/文件夹图标统一使用项目图标库（或 Emoji 图标集），不要用零散字符
- 文件类型按统一颜色：`vue`/`js` → 品牌蓝，`json` → 绿，`less`/`css` → 紫，图片 → 橙
- 未保存文件加统一的“修改指示点”
- 当前选中态与全局导航选中态一致

### 6. 抽离可复用 AI 助手面板

当前 AI 助手逻辑写在 `demo/index.vue` 里，建议抽成 `AiChatPanel.vue`：

- 组件生成页、Playground、任务详情页都可以复用
- 统一消息气泡、代码块、附件卡、输入框、状态空态
- 已改的颜色 token 直接迁移到新组件

### 7. 底部配置区统一表单语言

- 折叠条 `.config-toggle-bar` 改为与全局折叠面板一致：高度 36px、hover 态、图标动画
- `a-form-item` 卡片样式已改，但 label/输入框/分隔线仍需统一：
  - label 字号 12px、字重 500、颜色 `--text-secondary`
  - 输入框高度 32px、圆角 `--radius-sm`、边框 `--border-default`、focus `--brand`
  - `a-divider` 文字颜色与全站 section title 一致

### 8. 错误/警告统一

- 质量警告横幅改为统一 `AlertBanner` 组件（品牌 warning 色、圆角、关闭按钮）
- AI 输出错误用统一 error card：`--error-bg` + `--error-border` + `--error-text`
- 文件保存成功、代码推送成功等 toast/提示统一使用项目 message 风格

## 改动文件清单

| 文件 | 改动内容 |
|---|---|
| `frontend/src/views/demo/index.vue` | 顶部加工作路径条、统一按钮/标签页/文件树/AI 区/配置区样式 |
| `frontend/src/components/base-components/MonacoEditor.vue`（或 wrapper） | 主题跟随 `html[data-theme]` |
| 新建 `frontend/src/components/common/AiChatPanel.vue` | 抽离 AI 助手为复用组件 |
| 新建 `frontend/src/components/common/AlertBanner.vue` | 统一警告横幅 |
| `frontend/src/assets/styles/ui-components.less` | 补充 `.btn-primary` / `.btn-secondary` / `.tab-nav` / `.alert-banner` 等公共类 |
| `frontend/src/assets/styles/themes/tokens.css` | 如有缺失的 token（如 `--button-secondary-*`、`--alert-warning-*`）补充 |

## 落地优先级

- **P0（立刻见效）**：工作路径条 + Monaco 主题跟随 + 按钮统一
- **P1（体验统一）**：标签页统一 + 文件树统一 + AI 面板抽离复用
- **P2（精致化）**：配置区折叠/tab 统一 + AlertBanner 抽离 + 未保存指示统一

## 推荐做法

先不急着全改，建议按 P0 做一版：

1. 加工作路径条（10 行模板 + 样式）
2. Monaco 动态主题（改 MonacoEditor wrapper）
3. 把画布顶部和编辑器按钮换成项目统一按钮类

这三样做完，Playground 的“另一个产品”感会立刻消失。
