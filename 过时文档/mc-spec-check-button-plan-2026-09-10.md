# 「微码规范检查」按钮功能规划（2026-09-10）

> 需求：微码组件生成结束后（**不论任务成功与否，只要有代码产物**）提供「微码规范检查」按钮；
> 默认使用 `frontend-mc-check`；允许用户传入其他规范检查 skill，但**入口统一为 `scripts/mc-check.cjs`**。
> 本文回答「能不能做」并给出落地设计，不含实现。

---

## 0. 可行性结论：**能做，而且比预想简单**

已实测验证：

| 验证项 | 结果 |
|---|---|
| skill 放在任意目录（`~/Downloads/frontend-mc-check`）、从任意 cwd（`/tmp`）调用 | ✅ 正常执行 |
| `--component-path <组件绝对路径>` 单组件模式 | ✅ 不依赖 `ROOT` 推导，无需复制/软链 skill 到项目 |
| `--output-dir` 指定输出 | ✅ 报告生成到指定目录 |
| 报告 `mc-report.html` 自包含（0 外部依赖，4.8K 单文件） | ✅ 可直接 iframe 预览或新窗口打开 |

**关键点**：`mc-check.cjs:49-51` 的逻辑是

```js
const COMPONENT_BASE = COMPONENT_PATH
  ? path.dirname(COMPONENT_PATH)        // ← 单组件模式：直接用给定路径
  : path.isAbsolute(CFG.componentBaseDir) ? CFG.componentBaseDir
  : path.join(ROOT, CFG.componentBaseDir)  // ← 全量模式：才依赖 ROOT
```

而 `ROOT = resolve(__dirname,'../../../..')`（:29）只在**全量扫描**时参与。
单组件模式下 skill 可以在任何位置 —— 所以后端集成**不需要**把 skill 复制到 `aidocs/skills/`、也不需要建 `src/workspace` 软链（那是我在做 397 个全量扫描时才需要的）。

---

## 1. 需要遵守的既有约束

| 约束 | 说明 | 应对 |
|---|---|---|
| 入口固定 | skill 必须提供 `scripts/mc-check.cjs` | 后端强校验，缺失直接拒绝（正好匹配你「都需指向 mc-check.cjs」的要求） |
| 报告目录带时间戳 | 输出落在 `<output-dir>/<YYYY-MM-DD_HH-mm>/check-result.json` | 后端执行后按时间戳目录回读 JSON |
| 组件需是目录 | `--component-path` 指向组件根目录（含 `package/`、`declare.json`） | 复用现有 `resolveComponentDir(componentId)` |
| 无 `--format` 时生成 html+md+json | `reportFormat` 默认 all | 后端只读 JSON，HTML 供预览 |
| 同步阻塞 | 单组件检查约 1 秒内 | 可直接同步返回，无需异步任务队列 |

---

## 2. 功能设计

### 2.1 触发时机与入口

- **时机**：任务进入 `completed` / `failed` / `blocked` 任一终态，且 `resolveComponentDir()` 能解析到组件目录（即有代码产物）→ 显示按钮。
- **入口位置**（建议全加，成本极低）：
  1. `TaskDetail` 结果区（生成完最自然的位置）
  2. 组件详情页 `ComponentDetail`
  3. Playground `demo/index.vue`（改完代码顺手查一次）

### 2.2 skill 来源与解析

```
用户请求 skillId / skillPath
   ↓
① 未指定 → 用平台内置默认 skill（frontend-mc-check，随平台发布）
② 指定   → 按 skillId 查已注册的自定义 skill，或用传入路径
   ↓
校验：existsSync(<skillDir>/scripts/mc-check.cjs)   ← 不满足即拒绝
   ↓
spawn: node <skillDir>/scripts/mc-check.cjs \
         --component-path <组件绝对路径> \
         --output-dir <本次报告目录>
```

**存储位置建议**：平台内置 `backend-node/skills/frontend-mc-check/`；用户自定义 `backend-node/data/skills/<skillId>/`（与 `ai-config.json` 同级，便于持久化）。

### 2.3 接口设计

```
POST /api/mc-spec/check
  body: { componentId: string, skillId?: string }
  resp: { canRelease, passCount, failCount, warningCount,
          items: [{ id, name, level, passed, message }],
          reportUrl: string, specVersion: string, checkedAt: string }

GET  /api/mc-spec/skills              → 可用 skill 列表（内置 + 已注册）
POST /api/mc-spec/skills              → 注册自定义 skill（管理员）
DELETE /api/mc-spec/skills/:skillId
```

单组件约 1s，**同步返回即可**，不必引入任务队列。

### 2.4 执行器（后端新服务）

`McSpecCheckService`：

- `resolveSkill(skillId?)` → 绝对路径（内置 or 已注册）
- `assertEntry(skillDir)` → 必须存在 `scripts/mc-check.cjs`
- `runCheck(componentId, skillDir)` → `spawnSync('node', [...], { timeout: 60_000 })`
- `parseResult(outDir)` → 读 `<outDir>/<时间戳>/check-result.json`
- 报告落 `backend-node/data/mc-spec-reports/<componentId>/<时间戳>/`，返回相对 URL

### 2.5 前端交互

- 按钮 → loading（约 1s）→ 结果面板：
  - 顶部结论徽标：**允许上线 / 不允许上线**（`canRelease`）
  - 必须项（error）列表：按 M 系列分组，每项给「检查项 + 原因 + 建议」
  - 警告项（warning）折叠区
  - 「查看完整报告」→ 打开 `mc-report.html`（自包含，可直接新窗口/iframe）
- 未通过时给出**修复引导**（指向对应管线改造项，与 `mc-spec-compliance-plan` 的 L1–L5 对应）

---

## 3. 安全设计（这是本需求最大的风险点）

「用户可传入其他 skill」= **允许平台执行用户指定的 Node 脚本**，等同任意代码执行。必须设防：

| 风险 | 控制措施 |
|---|---|
| 任意路径执行 | 自定义 skill 必须注册后使用；注册时路径须落在允许的 skills 根目录内（防 `../` 穿越） |
| 恶意脚本 | 注册权限收敛到**管理员**；个人用户只能用内置 + 管理员注册的 skill |
| 未授权访问 | 接口挂 `SessionGuard`；自定义 skill 注册/删除走管理员鉴权 |
| 执行失控 | `spawnSync` 设 `timeout`（建议 60s）+ 输出大小上限，超时直接 kill |
| 磁盘占满 | 报告目录按组件保留最近 N 次（建议 10），定期清理 |
| 入口伪装 | 强校验 `scripts/mc-check.cjs` 存在，不满足即拒绝（同时满足你的约定） |

> 若后续要开放给普通用户上传 skill，建议改为**上传 zip → 服务端解压 → 人工/自动审计后才启用**，而不是直接给路径。

---

## 4. 决策结果（2026-09-10 已确认）

| # | 决策点 | **结论** |
|---|---|---|
| 1 | 自定义 skill 录入方式 | **上传**（zip/tar 包，服务端解压到 `data/skills/<skillId>/`） |
| 2 | 谁能注册自定义 skill | **仅管理员** |
| 3 | skill 存放位置 | 内置随代码 `backend-node/skills/`；用户自定义 `backend-node/data/skills/` |
| 4 | 是否生成后自动跑 | **先手动**（L2 门禁成熟后再评估） |
| 5 | 失败任务能查吗 | **能**（只要有代码产物即可检查） |

### 4.1 上传方案的细化约定（按「上传」落地）

| 项 | 约定 |
|---|---|
| 接受格式 | `.zip`（首选）；`.tar.gz` 后续按需 |
| 大小上限 | 单包 ≤ 10MB，解压后 ≤ 50MB，文件数 ≤ 500 |
| 包结构 | 解压后根目录（或唯一顶层目录）下须含 `scripts/mc-check.cjs`；**不满足即整包拒绝并清理** |
| 解压安全 | 防 zip-slip：每个条目解压前校验 `resolve(dest, entry) ` 必须仍在目标目录内；禁止符号链接条目、禁止绝对路径条目 |
| skillId | `^[a-z0-9][a-z0-9-]{1,39}$`，与目录名一致，已存在则覆盖（管理员显式确认后） |
| 注册落库 | 元数据（id / 名称 / 说明 / 版本 / 上传者 / 时间 / 入口文件路径）存 `data/skills/registry.json` |
| 删除 | 管理员可删；删除同时清理目录与注册表 |
| 执行时 | 只允许执行**已注册** skill 的 `scripts/mc-check.cjs`，不接受运行时传入任意路径 |

---

## 5. 分期落地计划

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P1** | 内置默认 skill + 后端执行器 + 一个接口 + 按钮 + 结果面板 + 报告预览 | 无 |
| **P2** | 自定义 skill 注册（管理员，路径方式）+ 前端 skill 选择下拉 | P1 |
| **P3** | 生成后自动跑 + 与 L2「合规自愈层」合并（error → BLOCK 重试） | P1 + L2 |

P1 的后端执行器与 P3 的门禁**可复用同一份代码**（`McSpecCheckService`），不重复建设。

---

## 6. 与现有治理的关系

- 本按钮是「**手动触发**」版本；`docs/mc-spec-compliance-plan-2026-09-10.md` 的 **L2 合规自愈层**是「自动拦截」版本。
- 两者共用 `McSpecCheckService`，差别只在触发时机（用户点击 vs 写盘前）。
- **L1 已落地**（M5-6 治本，8/8 单测），本次按钮上线后即可直观看到新生成组件的 M5-6 变为通过。

---

## 7. 验收标准

1. 生成结束（成功/失败/被拦）后，只要目录有产物，按钮可见可点。
2. 点击后约 1s 内返回结构化结果，`canRelease` 与本地跑脚本结果一致。
3. 报告 HTML 可正常打开，内容与 `check-result.json` 一致。
4. 传入不合规 skill（缺 `scripts/mc-check.cjs`）→ 明确报错，不执行。
5. 非管理员无法注册自定义 skill（P2）。

---

## 8. P1 落地记录（2026-09-10 21:12）

### 8.1 交付清单

| 层 | 文件 | 说明 |
|---|---|---|
| Skill | `backend-node/skills/frontend-mc-check/` | 内置默认 skill（随代码发布），入口 `scripts/mc-check.cjs` v1.0.20 |
| 后端 | `backend-node/src/mc-spec/mc-spec.service.ts` | 执行器：spawn `node mc-check.cjs --component-path <dir> --output-dir <out>`，60s 超时、8MB 输出上限 |
| 后端 | `backend-node/src/mc-spec/mc-spec.controller.ts` | `GET /api/mc-spec/skills`、`POST /api/mc-spec/check`、`GET /api/mc-spec/report/:componentId/:stamp` |
| 后端 | `backend-node/src/mc-spec/mc-spec.module.ts` + `app.module.ts` | 模块注册 |
| 前端 API | `frontend/src/api/mc-spec.ts` | `listMcSpecSkills()` / `checkMcSpec()` + M 系列中文名 |
| 前端组件 | `frontend/src/components/McSpecCheckButton.vue` | 按钮 + 右侧抽屉结果面板（Pill 圆角、暗色卡） |
| 接入点① | `frontend/src/views/tasks/TaskDetail.vue` | 面包屑操作区，`!pageTaskFlag && taskTarget==='microcode' && (completed 或 fileCount>0)` |
| 接入点② | `frontend/src/views/components/ComponentDetail.vue` | 头部操作区，`!isVue3Component && businessComponentId` |
| 接入点③ | `frontend/src/views/demo/index.vue`（Playground） | 画布顶部工具栏，`isMcComponent && !isPageMode` |

### 8.2 面板能力

- 结论徽章：**允许上线 / 不允许上线**（`canRelease`）+ 规范版本 + 检查时间；
- 三项计数：通过 / 失败 / 警告；
- **查看完整报告**：新窗口打开后端自包含 `mc-report.html`；
- **复制失败项**：一键复制 `[M5-6] 名称：原因` 列表，便于喂给 AI 修复；
- 失败项按 **M1 命名规范 / M2 必要文件 / M3 declare.json 字段 / M4 文件格式 / M5 代码规范** 分组；
- 警告项默认折叠（warning 不阻断上线）。

### 8.3 验证证据

```
# HTTP（dev token，已过 SessionGuard）
POST /api/mc-spec/check  → canRelease=true  v1.0.20  33/0/1   report=.../2026-09-10_21-10
GET  /api/mc-spec/skills → [{"id":"frontend-mc-check","builtin":true,"available":true}]
GET  /api/mc-spec/report/c-device-monitor-l0rxb0x4-c34eb871/2026-09-10_21-10 → 200, 4915B HTML

# 前端构建（env -i 清 node shim）
✓ built in 25.05s
dist/static/js/usePreviewErrorBridge-Di0AVKtv.js（21:12）命中：微码规范检查 / mc-spec/check / 不允许上线
```

### 8.4 关键坑（已记入记忆）

1. `backend-node/skills/` 不在 `src/` 下，`nest build` **不会**拷进 `dist/` → 生产部署需单独 scp 该目录；
2. 重启生效判据是 `server.log` 出现新 `Mapped {/api/mc-spec/...}`，不是端口在监听；
3. `core/http.js` 的 `request()` **不自动解包**，后端统一响应是 `{success,code,message,data}`，前端必须取 `res.data.*`（已在 `api/mc-spec.ts` 用 `unwrap()` 统一处理）。

### 8.5 剩余（P2/P3）

- P2：管理员上传 zip 注册自定义 skill（防 zip-slip）+ 前端下拉选择（组件已预留：`skills.length > 1` 时显示 `a-select`）；
- P3：生成后自动跑 + 与 L2 合规自愈层合并（error → BLOCK 重试）。

## 9. AI 修复「假成功」根因与修复（2026-09-10 晚）

### 9.1 现象

点某个失败项（如 `[M1-3] version格式`）的「AI 修复」→ 弹出「AI 修复完成，正在重新检查」→ 重查后**错误依旧**。

### 9.2 三重叠真因

| # | 根因 | 证据 | 位置 |
|---|------|------|------|
| 1 | **配置错配**：不带 config 的入口只兜底了 apiKey，baseURL 空、model 硬编码 `claude-opus-4-8` → 拿 deepseek 的 key 打 Anthropic 端点 | `resolveTextConfig({})` → `{apiKey:'sk-60b…', baseURL:'', model:'claude-opus-4-8'}` | `ai-defaults.js` `TEXT_DEFAULTS` |
| 2 | **temperature 400**：硬编码 `temperature: 0.2`，中继端点拒绝非默认温度 | `toolErrors:["temperature is not supported for claude-opus-4-8 when set to non-default values"]`，耗时 0.15s 秒失败 | `playground-agent-graph.js` `createLLM` |
| 3 | **提示词缺陷**：M1-3 实际是 `declare.json` **缺 version 字段**；AI 没被告知「缺失就补默认」，于是反问用户 A/B/C 不落盘；也没说 declare.json 在根目录（AI 先找 `package/declare.json`） | AI 回复「该文件里根本没有 version 字段…请确认 A/B/C」 | `api/mc-spec.ts` `buildMcSpecFixPrompt` |

> 附带问题：agent 失败时后端仍返 HTTP 200（`success:false`），前端未判 → 假成功提示。

### 9.3 修复

1. `backend-node/src/ai-engine/utils/ai-defaults.js`
   - 新增 `resolveSavedSlot(role)`：完整解析 `data/ai-config.json` 的 text/vision 槽（**模型库 binding 降维优先 → legacy 扁平字段回退**），产出 `apiKey/baseURL/model/providerType/temperature/thinkingType/providers/pickStrategy`；缓存按 **mtime** 失效（改配置无需重启）。
   - `resolveTextConfig/resolveVisionConfig` 在无入参时用该槽补全，并把已保存 `providers` 注入供应商池（获得与生成管线一致的故障转移）。
2. `backend-node/src/ai-engine/graphs/playground-agent-graph.js`
   - temperature 不再硬编码：配置有温度就用，**没有就不传该字段**（交给服务端默认）。
   - 新增 `TEMPERATURE_LOCKED_MODELS` + `invokeModel()` 运行时自愈：捕获 `temperature is not supported` → 重建无温度模型重试，并记住该模型。
3. `frontend/src/api/mc-spec.ts`
   - `buildMcSpecFixPrompt` 增加 `FIX_TARGET_HINT`（按 M1~M5 定位主要修改对象，明确 declare.json 在**组件根目录**）+「字段缺失/值为空则按规范直接补默认值，**不要反问用户**」+「必须 `write_file` 落盘」。
   - `fixMcSpecItem` 判 `success === false` 抛错（消除假成功，错误带 `toolErrors` 明细）。

### 9.4 验证证据

```
# 配置解析（治本后）
resolveTextConfig({}) → model=deepseek-v4-flash  baseURL=https://api.deepseek.com/v1/chat/completions
                        temperature=0  thinkingType=disabled  providerId=__primary_text__   ← 不再出现 claude-opus-4-8

# 真实 AI 调用
POST /api/demo/ai-chat → HTTP 201  8.9s  success=true  iterations=6（此前 0.15s 秒失败）

# M1-3 端到端
修复前：M1-3 ❌  "" 不符合规范，应为 v1.0.0     （15 通过 / 12 失败）
AI 修复：modifiedFiles=["declare.json"]  新增 "version": "v1.0.0"
重查后：M1-3 ✅ 通过                            （16 通过 / 11 失败）

# 预览（AI 改后立即可见，任务号与真实目录名双形态均命中）
GET /api/preview/<gid>/mc-lite-1789035969084-c298235f/declare.json      → 200，含 "version": "v1.0.0"
GET /api/preview/<gid>/c-environment-monitor-c298235f/declare.json      → 200，含 "version": "v1.0.0"

# 下载（与预览同源）
GET /api/component/download/mc-lite-1789035969084-c298235f → 200，673,631 B，zip 内 declare.json 含 version v1.0.0
```

### 9.5 生产现状（未部署）

```
GET https://go.microvideo.cn/api/mc-spec/skills
→ {"success":false,"code":500,"message":"No static resource api/mc-spec/skills.","data":null,"source":"java"}
```

即：**nginx 已把 `/api/mc-spec` 转到 Java，但 Java 的 `NodeProxyController` 未重新打包**（新前缀没上线）。
要发布需四件事：① Node `dist` + `skills/`（不在 src，需单独 scp）；② Java fat jar 重打（`PROXY_PREFIXES` + `@RequestMapping`）；③ 前端 `dist`；④ 公司 nginx 容器 `location /api/mc-spec`（须排在 `location /api` 前）并 reload。

### 9.6 待办

- [ ] 生产发布（需用户授权，涉及 4 个组件）
- [ ] 下载 zip 排除 `.snapshots/`（含 125KB 截图）、`.backups/`、`.cache/`、`.checkpoint/`
- [ ] P2：管理员 zip 上传注册自定义 skill（防 zip-slip）
- [ ] P3：生成后自动跑检查 + 与 L2 合规自愈层合并
- [ ] git 提交（本轮改动尚未提交）

## 10. P2 自定义 skill 上传（2026-09-10）与交付包瘦身

### 10.1 交付包瘦身

`archive.directory()` 默认会把管线内部目录打进交付包（实测含 125KB 生成截图）。新增共享过滤：

```ts
// src/common/utils/package-filter.ts
EXCLUDED_PACKAGE_DIRS = ['.snapshots','.backups','.cache','.checkpoint','.mc-gen','node_modules','.git']
archive.directory(workspacePath, componentId, packageEntryFilter())
```

三处打包统一：`phase2.packageComponent`、tasks 失败代码下载、demo legacy 打包（后者原 `SKIP_DIRS` 漏了 `.cache`/`.checkpoint`）。

| 组件 | 改前 | 改后 | 变化 |
|------|------|------|------|
| c-environment-monitor-c298235f | 673,631 B | 255,243 B | **-62%**（18 个文件，仅真实交付物） |

### 10.2 P2 自定义 skill 上传（仅管理员）

| 面 | 内容 |
|----|------|
| 接口 | `POST /api/mc-spec/skills`（multipart）、`DELETE /api/mc-spec/skills/:skillId` |
| 鉴权 | `AdminService.assertAdmin`（AdminModule 补 exports，McSpecModule imports 复用，判定与后台一致） |
| 安装位置 | `backend-node/data/skills/<skillId>/`（内置仍在 `backend-node/skills/frontend-mc-check`） |
| 约定入口 | `scripts/mc-check.cjs`（缺失即拒绝） |

**安全约束（逐条落地）**

- 路径：拒绝绝对路径、Windows 盘符、`..`、空字节；条目路径统一按 `/` 归一后逐段校验
- 符号链接：`entry.header.attr` 高 16 位为 `0o120000` 直接拒绝（可指向包外）
- 体积：条目数 ≤500、单文件 ≤8MB、解压总量 ≤20MB、zip ≤10MB（multer + service 双层）
- 标识：`^[a-z0-9][a-z0-9_-]{0,63}$`，且 `path.resolve(target)` 必须在 `data/skills` 之内（双保险）
- 落位：先解到 `.tmp-<rand>` → 校验入口 → 原子 `rename`；覆盖时旧目录先挪 `.trash-<rand>` 再删；任何失败清理 tmp

**验证**

```
单测 18/18 全绿（zip-slip / 绝对路径 / 盘符 / 空字节 / 符号链接 / zip-bomb 上限 / 缺入口 /
                非法 id / 空包 / 非 zip / 临时目录清理 / 覆盖 / 卸载 / 内置不可删）

端到端（dev token，dev-local 本身即管理员）
POST /api/mc-spec/skills（test-skill.zip 52,996B，含顶层目录）
  → {"id":"test-skill","available":true,"name":"frontend-mc-check",...}   顶层目录自动剥离 ✅
GET  /api/mc-spec/skills → [内置] frontend-mc-check / [自定义] test-skill ✅
POST /api/mc-spec/check {skillId:"test-skill"} → 通过 24 / 失败 3 / 警告 1 ✅（自定义 skill 可执行）
DELETE /api/mc-spec/skills/test-skill → removed:true ✅
DELETE /api/mc-spec/skills/frontend-mc-check → 400 内置 skill 不可删除 ✅
```

### 10.3 ⚠️ 发现：同一尾缀三份产物并存

```
GET /api/mc-spec/skills 无关；POST /api/mc-spec/check 触发解析告警：
[WARN] 组件目录尾缀多命中 {"tail":"c298235f","picked":"workspace/custom-components/mc-lite-1789035969084-c298235f",
  "candidates":["workspace/.../mc-lite-1789035969084-c298235f",
                "frontend/workspace/.../c-environment-monitor-c298235f",
                "frontend/workspace/.../mc-lite-1789035969084-c298235f"]}
```

| 目录 | mtime | declare.json 完整度 | 检查结果 |
|------|-------|---------------------|----------|
| `mc-lite-1789035969084-c298235f`（任务号命名，两份） | 22:52 | **有** attribute.aspectRatio / layoutConfig.list+default / themeConfig light+dark | 24/3/1 |
| `c-environment-monitor-c298235f`（规范命名） | 22:44 | 缺上述字段 | 16/11/1 |

- 任务号目录内容更完整，但 `componentId` 字段写成**任务号** → M1-1 失败；规范命名目录反之。
- 解析按 roots 顺序取首个（确定性），当前六条链路一致都指向 root1 的任务号目录。
- 已加 WARN 日志便于定位；**未删除或改名任何目录**，待决策。

### 10.4 提交

| 仓库 | commit |
|------|--------|
| backend-node | f6b5885（P1+治本+包瘦身）→ 299cb90（P2） |
| frontend | 4ba4438（P1）→ eaf39e2（P2） |
| backend-java | 2441f8d |
| docs | 945e9fc → 本节 |
| 根仓 | a04e65c9 → c62308a7 |
