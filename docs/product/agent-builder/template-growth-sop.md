# Agent Builder 模板生长 SOP（反馈驱动）

> 版本：v1.0 · 2026-08-21
> 目标：让模板库由**用户需求驱动**生长，而不是开发拍脑袋。
> 适用：mvgo 平台 Agent Builder（backend-node/src/agent-builder）。

---

## 一、机制闭环

```
用户在界面搜不到模板
  → Step1 搜索空态 3 条路（AI 通用分析 / 配方库 / 反馈）
  → 反馈落池 config/agent-feedback/feedback-YYYY-MM.json（按月）
  → 按频次聚合 → 评估（决策树）→ 实现（模板/配方/组合方案）
  → 回填 status:done → 模板库生长 → 下次搜得到
```

## 二、反馈数据（config/agent-feedback/feedback-YYYY-MM.json）

```jsonc
[
  {
    "need": "解析 Excel 表格",        // 用户需求（必填）
    "query": "excel",                 // 触发时的搜索词（可选）
    "author": "anonymous",            // 提交人
    "ts": 1787210000000,              // 提交时间
    "status": "pending"               // pending=待处理 | done=已兑现（回填）
  }
]
```

- 接口：`POST /api/agent-builder/feedback`（body: { need, query }）
- 约定：**兑现后必须回写 `status: "done"`**，保持池子可审计

## 三、评估决策树（拿到一条反馈怎么判断）

```
用户要的能力「X」
│
├─① 能不能用现有节点组合？────────→ 沉淀为「配方」（config/recipes/）
│    例：网页→结构化表格 = web-fetch + llm-analyzer
├─② 是不是 LLM 能干的（分析/提取/生成/总结）？→ 引导用 llm-analyzer，或写默认 Prompt 模板
│    例：需求→数据库设计 = doc-analyzer + 2×llm-analyzer
├─③ 背后是不是外部 API/服务？────→ 用 http-request 节点接入（带 headers）
│    例：OCR / 翻译 / 天气（需要 Key，走凭据管理 P1）
├─④ 是确定性的本地处理逻辑？─────→ 新增「工具模板」（走下方开发规范）
│    例：Excel 解析 → excel-parse ✅（本条反馈已兑现）
└─⑤ 都复杂/需脚本沙箱 → 标记 P1（本地脚本）或 P2（网络 Skill 市场）
```

**优先级**：① 组合 > ② AI > ③ API > ④ 新模板 > ⑤ 远期。能用组合解决的绝不动模板库。

## 四、新模板开发规范（Checklist）

### 4.1 代码位置

- 工具模板：`src/agent-builder/templates/tool-templates.js`（渲染函数 + TOOL_TEMPLATES 注册）
- AI 模板：`src/agent-builder/templates/llm-templates.js`
- 每个模板 = 渲染函数（def → 代码字符串）+ resources 资源清单（inputs/outputs/params）

### 4.2 渲染函数模板骨架

```js
export function renderXxx(def) {
  const nullOut = def.outputs.map((o) => `${o.key}: null`).join(', ') || 'ok: false'
  return buildHeader(def) + `    // ← 逻辑从这里开始（this._run 内）
    const { 输入字段 } = params
    if (!必填) return { ${nullOut}, ok: false, error: '缺少 xxx' }
    try {
      // 核心逻辑
      const out = { 输出字段: 值, ok: true }
      return { ${def.outputs.map((o) => `${o.key}: out[${JSON.stringify(o.key)}]`).join(', ')} }
    } catch (e) {
      return { ${nullOut}, ok: false, error: '失败: ' + e.message }
    }
` + (需要SSRF防护 ? httpHelpers() : '') + buildFooter()
}
```

### 4.3 必守规则（防踩坑，均有真实事故）

| 规则 | 原因（踩坑记录） |
|---|---|
| **错误分支输出 `null` 字面量** | 早期 `{}["text"]` 生成 undefined（mapOut 误用） |
| **动态 import 三方库做 interop 兼容** | `import('xlsx')` 返回 CJS namespace，`readFile` 在 `mod.default` 上 → `const M = mod.default && mod.default.readFile ? mod.default : mod` |
| **外部网络请求必须 SSRF 防护** | `_blockedUrl` 拒绝 localhost/内网段（http-request/web-fetch 共用） |
| **超时控制** | AbortController / AbortSignal.timeout，防止挂死管线 |
| **大小/长度截断** | 网页文本、响应体截断，防烧 Prompt |
| **字段名白名单** | 用户字段名强制 camelCase 正则（sanitizeKey），逻辑本体写死 |
| **用户输入只进参数值** | 绝不拼接用户输入到代码/URL/路径 |

### 4.4 验证清单（新模板上线前必须全过）

```
① 渲染语法：SourceTextModule 解析通过（acorn/vm）
② 创建冒烟：POST /agent-builder/create → smoke passed
③ 真实数据试跑：POST /agent-builder/test（造真实数据，含中文/边界）
④ 错误分支：缺参 → {字段:null, ok:false, error}（无 undefined）
⑤ 安全：SSRF/超时/截断行为符合预期
⑥ 前端 build：vite build 通过
```

### 4.5 依赖安装

新增第三方依赖：`pnpm add <pkg>`（backend-node），**dist 运行时从 backend-node/node_modules 解析**（nest build 只编译 src）。

## 五、治理节奏

| 动作 | 频率 | 谁 |
|---|---|---|
| 拉取 feedback-YYYY-MM.json 聚合频次 | 每周 | 平台负责人 |
| 按决策树评估 TOP 需求 | 每周 | 平台负责人 |
| 实现模板/配方并回填 status:done | 随迭代 | 开发 |
| 反馈池过期的长期项迁移 P1/P2 规划 | 每月 | 平台负责人 |

## 六、配套界面（已完成）

- Step1 搜索空态三按钮：AI 通用分析 / 配方库 / 反馈提交 ✅
- 反馈接口 + 按月落盘 ✅
- 界面简化（三步向导 / 分组 / 空态引导）✅

---

**一句话**：用户反馈是模板库的"需求池"，决策树决定"怎么给"，开发规范保证"给得稳"，status 回填保证"闭环可审计"。
