# REQUIREMENTS.md —— 前后端需求唯一源（草稿 v0.1 · 自动生成）

> 生成器 `s0-scan.cjs`｜2026-11-04T16:16:23Z｜项目根 `/Users/smigoo/工作/test`
> **本文件是契约（OAS）的第 1 种视图，不是新真值。字段级真值只在契约里；本文只写 JSON Pointer 引用与落点。**

> **章节骨架已定死（7 章）**：① 系统概述 ② 功能点清单 ③ 端点总表 ④ 数据实体索引 ⑤ 外部系统与定时任务 ⑥ 已裁决冲突 ⑦ sourceHashes。
> 结构由扫描器产出、不随重跑变形；② 的语义描述由 S2 的 `requirements-writer` 在本骨架上回填。

## 1. 系统概述

### 1.1 输入素材（S0 坑位识别结果）

| 坑位 | 状态 | 依据 |
|---|---|---|
| `docs/**` | ✅ 1 个文件 | 唯一必需项 |
| `html/**` | ✅ 5 页 | echarts / vue.global 全局包存在 ⇒ 判定为「可运行原型」而非设计稿 |
| `frontend/**` | ✅ vite 工程 ⇒ 可作为 S4 落点 | 特征：vite |
| `backend/**` | ✅ spring-boot 工程 ⇒ 可作为 S5 落点 | 特征：spring-boot |
| `mvgo.project.json` | 🔴 缺失 | 外链 / 口径 / 交付分支声明 |
| `.git` | ✅ 单仓（落点 frontend/vue3-vite-base，**非顶层**） | frontend/vue3-vite-base |

> ⚠️ **嵌套仓警告**：1 个 `.git` 落在子目录而非顶层 —— `frontend/vue3-vite-base`（分支 `main`，origin `http://scm.microvideo.cn/gitlab/opensource/framework3.0/102-vue/101001-vue3.0/vue3-vite-base.git`）。
> 常见成因：**基座是从上游 clone 来的**，带的就是上游的 remote 与分支 —— 在其中直接提交会推到**别人的仓库**。按已裁决口径（见 §6）：删嵌套 `.git` 并纳管为上层仓的普通子目录，**处置前先整仓备份、先经人确认**，扫描器不自动执行。

> 业务语义概述（这个系统做什么）由 S2 的 `requirements-writer` 从 `docs/**` 抽取后回填本节 1.2。

## 2. 功能点清单（每个功能点挂三锚点）

> 三锚点 = **文档段号 / 画板 nodeId / 端点**。下表由扫描器**机械**给出其中两个（文档命中位置、端点），画板 nodeId 需要 Figma 输入（本项目 未声明 `links.figma`）⇒ 留 `—` 待 S2 回填。**无锚点的功能点不得进入本节**。

| # | 功能点 | 文档锚点（file:line） | 画板锚点（nodeId） | 端点锚点 |
|---|---|---|---|---|
| 1 | *(待 S2 命名)* | <span>—</span> | — | `/api/bridge/traffic/query` |
| 2 | *(待 S2 命名)* | <span>—</span> | — | `/api/etc/transactions/query` |
| 3 | *(待 S2 命名)* | <span>—</span> | — | `/api/province/gantry/traffic/query` |
| 4 | *(待 S2 命名)* | <span>—</span> | — | `/api/toll/entry/query` |
| 5 | *(待 S2 命名)* | <span>—</span> | — | `/api/toll/exit/query` |
| 6 | *(待 S2 命名)* | <span>—</span> | — | `/api/toll/lanes/traffic/query` |
| 7 | *(待 S2 命名)* | <span>—</span> | — | `/api/trajectory/query` |
| 8 | *(待 S2 命名)* | <span>—</span> | — | `/api/vehicles/mileage/query` |
| 9 | *(待 S2 命名)* | <span>—</span> | — | `/api/weather/observations/query` |
| 10 | *(待 S2 命名)* | <span>—</span> | — | `/nhu-dp-show/api/fuwuyun/getCaiYunWeatherData` |
| 11 | *(待 S2 命名)* | <span>—</span> | — | `/test/byId` |
| 12 | *(待 S2 命名)* | <span>—</span> | — | `/test/cache` |

> 功能点名称留白是**故意的**：扫描器不做语义摘要（那是 LLM 的活）。手写一个名字上来，就等于给「没读过文档的人」一个看似完整的假象。

## 3. 端点总表（12 条）

> 置信度口径：`high` = ≥2 源交叉命中；`declared` = 仅需求文档声明；`partial` = 仅后端有实现；`candidate` = 仅原型/仅前端，**未交叉验证**。
> 「字段定义」一栏是 **JSON Pointer**（指向 `openapi.local.yaml`），不是字段表 —— 字段级真值只在契约里。

| # | 路径 | 方法 | 来源 | 置信度 | 标记 | 字段定义（JSON Pointer） |
|---|---|---|---|---|---|---|
| 1 | `/api/bridge/traffic/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1bridge~1traffic~1query` |
| 2 | `/api/etc/transactions/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1etc~1transactions~1query` |
| 3 | `/api/province/gantry/traffic/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1province~1gantry~1traffic~1query` |
| 4 | `/api/toll/entry/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1toll~1entry~1query` |
| 5 | `/api/toll/exit/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1toll~1exit~1query` |
| 6 | `/api/toll/lanes/traffic/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1toll~1lanes~1traffic~1query` |
| 7 | `/api/trajectory/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1trajectory~1query` |
| 8 | `/api/vehicles/mileage/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1vehicles~1mileage~1query` |
| 9 | `/api/weather/observations/query` | ANY | prototype | candidate | prototypeOnly-未交叉验证 | `openapi.local.yaml#/paths/~1api~1weather~1observations~1query` |
| 10 | `/nhu-dp-show/api/fuwuyun/getCaiYunWeatherData` | GET | frontend | candidate | outsideDeclaredPrefix(/api)<br>frontendOnly-疑似模板示例 | `openapi.local.yaml#/paths/~1nhu-dp-show~1api~1fuwuyun~1getCaiYunWeatherData` |
| 11 | `/test/byId` | GET | backend | partial | outsideDeclaredPrefix(/api)<br>backendOnly | `openapi.local.yaml#/paths/~1test~1byId` |
| 12 | `/test/cache` | GET | backend | partial | outsideDeclaredPrefix(/api)<br>backendOnly | `openapi.local.yaml#/paths/~1test~1cache` |

### 3.1 端点来源缺口

🔴 **需求文档未提供任何接口路径** —— 上表全部端点的 `sources` 均不含 `doc`。

这意味着 S2 的第五处对账（`REQUIREMENTS.md` 端点 ↔ 契约 `paths` 双向差集为空）在**当前素材上无法成立**，因为「文档侧集合」是空的。
必须先由用户裁决（见 `spec/conflicts.md` 的 `CF-DOC-ZERO-ENDPOINT`）。

## 4. 数据实体索引

> 扫描器**不解析实体**（实体是从需求文档语义抽取出来的，属 S2 的 `contract-freezer`）。
> 本节留空是**如实**：填上任何实体名都是编的。S2 回填口径 = 实体名 → `openapi.local.yaml#/components/schemas/<Name>`。

| # | 实体 | 契约指针 | 出现于端点 |
|---|---|---|---|
| — | *(S2 回填)* | — | — |

## 5. 外部系统与定时任务

### 5.1 外部系统（声明层）

| 外链 | 状态 |
|---|---|
| Figma | 🔴 未声明 |
| Apifox | 🔴 未声明 |

> 未声明不等于没有：**扫描器只报事实，不替你填**。按已裁决口径（见 §6），无 Apifox 时先出本地 mock，后期对接。

### 5.2 定时任务 / 调度器（由后端文件特征派生）

发现 3 个疑似调度器文件（**文件名特征命中**，未读内容判定）：

- `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/controller/XxlJobController.java`
- `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/entity/XxlJob.java`
- `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/mapper/XxlJobMapper.java`

> 「本期要不要加任务」属需求裁决，不在本节结论内。

## 6. 已裁决冲突

- 裁决台账：`spec/decisions.md`（**已存在**，8548 B，md5 `bae51f9368c230438859231ccf58853f`）。
- 待裁决冲突的**扫描快照**在 `spec/conflicts.md`（每次重跑整篇重写）。
- **本文不复制裁决内容**：复制即制造第二个真值。要看裁决，读 `decisions.md`。

## 7. 输入素材指纹（sourceHashes）

> 对本轮**实际被读取**的每个输入文件逐个 sha256。S4/S5 注入 prompt 时记下这些指纹 ⇒ 出问题能判「是设计错了，还是代码没按设计写」。
> ⚠️ **本文档自身的 sha256 不在这里** —— 自指哈希无法自证（写入即改变自身哈希），由消费者在注入前计算并记录。

### 7.1 分类摘要

| 源 | 文件数 | 分类 sha256（对「路径:文件sha256」排序拼接后再哈希） |
|---|---|---|
| ① 需求文档 | 1 | `fbe4bde4de558ff3631f42b2cdeceb98f9e716997cdc89c217187b6acb49c271` |
| ② 原型 HTML/JS | 10 | `942c48722fb40f659e2083a0ca16bd3166388fae7adc309606178574532e0ecb` |
| ③ 前端 api 封装 | 30 | `79f17f23cd82b4a3b698d16ca607f4744127d91d9bf0973afb89bddd4288fed5` |
| ④ 后端 controller | 5 | `a86f3af8159377db4b800057a03c93ab6c0f62f498e6ec0a7ae2c011c407e870` |
| **合计** | **46** | `7252376b3e7d3b6214b859ff9c0a9aa3ef5432d15b0ef7dff0eedd2516562599` |

### 7.2 逐文件

| 源 | 路径 | 字节 | sha256 |
|---|---|---|---|
| ① 需求文档 | `docs/沿江监控运维子系统_需求规格说明书_V1.1.docx` | 5926644 | `718d7e92db57b11468395789ac90bbb5756ca358a004faa889c3b4afe30cda14` |
| ② 原型 HTML/JS | `html/模块1/common/common.js` | 23748 | `2132bcac63156a65bf9b5fe9c0630426e96afb6f77294fd1b39fa0e89f73bbb7` |
| ② 原型 HTML/JS | `html/模块1/common/service-overview.js` | 15057 | `aa5ae52e72581cbdba28027517295a3d7ff300b74573b6c36d1d0c7c3249e41c` |
| ② 原型 HTML/JS | `html/模块1/common/service.js` | 9104 | `8dece2177aaa9e767008038896e3037bb12704d92b783c03c300569475eb868c` |
| ② 原型 HTML/JS | `html/模块1/libs/echarts.min.js` | 1030855 | `e84270bd0cd5bdf60fefc26d00c2a391cb2e81f4d26a7a9ee16185a54773a3cf` |
| ② 原型 HTML/JS | `html/模块1/libs/vue.global.prod.js` | 146843 | `b50eeefe35d41636bb96c92b40f1df0b4fb7914e07b3c625b1ec15e9748767b9` |
| ② 原型 HTML/JS | `html/模块1/云资源监测.html` | 203409 | `3b01400664cc4a628fd6a66d1b83dda5e163564f35168717fae3d27fb09580e6` |
| ② 原型 HTML/JS | `html/模块1/数据安全审计.html` | 244210 | `00e38e09bcfb3c4ec9b8c6b0e4e172644aff3255bd6c8d68c5e9bfe7b104fb52` |
| ② 原型 HTML/JS | `html/模块1/服务概览.html` | 20020 | `e64ac45835332915ee53e883e9856c9073a21040a8b00c898b4491c3c1469847` |
| ② 原型 HTML/JS | `html/模块1/本地资源监测.html` | 310858 | `f9937aa2118fb926d332ec62a12e94d9aa86436c15b06133b5dbd57cec4a8e23` |
| ② 原型 HTML/JS | `html/模块1/调用日志.html` | 13349 | `ac3fa140d2702156819f2d762965f701d1be54904446cb6d8b09ca29eb90d783` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/scaffold-config/auto-imports.d.ts` | 5850 | `7f7c9786c88187af0248dfc9ef6f1dcc2862071c6dac6194a05b3af5e1cb7fe7` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/scaffold-config/components.d.ts` | 1009 | `f00bfa7903919caa8bd2ab452dc30dfe1fb63d1fba0e89f0bfa734e55d1cdc9a` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/App.vue` | 566 | `be4cc6dc8e8b25e81db2c9c223d7443e9c33096de6fdd505a54be0f4c8f7ce92` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/api/test.js` | 307 | `adfed0de2c4f4aa3f1c456cc45f755139c174ef4b01cb3b109479a00bf6ec391` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/components/TsDemo.vue` | 1843 | `963566490db8eaec10f4e9a0b69510dcc85d6977ecbf216dd0cee00316c65c24` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/components/base-components/svg-icon/index.vue` | 544 | `7de3d4cf8a3cca842c6ca2d88bd58aa77a447d9931645f14e584f39c029e796c` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/config/custom-config.js` | 264 | `48e5f92c688d5065f256adc5774d6ea9ff7c8bb2ddd74efea5380624ec1ed64a` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/config/default-config.js` | 1737 | `7a073096fad76f1a2c4d23b3aa55d7764e3ee778ab323f986aabe808e01791f8` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/config/index.js` | 223 | `0046d88d29d895a97fa70b11869c7b88ba84bc6a07cb3d5dfa6c461899b7572e` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/core/lazy-use.js` | 510 | `370838d96780c2cf42984dd5b18701be3d069d7fde7cfdd8b74ff2a89a92fd30` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/core/request.js` | 2679 | `6b065bbf68b7bdee1e3db89c62b33ef9a342deb4d11ebb5e1a2ef24c3e1d5135` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/main.js` | 712 | `19a325d107d42c80e020293ae516bfcd40b6ccf9bc2e5735f060743b1c3cc08b` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/router/basic-routes.js` | 170 | `4f8b8457b272144c009a7f8dc70fe1e1c165212e8d6488c8dc49bf59d0afc3ae` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/router/index.js` | 366 | `87f6b4f7850235a9979fbb6932419fedccea7f3f845826ee934865309da4701b` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/router/permission.js` | 426 | `5ae998504107df9410a5511714d011ff2e9a78a2e0957f6460043b4741c01bc5` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/store/index.js` | 253 | `41a4a7e0caa99d47ab10919596ffa4d9e2b4b7ad3947828aa38f5390498747de` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/store/modules/index.js` | 23 | `9aaccf34f912b6b14f01bf3215e52c1cf9fec6736ddea09d315336a388fd82ba` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/store/modules/user.js` | 812 | `4fe07e0ad86534ff798f80b60de9427edc87966aeeb590f65149f252cf8e58bd` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/types/auto-imports.d.ts` | 3021 | `e6a61fed359e3cc617a42f0cad31335c6a8a5b46039ebef6b6863dbc5110f9d6` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/types/env.d.ts` | 287 | `ce1773b7971ba002efb9e6b5ed381680c4d76a6a50aa8e9d90df5be5ddfc37f3` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/types/shims-vue.d.ts` | 236 | `a3bc05181a62e9d8766f4f6fef028f5d1e5d171b9b733fff4f94911464f6c1c0` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/utils/auto-import/common.js` | 559 | `a2d7c29c26015ef49bcf88f22f69f9be7315ed2ef27ec47996312ed03be287a4` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/utils/auto-import/pretty-log.js` | 2866 | `13f046ec10fe8bbebe81d02581199c098f05ca4d2e925de91a08297eaecb3943` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/utils/auto-import/radash.js` | 28661 | `3d02b08380329aef1903c967d3d722095afe8aab704dfaf5297e79d57d263587` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/utils/rem.js` | 859 | `ca91ad7402edec061086994fbc239d6de0a0275bbe07bc73e1a7d8c638bbc46b` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/utils/storage/index.js` | 752 | `dcade81b916b2a9aae06f55d4318549e61588295749ffd57ff4b17d01181e705` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/utils/storage/storage.js` | 1421 | `90c1d1042a8535d25874e78219634b6c22fe6f6ce7fe27f9e902c51d353ada90` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/utils/tsDemo.ts` | 795 | `f69eb74ddea186e408779171c264281ffd3ea748546cb5fe8ae7f539c5650c16` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/src/views/home/index.vue` | 9459 | `c63fbc9fa89bdc48d9799202e3e0741690810526aae5e7ceff5b6a097125bd51` |
| ③ 前端 api 封装 | `frontend/vue3-vite-base/vite.config.js` | 4587 | `1609af761753a41843cb186fc1f47e04c094301c7eaa99cba5628564796a376c` |
| ④ 后端 controller | `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/MicroAppliction.java` | 503 | `f68d444fd7b3f563713ce85783276b6518e598e18fdb13bf5906fb1345514fb9` |
| ④ 后端 controller | `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/config/MybatisPlusConfig.java` | 804 | `ba8f1532071d32e975d52700188a706079ca794b4ef3dc2370adf907d6bf9993` |
| ④ 后端 controller | `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/controller/XxlJobController.java` | 3290 | `4a1bae4c9b49906a14ae6d7217e4b52168e00ceab3361a6063ba60325da4c795` |
| ④ 后端 controller | `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/entity/XxlJob.java` | 720 | `4fc5f09feefea4ac3c5101438fb843f71bb395e871eb03629429db1bae8f1e7e` |
| ④ 后端 controller | `backend/03-microvideo-framework3.x-lite-example-master/src/main/java/cn/microvideo/mvsc/mapper/XxlJobMapper.java` | 248 | `43d55a36a41c05342a055ec402beb1fa4d5357355d89d59d88ab52d1895f4310` |

---

复现：`node outputs/s0-scan.cjs /Users/smigoo/工作/test --out /Users/smigoo/工作/mvgo/outputs/2026-11-04-s0-scan`（**只读输入目录**，退出码 1 = 存在 blocker）。
