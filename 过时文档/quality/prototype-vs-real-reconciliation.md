# 原型 ↔ 真实实现 一致性核查报告
## 组件生成工作台（/generator/components）

> 状态：历史核查报告（截至 2026-08-13）。原型 HTML 未保留在当前 docs 仓库，本文的原型路径仅作历史核查对象记录，不是当前可打开文件的索引。
> 生成时间：2026-08-13 续接 · 由 UX Researcher 主理闭环
> 核查对象：
> - 原型（历史设计规格）：原始 `artifacts/prototype-generator-workbench.html` 已不在当前仓库（历史规模 1018 行 / 54.6 KB）
> - 真实实现：`frontend/src/views/generate/components.vue`（131 KB）+ `frontend/src/components/generate/IdlePanel.vue`
> 方法：对原型 11 项 Must-Haves 逐条 Grep 真实代码落点，结合 Phase 4 质量审查结论。

---

## 一、结论速览

✅ **闭环成立**。原型作为"已验证设计规格"的任务已完成——真实 `components.vue` 不仅逐项落实了原型的交互决策，还超出原型补全了 HTML 拆分生成、docx-html 组合模式、批量生成、Java 侧 zip 交付等能力。二者在**布局、三栏比例、单一 URL 数据源、Figma 中间确认闸门、主题切换、响应式降级**上完全一致。

🟡 **唯一"差异"属于设计决议不同，非缺失**：原型用"文档徽标 可选灰 / 必填红"表达来源对文档的要求；真实代码改为把 web 来源拆成 `html`（文档可选）与 `docx-html`（文档即核心输入）两个模式。功能意图等价，建模更干净。

---

## 二、原型 11 项 Must-Haves ↔ 真实实现 对照

| # | 原型 Must-Have | 真实 `components.vue` 落点 | 状态 |
|---|---|---|---|
| 1 | 唯一 URL 文本框（仅左栏 Figma 专属输入区） | `figmaUrl` v-model @ L294 / L1154；URL 历史下拉 @ L363–381 | ✅ |
| 2 | 文档徽标：可选灰 / 必填红 | 共享"需求文档（可选）"区 @ L534–536；web 必填意图由 `docx-html` 模式承载 @ L1274/L1569 | 🟡（建模不同，见第五节） |
| 3 | 中间舞台三态（idle / 拖入预览 / 成果） | `IdlePanel` @ L849/L1139；`rawHtmlPreview` 分裂面板 @ L719；结果态 @ L1005–1014 | ✅ |
| 4 | 右栏"进行中"实时统计 | `history-panel` @ L1050；`historyDotClass/historyTagClass` @ L2442–2457 | ✅ |
| 5 | 生成使能：`figma` 需 `figmaPreview && figmaConfirmed` | `isValidFigmaUrl && previewConfirmed` @ L1397；`validateConfig` 返回"请先确认预览图" @ L1346 | ✅ |
| 6 | Figma「确认这是目标组件」中间闸门 | `preview-confirm-btn` / `previewConfirmed` @ L354–359 / L1165；`confirmFigmaPreview` @ L1452 | ✅ |
| 7 | 网页来源必填缺失 → 红字 + 禁用 | `html`/`docx-html` 模式校验 @ L1313/L1319；`docx-html` 以文档为核心输入 | 🟡（见第五节） |
| 8 | 浅色默认 + `[data-theme="dark"]` 切换 | `html[data-theme='light'/'dark']` @ L2592/L2595 | ✅ |
| 9 | 窄屏 <1024px 抽屉降级 | `@media (max-width:1024px/900px/1200px)` @ L4113–4151（reflow 等价方案） | ✅ |
| 10 | 拖拽 / 粘贴手势录入（中间舞台） | `drag/drop` @ L221–225、L390–394、L540–544；全局 `paste` @ L2542 | ✅ |
| 11 | 三栏满屏、无 max-width 限宽（344 / 1fr / 320） | `grid-template-columns: 344px minmax(0,1fr) 320px` @ L2691 | ✅ |

**✅ 9 项完全一致 · 🟡 2 项设计决议不同但功能等价**

---

## 三、真实实现超出原型的部分（Superset）

| 能力 | 真实代码落点 | 说明 |
|---|---|---|
| 第 4 来源模式 `docx-html`（HTML + 需求文档） | L170–174 / L1274 / L1569–1609 | 原型仅 3 来源；真实补"上传 HTML 文件 + docx"组合 |
| HTML 拆分生成：分析 → 勾选组件 → 导出 MD 交付包 | L2101–2123 / L2162–2197 | 原型未含；真实接 Java 侧 build 生成 zip |
| 批量生成 / 拆分选择 | L1316 / L2216 | 原型未含 |
| 生成规格 Lite / Max 切换 | L623–634 | 原型仅隐含 |
| Figma URL 历史持久化 | `URL_HISTORY_KEY` @ L2473 / L2491 | 原型仅内存 |

---

## 四、Phase 4 质量审查结论（回顾）

原型审查 **PASS 24/25**（1 项 P1 tertiary 对比度、1 项 P2 拖拽遮罩兜底已修复并 Grep 复核落盘）：
- L27 浅色 `--color-text-tertiary:#64748b`（≥4.5:1）
- L66 深色 `#8b97a7`
- L263 `background:rgba(37,99,235,0.10)` 拖拽遮罩兜底
- L826 非图片拖入 `showToast('请拖入图片文件')`

---

## 五、唯一差异的设计决议说明（非缺陷）

**原型设计**：单一 web 模式 + 文档徽标随来源变色（截图/Figma=灰可选，web=红必填）。
**真实实现**：将 web 拆为两个独立模式——
- `html`：粘贴/拖入 URL 或 HTML，**文档可选**（灰，对应原型"可选灰"）
- `docx-html`：「HTML + 需求文档」，**文档即核心输入**（对应原型"必填红"的意图）

✅ 意图等价，且避免了"同一模式下必填项随状态跳变"的可用性风险。若产品希望 UI 上**字面还原**红/灰徽标，仅需在第 4 节 doc 区的 label 上按 `sourceMode` 动态切换"可选/必填"文案与色，属纯展示层改动（低风险）。

---

## 六、下一步建议（待确认）

1. **A（推荐）· 接受核查为闭环**：原型已达成"验证规格"使命，无需改代码；本文件即交付物。
2. **B · 字面还原文档徽标**：在 doc 区按 `sourceMode` 动态显示"可选（灰）/ 必填（红）"，纯 UI，低风险。
3. **C · 真实页 UX QA 深查**：对 `components.vue` 做对比度 / 焦点态 / 1024·900 断点 / 键盘可达性体检并出报告。

> 注：设计原型专家团 `design-engine-generator` 已于上一轮 `TeamDelete` 清理；`components.vue` 与 `IdlePanel.vue` 本次未改动，仅作核查背景。
