# 运行监测大屏原型 · 协作契约 v1

> 本文件是**唯一约定源**。所有并行工作（契约、mock、前端）都必须严格按本文件对齐，不得各自另立口径。
> 本轮范围 = S0–S4：输入归一化 → 多源对齐 → 契约冻结 → 本地 mock → 前端全铺。**不做后端实现。**

---

## 0. 输入物料

### 需求文档（10 篇，`/Users/smigoo/Downloads/`，用户已声明「文档不全 仅测试使用」）
| # | 文件 | 模块编码 | 模块名称 |
|---|---|---|---|
| D1 | `4.2.2.1_当日总流量（F_UC_B_YXJC_LLJC_DRZLL）.md` | `F_UC_B_YXJC_LLJC_DRZLL` | 当日总流量 |
| D2 | `4.2.2.2_车型分布（F_UC_B_YXJC_LLJC_CXFB）.md` | `F_UC_B_YXJC_LLJC_CXFB` | 车型分布 |
| D3 | `4.2.2.3_流量预测（F_UC_B_YXJC_LLJC_LLYC）.md` | `F_UC_B_YXJC_LLJC_LLYC` | 实时流量预测 + 节假日流量预测（**一个编码两个组件**） |
| D4 | `4.2.2.3_流量预测（F_UC_B_YXJC_LLJC_LLYC） (1).md` | 同上 | **与 D3 逐字节相同，S0 必须去重** |
| D5 | `4.2.3.1_今日累计（F_UC_B_YXJC_ZDCL_JRLJ） (1).md` | `F_UC_B_YXJC_ZDCL_JRLJ` | 今日累计 |
| D6 | `4.2.3.2_车辆明细（F_UC_B_YXJC_ZDCL_CLMX）.md` | `F_UC_B_YXJC_ZDCL_CLMX` | 车辆明细 |
| D7 | `4.2.3.3_危化品车运单列表（F_UC_B_YXJC_ZDCL_YDLB）.md` | `F_UC_B_YXJC_ZDCL_YDLB` | 危化品车运单列表 |
| D8 | `4.2.4.1_智能侦测事件列表（F_UC_B_YXJC_ZNJC_SJLB）.md` | `F_UC_B_YXJC_ZNJC_SJLB` | 智能侦测事件列表 |
| D9 | `4.2.4.2_告警处置（F_UC_B_YXJC_ZNJC_GJCL）.md` | `F_UC_B_YXJC_ZNJC_GJCL` | 告警处置 |
| D10 | `4.2.6.1_异常环境监测（F_UC_B_YXJC_HJJC_YCHJJC）.md` | `F_UC_B_YXJC_HJJC_YCHJJC` | 异常环境监测（**用户清单外，磁盘上另行发现**；定义 `GET /operation/device/monitor`，正好补上「环境监测」缺口） |

⚠️ `4.2.3.1` 另有**非 `(1)` 版**（未在本次清单内），与 `(1)` 版已分叉（扁平 `businessConfig` vs `sections[]`）。**本轮以 `(1)` 版为准**，并在 `spec/conflicts.md` 登记「同编号多版本」。

### 补充物料：项目级 SRS（**仅作词表/规范来源，不作接口来源**）
`/Users/smigoo/Downloads/隧道全息监测系统-软件需求规格说明书-V0.0.1.md`（1404 行）

- 这是**同一项目下的兄弟子系统**（全息监控 + 运营管理），其 §6.2.2 明确声明「**不扩展设备、环境或结构监测能力**」——即**不含**本轮 4.2.x 的运行监测大屏能力。**不得**从它推导运行监测的业务接口。
- 可复用的三样东西：
  1. **组件编码规则** §6.2.1：`c-{项目简称}-{模块简称}-{组件简称}`（本项目 `sdqx`，模块 `qxjk`/`yygl`）。
  2. **统一事件信封** §6.2.6.1：`{ eventId, eventType, sourceComponent, occurredAt, traceId, payload, resultCode, resultMessage }`——⚠️ 这是**组件间事件**信封，与本轮 HTTP 的 `{code,message,data}` 是**两回事**，不要混用。
  3. **领域词表** §3.4（`MonitoringEvent`/`PassageRecord`/`VerificationResult`〔确认/误报/已消失〕/`PushStatus`/`VideoStatus` 等）。
- SRS 另有「保存回溯片段/删除片段」等能力，属兄弟子系统，**本轮不实现**。

### Figma（token 已验证可用，实测 HTTP 200）
| 文件 | fileKey | 用到的 node | 说明 |
|---|---|---|---|
| 主设计 | `1t7Dmmpsl5i0PC8BJt2QLf` | `2-3432`（= `运行监测2026.04.14`） | 大屏骨架：头部 / 左侧(`cp-流量监测`、`cp-重点车辆监测`) / 中部 / 右侧(`cp-环境监测`、`cp-设备监测`) |
| 弹窗 | `Phqur1Lou2tSgwxYqIbM8U` | `5-7`、`5-1083` | 同页 17 个顶层画板，含全部下钻与弹窗 |

⚠️ 两个文件**同名都叫「运行监测」但 fileKey 不同**。引用一律用 `fileKey + nodeId` 双键，禁止按文件名匹配。

Figma REST：`GET https://api.figma.com/v1/files/{fileKey}?depth=N`，请求头 `X-Figma-Token: figd_jGyqehPFzSwRwhW7q_hZ2RdfD-YUqTZIpuFEVNii`
取单节点：`GET /v1/files/{fileKey}/nodes?ids={nodeId}&depth=N`

### Apifox
**本轮不提供**。契约来源改为：从文档 `4.x.x.5 接口设计` 段抽取 → 落成**本地 OpenAPI 3.0**。
后期对接 Apifox 的接缝 = 用 Apifox 导出的 OAS 替换 `spec/openapi.local.yaml` 并做 diff。**因此本地 OAS 必须是严格合法的 OpenAPI 3.0**，不得用自定义 JSON，否则接缝不成立。

---

## 1. 统一响应包装（用户已拍板：统一 `code:200`）

所有 HTTP 响应，成功与失败同形：

```json
{ "code": 200, "message": "ok", "data": { } }
```

- `code === 200` 为成功；非 200 为业务错误，`data` 为 `null`，`message` 给出中文原因。
- ⚠️ **本决策改变了原始口径**，属**有意为之的归一化**，必须在 `spec/conflicts.md` 中登记为「已拍板变更项」。
  - 复核实测（`grep -oE '"code" *: *[0-9]+'` 逐篇扫描）：**D1/D2/D3/D5 原文 = `200`；D6/D7/D8/D9/D10 原文 = `0`**。
  - ⚠️ 本节初版曾误写为「D5~D9 是 0」，已更正（D5 实为 200，且漏计 D10）。

## 2. 统一分页口径（用户已拍板：统一加标准分页）

所有**列表型**接口：

- 请求：`pageNum`（默认 `1`）、`pageSize`（默认 `20`）
- 响应 `data`：

```json
{
  "list": [],
  "page": {
    "totalNum": 0, "currentPage": 1, "pageSize": 20, "totalPages": 0,
    "firstPage": 1, "lastPage": 0, "startRow": 0, "endRow": 0
  }
}
```

模板取自 D6（4.2.3.2）的分页对象。
⚠️ D7（运单列表）与 D8（事件列表）原文**无分页**，属**新增**，同样登记到 `spec/conflicts.md`。

## 3. 前端模块注册契约（所有前端模块文件必须遵守）

```js
window.YXJC.register({
  id: 'flow-today',        // 全局唯一，kebab-case
  name: '当日总流量',       // 展示名
  region: 'left',          // head | left | center | right
  order: 10,               // 同 region 内排序，小在前
  modal: false,            // true ⇒ 注册为弹窗模块，不占 region，只能被 openModal 打开
  params: { /* 初始化参数，对应文档「初始化参数」表 */ },
  mount(root, ctx) {
    // root: 该模块的容器 HTMLElement（已插入 DOM）
    // 内部自行取数、渲染、绑定事件
    return function dispose() { /* 清理定时器/WebSocket/事件 */ }
  }
})
```

`ctx` 由外壳提供，接口固定：

```js
{
  api: {
    get(path, params),        // → Promise<data>，已解包（返回 envelope.data）
    post(path, body),         // → Promise<data>
    ws(path, onMessage)       // → { close() }
  },
  openModal(id, params),      // 打开某 modal 模块，params 会作为第二参传给其 mount
  closeModal(),
  toast(msg)                  // 轻提示
}
```

- `api.get` 内部负责：拼 mock 基址、判断 `code !== 200` 则 throw Error(message)、返回 `data`。
- 模块**不得**直接 `fetch`，必须走 `ctx.api`（否则 mock 切换失效）。

### 3.1 外壳 DOM 契约（`web/index.html` 固定提供，模块只认这些 id）

```html
<div id="yxjc-root">
  <header id="yxjc-head"></header>
  <main id="yxjc-main">
    <aside id="yxjc-left"></aside>
    <section id="yxjc-center"></section>
    <aside id="yxjc-right"></aside>
  </main>
</div>
<div id="yxjc-modal-layer"></div>
```

- `region: 'head' | 'left' | 'center' | 'right'` → 模块根插入对应容器，容器内按 `order` 升序排列。
- `modal: true` 的模块**不进任何 region**，其内容在 `openModal(id, params)` 时渲染进 `#yxjc-modal-layer`。
- 布局：`#yxjc-root` 固定 `1920×1080`，`transform-origin: top left`，整体 scale 到窗口；`#yxjc-head` 高 `72px`；`#yxjc-main` 为三列 grid，左右各 `440px`，中间 `1fr`，列内纵向滚动。
- 模块 `mount(root, ctx)` 拿到的 `root` 已是该模块自己的盒子（外壳负责包一层 `.yxjc-card` + 标题条）。**模块不要自己再画卡片外框**，只填内容。

### 3.2 共享图表工具契约（`web/core/charts.js` 提供，节点头部 `window.YXJC.charts`）

图表**一律内联 SVG 手绘**，禁止任何外部 CDN / 图表库。三个前端工作流都必须走这套 API：

```js
// 全部返回 render 函数（可重复调用于 resize）
YXJC.charts.line(el, { series: [{ name, color, data: [{x,y}], dashed?, area? }], yMin?, yMax?, xLabels?, thresholds?: [{value,color,label}] })
YXJC.charts.bar(el,  { items: [{ label, value, color }], max?, horizontal? })
YXJC.charts.pie(el,  { items: [{ label, value, color }], donut?: true })
YXJC.charts.gauge(el,{ value, max, color, label, unit })
```

- `el` 可以是 `HTMLElement` 或选择器字符串；函数内部 `innerHTML = <svg …>`。
- 尺寸自适应：从 `el.clientWidth/clientHeight` 取，宽度为 0 时回退 `640×220`。
- 配色一律**写死十六进制**（见 §6），**不得**用 CSS 变量。
- 悬停：`line` 必须支持点悬停 tooltip（用定位的 div，不放 SVG 内）。

### 3.3 共享格式化工具（`web/core/util.js`，节点头部 `window.YXJC.util`）

```js
YXJC.util.fmtNum(n, digits = 0)      // 千分位
YXJC.util.fmtPct(n, digits = 1)      // 百分比
YXJC.util.shiftDays(date, n)         // Date 偏移，返回 'YYYY-MM-DD'
YXJC.util.rangeDates(start, end)     // ['YYYY-MM-DD', …]
YXJC.util.el(tag, attrs, children)   // 极简 DOM 构造
YXJC.util.on(root, type, sel, fn)    // 事件委托
YXJC.util.poll(fn, ms)               // 返回 stop()
```

## 4. 接口清单（本轮 mock 必须全部覆盖）

前缀统一 `/operation`。所有 GET 的入参用 query，POST 用 JSON body。

### 4.1 有文档依据的 17 个端点

| # | 方法 | 路径 | 来源 | 主要入参 | 返回 data 要点 |
|---|---|---|---|---|---|
| 1 | GET | `/operation/flow/todayFlow` | D1 | `sectionNum[]`、`type`(1=24h,2=就近1h) | `flowThreshold`、`flowSuggestion`、`items[]`（sectionNum/sectionName/dailyTotalFlow/upFlow/downFlow/yoyChange/trendList[{time,upFlow,downFlow}]） |
| 2 | GET | `/operation/flow/todayVehicleTypeStatic` | D2 | `sectionNum[]` | 各车型占比（**原文缺 sectionNum 归属，本轮补 `items[].sectionNum`**） |
| 3 | GET | `/operation/flow/todayVehicleTypeTrend` | D2 | `sectionNum[]`、`type` | 车型趋势序列 |
| 4 | GET | `/operation/forecast/realtime` | D3 | `sectionNum` | `prevHour2/prevHour1/current/nextHour1/nextHour2`，各含 `time/actualFlow/predictFlow/accuracy`（next 仅 predictFlow） |
| 5 | GET | `/operation/forecast/staticsByHour` | D3 | `sectionNum`、`startTime`、`endTime` | `currentHour`、`items[]`(time/actualFlow/predictFlow/lastYearFlow/historyMaxFlow) |
| 6 | GET | `/operation/forecast/staticsByDay` | D3 | `sectionNum`、`startDate`、`endDate` | `items[]`(date/actualFlow/predictFlow/lastYearFlow/historyMaxFlow)。**原文称还返回 `dateList` 但表与示例都没有 → 本轮按「不返回」处理并登记冲突** |
| 7 | GET | `/operation/forecast/holiday` | D3 | 无 | `items[]`(holidayName/startDate/endDate) |
| 8 | GET | `/operation/point/pointTypeStatics` | D5 | `sectionNum` | `hazardousCount`、`truckCount` |
| 9 | GET | `/operation/point/pointCarDetail` | D6 | `sectionNum`、`carType`(1=重型货车,2=超高车辆)、`direction`、`licensePlate`、`pageNum`、`pageSize` | 分页对象 + `list[]`(id/plateNo/entryTime/exitTime/avgSpeed/driverName/driverPhone/driveStatus)。⚠️`exitTime`/`avgSpeed` 未驶离时为字符串 `"-"` |
| 10 | GET | `/operation/point/hazardousTypeDistribution` | D6 | `sectionNum`、`direction` | `data[]`(typeName/count)（原文层级不一致，本轮统一为 `{data:[...]}` 包在 envelope.data 内） |
| 11 | GET | `/operation/point/wayBillRecord` | D7 | `licensePlate`、`pageNum`、`pageSize` | 分页对象 + `list[]`(id/wayBillNo/dangerousGoodsName/dangerousGoodsType/origin/destination/departureTime/arrivalTime/estimatedTravelTime/fullLoad/transportStatus/driverName/driverPhone/transportMileage/totalWeight) |
| 12 | GET | `/operation/detection/eventList` | D8 | `sectionNum`、`eventType`、`pageNum`、`pageSize` | 分页对象 + `list[]`(id/eventNo/eventType/eventTypeName/alertTime/sectionName/direction/pileNumber/alertContent/eventLevel/status) |
| 13 | WS | `/ws/detection/event` | D8 | — | 推送同 12 的字段集（`eventLevel` 枚举**统一为 `HIGH/MEDIUM/LOW`**，原文示例的 `CRITICAL` 视为笔误并登记） |
| 14 | GET | `/operation/detection/alertDetail` | D9 | `eventId` | `alertInfo`(id/eventNo/eventType/eventTypeName/alertTime/sectionName/direction/pileNumber/alertContent/eventLevel/status/alertThreshold/realtimeValue/abnormalReason/monitorPoint/alertType/processingResult)、`cameras[]`(deviceId/deviceName/mediaType/mediaUrl)、`disposalTimeline[]`(time/action/operator) |
| 15 | POST | `/operation/detection/alertDisposal` | D9 | `eventId`、`handleTime`、`handleContent` | `{}`（成功即 code:200）。原文错误码 5011/5012/5013 保留语义 |
| 16 | POST | `/operation/detection/eventComplete` | D9 | `eventId` | `{}`。原文错误码 5021/5022/5023 |
| 17 | GET | `/operation/device/monitor` | **D10** | `sectionNum`、`productCode`、`monitorType` | `deviceList[]`(deviceId/deviceName/pileNumber/pileNumberStr/direction/directionName/unit/maxThreshold/minThreshold/currentValue/historyData[{time,value}])。⚠️`maxThreshold`/`minThreshold` 可为 `null`（不画预警线）。原文 `code:0` 已归一化为 `code:200` |

### 4.2 文档缺失、由 Figma 反推补充的端点（用户已授权「随意发挥，主要看功能闭环」）

命名可自行调整，但**必须落到 `/operation` 前缀下**，并在 `spec/openapi.local.yaml` 中与 Figma 画板一一注明来源。

| # | 建议方法+路径 | 对应 Figma 画板 | 用途 |
|---|---|---|---|
| 18 | GET `/operation/device/list` | `设备监测下钻` → 设备列表 | 设备分页列表（设备名/编号/位置/状态/最后心跳） |
| 19 | GET `/operation/device/detail` | `设备监测下钻` → 设备详情 | 单设备详情 + 实时指标序列 |
| 20 | POST `/operation/device/repair` | `设备监测下钻` → 保修 | 提交报修 |
| 21 | GET `/operation/detection/weatherAlarmList` | `运行监测-异常天气2026.04.21` | 天气预警列表 |
| 22 | GET `/operation/detection/reportList` | `运行监测-异常上报2026.04.21` | 异常上报列表 |
| 23 | GET `/operation/detection/envAlarmList` | `运行监测-环境异常2026.04.21` | 环境异常列表（补充 `device/monitor` 之外的告警视图） |
| 24 | GET `/operation/monitor/route` | `隧道路线` | 隧道路段/门架拓扑点位 |
| 25 | POST `/operation/detection/eventHandle` | `交通态势核实&协同上报` | 协同上报处置（**D9 正文引用了 `eventHandle` 却未给路径，本轮补全**） |

**合计 24 个 HTTP 端点 + 1 个 WS = 25 个端点**（§4.1 共 17 条 = 16 HTTP + 1 WS；§4.2 共 8 条 HTTP），`spec/openapi.local.yaml` 与 `mock/` 都必须全覆盖。

## 5. Frontend 模块 → region / 画板 映射（外壳按此排布）

| 模块 id | 名称 | region | 对应 Figma 画板 | 来源文档 |
|---|---|---|---|---|
| `shell` | 大屏外壳（头部/隧道路线/三栏） | — | `运行监测2026.04.14` | — |
| `flow-today` | 当日总流量 | left | `cp-流量监测` | D1 |
| `flow-vehicle-type` | 车型分布 | left → modal `modal-vehicle-type` | `车型分布下钻` | D2 |
| `flow-forecast-realtime` | 实时流量预测 | left | `cp-流量监测` | D3 组件一 |
| `flow-forecast-holiday` | 节假日流量预测 | left → modal `modal-forecast-holiday` | `节假日预测下钻` | D3 组件二 |
| `point-today` | 今日累计 | left | `cp-重点车辆监测` | D5 |
| `point-car-detail` | 车辆明细 | modal | `重型货车明细`、`超高车辆明细` | D6 |
| `point-waybill` | 危化品车运单列表 | modal | `重点车辆监测下钻-危化品明细` | D7 |
| `detection-event-list` | 智能侦测事件列表 | right / center | `运行监测-异常事件下钻` | D8 |
| `detection-alert-disposal` | 告警处置 | modal | `交通态势核实&协同上报` | D9 |
| `env-monitor` | 环境监测 | right | `cp-环境监测`、`运行监测-环境异常2026.04.21` | **D10** + `device/monitor`（有据）；异常列表靠 23 补 |
| `device-monitor` | 设备监测 | right | `cp-设备监测`、`设备监测下钻` | 缺失，自由发挥 |
| `weather-alarm` | 异常天气 | modal | `运行监测-异常天气2026.04.21` | 缺失，自由发挥 |
| `report-list` | 异常上报 | modal | `运行监测-异常上报2026.04.21` | 缺失，自由发挥 |

## 6. 视觉风格

按 Figma `运行监测-全息深色版本`：**深色底 + 青蓝高亮 + 细边框 + 半透明面板**。
- 底 `#050b14`，面板 `rgba(12,26,44,.82)`，主色 `#22d3ee`，副色 `#3b82f6`，警示 `#f59e0b`，危险 `#ef4444`
- 每张卡片：标题条 + 内容区 + 右上角刷新/时间戳
- 图表：允许内联 SVG 手绘（折线/柱/饼/环），**不引外部 CDN**（离线可开）
- 字体：`-apple-system, "PingFang SC", sans-serif`；数字用 tabular-nums
- 大屏基准 `1920×1080`，用 `transform: scale()` 自适应窗口

## 7. 硬约束（务必遵守）

- 🔴 **不得部署、不得重启 :13030 / :2610、不得同步生产、不得 git push、不得 git commit。**
- 本目录 `outputs/yxjc-monitor/` 是**原型草稿区**，只写这里，**不得**改动 `frontend/src`、`backend-node/src`、`docs/` 下任何文件。
- mock 服务端口固定 **`8791`**，只在验证时短暂启动；不得占用 13030 / 2610 / 8080。
- 所有产物**零外部依赖**：不 npm install、不引 CDN，双击 `index.html` 或由 mock server 静态托管都能跑。
