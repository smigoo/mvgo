# 感智晓界全面优化方案（2026-08-07）

> 目标：消灭三类系统性 bug（漏传/错位/时序），从结构上消灭"不同环境、不同等级版本代码很难维护"的技术债。

## 优化矩阵（18 项）

### 一、代码层面（6 项）

| # | 优化项 | 当前状态 | 优化后 | 收益 | 阶段 |
|---|---|---|---|---|---|
| 1 | **资源注入实现** | 2 份并存（engineer 类内 + utils） | 单一事实源（utils 一处） | 改一处生效，消灭漂移 | 0 |
| 2 | **档位判断** | `tasks.service.ts:1152` 用 sessionId 正则反推 | 显式 `ctx.tier` 字段 | 一眼看清档位，加新档位只改一处 | 1 |
| 3 | **档位差异配置** | 分散在图状态机 + 工程师类 if/else | `TierProfile[ctx.tier]` 配置对象 | 加新档位/改规则只改配置 | 1 |
| 4 | **资源变量名解析** | engineer 内私有 `_formatResourceMapping` + 独立 `resource-mapping-formatter.js` | 单一 `resource-vars.js` 纯函数 | 编号口径统一，prompt/注入共用 | 0 |
| 5 | **四模块复制粘贴** | lite/phase2/vue3/page-generator 各自复制一份 orchestrator + progress + apiKey | `GenerationOrchestrator` 统一骨架 + 策略 DI | 代码量砍 60%，改一处生效 | 2 |
| 6 | **engineer 继承耦合** | `Vue3Engineer extends MicrocodeEngineer`，改父类震坏两条产品线 | 组合替代继承，各自组装策略 | 父类改动不再影响 Vue3 | 2 |

### 二、防御层面（4 项）

| # | 优化项 | 当前状态 | 优化后 | 收益 | 阶段 |
|---|---|---|---|---|---|
| 7 | **CSS url() 路径校验** | 后处理只修前缀，不校验文件存在 | `validateCssResourceUrls` 后处理校验+修正 | 模型写错路径能自动修/告警 | 0 |
| 8 | **资源文件存在性** | figma-connector 导出失败时 mapping 有但文件无 | 导出后校验 mapping 每路径真实存在 | fail-fast，不进入生成流程 | 1 |
| 9 | **refiner 后资源复核** | 每个 refiner 节点手动接 gate | `enforceResourceImportsOnDisk` 自动在所有 refiner 出口生效 | 改坏文件漏网概率降为零 | 1 |
| 10 | **语义门禁时序** | 注入在门禁后（死代码）→ 已修到门禁前 | 固化到 generateCode 出口，成为规范 | 不会再次被误排 | 0 |

### 三、预览/沙盒层面（4 项）

| # | 优化项 | 当前状态 | 优化后 | 收益 | 阶段 |
|---|---|---|---|---|---|
| 11 | **lite 预览沙盒** | iframe 无 sandbox 属性，靠后端正则 sanitize | 补 `sandbox="allow-scripts"`，sanitize 换 DOMPurify 或补 `javascript:` 过滤 | 防 XSS 变种绕过 | 0 |
| 12 | **mc/vue3 预览沙盒** | `allow-same-origin` 保留，同源下可访问父页面 DOM | 预览页独立子域 + postMessage 精确 targetOrigin，摘掉 `allow-same-origin` | 防预览代码污染宿主 | 2 |
| 13 | **预览崩溃影响范围** | 崩溃只在 iframe 内，但可能泄漏 localStorage | 沙盒统一后完全隔离 + 错误上报通道 | 预览白屏不污染 Playground | 2 |
| 14 | **微码 ESM import 鲁棒性** | 未验证（Vue3 已用 new URL 规避 RUNTIME-004） | 实测后决定：保持 / 改用 new URL | 消除运行时解析不确定性 | 0 |

### 四、架构层面（4 项）

| # | 优化项 | 当前状态 | 优化后 | 收益 | 阶段 |
|---|---|---|---|---|---|
| 15 | **上下文透传** | 散在 state 各字段，可能漏传 | `GenerationContext` 值对象强类型 | 漏传编译期报错 | 1 |
| 16 | **预览发布策略** | `workspace-preview-publisher.js` 候选 URL 环境配置散在主流程 | `PreviewRenderer[componentType, env]` 策略接口 | 加新预览形态只加实现 | 2 |
| 17 | **环境差异** | 代码里 if/else 环境判断 | 全部进 env config，代码无环境分支 | 部署配置化 | 1 |
| 18 | **版本号注释** | 134 处 v2.2/v3.x/P0/P1 补丁标记 | 全部删掉，交给 git 历史 | 代码清爽 | 1 |

---

## 阶段 0：止血 + 验证（今天，4~6 小时）

### 0-1 单一事实源收口（2 小时）

**目标**：删除 engineer 类内的 `injectResourceImports` / `injectVue3ResourceUrls` 方法，调用点改走 `utils/resource-import-guard.js`。

**改动点**：
1. `backend-node/src/ai-engine/roles/microcode-engineer.js`
   - 删除 `injectResourceImports` 方法（L5477-5583）
   - 删除 `_resolveResourceDomMapping` 方法（L5600-5622）
   - 修改 L2260（generateCode 内）：`this.injectResourceImports` → `import { injectResourceImports } from '../utils/resource-import-guard.js'; injectResourceImports(...)`
   - 修改 L5013（execute 内）：同上
2. `backend-node/src/ai-engine/roles/vue3-engineer.js`
   - 删除 `injectVue3ResourceUrls` 方法（L960-985）
   - 删除 `_resolveResourceDomMapping` 方法（L998-1015）
   - 修改 L1050（execute 内）：`this.injectVue3ResourceUrls` → `import { injectVue3ResourceUrls } from '../utils/resource-import-guard.js'; injectVue3ResourceUrls(...)`
   - 同时改 L1026：`this._resolveResourceDomMapping` → `import { resolveResourceDomMapping } from '../utils/resource-import-guard.js'; resolveResourceDomMapping(...)`

**验收**：
- `build-backend.sh` 通过
- 重启后端，13030 监听正常
- 跑历史失败组件（`mc-max-1786072591718-4d4c4b19`）复测，确认资源 import 仍能正常注入

### 0-2 CSS url() 后处理校验（半天）

**目标**：在 `resource-import-guard.js` 加 `validateCssResourceUrls` 函数，扫描 `<style>` 内的 `url(...)` 校验文件是否存在。

**实现**：
```js
export function validateCssResourceUrls(code, componentDir) {
  const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/g)
  if (!styleMatch) return { valid: true, errors: [] }
  
  const errors = []
  for (const styleBlock of styleMatch) {
    const urlPattern = /url\(['"]?([^'")]+)['"]?\)/g
    let match
    while ((match = urlPattern.exec(styleBlock)) !== null) {
      const url = match[1]
      if (url.includes('resources/images/')) {
        const fileName = url.split('/').pop()
        const fullPath = join(componentDir, url)
        if (!existsSync(fullPath)) {
          errors.push({ url, file: fullPath })
        }
      }
    }
  }
  
  return { valid: errors.length === 0, errors }
}
```

**调用点**：在 `generateCode` 出口 + refiner 出口调用，错误时告警或自动修正。

**验收**：
- 单元测试：构造一个含错误 url() 的 .vue 文件，确认函数能检测到
- 集成测试：跑历史组件，确认无误报

### 0-3 lite 预览沙盒加固（1 小时）

**目标**：LiteGenerate iframe 补 `sandbox="allow-scripts"` 属性，sanitize 补 `javascript:` 过滤。

**改动点**：
1. `frontend/src/views/lite/LiteGenerate.vue`（或类似路径）：找到 iframe 标签，补 `sandbox="allow-scripts"`
2. `frontend/src/components/preview/SafePreview.vue`（或类似路径）：sanitize 逻辑补 `javascript:` 过滤

**验收**：
- lite 预览 iframe 内代码无法访问父页面 DOM
- 预览功能正常（不破坏现有功能）

### 0-4 微码 ESM import 鲁棒性验证（30 分钟）

**目标**：跑一个微码组件预览，确认 sfc-loader 编译 `import bg1 from '../resources/images/bg1.png'` 时能否正确解析相对路径。

**步骤**：
1. 找一个已有的微码组件（workspace/custom-components/ 下）
2. 启动前端 dev server（`npm run dev`）
3. 打开 Playground 预览该组件
4. 看浏览器控制台是否有报错
5. 如果有报错 → 微码也改用 `new URL()` 形态（与 Vue3 统一）
6. 如果正常 → 维持现状并记录到 memory

**验收**：
- 明确结论：微码 ESM import 在 sfc-loader 内是否正常
- 如果异常，产出修复方案

---

## 阶段 1：骨架雏形（2~3 周）

### 1-1 引入 GenerationContext 值对象

**目标**：让档位/类型/资源映射成为一等公民字段，不再靠 sessionId 正则反推。

**实现**：
```js
// src/ai-engine/types/generation-context.js
export class GenerationContext {
  constructor({
    tier,            // 'max' | 'lite' | 'dev' | 'pro'
    componentType,   // 'microcode' | 'vue3' | 'html'
    componentId,
    resourceDomMapping,
    outputPath,
    previousCritiques,
    ...
  }) {
    this.tier = tier
    this.componentType = componentType
    this.componentId = componentId
    this.resourceDomMapping = resourceDomMapping
    this.outputPath = outputPath
    this.previousCritiques = previousCritiques
  }
}
```

**改动点**：
- 删除 `tasks.service.ts:1152` 的 sessionId 正则推断
- 所有入口（lite/phase2/vue3/page-generator）在创建任务时显式构造 ctx
- 工程师类从 ctx 读取档位/类型，不再从 state 散字段读取

**验收**：
- `tasks.service.ts:1152` 的正则推断被删掉
- 加一个新档位（比如 "mini"）只改 ctx 构造一处

### 1-2 TierProfile 配置对象

**目标**：把档位差异从 if/else 收敛到配置对象。

**实现**：
```js
// src/ai-engine/config/tier-profile.js
export const TierProfile = {
  max: {
    stages: ['analyze', 'generate', 'validate', 'refine'],
    model: process.env.LLM_FULL_MODEL,
    maxRefineRounds: 3,
    adversarialCheck: true,
  },
  lite: {
    stages: ['analyze', 'generate'],  // 跳过 validate/refine
    model: process.env.LLM_LITE_MODEL,
    maxRefineRounds: 0,
    adversarialCheck: false,
  },
  dev: {
    stages: ['analyze', 'generate'],
    model: process.env.LLM_FULL_MODEL,
    maxRefineRounds: 0,
    adversarialCheck: false,
  },
  pro: {
    stages: ['analyze', 'generate', 'validate', 'refine'],
    model: process.env.LLM_FULL_MODEL,
    maxRefineRounds: 5,
    adversarialCheck: true,
  },
}
```

**改动点**：
- 工程师类内部不再 if/else 判断档位，全部从 `TierProfile[ctx.tier]` 查表
- 图文件（mc-component-graph-phase2.js / vue3）根据 TierProfile.stages 决定执行哪些节点

**验收**：
- 加一个新档位只改 TierProfile 一处
- 现有 4 种档位行为不变

### 1-3 ResourceSerializer 策略接口

**目标**：把资源变量名解析抽成纯函数，prompt 侧和注入侧共用。

**实现**：
```js
// src/ai-engine/utils/resource-vars.js
export const parseVarIndex = (name) => {
  const m = String(name).match(/^[a-z]+(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
};

export const buildVarName = (prefix, index) => `${prefix}${index}`;

export const formatResourceEntry = (mapping, i) => {
  const varName = mapping.semanticVarName || buildVarName('res', i);
  return `| ${formatResourceFile(mapping.resourceFile)} | ${varName} | ${mapping.description || ''} |`;
};
```

**改动点**：
- 删 `microcode-engineer.js` 内的 `_formatResourceMapping`
- 删 `vue3-engineer.js` 内的 `formatResourceFile`
- 两处都改成 `import { formatResourceEntry, formatResourceFile } from '../utils/resource-mapping-formatter.js'`

**验收**：
- 编号口径统一，prompt 和注入共用同一套解析逻辑
- 现有组件生成结果不变

### 1-4 资源文件存在性校验

**目标**：figma-connector 导出完成后校验 mapping 里每个路径都真实存在，不存在就 fail-fast。

**实现**：
```js
// src/ai-engine/roles/figma-connector.js
function validateResourceExistence(mapping, outputPath) {
  const errors = []
  for (const m of mapping) {
    const fullPath = join(outputPath, m.resourceFile)
    if (!existsSync(fullPath)) {
      errors.push({ file: m.resourceFile, hint: m.hint })
    }
  }
  return errors
}
```

**调用点**：`figma-connector._buildResourceDomMapping` 返回前调用，有错误时 throw 或返 null。

**验收**：
- 资源导出失败时立即 fail-fast，不进入生成流程
- 现有成功路径不受影响

### 1-5 清理版本号注释

**目标**：删掉 134 处 v2.2/v3.x/P0/P1 补丁标记，交给 git 历史。

**实现**：
```bash
# 批量删除注释（正则替换）
sed -i '' 's/\/\/ 🆕 v[0-9.]*:.*$//g' src/ai-engine/**/*.js
sed -i '' 's/\/\/ P[01]:.*$//g' src/ai-engine/**/*.js
```

**验收**：
- 代码清爽，无版本号污染
- 功能不变

---

## 阶段 2：复制粘贴模块收敛（4~6 周）

### 2-1 提取 GenerationOrchestrator

**目标**：把 lite/phase2/vue3/page-generator 四个模块的公共部分抽成 orchestrator。

**实现**：
```js
// src/ai-engine/orchestrator/generation-orchestrator.js
export class GenerationOrchestrator {
  constructor(ctx, strategies) {
    this.ctx = ctx
    this.progress = strategies.progressService
    this.apiKey = strategies.apiKeyFallback
  }
  
  async run() {
    const profile = TierProfile[this.ctx.tier]
    for (const stageName of profile.stages) {
      await this.runStage(stageName)
    }
    await this.progress.sendComplete(...)
  }
}
```

**改动点**：
- 四个模块从"各自复制一份 orchestrator" 变成"各自提供策略 + 调 orchestrator"
- progressService / apiKeyFallback 等公共逻辑移到 orchestrator

**验收**：
- 代码量砍掉 60%
- 加新模块只写策略，不复制 orchestrator

### 2-2 PreviewRenderer 策略接口

**目标**：把预览发布策略抽成接口，不同组件类型/环境各自实现。

**实现**：
```js
// src/ai-engine/strategies/preview-renderer.js
export class PreviewRenderer {
  static for(componentType, env) {
    if (componentType === 'microcode') return new McPreviewRenderer(env)
    if (componentType === 'vue3') return new Vue3PreviewRenderer(env)
    if (componentType === 'html') return new HtmlPreviewRenderer(env)
  }
}
```

**改动点**：
- `workspace-preview-publisher.js` 里那一串候选 URL 环境配置，按 env 分支进策略
- 不同组件类型的预览发布逻辑各自实现

**验收**：
- 加新预览形态只加实现
- 现有预览行为不变

### 2-3 沙盒统一策略

**目标**：三类预览统一沙盒策略，防 XSS/预览代码污染宿主。

**实现**：
| 预览类型 | 沙盒策略 |
|---|---|
| mc/vue3 任务预览 | 摘掉 `allow-same-origin`，依赖 postMessage 通信（需要 preview 页面独立子域/端口） |
| lite/html 预览 | 加 `sandbox="allow-scripts"`，移除 `allow-same-origin` |
| preview/index.vue | 维持 /__raw 机制（设计合理） |

**改动点**：
- 预览页独立子域部署（前端 vite.config 加 `server.origin` 配置）
- mc/vue3 iframe 标签摘掉 `allow-same-origin`
- 预览页与父页面通信改用 postMessage + 精确 targetOrigin

**验收**：
- 任意一种预览 iframe 内代码无法访问父页面 localStorage/DOM
- 预览崩溃不污染宿主 Playground

---

## 执行顺序

1. **今天**：阶段 0（4~6 小时）
   - 0-1 单一事实源收口
   - 0-2 CSS url() 校验
   - 0-3 lite 预览沙盒加固
   - 0-4 微码 ESM import 鲁棒性验证

2. **本周内**：阶段 1 小重构
   - 1-3 ResourceSerializer 策略接口
   - 1-4 资源文件存在性校验
   - 1-5 清理版本号注释

3. **2~3 周**：阶段 1 骨架雏形
   - 1-1 GenerationContext 值对象
   - 1-2 TierProfile 配置对象

4. **1~2 月**：阶段 2 大重构
   - 2-1 GenerationOrchestrator
   - 2-2 PreviewRenderer 策略接口
   - 2-3 沙盒统一策略

---

## 验收标准

### 阶段 0 验收
- 所有工程师类调用走 utils 单一事实源
- CSS url() 错误能自动修/告警
- lite 预览 iframe 无法访问父页面 DOM
- 微码 ESM import 鲁棒性有明确结论

### 阶段 1 验收
- `tasks.service.ts:1152` 的正则推断被删掉
- 加新档位只改 TierProfile 一处
- 编号口径统一，prompt 和注入共用同一套解析逻辑
- 资源导出失败时立即 fail-fast

### 阶段 2 验收
- 代码量砍掉 60%
- 加新模块只写策略，不复制 orchestrator
- 任意一种预览 iframe 内代码无法访问父页面 localStorage/DOM

---

## 风险与回退

### 阶段 0 风险
- 单一事实源收口可能引入新 bug → 跑历史失败组件复测
- CSS url() 校验可能误报 → 先告警不阻断，观察一周
- lite 预览沙盒加固可能破坏现有功能 → 先加 `allow-scripts` 不改 sanitize，观察一周

### 阶段 1 风险
- GenerationContext 引入可能影响现有 state 字段 → 渐进式迁移，新旧字段并存一段时间
- TierProfile 配置可能遗漏某些档位差异 → 逐个档位对比现有行为

### 阶段 2 风险
- GenerationOrchestrator 抽象可能过度设计 → 先小范围试点（lite 模块），验证后再推广
- 沙盒统一策略可能影响预览体验 → 先内测，收集反馈后再全量

---

## 总结

**一句话原则**：统一"什么时候做、用什么数据做"，放开"具体怎么做"。

**投入产出比最高的**：阶段 0 的 4 件事，今天就能做完，立即消灭正在咬人的 bug。

**从结构上消灭"漏传/漂移"这一整类 bug**：阶段 1 的 GenerationContext + TierProfile，2~3 周的小重构。

**长线纪律**：阶段 2 的大重构，1~2 月，等你验证过前面的收益再决定要不要做。
