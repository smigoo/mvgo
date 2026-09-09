# 模型配置「方案制」需求分析

> 日期：2026-08-18
> 角色视角：UX Researcher（用户行为 / 可用性 / 落地可行性）
> 结论先行：**建议做「后端方案库 + 前端下拉切换」**，不要做纯前端 localStorage 方案。

---

## 1. 需求本质

用户当前要管理的是一组**强耦合的完整模型配置**：`modelMode` + `vision*` + `text*` + `unified*` + `providers[]` + `pickStrategy` + 限流参数。这些字段共同决定一次生成的调度行为，但现有 UI 把它们拆成十几个独立输入框，每次换组合都要逐项重填。

用户的真实诉求不是"少填几个框"，而是：

> **把"一组完整配置"当作一个可命名、可保存、可一键切换的对象。**

这是典型的 **Preset / Profile 模式**，等价于 IDE 里的运行配置、Postman 里的 Environment。

---

## 2. 用户场景（来自实际工作流）

| 场景 | 当前代价 | 方案制后 |
|------|---------|---------|
| 调试不同模型组合（GLM视觉+DeepSeek文本 / 全Qwen / 全DeepSeek） | 每次重填整页 + 重启 | 下拉切换 |
| 生产密钥 vs 测试密钥 | 手改 apiKey 易粘错 | 切到"测试方案" |
| 给同事/另一台机器复用同一组配置 | 口述或截图字段 | 导出方案 JSON |
| 微调后想保留"上一版能跑的" | 覆盖即丢失 | 另存为新方案 |

核心痛点量化：**切换成本 = 重填 15+ 字段；误操作风险高（密钥粘错、role 填错）**。

---

## 3. 方案对比（决策矩阵）

| 方案 | 改动量 | 跨设备/持久化 | 多人共享 | 风险 | 推荐度 |
|------|-------|-------------|---------|------|-------|
| A. 前端 localStorage 方案库 | 小（仅前端） | 否（清缓存即丢） | 否 | 低 | 不推荐 |
| B. 后端方案库（profiles[] + activeProfileId） | 中（前后端各一处） | 是（随服务端配置） | 是（同服务端） | 中 | **推荐** |
| C. 仅导出/导入 JSON 按钮 | 最小 | 靠用户手动管理文件 | 靠文件拷贝 | 低 | 过渡可用，不够 |

**选 B 的理由**：
- 现有配置已是"服务端单配置"体系（`config.service.ts` + `data/ai-config.json`），加 `profiles[]` 是同一存储的自然扩展，不引入新基础设施。
- 密钥处理与现状一致（当前 `ai-config.json` 即为明文；`UserAiConfig` 集合才是加密的，本需求不改密钥落盘策略，保持兼容）。
- 切换是"服务端生效配置"的换源，生成管线无需改动——它本来就只 `getMergedAiConfig()` 读一份合并结果。

---

## 4. 推荐方案：后端方案库

### 4.1 数据结构

在 `data/ai-config.json` 增加两个顶层字段（**不破坏现有根字段**，旧配置自动成为默认方案）：

```jsonc
{
  // —— 现有根字段保留，作为"默认方案"的兼容视图 ——
  "modelMode": "separate",
  "visionModel": "glm-5V-Turbo",
  "textModel": "deepseek-v4-pro",
  "providers": [ /* ... */ ],
  "pickStrategy": "weighted-spread",

  // —— 新增：方案库 ——
  "activeProfileId": "default",
  "profiles": [
    {
      "id": "default",
      "name": "默认方案",
      "config": {
        "modelMode": "separate",
        "visionModel": "glm-5V-Turbo",
        "textModel": "deepseek-v4-pro",
        "providers": [ /* ... */ ],
        "pickStrategy": "weighted-spread"
        // 可含完整 *ApiKey / *BaseURL / 限流参数
      }
    },
    {
      "id": "glm-vision-deepseek-text",
      "name": "GLM视觉 + DeepSeek文本",
      "config": { /* 完整快照 */ }
    }
  ]
}
```

**关键约束**：
- 每个 `profile.config` 必须是**完整配置快照**，不是差异补丁——切换即整份覆盖，避免"方案A的 providers + 方案B的 model"这种隐式混搭。
- `activeProfileId` 指向当前生效方案；运行时读取顺序：`profiles[activeProfileId].config` → 回退根字段（兼容旧数据/未迁移场景）。
- `id` 用稳定 slug（非随机），便于日志追溯"本次生成用了哪个方案"。

### 4.2 后端改动

文件：`backend-node/src/config/config.service.ts`

1. `AI_CONFIG_BASE_SCHEMA` 增加：
   ```ts
   activeProfileId: stringField,
   profiles: z.array(z.object({
     id: z.string().min(1),
     name: stringField,
     config: z.object(AI_CONFIG_BASE_SCHEMA).passthrough(),
   })).optional(),
   ```
2. `getMergedAiConfig()`：若 `activeProfileId` 命中 `profiles`，以该 profile.config 为基座合并（优先级：profile.config < 请求内联 config）。
3. `saveAiConfig()`：支持两种写操作：
   - `op: 'apply'` → 仅切换 `activeProfileId`，不动 profile 内容；
   - `op: 'upsert-profile'` → 新增/覆盖某个 profile.config（可选同时设为 active）。
4. **迁移**：首次读取若无 `profiles`，把根字段包成 `default` profile 并设 `activeProfileId='default'`，写回。保证旧部署零中断。

### 4.3 前端改动

文件：`frontend/src/components/generator/ConfigPanel.vue`

1. 顶部新增**方案下拉框** + 三个动作按钮：
   - `应用`：选 dropdown 项即 `op:'apply'`（切换 activeProfileId）
   - `另存为方案`：弹名 → `op:'upsert-profile'` 新建
   - `更新当前方案`：覆盖当前选中 profile
   - `删除方案`：禁删最后一个/默认方案
2. 下拉项摘要：`方案名 · modelMode · 模型数`（如 `GLM视觉+DS文本 · separate · 5模型`），降低选择认知负荷。
3. 切换冲突保护：当前 formData 有未保存修改时，切方案先 `confirm('未保存修改将丢失，确认切换？')`。
4. 加载方案 → 填充 `formData`（含全部 *Model / providers / pickStrategy），保留现有逐项编辑能力（方案是起点，不是牢笼）。

---

## 5. 与既有 P0 修复的关系

| 维度 | 本需求（方案制） | 前一轮 P0（调度修复） |
|------|----------------|---------------------|
| 层 | 配置管理层 | 运行时调度层 |
| 解决 | 切换成本高、易填错 | 重试不换模型、熔断记错对象 |
| 耦合 | 独立，不改生成管线 | 独立，不改配置结构 |

两者可并行：方案制让"配哪组模型"变简单，P0 修复让"这组模型跑起来更稳"。

---

## 6. 实施步骤（MVP）

1. 后端 schema 加 `profiles` / `activeProfileId`（含迁移）。
2. 后端 `getMergedAiConfig` / `saveAiConfig` 支持 profile 读取与 upsert/apply。
3. 新增后端接口或复用 `/api/config`：`GET` 返回 profiles 列表，`POST` 支持 `op` 字段。
4. 前端下拉 + 四个动作按钮 + 摘要 + 冲突确认。
5. 编译验证（nest build + vue-tsc），重启后端，联调切换。

## 7. 验证标准

- [ ] 旧 `ai-config.json` 首次加载自动生成 `default` profile，生成行为不变。
- [ ] 新建方案 → 下拉出现 → 应用后 `getMergedAiConfig` 返回该方案快照。
- [ ] 应用方案后触发一次生成，日志可见 `activeProfileId` 对应的模型组合。
- [ ] 删除到仅剩一个方案时按钮禁用。
- [ ] 切换含未保存修改时弹确认，不会静默丢失。
- [ ] 方案 config 为完整快照，不会出现跨方案字段混搭。

## 8. 延伸（非 MVP，但值得记录）

- 方案**导出/导入 JSON**：便于跨机器/跨人复用（方案 C 可作为补充能力）。
- 方案**克隆**：基于现有方案微调后另存。
- 方案**测试按钮**：对每个 profile 一键跑连通性测试（复用现有 `runTest`）。
