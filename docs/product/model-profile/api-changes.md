# 模型方案制（Profile）— 接口改动分析

> 目标：把「一组完整模型配置」当作可命名、可保存、可一键切换的对象（Preset/Profile），避免每次在十几个输入框里手填。
> 本文只分析**需要改的接口层**（REST 路由 + service 方法 + 前端调用点 + 生成链路影响），不落地代码。

---

## 一、现状接口盘点（改动前）

| 接口 | 方法 | 当前行为 | 调用方 |
|------|------|---------|--------|
| `/api/config/ai` | GET | 返回 `{ success, config }`，`config = svc.getAiConfig()`（**扁平根配置，无 profiles 概念**） | `components.vue:2365`、`ApiBindingWizard.vue:1165` |
| `/api/config/ai` | POST | 把 body（扁平配置）`svc.saveAiConfig(body)`；带 `SessionGuard` | `ConfigPanel.vue:1431`（先 `configStore.saveConfig` 写 localStorage，再 POST 双写） |
| `/api/config/test-text` | POST | 测文本模型连通性 | `ConfigPanel.vue:429→893→runTest` |
| `/api/config/test-vision` | POST | 测视觉模型能力 | `ConfigPanel.vue:300→893→runTest` |
| `/api/config/test-figma` | POST | 测 Figma Token | `ConfigPanel.vue:705→893→runTest` |
| `/api/config/test-apifox` | POST | 测 Apifox Token | `ConfigPanel.vue:763→893→runTest` |
| `/api/config/test-provider` | POST | 测单个 provider 的 text+vision | `ConfigPanel.vue:955` |

**内部 service 调用方（受 profile 影响，必须同步改）**：
- `getMergedAiConfig(userId)` — 生成链路唯一合并入口，被 `phase2.service`、`vue3.service`、`lite.service` 广泛调用
- `getAiConfig()` — 被 `v2-pipeline.service`、`component-analysis.service`、`phase2.service`、`vue3.service`、`lite.service`、`config.controller` 调用

---

## 二、关键约束（决定改法）

1. **`AI_CONFIG_SCHEMA` 是 `.strict()`**（`config.service.ts:137`）。
   若 body 直接带 `profiles`/`activeProfileId` 会被 Zod 拒绝 → 必须显式扩展 schema 或拆独立 schema。

2. **生成链路读的是「根配置」而非「方案」**。
   `getMergedAiConfig` 第 180 行 `const globalCfg = this.getAiConfig()`，完全不感知 profile。
   → 要让切换方案真正生效，生成链路必须读到 **active profile 的 config**，而不是根扁平字段。

3. **前端是「localStorage + 后端」双写**。
   `ConfigPanel.vue` 先 `configStore.saveConfig`（写 localStorage），再 POST 后端。
   下拉切换方案时，前端既要更新后端 `activeProfileId`，也要把 active profile 的 config 同步进 localStorage（否则页面其他读 store 的地方用旧值）。

4. **用户级配置（MongoDB `user_ai_configs`）目前是一份扁平快照**，不参与 profiles。
   → MVP 阶段 profiles 仅放在**全局文件 `ai-config.json`**（作为「服务端预设方案库」），user 级仍按现状覆盖单字段，不引入 user 级 profiles，避免复杂度爆炸。

---

## 三、推荐接口设计（MVP：扩展现有路由，最小破坏面）

> 不新增独立路由（避免路由爆炸），用 `POST /api/config/ai` 的 `action` 字段分流；`GET` 仅增量返回 profiles 元信息。

### 3.1 GET /api/config/ai（扩展，向后兼容）

响应新增 `profiles` / `activeProfileId` 两个顶层字段，`config` 仍指向 **active profile 的完整配置快照**（保持现有 `data.config` 字段结构，不破坏 `components.vue` / `ApiBindingWizard` 读取）。

```json
{
  "success": true,
  "config": { "figmaToken": "...", "modelMode": "separate", "visionModel": "glm-5V-Turbo", "textModel": "deepseek-v4-pro", "providers": [...], "pickStrategy": "weighted-spread" },
  "profiles": [
    { "id": "default", "name": "默认", "config": { "...完整配置快照..." } },
    { "id": "fast",    "name": "快速模式", "config": { "...完整配置快照..." } }
  ],
  "activeProfileId": "default"
}
```

**UX 注意**：`config` 与 `profiles[active].config` 应完全一致（单一真相源），前端下拉只依赖 `profiles` + `activeProfileId`。

### 3.2 POST /api/config/ai（扩展 action，向后兼容）

`action` 缺省 = `save-current`（现有行为：把 body 落到 active profile，并同步更新根扁平字段供回退）。

| action | body | 行为 |
|--------|------|------|
| `save-current`（默认） | 扁平配置字段 | 覆盖 active profile 内容；同时写根扁平字段（保持回退链路） |
| `apply` | `{ action, profileId }` | 切换 `activeProfileId`；不改动任何 profile 内容 |
| `create` | `{ action, profileName, ...configFields }` | 以传入字段为快照新建 profile，设为 active，返回新 id |
| `update` | `{ action, profileId, profileName?, ...configFields }` | 覆盖指定 profile 内容（含可选改名） |
| `delete` | `{ action, profileId }` | 删除指定 profile；**禁止删除最后一个 / 当前 active 时需先 switch** |

统一响应（同 GET）：
```json
{ "success": true, "config": {...active}, "profiles": [...], "activeProfileId": "xxx" }
```

### 3.3 测试接口（本轮不强制改）

`test-text` / `test-vision` / `test-figma` / `test-apifox` / `test-provider` 暂不纳入 profile 体系——它们测的是「前端当前表单里的单组字段」，与方案制正交。后续可增强为"测某个 profile 的某个 provider"，但非 MVP 必需。

---

## 四、后端 service 层需改的方法

| 方法 | 文件 | 改动 |
|------|------|------|
| `AI_CONFIG_SCHEMA` | `config.service.ts:39-137` | 新增 `profiles` / `activeProfileId` 字段；profile 内 config 复用 `AI_CONFIG_BASE_SCHEMA`（建议放宽 strict 或独立 `PROFILE_SCHEMA`） |
| `getAiConfig()` | `config.service.ts:164` | 改为返回 `{ ...activeProfileConfig, profiles, activeProfileId }`（对外 GET 用） |
| `getActiveProfileConfig()`（**新增**） | `config.service.ts` | 内部用，返回**纯 active config**（不含 profiles 嵌套），供 `getMergedAiConfig` 调用，保持现有 `getAiConfig()` 语义兼容内部调用点 |
| `saveAiConfig(input)` | `config.service.ts:207` | 按 `input.action` 分流：`save-current` / `apply` / `create` / `update` / `delete`；`apply` 仅改 `activeProfileId`；`create` 生成 id 并 push；`delete` 校验非空 |
| `getMergedAiConfig(userId)` | `config.service.ts:179` | 第 180 行 `globalCfg` 改用 `this.getActiveProfileConfig()`（而非原 `getAiConfig()`），确保生成链路读 active 方案 |
| `migrateLegacy()`（**新增**） | `config.service.ts` | 首次读取时若根配置无 `profiles`，把现有根字段自动包成 `default` profile + `activeProfileId:'default'`，实现**零中断迁移** |
| `saveUserConfig()` | `user-ai-config.service.ts:27` | 暂不改（user 级仍扁平快照）；若后续要 user 级 profiles 再扩展 |

**数据落盘结构（`data/ai-config.json`）**：
```json
{
  "profiles": [
    { "id": "default", "name": "默认", "config": { "figmaToken":"...", "modelMode":"separate", "providers":[...], "pickStrategy":"weighted-spread" } },
    { "id": "fast",    "name": "快速模式", "config": { "...": "..." } }
  ],
  "activeProfileId": "default",
  "figmaToken": "...", "modelMode": "separate", "providers": [...]   // 根扁平字段保留作回退兼容
}
```

---

## 五、前端需改的调用点

| 文件 | 位置 | 改动 |
|------|------|------|
| `ConfigPanel.vue` | 顶部工具栏（新增） | 增加「方案」下拉 `<select>` + `应用 / 另存为 / 更新当前 / 删除 / 改名` 按钮组 |
| `ConfigPanel.vue` | `onMounted` / 加载 | 调 `GET /api/config/ai` 后，用 `data.profiles` 渲染下拉、`data.activeProfileId` 设为当前值（目前它只读 localStorage，需新增 GET 拉取） |
| `ConfigPanel.vue` | `saveConfig()` (1284) | 保存时若处于「某 profile 编辑态」→ `POST { action:'update', profileId, ...saveData }`；点「保存配置」默认 `action:'save-current'` |
| `ConfigPanel.vue` | 新增 `applyProfile(id)` | 调 `POST { action:'apply', profileId }`，成功后把返回 `config` 同步进 `configStore.saveConfig`（更新 localStorage） |
| `ConfigPanel.vue` | 新增 `createProfile()` / `deleteProfile()` | 调 `create`/`delete` action |
| `ConfigPanel.vue` | 切换前确认 | 若表单有未保存修改，切方案弹确认（防止覆盖） |
| `stores/config.ts` | `loadConfig` | 可保留 localStorage 兜底；新增从 GET 拿 profiles 后写入 store（新增 `profiles` / `activeProfileId` 两个 ref） |
| `components.vue` / `ApiBindingWizard.vue` | 读取 `data.config` | **无需改**（GET 仍返回 `config` 字段，且已是 active profile 配置） |

**UX 红线**：
- 删除正在使用的 active profile 必须拦截（先切到别的方案）
- 下拉项显示摘要：`方案名 · 模式 · 模型数`（如 `快速模式 · separate · 4模型`）
- 切方案前若有未保存修改，弹确认「切换将丢弃未保存修改 / 先保存再切换」

---

## 六、生成链路影响（务必同步）

`getMergedAiConfig` 是 phase2 / vue3 / lite 生成配置的**唯一合并入口**。
当前 `globalCfg = this.getAiConfig()` 读根配置 → **不感知 profile**。

修复后：`globalCfg = this.getActiveProfileConfig()`（新内部方法，纯 active config）。
→ 切换方案后，新任务自动使用新方案的 visionModel/textModel/providers/pickStrategy，无需重启服务（配置每次任务实时读取）。

**验证点**：切换方案后跑一个新生成任务，日志里 `供应商池[vision]/[text]` 应反映新方案的模型组成。

---

## 七、关键决策点（需你拍板）

1. **profiles 存储层级**：推荐「仅全局文件」（服务端预设库，所有人共用）。是否要支持「用户级 profiles」（每人独立方案）？→ MVP 不做，避免与 user 级扁平快照冲突。
2. **`save-current` 是否同步写根扁平字段**：推荐「是」，保持现有回退链路与 `getAiConfig()` 老调用点不回归。
3. **方案切换是否即时生效于进行中任务**：推荐「仅影响新任务」，进行中任务用启动时的快照（与现状一致）。

---

## 八、验证标准（改完如何验收）

1. 首次启动：旧 `ai-config.json` 自动迁移出 `default` profile，前端下拉显示「默认」，行为与改动前完全一致。
2. 新增方案「快速模式」并填入不同模型 → 保存后在下拉出现 → `GET /api/config/ai` 返回 `profiles` 含 2 项。
3. 点「应用 快速模式」→ 后端 `activeProfileId` 变更；前端 localStorage 同步；新生成任务日志使用新模型。
4. 删除 active profile 被拦截；删除非 active 后下拉少一项。
5. `save-current` 不破坏根扁平字段（生成回退链路不回归）。
6. `components.vue` / `ApiBindingWizard` 的绑定向导读取 `data.config` 仍正常（未破坏）。
