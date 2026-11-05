# S2 前置冲突清单（必须由人裁决，扫描器不自动选择）

> 由 `s0-scan.cjs` 于 2026-11-04T16:16:23Z 生成｜项目根 `/Users/smigoo/工作/test`
> 铁律：字段级真值只存在于契约里；三份人读文档只写 JSON Pointer 引用与落点。

## 一、S0 缺项（1 项）

- **mvgo.project.json**（`declaration`）：未声明 ⇒ 交付分支 / 信封口径 / 外链 3 项只能全部抛给用户选，禁止内置默认值蒙混

## 二、S1 抽源统计（判据底线在「多源交叉验证」，不在「扫到了几个」）

| 源 | 扫了 | 命中原点 | 去重后唯一点 | 备注 |
|---|---|---|---|---|
| ① 需求文档 | 1 文件 / 正文 6962 行 | 0 | 0 | 🔴 **主源为空** ⇒ 第五处对账无法成立 |
| ② 原型 JS/HTML | 5 页 / 5 脚本（其中可视化库 2 个） | 18 | 9 | 候选锚点，须交叉验证；过滤非接口字面量 0 |
| ③ 前端 api 封装 | 30 文件 | 1 | 1 | 含模板示例风险 |
| ④ 后端 controller | 5 文件 | 2 | 2 | 相对路径须拼类级前缀 |

> ⚠️ 「命中次数 ≠ 唯一点端点」：同一路径在多文件重复出现会重复计数（本样本原型 9 个端点 × 2 文件 = 18 次）。判据一律用**去重后**列。

## 三、缺口（blocker，进 S2 前必须消解）

### GAP-DOC-NO-ENDPOINT（blocker）

- **现象**：需求文档里 0 个接口路径（已扫正文 6962 行）
- **影响**：第五处对账「REQUIREMENTS.md 端点 ↔ 契约 paths 双向差集为空」无法在 S2 完成：文档主源为空
- **选项**：
  - A 把原型候选（去重后 9 个唯一点端点；原始字面量命中 18 次）升格为端点草案，逐条标「来源=原型，待补文档」
  - B 中止 S1，请用户补需求文档的接口章节后重跑
  - C 从 Apifox 反接端点（需要 mvgo.project.json 的 links.apifox）

## 四、待裁决冲突（5 条）

### 1. 需求文档 0 个接口路径　`CF-DOC-ZERO-ENDPOINT`

证据：
- `docs/沿江监控运维子系统_需求规格说明书_V1.1.docx（正文 6962 行）`

**要你定**：文档只有功能描述、没有接口路径 ⇒ 端点「主源」为空。请选 A（原型升格为草案）/ B（补文档）/ C（Apifox 反接）

### 2. 响应信封口径只有探测值，未经声明证实　`CF-ENVELOPE-UNCONFIRMED`

证据：
- `探测命中：`backend/03-microvideo-framework3.x-lite-example-master/readme.md` ⇒ 字段集 `code / data / detail / message``
- `启发式口径：同一文档里同时出现 code + data 且 ≥3 键即命中 ⇒ 可能把**子字段**（如 `detail`）误当顶层信封字段`
- `mvgo.project.json 未声明 `responseEnvelope` ⇒ 探测值只是候选，本平台不采信为真值`

**要你定**：请追认该字段集，或直接写进声明：`mvgo.project.json` → `responseEnvelope: { code, message, data, successCode: 200 }`。追认前 S2 不得把它写进契约真值。

### 3. mvgo.project.json 缺失（声明层为空）　`CF-PROJECTJSON-MISSING`

证据：
- `S0 特征扫描：项目根无 mvgo.project.json`

未决项：`delivery.branch（交付目标分支）`、`responseEnvelope（响应信封口径）`、`links.figma / links.apifox（外链）`

**要你定**：请提供 mvgo.project.json（或口头指定）：交付分支 / 响应信封 / Figma 与 Apifox 外链

### 4. 前端 api 封装里的端点无任何其他来源印证（疑似模板自带示例）　`CF-FRONTEND-ORPHAN`

证据：
- `frontend/vue3-vite-base/src/api/test.js:9  /nhu-dp-show/api/fuwuyun/getCaiYunWeatherData`

**要你定**：确认这些是否属于本系统；不属于则加入抽取消音名单（避免 false positive 污染契约）

### 5. 端点前缀各源不一致　`CF-PREFIX-INCONSISTENT`

证据：
- `原型统一前缀: /api`
- `越界端点: /nhu-dp-show/api/fuwuyun/getCaiYunWeatherData ← frontend | /test/byId ← backend | /test/cache ← backend`
- `后端映射: /test/byId, /test/cache`

**要你定**：确认网关前缀以哪个为准（Nginx /api/ 到底代理到哪个服务）

## 五、扫描器不做的事（防止「静默替你做决定」）

- 不猜交付分支（缺 mvgo.project.json 时只记录，不填默认值）
- 不猜响应信封（缺声明时列为 blocker，不选任何一边）
- 不删「疑似模板示例」的端点，只加 flag 交给人工消音
- 不把单源端点当既定事实（confidence 只到 `candidate`/`partial`）

## 六、裁决去向（本文件是扫描快照，不是结论）

- §三 缺口与 §四 冲突是 `s0-scan.cjs` 的**扫描快照**，每次重跑整篇重写 ⇒「**要你定**」会重新出现。
- 裁决结果与留痕写在同目录的 `spec/decisions.md`：**扫描器不生成、不覆盖**，重跑后裁决不丢。
- 现状：`decisions.md` **已存在**（8548 B，md5 `bae51f9368c230438859231ccf58853f`）—— 重跑本脚本不覆盖它，裁决内容以该文件为准，本清单不复述。
