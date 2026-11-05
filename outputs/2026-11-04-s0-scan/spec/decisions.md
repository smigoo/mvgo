# 用户裁决登记（S0/S2 待决项 → 已裁决）

> **本文件不由 `outputs/s0-scan.cjs` 生成** —— 重跑扫描不会覆盖它。
> 扫描器只报不选（口径见 `conflicts.md` §五），裁决只由人给，因此台账与产物分开存放：
> `conflicts.md` 是可重生成的**扫描快照**，本文件是不可重生成的**决策层**。
> 裁决时间：2026-11-04。样本目录 `/Users/smigoo/工作/test` 全程只读，一个字节未改。

---

## 一、裁决一览

| # | 对应待决项 | 裁决 | 一句话落点 | 状态 |
|---|---|---|---|---|
| 1 | `CF-DOC-ZERO-ENDPOINT`（需求文档 0 个接口路径） | **A：原型升格为端点草案主源** | 契约草案基线 = 原型 9 条唯一点端点 | ✅ 已落 |
| 2 | `CF-FRONTEND-ORPHAN` + `backendOnly`（单源孤儿端点） | **都不纳入** | 3 条单源端点不进 S2 契约，登记 S7 待接 | ✅ 已落 |
| 3 | `CF-PROJECTJSON-MISSING`（声明层为空） | **最小集**（只收机器推不出来的三项） | 规范见 `outputs/2026-11-04-声明层最小集.md` | ✅ 已落（规范已出，样本目录未落文件） |
| 4 | `B10`（mock 单方扩展契约外路由） | **从 mock 移除** | `mock ≡ 契约`，守卫 `check-contract-parity.rb` 钉住 | ✅ 已落 |

---

## 二、逐项留痕

### 裁决 1 · 端点主源 = A（原型升格）

- **原状**：需求文档正文 6962 行、端点命中 0 处 ⇒ 三源里「声明源」为空，端点主源无从谈起（`endpoints.json` 里 `confidence=declared` 一条都没有）。
- **裁决**：以**原型**（`prototype` 来源）升格为 S2 契约草案的主源。
- **落点与实测**：`spec/endpoints.json` 共 **12 条**唯一端点，其中 `sources=['prototype']` **9 条**即契约草案基线；这 9 条 `confidence` 均为 `candidate`、flag 均为 `prototypeOnly-未交叉验证`（**未因升格而洗白成 high** —— 单源就是单源）。
- **对下游的约束**：第五处对账以这 9 条为 OAS `paths` 基线；`REQUIREMENTS.draft.md` 必须向这 9 条收敛，否则第五处对账照样过不了。

### 裁决 2 · 单源孤儿端点 = 都不纳入

- **原状**：12 条里有 3 条为单源且**全部越界**（`outsideDeclaredPrefix(/api)` 命中数 = 3，恰为这 3 条）：

  | 来源 | 端点 | 判据 |
  |---|---|---|
  | frontend | `GET /nhu-dp-show/api/fuwuyun/getCaiYunWeatherData`（`frontend/vue3-vite-base/src/api/test.js:9`） | `frontendOnly-疑似模板示例` |
  | backend | `GET /test/byId` | `backendOnly` |
  | backend | `GET /test/cache` | `backendOnly` |

- **裁决**：3 条**都不进** S2 契约，登记为「S7 待接/待确认」。
- **落点与实测**：`12 − 3 = 9`，与裁决 1 的基线**逐条相等** —— 两条裁决互相印证，不是各说各话。附带效果：越界 flag 在契约面上归零（9 条 100% 落在 `/api` 内）。
- **为什么不是「只剔前端、留后端」**：本样本后端只有框架、`pom.xml` 0 个，`/test/*` 无可交叉验证的实现证据；把它们塞进契约会让「双向差集为空」的判据从一开始就假绿。留到 S7 有实现再接，代价只是多一次登记。

### 裁决 3 · 声明层 = 最小集

- **裁决**：`mvgo.project.json` 只收**机器推不出来**的三项（`delivery.branch` / `responseEnvelope` / `links.figma`+`links.apifox`）；可从代码或产物推导的（技术栈、端点前缀、接口清单）**一律不进声明**，进了也不采信为真值。
- **落点**：`outputs/2026-11-04-声明层最小集.md`（含字段表、缺省后果、可直接放到项目根的示例 JSON）。
- **⚠️ 未落盘的边界**：样本目录只读 ⇒ **没有**在 `/Users/smigoo/工作/test/mvgo.project.json` 创建任何文件。下次对该样本重跑 S0 时，`CF-PROJECTJSON-MISSING` 仍会如实报出，这是正确行为（缺就报缺）。

### 裁决 4 · B10 = 从 mock 移除

- **落点**：`outputs/yxjc-monitor/spec/conflicts.md` → **B10**（处置栏已改「已按用户裁决 B 执行」）；契约真值侧 `openapi.local.yaml` / CONTRACT **零改动**。
- **证据**：`ruby spec/check-contract-parity.rb` ⇒ `mock : 24 HTTP + 1 WS = 25` / `oas : 25` / 双向差集均空 ⇒ exit 0。三态已验证（一致 0 / 加回路由 1 / 缺文件 2）。

---

## 三、裁决后仍开着的事（不假装已解决）

| 事项 | 现状 | 为什么现在不能定 | 什么时候定 |
|---|---|---|---|
| 后端 `/test/*` 的真实挂载前缀 | 2 条已退出契约（裁决 2） | 样本 `pom.xml` 0 个、无实现可证；「Nginx `/api/` 代理到哪个服务」是部署事实，代码里没有 | **S7**（接后端时），届时须给出 Nginx 或 `server.servlet.context-path` 证据 |
| `CF-PREFIX-INCONSISTENT` 本身 | 在 S2 范围内**已不成问题**（越界 3 条全退出契约） | 但在 S7 会以「后端前缀映射」形式复现 | S7 |
| 响应信封实际字段 | `responseEnvelope` 待声明（裁决 3 只定了「要声明」，没定「值是什么」） | 本项目 A7 已把信封收敛为 `{code,message,data}`，但那是**契约决策**，与「样本项目声明什么」是两件事 | 用户提供声明值 / S2 冻结时以 A7 为准并登记 |
| **样本项目根目录没有 `.git`** | 唯一 git 仓在**前端模板内部**：`frontend/vue3-vite-base/.git`（83 个文件，origin=`…/102-vue/101001-vue3.0/vue3-vite-base.git`，那是公司 vue3 模板仓本身）；`stat .git`（根）⇒ `No such file or directory` | 「git 只提交到 `go-dev`」这一条在样本上**无法直接成立** —— 根不是仓，无处建分支 | **S7 前置**：签入前须先 `git init` 根目录；并且要定「嵌套模板仓怎么办」（删其 `.git` 纳管 / 保留为子模块 / 当 vendor 忽略）。在真实项目仓上跑 S0 时此项自然消失 |

> 口径校正（2026-11-04 复核）：本文件早期表述「.git 内 83」未写明**在哪**，易被读成「根是仓」。实测分解为
> `189 个文件 = 工作文件 101 + .DS_Store 5 + frontend/vue3-vite-base/.git 内 83`，三个数各自独立可数（`find` 逐项验证）。

---

## 四、第二轮裁决（2026-11-04，Q1–Q5）

> 这一轮裁决的是**管线怎么建**，不是某个样本的事实。落点主要在
> `outputs/2026-11-04-工坊端到端自动开发能力设计.md`（§2.3 / §3.1 / §9 / §12），本文件只做登记与互链。

| # | 议题 | 裁决 | 落点 | 证据 / 现状 |
|---|---|---|---|---|
| Q1 | 响应信封**未声明**时怎么取值 | **三级来源兜底 + 全留痕**：`declared` > `detected-未证实` > `default-A7`，每字段带 `source` | 设计文档 §2.3、§12 决策 10 | 已落进扫描器：`manifest.S1.envelope` 实测 `source=detected-未证实`、来源文件 `backend/…/readme.md`；本样本三级取值三态已跑通 |
| Q2 | **嵌套 `.git`** 怎么处置 | **删嵌套 `.git` 并纳管为上层仓普通子目录**（先整仓备份、先经人确认） | 设计文档 §9「嵌套仓」、§12 决策 11 | 已落进扫描器：`manifest.S0.git.nested` = 1 条（`frontend/vue3-vite-base`，origin 指公司模板仓）、`hasTopLevel=false`；`REQUIREMENTS.draft.md` §1.1 自动带嵌套仓警告 |
| Q3 | 三份人读文档**骨架** | **三份一起定死（7 / 5 / 5）**，章节号连续、不得增删、重跑不变形 | 设计文档 §3.1、§12 决策 12 | 已落：`REQUIREMENTS.draft.md` 7 章 / `FRONTEND-DESIGN.draft.md` 5 章 / `BACKEND-DESIGN.draft.md` 5 章；断言 27 条全过 |
| Q4 | 人确认**闸门**形态 | **单一审批文件 + 命令行先行**：`.gen/approvals/<阶段>.confirm.json`，含 `docHash` | 设计文档 §3.1、§12 决策 13 | 规范已定（schema + 三条硬规则）；**未实现**（待 S2/S4a/S5a 落地时接） |
| Q5 | 试跑产物 `outputs/yxjc-monitor/` 15 文件 | **全留 + 标清「判据载体 / 不可重生成」** | `outputs/yxjc-monitor/README.md`、设计文档 §12 决策 14 | 已落：README 逐个标注 15 文件各自承载哪条判据 |

### 本轮裁决的**不开工边界**（不假装已做）

| 事项 | 状态 | 为什么 |
|---|---|---|
| `.gen/approvals/` 闸门机制 | **只有规范，无实现** | 它属于 S2/S4a/S5a 的落地物，本轮只跑 S0/S1 |
| 删样本的嵌套 `.git` | **未执行** | 破坏性动作 + 样本只读，须人授权（裁决 Q2 自带的「先备份先人确认」） |
| 样本根 `git init` | **未执行** | 同上，属对样本目录的写操作 |

