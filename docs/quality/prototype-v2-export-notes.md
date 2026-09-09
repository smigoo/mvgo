# 组件生成工作台 v2 · 导出说明（Export Notes）

> 状态：历史导出记录。原始 HTML 未保留在当前 docs 仓库，本文只保留当时的自包含性核查结果，不作为当前可打开文件的索引。
> 导出角色：交付达（export-specialist）
> 动作：**仅核查与归档**，未修改原型 HTML 本体。
> 核查方式：grep 级自包含完整性校验 + 修订要点逐条复核。

---

## 一、交付物

| 项 | 值 |
|----|----|
| 原始文件 | 当前 docs 仓库未保留（历史路径 `/Users/smigoo/工作/mvgo/artifacts/prototype-generator-workbench-v2.html` 已失效） |
| 历史规模 | 1160 行 |
| 历史大小 | ~56 KB（单文件，HTML+CSS+JS 全内联） |
| 依赖 | 零外部 CDN / 字体 / 图片 / 网络请求 |
| 当前打开方式 | 不适用；原始 HTML 未纳入当前 docs 仓库 |

---

## 二、自包含完整性核查结论

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 无 `http(s)://` 外链（除 SVG xmlns） | ✅ PASS | 仅 L1138 `xmlns="http://www.w3.org/2000/svg"`（SVG 命名空间，允许）；L1033 为 JS 校验正则字符串，非实际请求 |
| 无 `cdn` 实际引用 | ✅ PASS | `cdn` 仅出现在 L22 注释「零外部 CDN」措辞中 |
| 无 Google Fonts / 外链字体 | ✅ PASS | 字体统一用系统栈 `--font-sans`（L80），无 `@font-face` / `fonts.googleapis` |
| 无 `@import` | ✅ PASS | 全文无 `@import` |
| 无外链 `<link>` | ✅ PASS | 无 `<link rel="stylesheet">` 等外链 |
| 无外链 `<img src>` | ✅ PASS | `<img id="srImg">`（L818）无 src 属性，运行时由 JS 赋 `data:`/objectURL；无 `src="http…"` |
| 无 `fetch` / `XMLHttpRequest` / 外链资源 | ✅ PASS | grep 无命中；无相对路径资源依赖 |
| CSS 全内联 `<style>` | ✅ PASS | L30–L465 单文件内 |
| JS 全内联 `<script>` | ✅ PASS | L647–L1158 单文件内 |
| 图标为内联 SVG | ✅ PASS | `ICON` 对象（L690–699）+ 多处内联 SVG，无 emoji 图标 |
| 占位图为 data-URI | ✅ PASS | `PLACEHOLDER_IMG`（L1137）为内联 SVG data-URI |
| 双击即开、无构建/服务器 | ✅ PASS | 无任何外部加载，纯静态单文件 |

**结论：零依赖、可独立运行 —— PASS。**

---

## 三、修订要点复核（迭代目标达成）

| 目标 | 结果 | 关键位置 |
|------|------|----------|
| 左/中无重复输入面：中栏 dropzone 唯一 | ✅ 达成 | `buildDropzone`（L789）；中栏是唯一拖入/粘贴/选择入口 |
| 左栏截图 Tab 无第二上传区 | ✅ 达成 | `src-screenshot`（L501）仅引导文案 + 只读文件名/尺寸（`shot-meta`），无上传控件 |
| Max/Lite 常驻左栏「生成规格」区 | ✅ 达成 | `tier-toggle` section（L542）所有来源下均渲染，默认 Lite |
| 截图源下 Max 禁用灰+锁+tooltip 占位不隐藏 | ✅ 达成 | `seg-disabled`（L289）+ `lock-ico`（L552）+ `tip`（L555），`pointer-events:none` 但占位可见 |
| Figma 已确认组件中栏只读回显（readonly-echo + 绿对勾） | ✅ 达成 | `buildReadonlyEcho`（L848）+ `confirmed-badge`（L378 绿对勾 SVG） |
| 左栏 Figma 为单一可交互数据源，中栏无重复交互预览 | ✅ 达成 | 左栏 `figma-card`（L520）可拉取/确认；中栏仅回显，不重复渲染可交互预览 |
| 左/中同源元信息不双显（左栏唯一） | ✅ 达成 | 左栏 `shot-meta` 唯一显示 文件名·尺寸（L503）；中栏 `shot-ready` 仅显示图片（L818）。Figma 侧左栏卡显示 节点·尺寸（L531），中栏 `readonly-echo` 仅 来源/Figma·规格（L855），未双显 节点·尺寸 |

**结论：本次迭代四条核心目标全部达成 —— PASS。**

---

## 四、如何打开

- 原始 v2 HTML 未保留在当前仓库，以上交互验证步骤仅适用于历史导出文件存在的环境。
- 当前可用原型请查看 `docs/prototypes/` 目录，并以该目录实际文件为准。
- **交互验证点**：
  1. 顶部右侧按钮切换浅色/深色主题；
  2. 中栏拖入 / ⌘V 粘贴 / 点击「选择图片」载入截图 → 左栏出现只读文件名·尺寸，Max 呈禁用灰+锁；
  3. 切换「Figma」Tab → 粘贴 figma.com 链接 → 获取预览 → 确认 → 中栏出现只读回显 + 绿对勾；
  4. 点击「生成组件」→ 进度模拟 → 结果 iframe 预览 → 下载 ZIP（模拟）。

---

## 五、历史 P2 可优化项（非阻塞）

> 标注：以下 P2 均为**非阻塞**打磨项，不破坏独立运行与核心交互。
> P2-1~P2-5 为 critique-reviewer 审查报告的**权威列表**（已采用定稿）；
> P2-6~P2-10 为导出终检自审的**补充项**。

### 权威列表（critique-reviewer）

- **P2-1 · 缺 `prefers-reduced-motion`**：未尊重「减少动态效果」系统偏好。建议补
  `@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}`。
- **P2-2 · 缺显式 `:focus-visible`**：键盘聚焦态无可见描边。建议统一加
  `.btn:focus-visible,.seg:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}`。
- **P2-3 · 禁用 Max 的 tooltip 仅 hover 触发**：键盘用户无法看到「该来源暂不支持 Max」提示。建议补
  `.seg-wrap.is-disabled:focus-within .tip`，或给 wrapper 加 `tabindex="0"` 使键盘可见。
- **P2-4 · 来源 Tab 缺 tabpanel 语义**：`source-tabs` 有 `role="tablist"`，但 `src-pane` 未标
  `role="tabpanel"` / `aria-labelledby`，可访问性不完整。建议补全 ARIA 配对。
- **P2-5 · 中栏 iframe `sandbox="allow-scripts"` 偏宽**：`RESULT_HTML` 本身无脚本，可收紧为 `sandbox=""`
  进一步最小化攻击面（当前 `allow-scripts` 仍安全、自包含，非硬伤）。

### 补充项（导出终检自审）

- **P2-6 · 主题偏好未持久化**：`applyTheme()`（L1111）每次加载默认 `light`，无 `localStorage` 记忆；刷新即丢失当前主题。非阻塞（原型演示可接受）。
- **P2-7 · 跨源历史回填状态残留**：点击右栏历史任务回填时（L1092）仅切换 `source` 与 Max 禁用态，未重置 `figmaConfirmed` / `figmaPreview` / `screenshotName` 等跨源状态。视觉上因 Tab 切换会隐藏对应面板而不暴露，但状态机可更严谨。非阻塞。
- **P2-8 · Figma URL 校验仅静默禁用**：`figmaUrl` 校验失败仅禁用「获取预览」按钮（L1031），缺少 inline 错误提示态。非阻塞（符合单一输入面原则，中栏不重复入口）。
- **P2-9 · `color-mix()` 旧浏览器降级**：dropzone 悬停态背景用 `color-mix()`（L335/L340），Chrome 111+ / Safari 16.2+ 支持；旧版降级为无着色，不影响布局。非阻塞。
- **P2-10 · 结果预览 iframe 不随主题**：结果 `iframe` 用 `srcdoc` 内联 `RESULT_HTML` 且 `sandbox="allow-scripts"`（L898，安全自包含），但无法继承父页主题变量，深色模式下预览仍为浅色。非阻塞（原型演示可接受）。

---

## 六、归档结论

✅ 自包含完整性：**PASS**（零依赖、可独立运行）
✅ 修订目标达成：**PASS**（四条核心目标全部达成）
📦 交付物已就绪，可直接交付评审 / 演示。
