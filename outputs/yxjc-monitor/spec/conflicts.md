# 契约冲突与已拍板变更登记（S2）

> 单一约定源：`outputs/yxjc-monitor/CONTRACT.md`。
> 每条按「现象 / 证据（文件+行或原文片段）/ 处置 / 影响面」四栏登记。
> 行号以磁盘实际文件为准（`wc -l` 与 `shasum -a 256` 实算）。

---

## A. 已拍板变更项（有意归一化，改变原文口径）

### A1. 响应码不统一 → 统一 `code:200`

| 栏 | 内容 |
|---|---|
| 现象 | 各文档响应示例的 `code` 值不一致：部分为 `200`，部分为 `0`（`0-成功，非0-失败`）。 |
| 证据 | 实扫各行 `"code"`：`200` 出现在 D1 L196；D2 L187/L252；D3(=D4) L278/L319/L362/L395；D5(1) L126、D5 非(1) L244。`0` 出现在 D6 L201/L267；D7 L146；D8 L270；D9 L121/L145/L277/L327/L371/L448/L486；D10 L175/L224。 |
| 处置 | 全部统一为 `code:200` 成功；非 200 为业务错误且 `data=null`，`message` 给中文原因。**D10 原 `code:0` 已归一化为 `code:200`**。 |
| 影响面 | 全部 25 个端点响应；`components.schemas.Envelope` 的 `code.example=200`；mock 层统一信封。 |
| ⚠️ 口径校正 | 用户/契约表述为「D5~D10 原 `code:0`」，但磁盘上 **D5（两种版本）实际均为 `code:200`**。故真实分布为：**D1/D2/D3/D5=200，D6/D7/D8/D9/D10=0**。处置结果（统一 200）不变，仅登记差异以免误判。 |

### A2. 分页口径 → 列表型统一加标准分页

| 栏 | 内容 |
|---|---|
| 现象 | D7（运单列表）、D8（事件列表）原文无分页；仅 D6 有 `page` 分页对象。 |
| 证据 | 全文 `page` 子串出现次数：D6=18（17 行），其中请求示例 L80-89 与响应示例 L227-236 各 1 个 `page` 分页对象（合计 4 处/4 行）；D7=0；D8=0；其余=0。D6 L80-89 给出 `page:{totalPages,pageSize,firstPage,lastPage,currentPage,totalNum,startRow,endRow}`。 |
| 处置 | 统一分页：请求 `pageNum`(默认1)/`pageSize`(默认20)；响应 `data={list:[],page:{...8 字段...}}`。D7(#11)、D8(#12) 由「无分页」升为「标准分页」。 |
| 影响面 | #9、#11、#12，及新增的 #18/#21/#22/#23；`components.schemas.PageMeta`、`PagedList`、`components.parameters.PageNum/PageSize`。 |

### A3. 车型统计缺 `sectionNum` 归属 → 补 `items[].sectionNum`

| 栏 | 内容 |
|---|---|
| 现象 | 车型概览接口原只返回**全局**客货累计数，无路段归属。 |
| 证据 | D2 4.2.2.2 响应示例仅 `{ "busNum": 37258, "truckNum": 1362 }`（L187-192），响应参数表亦无 `sectionNum`（L179-180）。 |
| 处置 | 统一为 `data.items[]`，每项补 `sectionNum`（并含 `sectionName/busNum/truckNum/busRatio/truckRatio`）。 |
| 影响面 | #2 `TodayVehicleTypeStaticData.items[]`。 |
| ⚠️ 口径校正 | 用户表述为「D6 `4.2.3.2` 中 `pointTypeStatics`」，但 4.2.3.2 实为**车辆明细**，`pointTypeStatics` 属 **D5 `4.2.3.1`**，且 D5 请求本已带 `sectionNum`（请求示例 L27-28、请求参数表 L54）。按证据，真正「缺 sectionNum 归属」的是 **D2 `todayVehicleTypeStatic`**；本项即按此落位。D5 的 `pointTypeStatics` 不重复补。 |

### A4. D3 `staticsByDay` 的 `dateList` → 本轮不返回

| 栏 | 内容 |
|---|---|
| 现象 | 正文称按日统计「同时返回可选日期列表（dateList）」，但响应参数表与示例均无该字段。 |
| 证据 | D3 4.2.2.3.4 后端设计 L224：「同时返回该范围的可选日期列表（dateList）」；而 §4.2.2.3.5 接口三响应参数表 L348-355 仅 `items[]`，响应示例 L360-370 仅 `items`。 |
| 处置 | 按「不返回」处理；`ForecastStaticsByDayData` 不含 `dateList`。前端小时模式的日期列表改由区间前端生成或另调 #7。 |
| 影响面 | #6 `ForecastStaticsByDayData`；节假日预测下钻弹窗。 |

### A5. D8 WS 示例 `eventLevel:"CRITICAL"` → 视为笔误，统一枚举

| 栏 | 内容 |
|---|---|
| 现象 | 事件等级枚举定义为 `HIGH/MEDIUM/LOW`，但 WS 推送示例出现 `CRITICAL`。 |
| 证据 | D8 4.2.4.1 响应参数表 L261：`eventLevel` 枚举 `HIGH/MEDIUM/LOW`；WS 推送示例 L342：`"eventLevel": "CRITICAL"`；HTTP 示例 L284/L297 为 `HIGH`/`MEDIUM`。 |
| 处置 | `CRITICAL` 视为笔误，统一枚举 `HIGH/MEDIUM/LOW`；`EventListItem.eventLevel` 加 `enum` 约束。 |
| 影响面 | #12、#13、#14、#25。 |

### A6. D9 正文引用 `eventHandle` 但无路径 → 补全为 #25

| 栏 | 内容 |
|---|---|
| 现象 | 后端设计章节描述了「事件处置（eventHandle）」的完整逻辑，但接口设计章节未给任何路径/请求参数。 |
| 证据 | D9 4.2.4.2.3 L198-202：「**事件处置（eventHandle）**：根据 eventType 路由到对应数据表……该接口由智能侦测事件列表页面调用，用于误报/忽略/已读操作」；而 §4.2.4.2.4 接口设计仅列 alertDetail / alertDisposal / eventComplete 三个（L226/L419/L459）。 |
| 处置 | 在契约 #25 补全为 `POST /operation/detection/eventHandle`，请求 `{eventId, eventType?, action(FALSE_ALARM/IGNORED/READ), remark?}`，响应 `data={}`。来源标注为 Figma「交通态势核实&协同上报」。 |
| 影响面 | #25 `EventHandleRequest/Response`；D9 闭环补全，事件列表的误报/忽略/已读可落地。 |

### A7. 响应信封多字段（`rid`/`detail`）→ 收敛为 `{code,message,data}`

| 栏 | 内容 |
|---|---|
| 现象 | D6~D10 原示例信封为 `{rid, code, message, detail, data}` 五字段。 |
| 证据 | D6 L199-204；D7 L144-149；D8 L268-273；D9 L275-280；D10 L173-178。D1/D2/D3/D5 为 `{code, data}` 两字段。 |
| 处置 | 统一信封仅保留 `code`/`message`/`data`；`rid`/`detail` 丢弃（如需链路追踪后续以响应头承载）。 |
| 影响面 | 全部响应；`Envelope` 仅 `required:[code,message]`。 |

---

## B. 一致性/记录项（不改闭环，但需留痕）

### B1. D8 正文自称「6 类」实列 7 类

| 栏 | 内容 |
|---|---|
| 现象 | 功能说明写「6 类」，括号内与枚举均列 7 类。 |
| 证据 | D8 L3：「汇聚6类智能侦测事件（违法行为、异常事件、异常天气、异常上报、超高车辆、环境异常、结构异常）」共 7 项；`eventType` 枚举 7 个（L57/L244）。 |
| 处置 | 以 **7 类**为准；文案「6 类」视为笔误。 |
| 影响面 | #12 `eventType` 枚举 7 值；事件类型筛选按钮 7 个。 |

### B2. D3 / D4 逐字节重复 → S0 去重

| 栏 | 内容 |
|---|---|
| 现象 | `4.2.2.3_流量预测（…LLYC）.md` 与 `… (1).md` 内容完全相同。 |
| 证据 | `shasum -a 256` 两者均为 `81a2a37263c176974d2166cd6e5d36c7f28d9391418ef4115d2c9df45eab7b9f`；`md5` 均为 `1539428a52180cf46d2b0cb1462c52a3`；`wc` 均 17308 字节 / 410 行。 |
| 处置 | 保留 D3，删除 D4（`sources.json.dedup.removed=["D4"]`，`D4.duplicateOf="D3"`）。 |
| 影响面 | 输入归一化计数：10 篇 → 9 份唯一内容。 |

### B3. `4.2.3.1` 同编号两版本分叉 → 以 `(1)` 版为准

| 栏 | 内容 |
|---|---|
| 现象 | 非 `(1)` 版与 `(1)` 版内容不同：初始化参数结构由扁平 `businessConfig[]` 改为 `sections[]`。 |
| 证据 | sha256：非 `(1)`=`dc2da03af4fc990f4f7f6543c838ebbb214aa220c24edc9a1cf63965420f3e0a`（253 行 / 8244 B）；`(1)`=`5e16a50b65358649b1d4dba35c567f56128dfb8b1daa5f040df59e03241fb7cf`（135 行 / 5321 B）。`diff` 段号：**`11,12c11`**、**`26,137c25,31`**、**`141,157c35,39`**。 |
| 处置 | 本轮以 **`(1)` 版**为准（`sources.json.forked[0]`）。差异摘要：① 原型图 URL 不同；② 初始化参数由逐项平铺的 `businessConfig[]`（约 20+ 配置项）改为 `sections[]`+`pollInterval`；③ 接口配置/页面元素段随之重写。 |
| 影响面 | #8 `pointTypeStatics` 的初始化参数口径；前端 `point-today` 模块 `params`。两版 `code` 均为 200，不影响 A1 结论。 |

### B4. D10 属用户清单外文档，磁盘发现后并入

| 栏 | 内容 |
|---|---|
| 现象 | 用户给的 10 篇清单中，D10 未列，但磁盘存在且定义 `GET /operation/device/monitor`。 |
| 证据 | `/Users/smigoo/Downloads/4.2.6.1_异常环境监测（F_UC_B_YXJC_HJJC_YCHJJC）.md`，9646 B / 249 行，sha256 `2ed30dc09e582d125f619c525acb5b4b2f20e873b1bfe969bef7264a77c42327`；§4.2.6.1.4 定义 `GET /operation/device/monitor`（L139）。 |
| 处置 | 并入为 D10，补上 CONTRACT §5 `env-monitor` 的「环境监测」数据缺口；`sources.json.documents[9].note` 已标注来源。 |
| 影响面 | #17；`env-monitor` 模块由「纯 Figma」变为「有文档依据」。 |

### B5. SRS 声明「不扩展设备/环境监测」与本项目含该能力 → 范围说明（非冲突）

| 栏 | 内容 |
|---|---|
| 现象 | 项目级 SRS 明确不含设备/环境监测，而本轮运行监测大屏含「设备监测」「环境监测」两个 region。 |
| 证据 | `隧道全息监测系统-软件需求规格说明书-V0.0.1.md` §6.2.2（CONTRACT §0 L29 引述）：「不扩展设备、环境或结构监测能力」。 |
| 处置 | 记为**范围说明**，非冲突：SRS 是**兄弟子系统**（全息监控+运营管理）的规范，本轮运行监测大屏是其**兄弟能力**，二者并行不矛盾。SRS 仅复用组件编码规则与领域词表，不从中推导接口。 |
| 影响面 | 无接口影响；仅明确 `device-monitor`/`env-monitor` 的能力来源为 Figma + D10，不引用 SRS。 |

### B6. `hazardousTypeDistribution` 原响应为裸数组 → 统一包一层

| 栏 | 内容 |
|---|---|
| 现象 | 原文 `data` 直接是数组，与其余「对象型 data」不一致。 |
| 证据 | D6 §4.2.3.2.2.4 L105-114 期望返回为裸数组；§4.2.3.2.4 L264-278 响应示例 `"data": [ {...} ]`。 |
| 处置 | 统一为 `envelope.data = { "data": [ {typeName,count} ] }`（即 `HazardousTypeDistributionData.data`）。 |
| 影响面 | #10；前端 `point-car-detail` 饼图取值路径变为 `res.data.data`。 |

### B7. `eventList` 原响应为裸数组 → 改为分页 `list`

| 栏 | 内容 |
|---|---|
| 现象 | D8 原 `data` 为事件裸数组，无分页包装。 |
| 证据 | D8 §4.2.4.1.4 L251-262 响应参数 `data` 为 `Array`；示例 L273-300 `"data": [ ... ]`。 |
| 处置 | 结合 A2，改为 `data={list:[EventListItem],page:{...}}`。 |
| 影响面 | #12；前端 `detection-event-list` 取值路径变为 `res.list`。 |

### B8. 端点总数「25」与「24 HTTP + 1 WS」的口径对齐（登记更正）

| 栏 | 内容 |
|---|---|
| 现象 | CONTRACT **L211** 原文为「**合计 24 个 HTTP 端点 + 1 个 WS = 25 个端点**」—— 契约全文从未出现「25 个 HTTP 端点」的说法，「25」是**端点总数**口径。§4.1 表 17 行（L178-L194）中 #13 即 `WS /ws/detection/event`，故 §4.1 严格 HTTP = #1-#12 + #14-#17 = 16；加 §4.2 的 #18-#25（L202-L209）= 8，共 **24 HTTP**；加 1 个 WS = 25 个端点。⚠️ **登记更正**：本条目初版曾把「25」引述为「25 个 HTTP 端点 + 1 个 WS 通道」并据此声称契约口径矛盾 —— 该引述在 CONTRACT 中不存在（L211 为唯一口径出处），属登记错误，现按原文更正。下游算术（16+8=24）与处置结论（`paths` 收录 25 条）不受影响。 |
| 证据 | CONTRACT L211（唯一口径出处，原文逐字如上）；L178-L194 = §4.1 表 17 行（#13 为 WS）；L202-L209 = §4.2 表 8 行（#18-#25）。 |
| 处置 | `openapi.local.yaml` 的 `paths` 收录 **25 条**（#1-#25 一一对应，其中 #13 `/ws/detection/event` 以 `get` 操作登记并另在根级 `x-websocket` 说明语义）；`operationId` 计数 **25**，与契约编号严格对齐、无遗漏。真实 HTTP 语义端点 24 个 + WS 1 个。 |
| 影响面 | 自查脚本口径；Apifox 对接时 `paths` 25 条。 |

### B9. 契约 #3 列 `type` 入参，D2 文档无 `type`

| 栏 | 内容 |
|---|---|
| 现象 | CONTRACT §4.1 #3 主要入参写「`sectionNum[]`、`type`」，但 D2 趋势接口文档仅 `sectionNum`。 |
| 证据 | CONTRACT L180（§4.1 #3 行）；D2 §4.2.2.2.5 L197-206 请求参数仅 `sectionNum`。 |
| 处置 | 按**文档**实现：`todayVehicleTypeTrend` 仅收 `sectionNum`（不臆造 `type`）。若后续前端需要维度切换，再按新增参数登记。 |
| 影响面 | #3 `parameters`；前端 `flow-vehicle-type` 弹窗。 |

### B10. `mock` 单方扩展 #26 `GET /operation/monitor/sectionList`（契约外路由，已按裁决 B 移除）

| 栏 | 内容 |
|---|---|
| 现象 | `mock/server.js` 曾注册 `route('GET','/operation/monitor/sectionList','self',()=>ok({items:D.SECTIONS}))`（原 L340，注释「补充 #26：外壳取路段配置（D1/D2 初始化参数 sections 需要）」）。该路径**不在** CONTRACT §4 编号内（§4 共 25 条 = 24 HTTP + 1 WS），亦不在 `openapi.local.yaml` 的 25 条 `paths` 中。 |
| 证据 | 原 `mock/server.js` L340（全仓唯一注册点，**已删**）；`mock/data.js` L71 `const SECTIONS = [...]`（**保留**，该文件内 L81/209/325/370/761/909/976/1002… 共 10 处内部使用，删路由未产生悬空引用）；`web/` 全目录对 `sectionList`/`SECTIONS` **0 处引用** ⇒ 交付物无消费者。 |
| 差集实测（裁决前） | `openapi.paths ∖ mock.routes = ∅`（无遗漏）；`mock.routes ∖ openapi.paths = ['/operation/monitor/sectionList']`（多 1 条）。mock 实注册 25 HTTP = 契约内 24 + 本条 1。 |
| 处置 | **已按用户裁决 B 执行**（2026-11-04）：① 删除 `mock/server.js` L340-341（含注释）该路由；② 同文件 L742-744 自检日志由写死的「（含补充 /operation/monitor/sectionList）」改为**计算式** —— 用 `httpCount` 实数对契约 24 逐次比对，同时打印`缺失 n 条 / 多余 n 条`，路由表一变日志立刻露馅；③ 契约真值侧（`openapi.local.yaml` / CONTRACT）**零改动**。 |
| 落点与复现 | 新增守卫 `spec/check-contract-parity.rb`（常驻，非一次性脚本）：`ruby spec/check-contract-parity.rb` ⇒ 实测 `mock : 24 HTTP + 1 WS = 25`、`oas : 25（WS 归一后）`、`mock ∖ oas = 0`、`oas ∖ mock = 0` ⇒ **exit 0**。退出码口径：0 = 一致 / 1 = 存在差异 / 2 = 读不到文件。三态已验证：真实 0、把路由加回（阳性对照）1、缺文件 2。 |
| 影响面 | mock 自检日志口径（改后更严）；Apifox 对接仍为 25 条 path（**不含** sectionList）。若后续外壳确需「路段选择」配置源，须走**新增契约条目**的正规路径（原 A 方案：`paths` 25→26 + CONTRACT §4.2 增 #26 + `alignment.endpointsTotal` 同步），不得再由 mock 单方扩展。 |

---

## C. 汇总

| 类别 | 条目 |
|---|---|
| 已拍板变更（改口径） | A1 响应码、A2 分页、A3 车型归属、A4 dateList、A5 CRITICAL、A6 eventHandle、A7 信封字段 |
| 记录/留痕 | B1 6 vs 7 类、B2 D3/D4 重复、B3 4.2.3.1 分叉、B4 D10 并入、B5 SRS 范围、B6 裸数组、B7 事件裸数组、B8 25 vs 24、B9 type 入参、B10 mock 单方扩展 sectionList（**已处置：移除**） |
| 未决 | **无**。B10 已于 2026-11-04 按用户裁决 B 落地：移除 `mock/server.js` 契约外路由 + 自检日志改计算式，`mock ≡ 契约`（24 HTTP + 1 WS，双向差集为空），口径由 `spec/check-contract-parity.rb` 钉住（`ruby spec/check-contract-parity.rb` ⇒ exit 0）。 |
