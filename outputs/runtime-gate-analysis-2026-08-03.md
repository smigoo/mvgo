# 微码 vs Vue3 组件生成判定差异分析报告

**生成时间**：2026-08-03  
**分析对象**：
- 微码组件：`mc-1785743893840-a9bcc0ba`
- Vue3 组件：`mv-1785743905456-59934088`

---

## 📊 执行流程对比

### 微码组件（成功 ✅）

| 时间 | 阶段 | 状态 | 关键指标 |
|------|------|------|----------|
| 07:58:27 | Figma 下载 | ✅ 成功 | 预览图 45KB |
| 07:58:32 | 视觉分析 | ✅ 完成 | 分析结果已保存 |
| 08:08:30 | 第一次截图 | ✅ PASS | `issueCount: 0`, `status: ready` |
| 08:18:17 | adversarial-checker | ⚠️ 发现问题 | `critiqueCount: 7`（padding 违规等） |
| 08:18:21 | 工程师修订 | ✅ 完成 | 进入修订流程 |
| 08:32:07 | 第二次截图 | ✅ PASS | `issueCount: 0`, `status: ready` |
| 08:32:xx | complete 节点 | ✅ 成功 | 进入 orphan-component-detector、less-variable-checker |

**总耗时**：约 34 分钟  
**修订轮次**：1 轮  
**最终状态**：✅ 通过

---

### Vue3 组件（失败 ❌）

| 时间 | 阶段 | 状态 | 关键指标 |
|------|------|------|----------|
| 07:58:27 | Figma 下载 | ✅ 成功 | 预览图 45KB |
| 07:58:32 | 视觉分析 | ✅ 完成 | 分析结果已保存 |
| 08:08:30 | 第一次截图 | ✅ PASS | `issueCount: 0`, `status: ready`, `readySignal: complete` |
| 08:17:28 | adversarial-checker | ⚠️ 发现问题 | `L4-003: 类名前缀不一致`（`mv3-mv-*` vs `.c-mv-*`） |
| 08:17:29 | workspace-preview-publisher | ⚠️ 警告 | `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（50+ 文件） |
| 08:17:29 | 工程师修订 | ✅ 完成 | 开始第二次截图 |
| 08:17:31 | 第二次截图 | ❌ BLOCK | `issueCount: 2`, `status: load-error` |
| 08:17:31 | revision-decision | ❌ 失败 | `RUNTIME-004: 真实预览状态为 load-error` |
| 08:18:25 | 文件读取 | ❌ 失败 | `文件不存在: package/index.vue` |

**总耗时**：约 20 分钟（未完成）  
**修订轮次**：1 轮（未完成）  
**最终状态**：❌ 阻断

---

## 🔍 根本原因分析

### 1. **第一次截图：两者一致**

两个组件的第一次截图都是 `issueCount: 0`，预览状态正常：

**Vue3 第一次截图（08:08:30）**：
```
URL: http://127.0.0.1:2610/preview/mv-1785743905456-59934088?type=vue3&groupId=6a51f7caed28c5d5b13c61a5
状态: status=ready, readySignal=complete, dataPreviewStatus=complete
结果: issueCount: 0 ✅
```

**微码第一次截图**：也是 `issueCount: 0` ✅

---

### 2. **adversarial-checker：都发现问题**

**Vue3 问题**：
- `L4-003: common.less 中的类名前缀 mv3-mv-* 不符合 .c-{componentId}- 的标准前缀规范`

**微码问题**：
- `critiqueCount: 7`（padding 违规等 7 个问题）

两者都触发了修订流程。

---

### 3. **关键差异：第二次截图**

#### Vue3 第二次截图（08:17:29 - 08:17:31）

**时间线**：
```
08:17:29.244 - workspace-preview-publisher 开始清理 backup 目录
08:17:29.244 - [WARN] safeDeleteDir: 删除文件失败 (SAFE_DELETE_BULK_CONFIRM_REQUIRED)
08:17:29.245 - [WARN] safeDeleteDir: 删除目录失败 (ENOTEMPTY: directory not empty)
...（多个文件和目录删除失败）
08:17:29.525 - workspace-preview-publisher 完成同步
08:17:29.525 - screenshot-renderer 开始渲染截图
08:17:31.606 - screenshot-renderer 预览页截图完成 {"issueCount":2}
08:17:31.616 - ❌ revision-decision 节点执行失败
              错误: "运行时质量门禁阻断: [RUNTIME-004] 真实预览状态为 load-error"
```

**问题**：
- `issueCount: 2`（检测到 2 个问题）
- `status: load-error`（预览页面加载失败）
- `RUNTIME-004`：真实预览状态为 `load-error`

**根因推测**：
1. `workspace-preview-publisher` 在清理 backup 目录时触发了 `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 保护机制
2. 大量文件删除失败（`ENOTEMPTY: directory not empty`），可能导致组件文件状态不一致
3. 截图时预览页面无法正常加载组件，检测到 `load-error`

---

#### 微码第二次截图（08:32:07）

```
结果: issueCount: 0 ✅
状态: 正常通过
```

微码的修订过程没有触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，文件状态保持一致，预览页面正常加载。

---

### 4. **文件路径问题（次要问题）**

**Vue3 文件结构**：
```
vue3-components/6a51f7caed28c5d5b13c61a5/mv-1785743905456-59934088/
├── index.vue          ← 直接在根目录
├── resources/
│   ├── images/
│   └── styles/
└── component-meta.json
```

**代码读取路径**：
```
package/index.vue  ← 微码的目录结构约定
```

**微码文件结构**：
```
custom-components/mc-1785743893840-a9bcc0ba/
├── package/
│   └── index.vue      ← 在 package 子目录
├── resources/
└── declare.js
```

**问题**：Vue3 管线的某些工具还在使用微码的路径约定（`package/index.vue`），导致文件读取失败。

---

## 🎯 判定不一致的核心原因

### 直接原因
**Vue3 第二次截图检测到 `load-error`，微码第二次截图正常通过。**

### 深层原因

1. **workspace-preview-publisher 的 safe-delete 机制触发**
   - Vue3 修订后，publisher 尝试清理 backup 目录
   - 触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 保护（50+ 文件）
   - 大量文件删除失败（`ENOTEMPTY`），可能导致文件状态不一致
   - 预览页面加载时检测到 `load-error`

2. **文件路径约定不一致（次要）**
   - Vue3 组件：`index.vue` 在根目录
   - 代码读取：`package/index.vue`（微码约定）
   - 导致后续文件读取失败

3. **修订过程引入新问题**
   - Vue3 工程师在修复类名前缀问题时，可能引入了新的运行时错误
   - 第二次截图检测到 2 个问题（可能是 console error 或资源加载失败）

---

## 📋 修复建议

### 优先级 1：修复 safe-delete 机制对预览的影响

**问题**：`workspace-preview-publisher` 在清理 backup 目录时，如果触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，会导致文件删除失败，进而影响预览页面加载。

**修复方案**：
1. 在截图前确保 workspace 文件状态完全同步
2. 如果 backup 清理失败，不应该阻塞主流程
3. 增加重试机制，确保文件状态一致

---

### 优先级 2：修复 Vue3 文件路径读取问题

**问题**：代码中使用 `package/index.vue` 读取 Vue3 组件，但 Vue3 的文件结构是 `index.vue` 在根目录。

**修复方案**：
1. 根据 `target` 参数（`vue3` vs `microcode`）使用不同的路径约定
2. Vue3：`{componentId}/index.vue`
3. 微码：`{componentId}/package/index.vue`

---

### 优先级 3：优化 adversarial-checker 的修订质量

**问题**：Vue3 工程师在修订时引入了新的运行时错误。

**修复方案**：
1. 在修订后增加预检查，确保不会引入新的错误
2. 对类名前缀问题进行更严格的校验
3. 在修订前备份当前状态，失败时回滚

---

## 📊 数据对比表

| 指标 | 微码组件 | Vue3 组件 | 差异 |
|------|----------|-----------|------|
| 第一次截图 issueCount | 0 | 0 | ✅ 一致 |
| adversarial-checker 问题数 | 7 | 1 | ⚠️ 微码更多 |
| 修订轮次 | 1 | 1 | ✅ 一致 |
| 第二次截图 issueCount | 0 | 2 | ❌ Vue3 失败 |
| 第二次截图状态 | ready | load-error | ❌ Vue3 加载失败 |
| safe-delete 警告 | 无 | 50+ 文件 | ❌ Vue3 触发保护 |
| 文件路径问题 | 无 | package/index.vue 不存在 | ❌ Vue3 路径错误 |
| 最终状态 | ✅ 通过 | ❌ 阻断 | ❌ 不一致 |

---

## 🔬 技术细节

### RUNTIME-004 错误码

**定义位置**：`backend-node/src/ai-engine/roles/screenshot-renderer.js:1200-1250`

**触发条件**：
```javascript
if (realPreviewStatus === 'load-error') {
  return {
    passed: false,
    issueCount: issues.length,
    issues: [...issues, {
      code: 'RUNTIME-004',
      message: '真实预览状态为 load-error',
      severity: 'critical'
    }]
  }
}
```

**检测逻辑**：
1. 打开预览页面
2. 等待 `data-preview-status` 属性
3. 如果值为 `load-error`，判定为加载失败
4. 记录所有 console errors 和资源加载失败

---

### SAFE_DELETE_BULK_CONFIRM_REQUIRED

**定义位置**：`backend-node/src/ai-engine/utils/safe-delete.js`

**触发条件**：
```javascript
if (deleteCount > threshold) {
  logger.warn(`[safe-delete] SAFE_DELETE_BULK_CONFIRM_REQUIRED`, {
    count: deleteCount,
    threshold: 50,
    scope: 'turn'
  })
  return false
}
```

**影响**：
- 阻止批量删除操作
- 保护重要文件不被误删
- 但可能导致文件状态不一致

---

## ✅ 结论

**判定不一致的根本原因**：

1. **主因**：Vue3 修订后，`workspace-preview-publisher` 清理 backup 目录时触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，大量文件删除失败，导致预览页面加载失败（`load-error`）

2. **次因**：Vue3 文件路径约定与代码读取路径不一致（`index.vue` vs `package/index.vue`）

3. **触发点**：第二次截图检测到 `RUNTIME-004` 错误，`revision-decision` 节点阻断流程

**微码成功的原因**：
- 没有触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`
- 文件状态保持一致
- 第二次截图正常通过

---

**报告生成时间**：2026-08-03 17:20  
**分析工具**：日志分析 + 源码审查
