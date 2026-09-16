# 914 管线治理文档：设备监测头部视觉错误根因与统一收口方案

> 日期：2026-09-14
>
> **本次不修生成产物。** `c-device-monitor-6c12baba` 只作为回放证据和回归基准。所有修复必须回到 Figma 事实解析、headerSlots 契约、资源 DOM mapping、确定性模板装配和统一门禁；禁止在 `frontend/workspace/custom-components/` 内对单个产物加 CSS 补丁。
>
> 本文优先级高于同主题旧文档中互相冲突的执行顺序。旧治理中已经正确的事实源和测试保留，但重复的推断、兜底挂载、关键词猜测和「单测绿即完成」标准必须合并或废弃。

---

## 0. 结论先行

本次头部的五类错误不是五个互不相关的 CSS 问题，而是同一条生成链没有收口造成的五种投影：

```text
Figma 节点事实没有形成不可变语义记录
        ↓
header / headerSlots / section 被多处重复推断
        ↓
LLM 自由生成头部 DOM，prompt 又允许泛化控件
        ↓
资源挂载器只确认「有资源」，没有确认「应挂到哪个 DOM」
        ↓
样式与颜色没有按 Figma nodeId 绑定，后处理只补能编译的 CSS
        ↓
现有代码门禁只验证语法、引用、文件和部分结构
        ↓
生成结果可通过门禁，但出现换行、圆点、臆造刷新按钮、跨区背景图
```

统一原则：

1. **Figma bbox、节点类型、visible fills/strokes、imageRef 和父子路径是视觉事实源。**
2. **一个 Figma nodeId 只能有一个语义落点。** 同一节点不得同时进入 header、body、子组件或兜底插槽。
3. **headerSlots 只能由一个确定性入口构建。** 没有 nodeId、bbox 和父级 header 证据，不得生成 slot。
4. **资源挂载必须是目标约束问题，不是资源消费问题。** 资源只能挂到 mapping 指定的 owner block / target DOM；找不到目标就不挂载并记录诊断。
5. **布局、插槽、资源、组件数量和 Figma 样式事实由确定性装配完成。** LLM 只负责受限的业务文案、数据表达和组件内部交互逻辑。
6. **「可编译」不等于「视觉正确」。** 完成标准必须包含真实样本重生成、DOM/CSS 计算结果和设计稿对照。

---

## 1. 914 样本事实基线

### 1.1 Figma 头部事实

样本：`c-device-monitor-6c12baba`，来源：

- `frontend/workspace/custom-components/c-device-monitor-6c12baba/.checkpoint/figma.json`
- 根节点 bbox：`420 × 425`
- header 节点：`2:8419`，bbox `388 × 30.09`
- 标题：`2:8426`，文本「设备监测」，bbox `64 × 19`
- 三个统计组：`2:8428`、`2:8431`、`2:8434`
- 三组文本分别为：
  - 「设备类型」+「28」
  - 「设备总数」+「68562」
  - 「完好率」+「98%」
- 三个统计组均为 `HORIZONTAL`、`layoutWrap=NO_WRAP`，高度 `23px`
- header 内另有 `2:8856`，bbox `16 × 16`，子节点 `2:8857` 为蓝色 VECTOR；这是一个真实图形节点，不能因为名称不明确就臆造成刷新按钮，也不能无资源证据时用圆点代替。

### 1.2 数字颜色事实

Figma 数字节点 `2:8430`、`2:8433`、`2:8436` 均有 visible `GRADIENT_LINEAR`，核心 stops 为：

- 起点约 `#E1EFFF`
- 终点约 `#00CCFF`
- `98%` 节点还带 visible solid 色，约 `#08A3A5`
- 字体：Roboto、20px、700、行高约 `23.44px`

生成产物当前写的是通用硬编码：

```less
background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;
```

这说明产物虽然出现了 gradient 字符串，但没有证据表明该 CSS 是由对应 Figma nodeId 的 fills 生成；它是模型/样式生成器的通用近似值。视觉验收仍可能失败，且当前没有计算样式/像素级门禁证明 gradient 真正落在数字文字上。

### 1.3 资源 mapping 事实

`resource-dom-mapping.json` 明确记录：

| 资源 | Figma path | 目标 | 结论 |
|---|---|---|---|
| `bg-8788.png` | `slot-con/switch/active/bg` | `active区域` | 只能挂 active switch |
| `icon-8798.png` | `slot-con/switch/active/icon` | `active区域` | 只能挂 active icon DOM |
| `bg-8807.png` | `slot-con/switch/default/bg` | `default区域` | 只能挂 default switch |
| `icon-8817.png` | `slot-con/switch/default/icon` | `default区域` | 只能挂 default icon DOM |
| `bg-8439.png` | `slot-con/@antd/tab/cons/.../bg` | `cons区域` | **不能挂 header/stat-group** |
| 根 `2:8418` | `cp-设备监测/bg` | `cp-设备监测区域` | `skipMount=true`，没有下载资源就不应人工补挂 |

当前最终产物却把 `bg-8439.png` 通过 `bg6`、`bg9`、`bg12` 等别名连续写入 `HeaderSection.vue` 的 `stat-group`，这是确定性的跨区域挂载错误。

---

## 2. 五类错误总表

| 编号 | 用户看到的表象 | 原始 chunk | 最终产物 | 直接原因 | 管线根因 | 统一修复入口 |
|---|---|---|---|---|---|---|
| H-01 | 「设备类型」等文字折成两行，没有保持一行 | label/value 被拆成两个 span；没有稳定的 no-wrap 组布局 | `.stat-group` 使用 `flex:1` 等竞争式布局，label/value 未按 Figma frame 组装 | 统计组没有按 Figma 的 `HORIZONTAL + NO_WRAP + bbox` 写出 | header 结构交给 LLM 自由拼装，没有消费叶子节点结构事实 | `header-block` 确定性模板 + `inline-row` contract |
| H-02 | 数字看起来不是设计稿的渐变色 | LLM 写了 generic gradient，但没有 node fills 来源 | hardcoded `#e1f0ff → #00ccff`，与 Figma fills 未绑定；`98%` 的 visible solid 语义也未建模 | 颜色只是「像一个渐变」，不是 Figma style fact 的落盘结果；运行时覆盖尚未被门禁检查 | Figma fills 没进入统一 style fact；没有 computed-style/截图门禁 | `text-style-facts` + Figma fills 编译 + visual gate |
| H-03 | Figma icon 被生成成空 div + CSS 圆点 | 原始 chunk 已生成 `header-deco` 空 div | `.header-deco { border-radius:50%; background:linear-gradient(...) }` | icon 的资源/图形语义被替换为装饰圆点 | 「装饰」与「无资源」混为一谈；节点类型、image/vector mapping 和 prompt 没有统一契约 | `node-kind` / `resource-kind` 事实源 + `<img>`/vector contract |
| H-04 | 生成了不存在的刷新按钮和 `c-device-monitor-refresh-icon` | 原始 chunk 已有 `<a-button>` 和 `⟳` | 产物保留 Ant Design button 及 `.refresh-icon` | LLM 把泛化的「header-right 常放刷新」当成当前设计证据 | prompt 允许臆造控件；headerSlots 没有变成「允许生成的节点白名单」 | `headerSlots` allow-list + 无证据 fail-closed |
| H-05 | `stat-group` 出现不属于头部的背景图 | 原始 chunk **没有**背景图和资源 import | `bg-8439.png` 被批量 spread 到 `stat-group` | 资源后处理按「剩余资源/可消费变量」补挂，没有校验目标 DOM | resource import、resource reference、resource mount 三件事没有同一 owner/mount 契约；CODE-022 压力诱发错误挂载 | `resource-mount-contract` + target mismatch fail-closed |

---

## 3. 五类错误的逐项根因分析

### H-01：文字未保持一行

#### 证据

Figma 的 `2:8428`、`2:8431`、`2:8434` 本身就是水平 frame，明确给出：

- `layoutMode=HORIZONTAL`
- `counterAxisAlignItems=CENTER`
- `layoutWrap=NO_WRAP`
- 每组固定高度 `23px`
- label 与 value 是同一组的直接子节点

原始 `HeaderSection.vue` chunk 却把结构交给模型直接写成：

```vue
<div class="...stat-item">
  <span class="...stat-label">设备类型</span>
  <span class="...stat-value">28</span>
</div>
```

并没有把 Figma 的 frame 级事实传递为「一组、水平、不换行、label 与 value 紧邻」的不可变 contract。最终 `stat-group` 还通过 `flex:1` 参与宽度竞争，多个统计组在窄画布中相互挤压。

#### 根因判定

这不是简单缺少一条 `white-space: nowrap`。单独补这一条仍可能导致溢出、压缩或组间比例错误。

真正根因是：

1. Figma frame 级 inline row 没有进入结构表的 leaf block；
2. header 统计组没有由确定性模板生成；
3. LLM 只看到「统计数据」语义，没有看到稳定的宽度/间距/不换行 contract；
4. 样式门禁没有以 Figma bbox 验证每组宽度、高度和 `clientWidth/clientHeight`。

#### 统一修复

将每个统计组写入 `blocks[]`：

```json
{
  "figmaNodeId": "2:8428",
  "role": "header-stat",
  "layoutMode": "horizontal",
  "layoutWrap": "no-wrap",
  "bbox": { "width": 80, "height": 23 },
  "children": ["2:8429", "2:8430"]
}
```

确定性模板负责：

- 生成一个统计组 DOM，不允许 label/value 被拆到两个无关布局上下文；
- `display:inline-flex; flex-wrap:nowrap; align-items:center`；
- label/value `white-space:nowrap`；
- 根据 Figma bbox 写出最小必要宽度和间距；
- 只有 Figma 明确允许收缩时才设置 `flex-shrink`；
- 不靠后处理给所有 span 粗暴补 nowrap。

回归必须验证：三组均为单行，组高度接近 `23px`，组间 x 顺序和设计稿一致，窄画布下不发生隐式换行。

---

### H-02：数字颜色不是设计稿渐变

#### 证据

Figma 的三个数字节点都有 visible gradient。生成产物的 CSS 也有 gradient，但二者不是同一个事实链：

- Figma：每个数字节点有具体 fills、stops、方向和透明度；
- 产物：`.stat-value` 统一写死 `#e1f0ff → #00ccff`；
- 产物没有记录 `2:8430`、`2:8433`、`2:8436` 对应的 `styleFact`；
- `.stat-value-success` 同时写了 gradient、透明文字和 `color: #08a3a5`，但没有明确「solid 是 fallback 还是可见填充」的优先级；
- 当前门禁没有检查浏览器计算样式，也没有检查截图中数字区域是否实际呈现渐变。

#### 根因判定

已经可以确定的管线根因是：**颜色没有从 Figma node fills 进入统一的文本样式事实源，模型只生成了近似 CSS。**

「产物源码中存在 `linear-gradient`」不能证明视觉正确。运行时是否被 scoped/import 顺序、`color`、`-webkit-text-fill-color` 或宿主样式覆盖，需要在修复后的真实回放中读取 computed style 和截图确认；这一步不能用猜测代替。

因此本项分为两个必须合并的治理点：

1. **事实链治理**：Figma `fills.visible=true` → `textStyleFacts[nodeId]` → 确定性 CSS；禁止 generic gradient 代替有事实的颜色。
2. **结果治理**：视觉门禁检查目标文字节点的 computed `background-image`、`background-clip`、`-webkit-text-fill-color`，并对截图文字区域做颜色覆盖/渐变存在性检查。

#### 统一修复

- 颜色按 nodeId 提取，不按「数字」「成功率」等名称猜测；
- gradient 的 stops、方向、透明度进入可序列化 style facts；
- visible solid 与 gradient 同时存在时建立明确规则：优先使用设计稿实际可见填充，另存 fallback，不允许模型自行选；
- 生成数字时保留与 Figma 节点的 provenance；
- 对没有 fills 事实的文本，禁止强行套业务主题 gradient；
- visual gate 必须区分「源码有 gradient」和「目标像素实际有渐变」。

本项不能通过只改 `HeaderSection.vue` 的颜色值完成，因为那只能修当前样本，不能防止下一次生成再次使用 generic gradient。

---

### H-03：icon 被替换成 CSS 圆点

#### 证据

当前产物为：

```vue
<div class="c-device-monitor-header-deco"></div>
```

对应样式为：

```less
.c-device-monitor-header-deco {
  border-radius: 50%;
  background: linear-gradient(...);
}
```

原始 chunk 已经有该空 div，说明「圆点」不是资源挂载器后来添加的，而是生成阶段已经将目标节点抽象错。

同时，`figma-connector.js#_identifyNodeType` 当前先执行 `header-deco` / `deco-header` 的 chrome 名称判断，再执行节点视觉属性判断。该顺序存在结构性风险：节点名含 `deco` 时可能先被归为 chrome，即使它实际有 image fill、vector 资源或明确的资源 mapping。现有代码虽有「IMAGE fill 优先」注释，但它位于名称判断之后，不能覆盖名称早退。

本样本 checkpoint 还显示 header 内有真实 vector 节点 `2:8856/2:8857`。无论该图形最终由导出的静态资源还是受控 vector 表达承载，都不能将「装饰」解释成「无资源」。

#### 根因判定

根因有两层：

1. **语义层**：`decorative` 是布局/业务语义，不代表节点没有视觉资源；icon/image/vector 与 CSS decoration 没有正交建模。
2. **生成层**：prompt/LLM 没有收到「如果 mapping 有 resourceFile 或 node 有 IMAGE/vector 证据，必须真实渲染」的强制约束，因而自由选择空 div + 圆形渐变。

#### 统一修复

建立不可变的 `nodeKind`：

```text
resourceKind = image | vector | none
semanticRole = title-icon | header-decoration | card-bg | ...
```

判定优先级固定为：

1. mapping 中有对应 resourceFile / imageRef；
2. Figma 节点有 visible IMAGE fill；
3. Figma 节点为有视觉 fills/strokes 的 vector/group；
4. 只有前三项都不存在时，才允许 CSS-only decoration；
5. 仅凭名称 `deco`、`dot`、`装饰` 不得把资源降级为 CSS 圆点。

`_identifyNodeType`、visual parser、prompt builder、resource mounter 必须消费同一个 `nodeKind` 结果，不得各自重判。

回归要求：有 icon 事实时必须出现 `<img>` 或确定性 vector DOM；不存在资源且 Figma 明确是纯几何时才允许 CSS 形状；两者都不能满足时应报告 missing mapping，而不是造圆点。

---

### H-04：臆造刷新按钮

#### 证据

当前生成产物和原始 chunk 都存在：

```vue
<a-button class="c-device-monitor-refresh-btn" type="text" size="small">
  <template #icon>
    <span class="c-device-monitor-refresh-icon">⟳</span>
  </template>
</a-button>
```

而样本 header 的实际 Figma 节点证据是标题、三组统计数据和 `2:8856` 的真实图形节点；没有证据表明存在名为 refresh 的按钮节点。`2:8856` 的 bbox 为 `16 × 16`，其子节点是蓝色 VECTOR，应按真实节点事实处理，不能把它语义化为「刷新」并用 Ant Design button 包装。

当前 prompt 存在直接诱因：

- `header-right-slot-detection.md` 写明 header-right「通常用于刷新、设置、导出」；
- 示例直接使用 `refresh-button`；
- `visual-parser.js` 的 header-right 文案也把「图标操作按钮」「刷新按钮」作为常见内容；
- `vue3-prompt.js` 要求 header 控件真实渲染，但没有同时规定「只能渲染 headerSlots allow-list 中的 nodeId」。

#### 根因判定

这是**生成协议过宽**导致的结构臆造，不是 Ant Design 组件自身的问题，也不是应在产物中删除一段按钮的后处理问题。

`header-right` 目前承担了两种相反语义：

- 「Figma 明确存在、允许落地的节点」；
- 「模型认为标题右侧通常可能有的控件」。

只要二者混用，模型就会用常识补齐刷新按钮。

#### 统一修复

- `headerSlots` 改成生成 allow-list，而不是描述性建议；每一项必须有 `figmaNodeId`、`slotType`、`elementType`、bbox 和 provenance；
- 没有 `figmaNodeId` 的 slot 不得进入生成 prompt 的可渲染列表；
- `elementType=icon` 只能生成真实 icon DOM，不能升级成 button；
- 只有 Figma 明确是 button/action 且存在对应节点时，才允许生成 `<button>` 或 UI 库按钮；
- 刷新、设置、导出等词只作为内容标注，不得作为结构生成依据；
- 删除 prompt 中「通常放刷新」的示例，改成反例和 fail-closed 规则；
- 生成后做 nodeId allow-list 检查：任意 button/refresh/setting 等结构没有对应 Figma nodeId 就 BLOCK。

`ensureHeaderSlots` 的职责也必须收窄：只能补齐已有契约中明确存在但 LLM 漏写的节点，不能依据 `content` 文本自动造 DOM，更不能在找不到节点时保守放行。

---

### H-05：stat-group 错挂 `bg-8439.png`

#### 证据链

这是五类问题中证据最完整的一项：

1. 原始 chunk 中 `stat-group` 没有 `:style` 背景图，也没有 `bg6` import。
2. 最终 `HeaderSection.vue` 中出现 `bg6` 到 `bg14` 的连续嵌套 spread。
3. 所有 alias 实际都指向同一张 `bg-8439.png`。
4. `resource-dom-mapping.json` 指明 `bg-8439.png` 的 Figma path 是：
   `cp-设备监测/slot-con/@antd/tab/cons/Group 2136637321/bg`
5. 同一条 mapping 的目标是 `cons区域`，`recommendedUsage=backgroundBlock`，不是 header、stat-group 或 title。
6. 该资源的 bbox 位于 `y≈550`，header 位于 `y≈441`，空间上也不属于 header。

#### 根因判定

背景图错误发生在后处理资源挂载链，不是原始 LLM chunk 单独造成的。

当前资源链把三个事实混在了一起：

```text
资源被下载/import 了       ≠       资源应该被当前文件消费
当前文件有可扫描的变量名   ≠       变量应该挂到当前 DOM
CODE-022 要求真实使用      ≠       可以把资源挂到任意容器
```

可能的具体错误路径是：

- mapping 记录了多个同图资源和 alias；
- resource-mounter 找不到严格匹配的 `targetDomSelector` / `mountTarget`；
- 为避免「只 import 不使用」或满足 CODE-022，进入了剩余资源/可用容器兜底；
- 同一 `backgroundImage` 被重复 spread，后写值覆盖前写值，但没有在写盘前校验 owner block；
- 结果是属于 `cons区域` 的背景被写到 `HeaderSection.stat-group`。

#### 统一修复

资源 manifest 必须在写盘前补齐并冻结：

```json
{
  "figmaNodeId": "2:8439",
  "ownerBlockId": "<cons block>",
  "mountTarget": "cons区域",
  "targetDomSelector": ".cons-region",
  "allowedConsumers": ["package/components/TabsSection.vue"],
  "recommendedUsage": "backgroundBlock",
  "skipMount": false,
  "provenance": "figma-tree"
}
```

挂载前必须同时满足：

- 当前文件在 `allowedConsumers` 中；
- 当前 DOM 能定位到目标 block；
- DOM 的 block/node provenance 与 `figmaNodeId` 对应；
- usage 与挂载形态一致（background 不能变成 img，icon 不能变成父容器背景）；
- `skipMount=true` 时永不挂载。

任一条件不满足：

- 不写 import；或移除未消费的 import；
- 不生成 fallback 背景；
- 写入 `unmountedResources` 诊断；
- 任务保持未完成，或进入明确的 retry，而不是 `success`。

CODE-022 必须改成「正确挂载或诚实报告」，不能继续作为错误挂载的驱动力。

---

## 4. 前期治理评审：保留、修改、合并、废弃

### 4.1 总体评审表

| 前期治理 | 结论 | 评审意见 | 914 合并落点 |
|---|---|---|---|
| P0-1 根 class 误判、装饰节点 `width:100%` | 保留并扩展 | 根类提取和像素保护方向正确，但只能解决尺寸覆盖，不能解决装饰语义误判 | 并入 `rootLayoutFacts + nodeKind + dimension ownership`，统一所有 width/height 写入者 |
| P0-2 Figma 比例锁定 | 保留 | 预览不能用窗口宽度替代 Figma bbox | 与 P1-1 合并成 `previewDescriptorResolver`，统一 snapshot/workspace/size/declare 来源 |
| P1-1 sessionId → componentId | 保留并合并 | 之前多个调用点各自 resolver，容易再次漏接 | 一个 resolver 输出 `componentId + sourceKind + aspectRatio + declarePath`，所有预览入口只消费 descriptor |
| P1-2 componentName/aspectRatio 事实源 | 保留并扩展 | 名称保护已解决 Tab 文案污染；bbox 保护已解决默认 16:9，但只覆盖 declare 字段 | 扩成 identity/style facts，禁止 header 文本覆盖 componentName，禁止 generic style 覆盖节点事实 |
| assignedVarName 按视觉顺序 | 保留 | 资源编号稳定性正确 | 归入 resource manifest 构建入口，不再由 mounter 再次编号 |
| resource alias / import guard | 保留但合并 | 解决 alias、注释、成员访问误报；仍只证明「引用存在」 | 与 owner/mount contract 合并，区分 `declared`、`referenced`、`mounted` 三态 |
| CODE-022 扫描子组件 | 保留但改语义 | 扫描范围正确；不能为了通过而强制错误挂载 | 变成正确目标挂载审计；错误映射应报告 missing/misbound，不得任意补 DOM |
| header 关键词收窄 | 保留但降级 | `section-type-derive` 的关键词收窄是必要防线，但不是最终归属事实 | 只做候选过滤，最终 headerSlots 由单一 Figma 几何入口决定 |
| headerSlots 多路径推断 | **必须合并** | `visual-parser`、`header-slot-validator`、inline rows、graph 和 mounter 都在推断/修补，重复解释是核心复发源 | 建立唯一 `buildHeaderSlotsContract`；其余入口只能消费，不得另建 slots |
| deterministic index template | 保留但收紧 | 确定性装配方向正确；当前仍存在无契约时回退 `type=header` 的 fail-open | header/body/slot 均必须有 nodeId contract；无证据不生成 header 控件，不用类型词兜底 |
| `ensureHeaderSlots` / T09 | **修改** | 原意是补漏，但当前按 content 注入最小 DOM，可能把缺证据内容变成真实控件 | 只补已有 nodeId contract 且有目标 slot 的漏写；无证据只记诊断，不注入 |
| slot DOM 去重 / node once | 保留并前置 | 删除重叠 DOM 的方向正确 | 在 section plan 形成时就裁决，mounter 只执行已冻结结果，不再事后猜 |
| chunk 同路径后写覆盖 | 保留 | 解决同路径 SFC 拼接两份的时序问题 | 与 per-file assembly contract 合并，写盘前校验 file ownership |
| `healGridContainer` / flex 守卫 | 保留为防御层 | 对漏写 display 的真塌方有效，不能修显式错误方向或错误组件结构 | 置于装配后的安全网；不能替代 bbox 驱动的结构生成 |
| style-class-consolidator 像素保护 | 保留并限责 | 能防百分比覆盖 common.less 像素事实 | 只负责声明冲突保护；不负责决定节点语义、资源和 header 归属 |
| LESS 颜色函数治理 | 保留 | `var()` 和不可求值合成值会造成真实编译错误，事实闭环正确 | 作为编译安全层；与 H-02 的 Figma text style facts 分开，禁止用 Less 修复代替颜色事实治理 |
| Golden extractor / manifest auditor | 暂缓接入，保留工具 | 若与装配算法共享会自证；只锁 mapping 不够 | 先抽第三方 facts schema，再独立比较 blocks/slots/styles/mount；最后接 L0 |
| 仅单测/`pass=true` 验收 | **废弃** | 已多次出现门禁全绿但视觉错误 | 完成必须包含真实样本重生成、结构脚本、DOM/CSS 计算和截图对照 |

### 4.2 必须删除或禁止的旧通道

以下行为不再允许以「兼容旧产物」为理由保留：

- `allowed.size===0` 时把资源映射回退为全量成功；
- 没有 Figma nodeId 的 header slot 进入可渲染 prompt；
- `ensureHeaderSlots` 依据纯文本 content 自动生成按钮/标签；
- resource-mounter 找不到目标 DOM 时把资源挂到第一个或剩余容器；
- 为满足 CODE-022 而制造错误的背景、img 或组件引用；
- `header-deco`、`deco-header` 等名称直接覆盖 IMAGE/vector 事实；
- `type==='header'` 在没有 slots contract 时自动进入 `#header-right`；
- 仅扫描源码是否包含 gradient、import 或 class 就判定视觉事实已还原。

---

## 5. 914 统一数据契约

### 5.1 FigmaVisualFacts

所有下游只消费一份事实对象：

```json
{
  "nodeId": "2:8428",
  "parentId": "2:8419",
  "path": "cp-设备监测/header/Frame 2136638825",
  "bbox": { "x": 1595, "y": 441, "width": 80, "height": 23 },
  "nodeType": "FRAME",
  "layout": { "mode": "horizontal", "wrap": "no-wrap", "itemSpacing": 1 },
  "role": "header-stat",
  "children": ["2:8429", "2:8430"],
  "styleFacts": {},
  "resourceFacts": [],
  "provenance": "figma-tree"
}
```

### 5.2 HeaderSlotsContract

```json
{
  "headerNodeId": "2:8419",
  "slots": [
    {
      "slotType": "header-right",
      "elementType": "statistic",
      "figmaNodeId": "2:8428",
      "bbox": { "x": 1595, "y": 441, "width": 80, "height": 23 },
      "renderKind": "deterministic-header-stat",
      "provenance": "figma-tree"
    }
  ],
  "rejectedNodeIds": [],
  "allowGeneratedControls": false
}
```

没有 `figmaNodeId` 的条目不是可渲染 slot，只能作为诊断文本。

### 5.3 ResourceMountContract

资源必须同时拥有：

```text
resource facts
  ├─ resourceFile / imageRef
  ├─ figmaNodeId / figmaPath
  ├─ ownerBlockId
  ├─ semanticRole
  ├─ targetDomSelector / mountTarget
  ├─ allowedConsumers[]
  ├─ recommendedUsage
  └─ skipMount / provenance
```

下游必须明确区分：

```text
declared import → referenced in template/script → mounted at allowed target
```

三态不能互相替代。

---

## 6. 统一修复落点与执行顺序

### 914-A：先冻结事实和契约

目标：关闭所有 fail-open，不增加视觉补丁。

1. 抽出唯一 `buildFigmaVisualFacts`，输出 bbox、layout、fills、strokes、nodeKind、resource facts。
2. 抽出唯一 `buildHeaderSlotsContract`，所有旧推断入口改为消费或删除。
3. 在 LLM 生成子组件和 index template 前创建 per-file contracts。
4. 空 contract 返回诊断，不返回全量 success。
5. 形成 `nodeId → one owner block` 冲突表，冲突直接 BLOCK/retry。

### 914-B：确定性生成头部

目标：H-01、H-03、H-04 一次收口。

1. 统计组由 Figma frame 事实生成，不再由 LLM 任意拼 label/value。
2. icon/vector/image 由 `nodeKind` 选择渲染形态。
3. header 控件只允许来自 `HeaderSlotsContract`。
4. 无 refresh node 时，任何 `refresh` class、`a-button`、`button`、`⟳` 都视为未授权结构并 BLOCK。
5. `ensureHeaderSlots` 只做契约内漏写补齐，不再按文本兜底造 DOM。

### 914-C：资源目标挂载

目标：H-05 一次收口，并修复 CODE-022 与 mounter 的冲突。

1. manifest 在写盘前生成并冻结 owner/mount/allowedConsumers。
2. mounter 只执行 mapping 中的唯一目标，不再搜索「第一个可用容器」。
3. `targetDomSelector` 找不到时 fail-closed，记录 `RESOURCE-MOUNT-TARGET-MISSING` 诊断。
4. `skipMount=true` 绝不生成 import、style 或 fallback。
5. CODE-022 检查正确挂载，不再要求错误资源必须被任意方式消费。
6. 同一 `figmaNodeId` 或同一资源实例不得在多个不允许的 DOM 出现。

### 914-D：Figma 文本样式

目标：H-02 根治，不用单个组件颜色补丁。

1. 提取每个文本 node 的 visible fills 和 gradient stops。
2. 写入 `textStyleFacts[nodeId]`，保留 provenance。
3. 确定 gradient/solid 同时存在时的可见优先级。
4. 生成 CSS 时只消费 facts；没有 facts 不得臆造业务 gradient。
5. 将运行时 computed style 检查纳入视觉回归。

### 914-E：统一门禁

目标：阻止「代码绿、视觉坏」。

新增的不是分散的多个业务 CODE，而是一套 `verifyProductVisualContract`，输出结构化诊断：

- `unauthorized-node`：产物节点无 Figma nodeId 来源；
- `duplicate-node-owner`：nodeId 多落点；
- `resource-misbound`：资源目标与 DOM/owner 不匹配；
- `missing-resource-render`：有资源事实但没有合法渲染；
- `layout-nowrap-violation`：Figma no-wrap 组发生换行；
- `text-style-mismatch`：目标文字 computed style 与 Figma facts 不一致；
- `unexpected-control`：不存在 refresh/button 等交互结构；
- `height-zero` / `ratio-mismatch`：关键区块不可见或比例错误。

这些是同一视觉契约的诊断类型，不再为每一个样本继续新增互相重叠的规则编号。

### 914-F：最后才接 Golden 和真实回归

准入条件：914-A 至 E 完成后，再将 Golden 独立裁判接入生成门禁。Golden 必须锁定：

```text
blocks + parent/child + slots + node ownership
resource mount targets
text style facts / chart type / size ratio
```

不能只锁资源列表，也不能 import 装配层算法形成自证。

---

## 7. 914 回归测试矩阵

### 7.1 纯函数/契约层

| 用例 | 必须断言 |
|---|---|
| header 统计 frame | `HORIZONTAL + NO_WRAP` 被完整保留；label/value 同组 |
| header icon 有 image/vector 事实 | `nodeKind != none`，不得生成 CSS-only 圆点 |
| 无 refresh node | `headerSlots` 无 refresh；生成 contract 禁止 button |
| `bg-8439.png` | owner 是 cons block；header file 不在 allowedConsumers |
| 根背景 `skipMount=true` | 不产生 import/style/mount |
| 空资源 contract | 不回退全量，不返回 success |
| 同一 nodeId 多落点 | contract 直接失败，不能交给后处理去重 |
| Figma gradient | stops、方向、透明度保留；generic fallback 不覆盖 facts |

### 7.2 真实产物离线回放

以 `c-device-monitor-6c12baba` 为固定样本，必须验证：

1. `HeaderSection.vue` 中不存在 `c-device-monitor-refresh-icon`、`c-device-monitor-refresh-btn`、未授权 `a-button`；
2. header icon 使用真实 mapping/vector contract，不是空 div + `border-radius:50%`；
3. 三组统计 label/value 每组单行；
4. `stat-group` 不引用 `bg-8439.png`、`bg-8788.png`、`bg-8807.png`；
5. `bg-8439.png` 只出现在 cons 对应文件/DOM；
6. `declare.componentName` 为「设备监测」，aspect ratio 为 `[420,425]`；
7. 关键 block 数量、父子关系和 section 高度比例与 Figma 一致；
8. 数字目标节点 computed style 含正确的 text gradient/可见填充，截图中不是统一实色；
9. 无未授权控件、无无资源 fallback、无重复 node owner。

### 7.3 真机验收

每次治理完成后必须重新生成至少一轮，不能只用旧 snapshot：

| 层 | 验收内容 | 完成标准 |
|---|---|---|
| 文件 | `degradedFiles`、写盘文件数 | `degradedFiles=[]`，组件文件齐全 |
| 结构 | index 和 components | section 不少不少；header/body 无双落点 |
| DOM | 节点、资源、控件 | 资源在正确 DOM；没有 unauthorized button |
| 计算样式 | nowrap、尺寸、颜色 | 三统计组单行；关键高度非 0；颜色 facts 命中 |
| 截图 | 设计稿 vs 预览 | 头部布局、间距、图标、颜色、背景位置一致 |
| 稳定性 | 至少 3 次重生成 | 非偶然单轮通过；失败要记录真正阻断链 |

「jest 通过」「L0-B pass=true」「Golden JSON 已生成」「commit 已提交」都不能替代以上验收。

---

## 8. 明确禁止的治标方案

- 不直接编辑 `frontend/workspace/custom-components/c-device-monitor-6c12baba/package/components/HeaderSection.vue`；
- 不给 `.header-deco` 加 `background:none` 来掩盖错误语义；
- 不删除一条 `backgroundImage` 就宣称资源治理完成；
- 不给 `.stat-label` 粗暴加 `white-space:nowrap` 作为唯一修复；
- 不把刷新按钮用 CSS 隐藏；
- 不把数字颜色换成另一组硬编码颜色；
- 不把 `bg-8439.png` 复制到所谓正确位置来满足 CODE-022；
- 不新增一个只针对设备监测的 CODE 编号；
- 不在 visual-parser、validator、prompt、mounter 各写一套 header 判定；
- 不在没有新生成样本的情况下把本轮治理标记为完成。

---

## 9. 当前状态与下一步

### 已确认

- H-01：原始 chunk 的统计组未消费 Figma no-wrap frame，属于结构装配根因；
- H-02：Figma 有真实 gradient fills，产物是 generic hardcoded gradient，事实链未收口；运行时覆盖需要随新管线回放进一步量证；
- H-03：圆点已存在于原始 chunk，属于 LLM/语义分类错误，不是单纯资源 mounter 添加；
- H-04：刷新按钮已存在于原始 chunk，prompt 的泛化刷新示例和无 allow-list 契约是直接诱因；
- H-05：`bg-8439.png` 在原始 chunk 不存在、在最终产物跨区出现，明确属于资源后处理错挂；
- 前几天的 P0-1、P0-2、P0-3、P1-1、P1-2 方向大体正确，但仍需按本文合并事实源和验收标准；
- headerSlots、section 类型、deterministic template、T09 和 resource-mounter 当前仍有重复/互相兜底的职责，必须收敛。

### 下一步执行顺序

1. 先实现并单测 `FigmaVisualFacts + HeaderSlotsContract` 的唯一构建入口；
2. 关闭所有 header/resource fail-open 和无 nodeId 的兜底注入；
3. 将 header 统计、icon、控件改为确定性装配；
4. 将 resource mount 改成 owner/target/allowedConsumers 三重约束；
5. 接入文本 fills 和 computed-style/截图视觉门禁；
6. 重新生成设备监测、流量监测、重点车辆三个样本，做结构和截图对照；
7. 最后才接独立 Golden 双裁判；
8. 验收通过后再提交代码，不在当前产物目录留下补丁。

---

## 10. 本文涉及的关键代码证据

- `backend-node/src/ai-engine/roles/figma-connector.js#_identifyNodeType`
- `backend-node/src/ai-engine/roles/visual-parser.js#_inferHeaderSlots`
- `backend-node/src/ai-engine/validators/header-slot-validator.js#deriveHeaderSlotsFromFigma`
- `backend-node/src/ai-engine/utils/inline-header-slot-inferrer.js`
- `backend-node/src/ai-engine/roles/microcode/code-generator.js#buildDeterministicIndexTemplate`
- `backend-node/src/ai-engine/roles/microcode/resource-mounter.js#ensureHeaderSlots`
- `backend-node/src/ai-engine/utils/resource-import-guard.js`
- `backend-node/src/ai-engine/validators/code-structure-validator.js#CODE-022`
- `backend-node/src/ai-engine/prompts/guides/header-right-slot-detection.md`
- `backend-node/src/ai-engine/roles/microcode/vue3-prompt.js`
- `frontend/workspace/custom-components/c-device-monitor-6c12baba/package/components/HeaderSection.vue`
- `frontend/workspace/custom-components/c-device-monitor-6c12baba/.mc-gen/cache/code-chunks/5-package_components_HeaderSection.vue`
- `frontend/workspace/custom-components/c-device-monitor-6c12baba/.mc-gen/resource-dom-mapping.json`
- `frontend/workspace/custom-components/c-device-monitor-6c12baba/.checkpoint/figma.json`

---

## 11. `c-device-monitor-switch` 视觉偏差取证（2026-09-14）

本节记录设备监测组件 switch 区域的真实生成结果。结论来自三条独立证据链：Figma checkpoint 节点事实、生成缓存/最终 SFC、Puppeteer 打开的真实预览 DOM；不以 `pass=true`、L0-B 或 Golden JSON 替代浏览器验收。

### 11.1 事实基线：switch 不是自由流式卡片

| Figma 节点 | 事实 | 管线含义 |
|---|---|---|
| `89:38` switch | `396.4 × 64.8` | 根容器应锁定设计尺寸比例，不能由内容自然撑高 |
| `2:8787` active | 约 `193.4 × 64.8` | active item 约占 switch 一半宽度 |
| `2:8806` default | 约 `193.4 × 64.8` | default item 与 active 等宽，不是按文字宽度收缩 |
| `2:8788` / `2:8807` | active/default 各自真实背景资源 | 两个状态必须分别挂载，不能用通用透明色替代 |
| `2:8798` / `2:8817` | active/default 各自 icon 资源，约 `35.25 × 28.33` | 不能由圆点、CSS 图形或常识性图标替代 |
| `2:8791` | `隧道设备`，12px，白色，约 `45 × 16` | active 标题颜色由节点事实决定 |
| `2:8816` | `南北接线\\n设备`，约 `45 × 20`，`lineHeightPx=10`，深色 | 换行、行高和文本框尺寸均属于 Figma 事实 |
| `2:8793`/`2:8794`、`2:8796`/`2:8797` | label 14px；数字 20px/700；数字含渐变，异常数字含 `#E03434` | 统计行不能退化为通用主题色 |
| `2:8810`/`2:8813` | 两行统计 frame | 统计行应按原始 frame 关系装配，不由 LLM 自由排版 |

资源映射已明确给出唯一归属：

| 资源 | `figmaPath` | `mountTarget` | 允许落点 |
|---|---|---|---|
| `bg-8788.png` | `.../switch/active/bg` | `active` | active 背景块 |
| `bg-8807.png` | `.../switch/default/bg` | `default` | default 背景块 |
| `icon-8798.png` | `.../switch/active/icon` | active 语义 | active icon |
| `icon-8817.png` | `.../switch/default/icon` | default 语义 | default icon |
| `bg-8439.png` | `.../@antd/tab/cons/.../bg` | `cons` | 后续 cons 区域；禁止进入 switch/header |

### 11.2 真实浏览器对照结果

| 检查项 | Figma 目标 | 当前预览实测 | 判定 |
|---|---:|---:|---|
| switch 根 | `396.4 × 64.8` | `405 × 126.13` | 🔴 高度约为目标 1.95 倍 |
| active item | `≈193.4 × 64.8` | `131.7 × 65` | 🔴 宽度按内容收缩 |
| default item | `≈193.4 × 64.8` | `79.91 × 65` | 🔴 宽度按内容收缩 |
| default 内容 | 不应有害溢出 | `scrollHeight=108`、`clientHeight=65` | 🔴 内容被裁切 |
| active 背景块 | 有背景且填满 active | rect 宽度 `0`、高度 `65` | 🔴 资源虽绑定但承载 DOM 无尺寸 |
| default 背景块 | 有背景且填满 default | rect `79.91 × 0`，无背景图 | 🔴 资源未补齐且无尺寸 |
| slot-con | `407.4 × 380` 附近 | `405 × 389`，`scrollHeight=522` | 🔴 内部错误布局向外溢出 |
| active 标题 | 白色、一行 | 实际 `rgb(51,51,51)` | 🔴 通用文本色覆盖 Figma fact |
| default 标题 | `45 × 20`、行高 10px | 自由流式两行，约 `31.19px` | 🔴 仅有 `<br>`，未还原文本框事实 |
| 统计布局 | 两个明确 frame | `.switch-stats` 为 column 自由布局 | 🔴 未消费 Figma frame/bbox |

取证脚本为 `backend-node/.tmp-switch-evidence.cjs`，真实截图为 `backend-node/.tmp-switch-render.png`。这些文件只用于取证，不是修复目标；最终修改不得落在生成组件目录。

### 11.3 四类表象到根因

1. **高度和宽度比例错误**：原始 chunk 使用 `flex:1`，但 `common.less` 的 `.c-device-monitor-switch-item { flex:0 0 auto; }` 覆盖了等分意图，active/default 按内容宽度收缩；根容器又被宿主剩余高度和错误内容流共同撑大。
2. **背景图消失**：原始 chunk 的两个背景块都没有资源引用；资源注入只按模板中已出现的变量补 import，发现 active 引用后只补齐 active。mapping 中已有 `mountTarget=default`，但没有被当作确定性装配输入，因此 default 背景无法自愈。active 虽有绑定，背景块仍因宽度为 0 不可见。
3. **文字布局错误**：LLM 将 title、stats、icon 放入普通文档流，没有消费 active/default frame、统计 frame 及其 x/y/bbox；`<br>` 只能复刻字符换行，不能复刻 Figma 文本框、行高和状态内位置。
4. **文字颜色错误**：通用 `@colorTextBase`、`@colorPrimary` 取代了 TEXT 节点的 fills，导致 active 标题变深色，数字渐变和异常色没有按 nodeId 建立样式事实。

### 11.4 唯一修复入口与禁止分散修补

后续应把 switch 作为通用 `SwitchSectionContract` 纳入 `FigmaVisualFacts`，由单一入口产出：根/状态 bbox、title/line/icon nodeId、文本 characters/font/lineHeight/fills、背景/icon mapping、ownerBlockId 和 allowedConsumers。确定性模板负责生成 active/default 的完整 DOM 与资源落点；LLM 仅填充受限业务内容，不再决定状态结构、背景和 icon。

资源挂载必须同时满足 `figmaNodeId + ownerBlockId + mountTarget + allowedConsumers`：缺任一证据则 fail-closed，不造 DOM、不挂资源；资源 import 也不能证明它可以被当前节点消费。`bg-8439.png` 必须在资源层拒绝跨到 switch/header。

样式生成必须以 nodeId 绑定 Figma fills：active 标题/label 为白色，default 文本为 `#333333`，数字使用事实渐变，异常数字保留 `#E03434`；尺寸应由 bbox 转为布局约束，switch/item 目标分别接近 `396.4×64.8` 与 `193.4×64.8`。不能通过给最终 `SwitchSection.vue` 加一条固定 CSS 作为治理完成证明。

### 11.5 必须新增的回归门禁

- switch/item 的宽高与 Figma bbox 在允许误差内；active/default 宽度比例正确；
- active/default 背景和 icon 均挂载到各自授权 DOM，且 `bg-8439.png` 不跨区；
- title、line1、line2 的 nodeId、换行、line-height、位置和颜色与 facts 一致；数字渐变、异常色均可从 node facts 追溯；
- 无资源节点不强行生成 `<img>` 或 background；无授权 nodeId 不生成 refresh/button 等交互控件；
- `clientHeight/scrollHeight`、`clientWidth/scrollWidth` 不出现有害溢出；
- 代码门禁通过后必须再做 computed-style、真实 DOM 和截图对照，至少验证 3 次生成样本；
- 复测应覆盖设备监测、流量监测、重点车辆，证明规则是通用治理而非组件名特判。

---

## 12. `c-device-monitor-tabs-vertical` 视觉偏差取证（2026-09-14）

与 switch 同源：左侧垂直标签栏是 `@antd/tab`（`89:37`）内的 `tabs` 帧（`89:39`，`46×317`），共 6 个 tab 项，其中 1 个 `tab-active` + 5 个 `tab`。产物由 `TabsSection.vue` 承载。

### 12.1 事实基线：tab 背景是渐变，不是图片资源

`resource-dom-mapping.json` 里**没有任何 tab 背景资源条目** —— 因为 Figma 中 tab 的 `bg` 节点是 `VECTOR`/`RECTANGLE`，fills 是 `GRADIENT_LINEAR`（深蓝青渐变），不是 IMAGE，figma-connector 不会导出成 PNG。这意味着「tab 背景」必须由 CSS 渐变还原，不能靠资源注入。

| Figma 节点 | 事实 | 管线含义 |
|---|---|---|
| `2:8825` tab-active（监控） | `46×54`；bg `2:8826` 是 `RECTANGLE` `34×44` GRADIENT_LINEAR | active 背景 = 深蓝青渐变块 |
| `2:8830/8836/8841/8846/8851` tab | `34~37 × 40~72`；bg 均是 `VECTOR` GRADIENT_LINEAR | default 背景 = 渐变块（尺寸随文字变化） |
| `2:8827` t-监控 | 白色 `rgba(1,1,1,1)`，14px/700，竖排 | active 文字 = 白（深色渐变底上） |
| `2:8832/8838/8843/8848/8853` d-* | 蓝色 `rgba(0.23,0.50,0.90)` = `#3A80E6`，14px/400 | default 文字 = 蓝 |
| `2:8828` Frame + `2:8829` | 白底 `38×18` + 蓝字 `3/3740`（14px/500） | active badge = 白底蓝字 |
| `2:8833` Group + `2:8834` + `2:8835` | 红底 `14×14`（`rgba(0.96,0.25,0.25)`）+ 白字 `3`（12px/500） | default badge = 红底白字角标 |

### 12.2 产物对照（`TabsSection.vue`）

| 检查项 | Figma 事实 | 产物现状 | 判定 |
|---|---:|---:|---|
| tab-item 背景 | 深蓝青渐变（active/default 各尺寸） | `.c-device-monitor-tab-vertical-item` 无任何背景 | 🔴 |
| active 文字 | 白色 14px/700 | `@color-tab-active-text:#333333` | 🔴 |
| default 文字 | `#3A80E6` 14px/400 | `@color-tab-default-text:#333333` | 🔴 |
| active badge | 白底 38×18 + 蓝字 | `.badge { background:#fff; color:#333 }` | 🔴 底色对、字色错 |
| default badge | 红底 14×14 + 白字 | 同上统一白底深灰字 | 🔴 底色字色全错 |
| badge 定位 | 独立定位角标（`2:8833` 有独立 bbox `14×14`） | flex column 流式塞进 item 内部 | 🔴 |
| 竖排文字 | `writing-mode` 竖排 | 产物有 `writing-mode:vertical-lr` | ✅ 方向对，但颜色/背景错 |

### 12.3 根因链

1. **渐变背景整体缺失**：tab 的 bg 是 Figma 渐变，不在资源 mapping 中；生成链没有「GRADIENT_LINEAR fills → CSS gradient」的确定性还原入口，LLM 又未从 Figma 节点 fills 生成背景 → tab 裸白。
2. **文字颜色错误**：`TabsSection.vue` 内 `@color-tab-*-text` 全部硬编码 `#333333`，没有按 nodeId 消费 `2:8827`（白）/`2:8832`（蓝）的 fills 事实。这是「通用主题色替代 node fills」在 tab 上的再次复现。
3. **badge 语义错误**：badge 在 Figma 是**独立 GROUP 节点**（有自己的 bbox 和底色/字色，active 白底蓝字、default 红底白字），产物把它降级成 item 内的一个统一 `v-if` 文本块，丢失了「独立角标 + 双态配色」两层事实。
4. **状态结构未确定性装配**：tab-active 与 tab 是 Figma 的两个不同 GROUP 结构（一个带 badge、一个带红角标），但产物用单一 `v-for` + `--active` 修饰符统一渲染，未消费 `tab-active`/`tab` 的节点差异。

### 12.4 唯一修复入口

tab 属于「状态列表型 section」：内部是 N 个同构状态项，每项由 `bg（渐变/资源）+ 文本（fills）+ 可选 badge` 构成。应纳入统一的 `StatefulSectionContract`（与 switch、card-grid 同一契约），由确定性模板按 `item nodeId → 子节点角色（bg/text/badge）` 生成 DOM，并：
- `bg` 为 `GRADIENT_LINEAR` → 生成 CSS gradient（颜色取自 `gradientStops`），不依赖资源文件；
- `bg` 为 IMAGE → 挂 `resourceFile`，且 `mountTarget` 精确到 item 索引；
- 文本 fills 绑定 nodeId：active 白 / default 蓝，badge 双态（白底蓝字 / 红底白字）。

---

## 13. `c-device-monitor-device-grid` 视觉偏差取证（2026-09-14）

设备网格是 `@antd/tab` 内 `cons` 帧（`2:8437`，`367×295`）的 12 个设备卡（每卡 `117×64`，3 列 × 4 行）。产物由 `TabsSection.vue` 右侧 `c-device-monitor-device-grid-wrapper` 承载。

### 13.1 事实基线：12 卡共享同一张背景

| Figma 节点 | 事实 |
|---|---|
| 12 个卡 `2:8438…2:8758` | 各 `117×64`，布局 3 列 × 4 行 |
| 每卡 `bg`（GROUP，如 `2:8439`） | 内含多个 VECTOR，`GRADIENT_LINEAR` 深蓝青渐变；figma-connector 导出为同一张 `bg-8439.png` |
| 设备名 TEXT（如 `2:8442` 摄像机） | 深灰 `rgba(0.20,0.20,0.20)` = `#333333`，12px/400 |
| 数量 TEXT（如 `2:8443` (2/484)） | **白色** `rgba(1,1,1,1)`，16px/500 |
| icon GROUP（如 `2:8444`） | `26.6×32`，真实图片 `icon-8444.png` … `icon-8764.png` |

### 13.2 产物对照（`TabsSection.vue`）

| 检查项 | Figma 事实 | 产物现状 | 判定 |
|---|---:|---:|---|
| 卡背景 | `bg-8439.png`（深蓝青渐变卡底） | `.c-device-monitor-device-card` 无背景 | 🔴 |
| 设备名 | `#333333` 12px | `@color-device-name:#333333` | ✅ |
| 数量 (2/484) | 白色 16px/500 | `@color-device-count-num/total:#333333` | 🔴 |
| icon | 真实图片 | 已 import 12 个 icon | ✅ 引用齐全 |
| 布局 | 卡内 icon 与文字按 Figma 坐标分布 | `.device-card` 用 `flex column align-center`（icon 上、文字下） | 🔴 布局方向错 |

### 13.3 根因链（比 switch 多暴露一个「同图多别名」冲突）

1. **背景整体丢失**：12 个卡的 `bg` 都映射为同一 `bg-8439.png`，但 `assignedVarName` 被 figma-connector 按节点顺序编成 `bg3…bg14`（12 个别名指向同一文件）。LLM 生成时既没 import 也没挂载 → 全裸。
2. **C1 同图多别名去重与「12 卡共享一张底图」语义冲突**：`dedupeSameImageAliases`（resource-mounter.js）按 `resourceFile` 聚合，发现 `bg-8439.png` 有 12 个别名后**只保留评分最高者、剥离其余 11 个**。即便兜底 `autoMountUnusedBackgrounds` 想挂，也只会让 1 个卡有背景。正确语义是「12 卡共享**同一个 import 变量**」，而非「12 个变量指向同一文件再合并」。
3. **数量文字颜色错**：`#333333` 替代了 Figma 的白色 fills（深色渐变底上的白字）。
4. **布局方向错**：LLM 用 column 自由排版，未消费卡内 icon/文本的 Figma bbox 坐标（横向 icon 左 + 文字右）。
5. **资源挂载无确定性落点**：12 个 bg 的 `mountTarget=null`、`targetDomHint` 都是笼统的 `cons区域`，没有「第 N 个设备卡」的索引级落点，兜底挂载无法定位到具体卡。

### 13.4 唯一修复入口

设备卡属于「重复卡片型 section」。正确契约应为：**一张 `bg-8439.png` = 一个 import 变量**，在确定性模板生成的 `v-for` 卡片上，用**同一变量**绑定背景；icon 每个卡一个变量按索引绑定；文本 fills 按 nodeId 生成（设备名深灰、数量白）。必须同时修两处：

1. `figma-connector`：同一 `resourceFile` 在「重复卡片」场景只登记**一个** `assignedVarName`（或明确 `sharedBy` 语义），不再按节点编 12 个别名。
2. `resource-mounter`：`dedupeSameImageAliases` 不得把「共享底图」当「重复错误」剥离；只有「同一张图被错挂到多个不同容器」才需要去重，而「同一张图按设计重复出现在 N 个同类容器」应保留为共享变量。

---

## 14. 三区域共同根因 → 统一治理架构（switch / tabs / device-grid 收敛）

第 11~13 节的取证指向**同一个根因家族**，不能再分三个 patch 各自修：

| 根因 | switch | tabs | device-grid |
|---|---|---|---|
| 状态/重复项内部 DOM 由 LLM 自由生成，未消费 Figma 结构 | ✅ | ✅ | ✅ |
| 渐变（GRADIENT_LINEAR）无确定性 CSS 还原入口 | ✅(箭头) | ✅(tab 底) | ✅(卡底) |
| 资源挂载 fail-open / 无索引级落点 | ✅(default bg) | — | ✅(12 卡 bg) |
| 同图多别名被 C1 误去重 | — | — | ✅ |
| 文本 fills 未绑定 nodeId，通用主题色替代 | ✅ | ✅ | ✅ |

**统一修复入口（唯一）**：新增 `StatefulSectionContract`，作为 `FigmaVisualFacts` 的子契约，由**单一模块**从 Figma 节点树提取「状态项/重复卡片」的完整事实：

```
section (type ∈ {switch, tabs, card-grid})
 └─ item[0..N]                         // tab-active/tab，或 active/default，或 12 卡
     ├─ bg        → { kind: GRADIENT|IMAGE, stops[] | resourceFile, sharedVar? }
     ├─ text[0..M] → { characters, fills, fontSize, fontWeight, lineHeight }
     └─ icon?      → { resourceFile, bbox }
```

确定性模板据此生成 item 的 DOM 骨架 + 资源/渐变/文本样式；LLM 只填充受限业务文案与交互，不再决定结构、背景、icon 与颜色。资源契约以 `item 索引 + 角色` 定位挂载，`sharedVar` 标记同一资源文件在重复卡片上的共享语义。此入口落地后，第 11/12/13 节的回归门禁合并为一张「状态型 section」门禁矩阵，复测覆盖设备监测、流量监测、重点车辆三样本。

---

## 15. `c-vehicle-monitor`（重点车辆监测）视觉偏差取证与根因（2026-09-14）

样本 `mc-max-1789346456898-40f74449`（workspace `c-vehicle-monitor-40f74449`），Figma `2:7952` `cp-重点车辆监测`（`420×147`）。这是继设备监测 switch/tabs/device-grid 之后的**第四个同类样本**，用于验证「状态型 section」根因家族是否跨组件复现。

### 15.1 事实基线：结构只有三层，产物多出 title-row 与第二个 content-section

| Figma 节点 | 事实 | 产物偏离 |
|---|---|---|
| `2:7952` 根 | `420×147`，含全屏 `bg`(2:7953) + header(136:120) + slot(136:121) | — |
| header `136:120` | 含 `tabs`(2:7954，江阴靖江长江隧道/江阴大桥) + `小标题`(2:7959，标题+装饰+副标题) | 多出空 title-row |
| slot `136:121` | 含 `Group 2136639043`(3 卡) + `sub-header`(136:122，今日累计) | 多出第二个 content-section |
| `Group 2136639043` | 3 卡：FRAME '1'危化品(x=37) / '2'重型(x=166) / '3'超高(x=274) | 顺序反成 [超高,重型,危化品] |
| 全屏 bg `2:7953` | `420×147`，`#edf4fbb2` | `downloadStatus:missing` 未挂载 |

### 15.2 四类表象 → 根因（含对上一份第三方分析的纠偏）

**根因 1：title-row 空壳残留 —— T1 剥离只删叶子文字，不删父容器与兄弟装饰** ✅

`HeaderSection.vue` L4-10 残留 `title-row → title-deco → {diamond, line}`，标题文字被替换成注释 `<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->`。代码证据在 `microcode-engineer.js` L5643-5654：

```js
const titleElRe2 = new RegExp(`\\n?[ \\t]*<[a-zA-Z][^>]*>\\s*${esc2}\\s*</[a-zA-Z]+>`, 'g');
const stripped = fc.replace(titleElRe2, '\n<!-- 🎯 ... 已程序化移除 -->');
```

正则只匹配**叶子文字元素** `<tag>重点车辆监测</tag>`，父容器 `title-row` 与兄弟装饰 `title-diamond`/`title-line` 全部保留 → 视觉多一条孤立装饰条。

补充发现：`titleText` 只取 header 内按 x 排序的**第一个** TEXT（「重点车辆监测」），副标题「*数据实时更新」（`2:7967`，x=322）既未被 T1 剥、也被 LLM 漏生成 → 副标题信息双重丢失。

**根因 2：双 content-section —— 同批生成两套，非跨轮残留** ⚠️（修正第三方归因）

`index.vue` L8-9 同时渲染 `<ContentSection />`（背景图版）与 `<ContentSection2 />`（渐变装饰版），卡片数据完全相同（超高19/重型2/危化品51）。但 `chunk-meta.json` 显示这是**单轮 8 文件**里 `7-ContentSection.vue` 与 `8-ContentSection2.vue` **连续编号同批生成**，`completed` 齐全、无重试痕迹。真因是 subcomponent-planner/LLM 把单个 content section（`Group 2136639043`）拆成两个文件。

另一个铁证：`index.vue` 走 **LLM 回退路径**（`<template class="c-mc-max-...">` 带异常 class；`HeaderSection` 被放进 slot-con 而非 header-right）→ 装配层未走确定性模板单一事实源，才让「同一 section 拆两文件」得以落盘。

**根因 3：卡片顺序反了（未按 x 排序），但背景绑定实际正确** ⚠️（修正第三方「背景反转」误判）

| 证据 | 值 |
|---|---|
| Figma `Group 2136639043` children 数组顺序 | z-order `[FRAME'3'超高, FRAME'2'重型, FRAME'1'危化品]` |
| 视觉正确顺序（x 升序） | `[危化品(x=37), 重型(x=166), 超高(x=274)]` |
| `preview-analysis.json` `2:8023` children | 沿用 z-order → `超高→重型→危化品`（**反了**） |
| 背景绑定 | `bg-126→…/3/bg(超高)`、`bg-124→…/2/bg(重型)`、`bg-125→…/1/bg(危化品)` → 产物 `label→bg` **全部正确** |

用户看到的「背景图不对」本质是**卡片整体顺序反了**——背景图跟着卡片一起错位，而非背景绑定反转。真正的缺口是「卡片横向顺序没有以 `absoluteBoundingBox.x` 为单一事实源排序，沿用了 Figma children 的 z-order」。

**根因 4：面板整体背景缺失 —— bg 下载失败被 skipMount** ✅

`resource-dom-mapping.json` 首条 `2:7953 cp-重点车辆监测/bg` 的 `downloadStatus:"missing"` + `skipMount:true` + `isPanelResource:true` + `resourceFile:null`，全屏背景未挂载 → 面板底色/背景图整体错误。

### 15.3 与设备监测三区域的收敛

| 根因 | 设备监测(switch/tabs/device-grid) | 重点车辆(vehicle) |
|---|---|---|
| item 内部 DOM 由 LLM 自由生成 | ✅ | ✅（双 content-section） |
| item 排序未按 x/y 坐标 | ⚠️ 隐含 | ✅ 实锤（卡片反序） |
| 资源挂载 fail-open / skipMount | ✅ | ✅（面板 bg） |
| 标题剥离边界错误 | — | ✅ 实锤（title-row 空壳） |
| 文本/背景 fills 未绑定 nodeId | ✅ | ✅ |

重点车辆新增两个此前未显式记录的根因维度：**item 坐标排序**（`StatefulSectionContract` 提取 item 时须按 x/y 排序）与 **T1 标题剥离边界**（应识别「标题行 GROUP」整体语义，连带处理装饰与副标题）。

---

## 15b. `c-traffic-monitor`（流量监测）错误取证与根因（2026-09-14，实锤）

> 样本：`c-traffic-monitor-c6c228fb`（任务 `mc-max-1789327139782`）。证据全部来自落盘产物与 checkpoint，**未使用任何二手描述**：
> `frontend/workspace/custom-components/c-traffic-monitor-c6c228fb/{package/index.vue, package/components/*.vue, .checkpoint/visual.json}`。

### 15b.1 产物结构与真值基线

产物 5 个组件：`HeaderSection.vue` + `ContentSection.vue` / `ContentSection2.vue` / `ContentSection3.vue` / `ContentSection4.vue`，`index.vue` 四个 ContentSection 顺序挂载（无重复、无孤儿，**section→文件 1:1 成立**）。

`.checkpoint/visual.json` 的 `charts[]` 真值（**逐字**）：

| # | 真值 type | 归属 section |
|---|---|---|
| 1 | `bar` | `section-chart-tunnel` |
| 2 | `bar` | `section-chart-bridge` |
| 3 | **`area`** | `section-forecast` |

### 15b.2 五类错误（全部代码级定位）

| # | 表象 | 代码证据 | 判定 |
|---|---|---|---|
| T-01 | **多图互踩：预测图应为面积折线，产物是柱状图** | `visual.json` 真值 `section-forecast.type='area'`；产物 `ContentSection4.vue:154` 与 `:176` 的 `series[].type` **均为 `'bar'`**（`itemStyle/areaStyle` 却按面积图写） | 🔴 真值 `area` 被 `chartsArr[0]='bar'` 覆盖，**实锤** |
| T-02 | **隧道名称与数值互换** | `ContentSection2.vue:28-29`：`tunnel-value` = 「江阴靖江长江隧道」、`tunnel-name` = 「34,620」——类名与内容语义**完全颠倒**（对比 `:23-24` 的 `bridge-name`=「江阴大桥」/`bridge-value`=「82,379」正确） | 🔴 实锤 |
| T-03 | **菱形装饰 `width:100%` 撑破** | `ContentSection.vue:148`（`.c-traffic-monitor-section-icon { width: 100% }`）与 `ContentSection2.vue:46`（`.c-traffic-monitor-title-icon { width: 100% }`）——8px 级装饰被写成满宽 | 🔴 实锤（与 §11 switch 菱形同源） |
| T-04 | **同一图标双写 + 别名转发** | `ContentSection.vue:4-6`：header 里既有 `<img :src="icon2" class="auto-mounted-icon">` 又有空 `<span class="...-section-icon">`，标题内再嵌 `<img :src="icon3">`；`script:17-18` 写 `import icon2 … ; const icon3 = icon2`（别名转发） | 🟡 同 §13/刀 7b 形态 |
| T-05 | **`section-icon` / `icon` 双类名各写一遍渐变** | `ContentSection.vue:148-150`（`section-icon`，`width:100%` + gradient）与 `ContentSection3.vue:147-148`、`ContentSection4.vue:264-265`（`icon`，仅 gradient）——同一视觉意图三处实现、其中一处带撑破属性 | 🟡 语义重复实现 |

### 15b.3 根因链（与既有 914 根因的对应关系）

```text
T-01：2.1.E 守卫「单图真值」假设不成立
      chartsArr[0] 当全文件真值 → chart B/C 的 area 被 chart A 的 bar 覆盖
      （真值本身合法，错在「一个真值跨图适用」这个前提）
        ↓
T-02/T-03/T-05：item/装饰节点仍由 LLM 自由生成
      没有 item 级契约约束「类名 ↔ 内容语义」与「装饰尺寸真值」
      → 类名/内容错配、装饰满宽、同类名多处实现
      （对应 G1/G2/G6：确定性 item 装配 + bbox 真值绑定）
        ↓
T-04：资源节点未做「一节点一落点」
      header 装饰 img 与空 span 并存 + 别名转发
      （对应 G5/刀 7b：资源四重校验 + 别名在编号阶段根治）
```

**共性**：五类全部是「LLM 承担了本应由确定性装配负责的职责」——chart 类型、item 语义、装饰尺寸、资源落点。与 §17.10 删减法结论一致：**这类缺陷不靠新增门禁解决，靠 planner/assembler 接管**。

### 15b.4 治理落点（复用现有唯一入口，不新增契约）

| 根因 | 唯一落点 | 治本动作 |
|---|---|---|
| T-01 多图真值 | ✅ **已落地**：`chart-type-guard.js#buildChartTypeTruthSet` + 调用点（`microcode-engineer.js:5686` / `vue3-engineer.js:1280`） | 真值从「单值」升级为「**真值集合**」：`charts[]` 每种 type 经 `resolveEchartsType` 归一组成允许集（`bar/bar/area` → `{bar,line}`），`series.type` 只需落在集合内即合法；只有落在集合外才 fail-closed。**「首图真值覆盖全文件」已禁用**。守卫**只消除主动破坏**，根治靠 §16 契约层逐文件绑定（见 §17.11 批次 3 补充）。 |
| T-02 item 语义错配 | `stateful-section-contract.js`（16.1 已定） | item 的 label/value 由 Figma 文本节点事实直接绑定，类名由契约推导，禁止 LLM 自定语义 |
| T-03 装饰满宽 | `code-validator.js#detectRootContainerClass`（P0-1 已做）+ 契约层 | 装饰节点尺寸取 Figma bbox 真值，缺真值则不注入尺寸（**禁止 `width:100%` 兜底**） |
| T-04 资源双写 | `resource-mount-plan.js`（批次 2 已做） | 一节点一落点；别名在编号阶段共享（2c 已做） |
| T-05 类名重复实现 | 契约层 | 同一视觉意图（装饰 icon）只允许一个类名，由契约生成 |

### 15b.5 验收（与 §7.3 一致）

1. 重生成 `c-traffic-monitor`，产物 `ContentSection4` 的 `series[].type` 含 `area`（或归一后的 `line`），**不再全 bar**；
2. `tunnel-name` = 隧道名、`tunnel-value` = 数值；
3. 装饰 icon 计算宽度 = Figma bbox（≈8px），非满宽；
4. header 不出现「img + 空 span」双写；
5. 代码门禁通过后，必须补截图 vs 设计稿对照（§0 统一原则 6）。

### 15b.6 🔴 RUNTIME-004 硬伤真机闭环（c-traffic-monitor-**6b803ab0**，2026-09-14 14:13 实锤）

> 同一组件不同样本 `6b803ab0`（`mc-max-1789366084119`）在运行时质量门禁**硬 BLOCK**：`RUNTIME-004`（真实预览 `render-error`，`errorType=vue-render`）。预览页 ErrorBoundary 原文：`组件渲染出错 · xAxis "0" not found`。比 T-01 视觉错误更严重——是**整组件无法交付**。

| 项 | 内容 |
|---|---|
| 真机复现 | puppeteer 加载预览页 + 抓 ErrorBoundary 完整堆栈：`at cartesian2d → getCoordSysInfoBySeries → createSeriesData → BarSeriesModel.getInitialData → setOption`（initTunnelChart / ContentSection4.vue），`mounted hook` 中 `setOption` 抛错 |
| 根因链 | `ContentSection4` 是**环形图**（真值 `section-vehicle-distribution` = 环形图/doughnut，带 `radius`/`center`）。但 LLM 把它写成 `type:'bar'` + `radius`/`center`（饼图特征 + 柱类型错配）。echarts 把 `bar` 当 cartesian → 找不到 xAxis → 抛 `xAxis "0" not found` → mounted 崩溃。**这是 2.1.E 类型归一层的「形状错配」缺口**：旧守卫只处理顶层 `type` 别名（分组柱状图/面积折线图），不处理「bar + radius/center」这类**饼图特征 + 错误类型**组合。 |
| 2.1.F 修正③的责任判定 | 旧 2.1.F 给 cartesian series 盲注 `xAxisIndex:0/yAxisIndex:0`，**假设补索引就安全**。但真机证明：option 根本**没有 xAxis/yAxis 对象**时，echarts 对**任何** cartesian series（无论有无索引）都崩 `xAxis "0" not found`（puppeteer 双向验证：无轴无索引崩、无轴有索引也崩、有轴有索引 OK）。**修正③是打在错误层次的无意义补丁**——注入索引救不了「没有轴对象」本身。 |
| 治本 ①（2.1.E 形状错配归一） | `chart-type-guard.js#rewriteSeriesElementTypes`：series 元素含饼图特征键（`radius`/`center`/`roseType`/`startAngle`/`clockwise`/`selectedMode`）且 `type` 是 cartesian（bar/line…）→ 归一成 `pie`（echarts 中 doughnut = `pie` + `radius`）。饼图特征是不可辩驳的「这是饼图」事实，优先于真值集/单图真值覆盖。**`bar+radius` → `pie`** 后不再查轴，根因消除。 |
| 治本 ②（2.1.F 无轴守卫） | `chart-type-guard.js#hasAxisDeclared` + `rewriteSeriesAxisIndex(arrText, hasAxis)`：仅当 option **声明了 xAxis/yAxis** 时才注入索引；无轴 option 直接跳过（消除噪音补丁）。 |
| 验证 | ① `chart-type-guard.spec.ts` 新增「形状错配归一」块 5 例 + 2.1.F 无轴守卫 2 例 → 套件 **60/60 绿**；② `npm run build` ✅；③ **dist 离线回放真实 ContentSection4**：`bar+radius/center` → `type:'pie'`，`changed=1`，`2.1.F changed=0`（不再注入索引）；④ **puppeteer 真机双向**：`bar+radius`→`CRASH xAxis "0" not found`，`pie+radius`→`OK`。已重启后端（PID 45216，`env -i` 清 env）使新 dist 生效。 |
| 收敛 | 新增编号=0；纯函数/分支 +1（`hasPieFeatureKeys`、`hasAxisDeclared`，均非门禁）。遵循删减法「不猜、治本、收敛」——修正③的无效注入被收敛为「有轴才注入」。 |
| 残余 | `6b803ab0` 的 index.vue 同时挂了 4 个 ContentSection + 3 个 ChartSection（9 文件混编，含重复 ChartSection3），说明 planner 仍产出不可锚壳（批次 1 锚定未全覆盖）；但这是视觉/结构问题，与 RUNTIME-004（渲染崩溃）正交。彻底收敛需 §17.11 批次 3 的 3b/3c + 批次 5。 |

---

## 16. 统一治理方案（四组件取证收敛后的最终版）

第 5/6 节（914-A~F）已覆盖 header 五类错误；第 11~15 节新增的「状态型 section」根因需在 914 体系上**追加 914-G/H/I**，并修正 T1。全部禁止对 `frontend/workspace/custom-components/*` 产物打补丁。

### 16.1 唯一修复入口：`StatefulSectionContract`

新增单一模块 `utils/stateful-section-contract.js`（纳入 `FigmaVisualFacts` 子契约），对 `section.type ∈ {switch, tabs, card-grid, card-row}` 从 Figma 树确定性提取 item 事实：

```
section
 ├─ items[]            // 按 absoluteBoundingBox.x/y 升序排序，禁止 z-order
 │   ├─ sortKey        // x 升序（横排）或 y 升序（竖排）
 │   ├─ bg             // { kind: GRADIENT|IMAGE, stops[]|resourceFile, sharedVar? }
 │   ├─ text[]         // { characters, fills, fontSize, fontWeight, lineHeight, nodeId }
 │   └─ icon?          // { resourceFile, bbox, nodeId }
 └─ itemLayout         // horizontal | vertical（由 item 间 x/y 差分判定）
```

确定性模板据此生成 item DOM 骨架 + 渐变/资源/文本样式；LLM 只填受限业务文案与交互。同一个 content section 只能产出一个组件文件（根治双 content-section）。

### 16.2 各根因 → 唯一落点（治本映射）

| # | 根因 | 落点文件 | 治本动作 |
|---|---|---|---|
| G1 | item 内部 DOM 由 LLM 自由生成 | `code-generator.js` + 新增 `stateful-section-contract.js` | 确定性生成 item 骨架；LLM 只填文案 |
| G2 | item 顺序沿用 z-order | `stateful-section-contract.js` | item 按 x/y 升序排序输出 |
| G3 | 渐变无 CSS 还原入口 | `figma-connector.js` fills 提取 + 模板 | `GRADIENT_LINEAR.gradientStops → linear-gradient()` |
| G4 | 同图多别名被 C1 误去重 | `resource-mounter.js#dedupeSameImageAliases` | 同一 `resourceFile` 只登记 1 个 import 变量 + `sharedBy` 共享语义 |
| G5 | 资源挂载 fail-open / 无索引落点 | `resource-mounter.js` + `resource-facts.js` | `figmaNodeId+ownerBlockId+mountTarget+allowedConsumers` 四重校验，缺证据 fail-closed |
| G6 | 文本 fills 未绑定 nodeId | 样式生成层 | 每个 TEXT nodeId → visible fills/gradient 绑定，禁用通用主题色替代 |
| G7 | T1 标题剥离只删叶子文字 | `microcode-engineer.js` L5643 | 识别「标题行 GROUP」整体：标题+装饰+副标题连带处理；副标题 TEXT 不得误漏 |
| G8 | 双 content-section（单 section 拆两文件） | `code-generator.js#buildDeterministicIndexTemplate` | section→组件文件 1:1；回退路径也校验「单 section 单文件」 |
| G9 | 面板 bg 下载失败被 skipMount | `figma-connector.js` 下载层 + mounter | missing 时用 fills/gradient CSS 兜底，不静默丢背景 |

### 16.3 执行顺序（分三批，每批可独立验证）

**第一批：事实与契约冻结（G1/G2/G3/G6）**
1. `stateful-section-contract.js`：item 排序 + bg kind 判别 + text fills 提取。
2. `figma-connector`：fills/gradient 事实优先于名称猜测（`_identifyNodeType`），`GRADIENT_LINEAR` 保留 stops。
3. 单测钉死：switch 两态、tabs 6 项、device-grid 12 卡、vehicle 3 卡的 item 顺序与 fills。

**第二批：确定性装配 + 资源契约（G4/G5/G8/G9）**
4. `code-generator`：item 骨架生成 + section→文件 1:1 校验。
5. `resource-mounter`：C1 去重语义改 `sharedBy`；挂载改四重校验 + 索引级定位。
6. 面板 bg missing 走 CSS 兜底。

**第三批：标题剥离边界 + 门禁（G7 + 回归）**
7. T1 改为「标题行 GROUP」整体语义。
8. `verifyProductVisualContract` 增补 `item-order-mismatch`、`gradient-missing`、`text-fill-mismatch`、`duplicate-section-file` 四类诊断。

### 16.4 回归门禁（四样本统一矩阵）

| 断言 | switch | tabs | device-grid | vehicle |
|---|---|---|---|---|
| item 顺序与 x/y 升序一致 | — | 6 tab | 12 卡 | 3 卡 |
| 渐变/资源背景均挂载 | 2 态 bg | 6 tab 渐变 | 12 卡共享 bg | 3 卡 bg |
| 文本 fills 命中（白/蓝/深灰/渐变/异常色） | ✅ | ✅ | ✅ | ✅ |
| 无双 section 文件 / 无空 title-row | — | — | — | ✅ |
| 面板 bg 不因 missing 静默丢失 | — | — | — | ✅ |
| `scrollHeight==clientHeight` 无有害溢出 | ✅ | ✅ | ✅ | ✅ |

复测覆盖设备监测、流量监测、重点车辆三组件，证明规则是通用治理而非组件名特判；代码门禁通过后仍必须做 computed-style + 真实 DOM + 截图三重验收。

---

## 17. 治理体系自我评审与重构计划（唯一总纲）

> 本节是**对本文件第 0~16 节的批判性评审**，并给出取代性计划。若本节与前文条款冲突，以本节为准；前文降级为「取证附录」，不再作为执行依据。
>
> 触发：`mc-max-1789352355339-34750940`（流量监测）生成失败 + 视觉崩坏；用户要求「评审是否能从根源解决、是否补丁式、结合之前整改重新制定计划、拒绝反复重复矛盾、要通用型治理」。

### 17.1 三维度评审结论

| 维度 | 结论 | 判据 |
|---|---|---|
| 现象层 | 🟡 取证扎实，但**同一现象被反复重述** | H-02 与第 11.2/12.2/13.2/15.2 的「颜色错」是同一件事；`2:8856` 被拆成 H-03（误降级 icon）+ H-04（误当刷新）两条 |
| 根因层 | 🟡 收敛方向正确，但**被切成 14 条症状编号** | H-01~H-05 + G1~G9 全部可归约为一句：「Figma 节点事实未形成单一不可变记录，下游各自推断」 |
| 方案层 | 🔴 **会继续打补丁** | 三套契约并存、两套回归矩阵、门禁已 40+ 编号却仍在增殖、与刀 13~22 脱节 |

**核心判断：方向对，组织形式错。** 按「症状编号」组织治理，必然导致每发现一个新组件就新增 H/G 条目与门禁编号 —— 这正是「一个问题反复、重复」的机制性来源。

### 17.2 四类问题举证（重复 / 矛盾 / 补丁 / 脱节）

**（一）重复**

1. **三套契约并存**：第 5.1 `FigmaVisualFacts` + 第 5.2 `HeaderSlotsContract` + 第 14/16 节 `StatefulSectionContract` —— 三者是同一件事的三个切面（header 走 slots、状态型走 items、普通走 children），却写成三个独立契约 → 下游又会各建一套。
2. **两套回归矩阵**：第 7 节「914 回归矩阵」与第 16.4 节「四样本矩阵」未合并。
3. **门禁两套实现**：`ensureGridDisplay`（刀 17，补 `display:grid`）与 `healGridContainer`（补 `display:flex`）都是「容器缺 display」守卫，各写一套；文档只提了后者。

**（二）矛盾**

1. **自相矛盾**：第 6 节 914-E 明确写「不再为每个样本新增互相重叠的规则编号」，但第 16 节又新增 G1~G9 与 4 类诊断。
2. **文档把规划当现状**：第 5/6 节称 `buildFigmaVisualFacts`、`buildHeaderSlotsContract` 为「唯一事实源入口」，但 **grep 全仓 = 0 命中**，代码里根本不存在。实际事实源是分散的 `section-tree.js` / `header-slot-contract.js` / `resource-facts.js` / `class-facts.js`。
3. **验收脚本自打脸**：16.4 声称「证明是通用治理而非组件名特判」，但现存验收脚本是 `scripts/verify-device-monitor.mjs` —— 本身就是**组件名特判**。

**（三）补丁式项**

1. **G7（T1 标题剥离）是第三个补丁**：T1 已补过一次（C2 空壳解绑，`microcode-engineer.js:2504`），G7 又在其上改语义。真正的病是「外壳渲染标题 + 组件内剥离」的**双写架构**，补丁只会继续叠加。
2. **G8（新增 section 去重）与刀 22 P1 重复**：`dedupeByWholeRegionShell` 已治「无归属壳去重」；流量监测的 `tunnel-hourly-chart`/`bridge-hourly-chart`/`flow-prediction`（`src=[]`）**正是该去重的漏网形态**（判别力规则未覆盖 chart 类壳），不是新根因。
3. **G3（渐变 CSS 还原）写法偏补丁**：与 H-02「fills 事实投影」是同一件事，却被写成「补背景」。

**（四）与历史整改脱节**

第 4 节「前期治理评审」**只评到 P0/P1 系列（09-14 凌晨），完全漏掉刀 13~22**（09-13~09-14）。这是 G8 重复、`ensureGridDisplay` 漏评的直接原因。

### 17.3 与历史整改对账表（刀 1~22 + 系列）

| 历史整改 | 本文档当前处理 | 评审结论 | 处置 |
|---|---|---|---|
| 刀 13 COMP-001 真根因 / R3 嵌套 `&` / FLEX-003 静默失效 | 未列 | 漏评 | 补入对账，保留 |
| 刀 14 CODE-024 C3 可修/不可修二分 | 未列 | 漏评 | 保留 |
| 刀 15 / 16b LESS 颜色函数可求值 | 第 4 节已列「LESS 颜色函数治理」 | 一致 | 保留为编译安全层 |
| 刀 16a FLEX-003 选择器目标元素 | 未列 | 漏评 | 保留 |
| 刀 17 `ensureGridDisplay`（grid 缺 display） | 未列 | 漏评 | **与 `healGridContainer` 合并为单一容器守卫** |
| 刀 18 绑定表达式对象键 | 未列 | 漏评 | 保留（管线自伤类） |
| 刀 19 数据键被写成类名 | 未列 | 漏评 | 与 H-03 同源（事实可见但语义写错），并入事实源论证 |
| 刀 20 父容器缺 `display:flex` | 未列 | 漏评 | 同上，并入容器守卫 |
| 刀 21/22 `dedupeByWholeRegionShell` + `verify-device-monitor.mjs` | 第 4 节仅提「slot DOM 去重」，G8 当新根因 | **重复** | 扩展刀 22 覆盖 chart 类壳；脚本改通用断言 |
| 09-13 快照竞态（找不到 TabsSection/MainSection，刷新后消失） | 未列 | 漏评 | 与「重试轮残留累积」**同源**（文件集一致性），合并治理 |
| P0-1/P0-2/P1-1/P1-2 | 第 4 节已评 | 一致 | 保留并入新模型 |

### 17.4 唯一模型：`FigmaFactsTree` + `SectionPlanContract`（替代三套契约）

```text
FigmaFactsTree（唯一不可变事实）
  nodeId → { bbox, type, layoutMode, layoutWrap, fills[], strokes[], resourceKind, imageRef, parentId, children[] }
                    │
                    │ 唯一投影入口 buildSectionPlanContract()（禁止其它入口另建 slots/items）
                    ▼
SectionPlanContract（唯一装配契约）
  plan.sections[] → { sectionId, ownerNodeId, role,
                      slots[],    // header-right / title-left / title-right 等插槽
                      items[],    // switch 两态 / tabs N 项 / 卡片 N 张（按 x/y 升序）
                      children[], // 普通子结构
                      resourceRefs[] }   // 每项带 mountTarget + ownerBlockId + allowedConsumers
```

**关键收敛**：
- header 插槽 = `slots[]`；switch/tabs/card-grid = `items[]`；普通 section = `children[]`。**同一契约，三种投影**。
- **删除** `HeaderSlotsContract`、`StatefulSectionContract` 两个独立契约（并入 `SectionPlanContract`）。
- item 排序、bg kind 判别、text fills **都在 `FigmaFactsTree → SectionPlanContract` 投影时一次性完成**，下游不再推断。

### 17.5 唯一装配器：`assembler`（一次生成，不留残留）

1. 消费 `SectionPlanContract` 生成 index.vue 骨架 + 每个 section 的 DOM + 资源绑定 + 样式投影。
2. **写盘前按契约精确重建文件集**：先清理上一轮多余子组件，再写入本轮文件集（治重试轮残留 → ContentSection 从 5 个回落到契约数）。
3. **section → 组件文件 1:1**（治双 content-section；同时消除 `groupId/componentId` 不匹配）。
4. 组件命名严格由契约推导，禁止 LLM 自由命名 `ContentSectionN`。

### 17.6 唯一门禁：`verifyVisualContract`（编号冻结）

- 合并第 7 节 + 第 16.4 节为**一套矩阵**，输出结构化诊断类型，**不再新增 CODE-0XX/FLEX-0XX 编号**：

```text
node-owner-conflict    一个 nodeId 多落点
unauthorized-node      产物节点无 Figma 来源（如臆造刷新按钮）
resource-misbound      资源目标与 owner/target 不符（含跨区挂载）
missing-resource-render 有资源事实但无合法渲染
text-style-mismatch    文本 computed style 与 fills 事实不符
item-order-mismatch    item 顺序与 x/y 升序不符
section-file-mismatch  section 数与组件文件数不一致
layout-collapse        关键区块高度 0 / 比例错误（含缺 display）
```

- **编号冻结**：现有 40+ 编号保留兼容，但**新问题一律归入上述诊断类型**，不再扩编号。

### 17.7 剔除 / 降级的补丁项

| 原条款 | 处置 | 替代方案 |
|---|---|---|
| G7 T1 标题剥离再改 | **降级** | 标题归属契约化：由 `SectionPlanContract` 决定标题 owner（归组件或归外壳，二选一），**取消双写**；阶段一先把 T1 从「正则剥叶子」改为「按 nodeId 剥离所属子树」 |
| G8 新增 section 去重 | **删除** | 扩展刀 22 `dedupeByWholeRegionShell` 覆盖 `src=[]` 的 chart 类臆造壳 |
| G3 渐变还原 | **合并** | 并入 H-02「fills → CSS 投影」，作为资源事实的一种 |
| `ensureGridDisplay` + `healGridContainer` | **合并** | 单一「容器 display 守卫」 |
| 第 5 节双契约 | **删除** | 并入 `SectionPlanContract` |
| 第 7 节 + 16.4 双矩阵 | **合并** | 单一 `verifyVisualContract` 矩阵 |

### 17.8 分阶段计划（每阶段可独立验收）

**阶段 0（止血，1 步）**：写盘前精确重建文件集 + section→文件 1:1 + 命名由契约推导。→ 直接消除流量监测的 5 个 ContentSection / groupId 不匹配 / 双 content-section。

**阶段 1（唯一模型）**：实现 `FigmaFactsTree` + `buildSectionPlanContract`，把 header slots / stateful items / children 三投影收敛；删除两个独立契约；单测钉死四样本（switch/tabs/device-grid/vehicle）的 item 顺序与 fills。

**阶段 2（唯一装配 + 资源契约）**：`assembler` 消费契约生成 DOM/资源/样式；资源挂载改四重校验（`figmaNodeId+ownerBlockId+mountTarget+allowedConsumers`）；扩展刀 22 去重覆盖 chart 壳；修 C1 同图 `sharedBy` 语义。

**阶段 3（唯一门禁）**：`verifyVisualContract` 落地，合并双矩阵，冻结编号；`verify-device-monitor.mjs` 改通用断言。

**阶段 4（对账收口）**：补齐刀 13~22 对账；合并容器守卫；T1 归属契约化。

### 17.9 章节效力声明

- **第 17 节 = 唯一执行依据**。
- 第 0~4 节：降级为**取证与历史评审附录**（事实保留，执行条款以本节为准）。
- 第 5~7 节：**被 17.4/17.5/17.6 取代**（一模型、一装配器、一门禁）。
- 第 8 节（禁止治标）：继续有效。
- 第 11~15 节：降级为**样本取证附录**（现象/证据保留，根因与方案以本节收敛后的表述为准）。
- 第 16 节：**被本节取代**（G1~G9 中 G3/G7/G8 已按 17.7 处置，其余并入阶段 1~3）。

### 17.10 二次评审修正：从「叠加法」到「删减法」

> 用无预设视角重审第 17 节本身。**第 17 节犯了三个它自己正在批判的错误**，必须当场修正，否则治理会继续发散。

**第 17 节自身的三处错误**

1. **用「追加章节」回应「分散追加」**：第 17 节在物理上仍是本文档的第 17 个章节，与前 16 节并存。「声明取代」不等于「真正删除」——旧的契约（第 5 节）、旧矩阵（第 7 节）、G1~G9（第 16 节）都还在文件里，读者仍会照单全收。
2. **用「新符号」回应「旧符号是画饼」**：上一节批判 `buildFigmaVisualFacts`/`buildHeaderSlotsContract` grep=0（规划当现状），转头又发明 `FigmaFactsTree`/`buildSectionPlanContract`/`SectionPlanContract`/`assembler`/`verifyVisualContract` 五个**同样 grep=0 的新名字**。这是同一件事重演。
3. **用「新诊断类型」回应「编号增殖」**：17.6 一边说「冻结编号不再扩」，一边列出 8 个新诊断类型。这 8 个就是换了皮的编号，与「说不新增 CODE 却新增 G」是**完全相同的矛盾**。

**根源再下一层：整份 914（含第 17 节）都在做同一件事——在 LLM 自由生成之后用规则纠偏。这是对抗式架构：LLM 的错误空间无限，补丁必然无限。** 40+ 门禁编号、刀 1~22、914 的 H/G 编号、3 套契约、2 套矩阵，每一条都是某次失败后追加的纠偏层。继续在这个范式里加规则，治理永远不会收敛。

**通用型治本只有一条：把「视觉确定性事实」从 LLM 职责里剥离，把「生成后纠偏」改为「生成时确定性装配」。**

删减法三步（全部通用，不针对任何组件/任何错误类型）：

1. **圈定「LLM 不该碰」的事实清单**：section 结构树、每个 node 的 bbox、fills/颜色、资源文件与挂载点、item 数量与顺序、布局 display/flex/grid。这些 Figma 里**已经确定**，LLM 生成只会引入错误——**全部从 LLM 职责剥离**。
2. **planner + assembler 确定性接管**：planner 产出**唯一确定**结构（一次去重到位）；assembler 从该结构**直接生成**所有 DOM/资源/样式（无 LLM 参与）；LLM 只在 assembler 预留的「洞」里填 {业务文案、数据映射、交互事件}。
3. **每接管一件事，就删掉对应的后处理/门禁**（收敛，不是发散）：
   - assembler 接管资源挂载 → 删 `autoMountUnusedBackgrounds`/`dedupeSameImageAliases`/`ensureHeaderSlots`；
   - assembler 接管布局 → 删 `healGridContainer`/`ensureGridDisplay`/FLEX-001~005；
   - assembler 接管颜色 → 删 M5-10/THEME-* 颜色后处理；
   - assembler 接管结构 → 删 COMP-001/CODE-021/`dedupeByWholeRegionShell`；
   - planner 接管去重 → 删 `dedupeDuplicateSections` 相关；
   - 确定性命名 → 删 `groupId/componentId` 不匹配类门禁。

**唯一收敛指标（本文档此前完全缺失，也是判断「是否打补丁」的客观标尺）：门禁/规则总数必须下降，而非上升。** 一个让规则变多的「治理」是发散（补丁）；只有让规则变少，才是收敛（治本）。

**执行落点（取代 17.8 的四个阶段）**：不再先造 `FigmaFactsTree` 等新符号，而是从**现有的确定性装配（`buildDeterministicIndexTemplate`）向外扩展其接管范围**——每扩展一类事实接管，就当场删除一个对应的纠偏器，并以「门禁总数下降」作为该批次的验收标准。第一批最小闭环：assembler 接管「section→组件文件集 + 命名」→ 删除「重试轮残留」与「groupId/componentId 不匹配」两类门禁/后处理；再逐步扩展到资源、布局、颜色。

**效力修正**：17.4~17.8 中的新符号（`FigmaFactsTree`/`SectionPlanContract`/`assembler`/`verifyVisualContract`）与 8 类诊断，一律降级为「目标形态的口头描述」，**不作为新增实现契约**；执行以 17.10 的删减法为准。第 17 节其余部分（取证、对账、四类问题）继续有效。

### 17.11 删减法执行方案（具体批次，全部落到真实文件）

> 原则：从现有确定性装配 `buildDeterministicIndexTemplate`（`code-generator.js`）向外扩展接管范围；**每扩展一类接管，当场删除一个对应纠偏器**；以「门禁/规则总数下降」作为每批次验收硬指标。**不先造新符号**，复用现有 `effectiveSections` + `assignSectionComponentNames` 作为「契约文件集」事实源。
>
> 现状基线（已核实，非规划）：子组件文件由 LLM 经 `runChunk(buildTemplateChunkMiddle/buildScriptChunkMiddle)` 生成；`writeFiles`（`file-writer.js:388`）只写入、**不清理磁盘多余文件**（重试轮残留的直接机制）。

#### 批次 1 · 接管「section ↔ Figma 节点归属」（planner 层）—— ✅ 已执行（2026-09-14）

> **方案更正**：原「文件集对账」方案已作废——traffic 缺的是 2 个 ChartSection（不是多文件）、vehicle 是内容重复（不是文件多余），不对症。真实根因在 planner 层：vision schema 示例教 LLM 用语义 id 起 section 名（`preview-analysis-schema.md:70` 示例 `"id": "daily-total"`），`collectSourceNodeIds` 只认 `数字:数字` → 壳 src=[]，且全链路**无任何「vision sections ↔ Figma 节点树」对账** → `dedupeByWholeRegionShell` 判别力双输（真图表壳 ec 小被当碎片杀、假壳 ec 大被判超集留）。

| 项 | 内容 |
|---|---|
| 接管点 | 新增 `anchorPhantomSections`（`section-tree.js`）：在「丢弃/保留」裁决**之前**用 figma 节点树把 src=[] 壳锚定回真实节点——①标题匹配（壳 title ↔ 祖先槽名剥 `slot-` 前缀 / 子树 TEXT 文案，精确优先+双向包含）②顺序对齐（剩余 chart 类壳数组序 ↔ 未覆盖 @echarts 节点 y/x 升序 zip）；锚定成功补 `sourceNodeIds` 救回、无 type 壳按节点事实补 `type='chart'`；锚定失败维持原判别力兜底。接入 `subcomponent-planner.plan()`（`opts.figmaNodeData`），三个调用点全接线（phase2 graph / vue3 graph / planner-node）；assembler 消费 plan 输出自动受益（单点） |
| 删除纠偏 | 本批**删 0**（如实记录）：判别力去重仍是不可锚壳（485d724d/a612a9f7 形态）的兜底，其适用面被压缩但代码未删；收敛主力在批次 2 起 |
| 单测 | `section-tree.spec.ts` +9 例（标题匹配/顺序对齐/type 补全/覆盖排除/端到端 8 壳全保留/无 figmaRoot 兼容/不可锚兜底/幂等/非图表壳不抢节点），37/37 绿；planner 相关 5 套件 42/42 绿；`nest build` ✅ |
| 回放 | **离线真实回放**（traffic checkpoint，无 LLM）：修复前 8→6（2 个真 chart 壳被杀、flow 假壳存活）；修复后 8 全保留，tunnel→`2:7459`、bridge→`2:7628`、flow→`2:3604`（type 补 chart），chart sections=3 ✅ |
| 已知边界 | flow-prediction 的 `internalSubcomponents` 仍含 6 个臆造 chart 子组件（vision 幻觉，复杂度评分 70）——锚定救了文件存在性，内部子组件幻觉属后续批次；真实重生成验证待后端服务可用时补 |

#### 批次 2 · 接管「资源挂载」（import + 绑定 + 落点）—— 🔶 loop 2a/2b 已执行（2026-09-14），2c/2d 待续

| 项 | 内容 |
|---|---|
| 接管点 | **2a** 新增 `buildResourceMountPlan`（`resource-mount-plan.js`）：同 `resourceFile` 固化单变量（首个 assignedVarName 为唯一事实）+ `sharedBy` 全节点；owner 解析 = `figmaNodeId ∈ section.sourceNodeIds`（批次 1 已锚定）→ 不命中沿 figma 祖先链上溯（switch 双态 bg 是状态容器子节点）→ 仍不命中 `owner=null` 归 index 根，**不猜**。**2b** 新增 `mountPlannedResources`：限定 owner 文件挂载（`package/components/{Owner}.vue`），同 var+target 去重（12 卡共享单绑定单 import），sub-state 走 active 条件绑定（作用域限定 owner 文件），icon 尺寸 figmaBox 真值封顶 48px；**fail-closed**——目标不命中只记诊断，禁止跨文件/根回退（旧回退正是「背景消失/错位」根源）。接线：engineer 门禁前单点 + 重试自愈路径（同 helper 幂等）+ code-fix-rules 单规则 `planned-resource-mount`。**2c（源头侧半刀）**：`assignVisualOrderVarNames` 编号阶段同 `resourceFile` 共享 `assignedVarName`（视觉序首条目为唯一事实）+ 非首条目 `isSharedAlias` 标记 + 首条目聚合 `sharedBy`；`formatResourceMapping`/`Compact` 折叠别名条目 → prompt 每张图只列 1 个变量，LLM 多别名引用从源头消失 |
| 删除纠偏 | **已删 3/4**：`autoMountUnusedBackgrounds` + `autoMountUnusedIcons`（-7.8k 字符）+ 2 wrapper + fix 规则 2→1；`dedupeSameImageAliases`（-6.1k 字符）+ engineer 调用点/wrapper + spec 块 3.2k —— 同图多别名在编号阶段根治后，事后合并失去存在理由。**2d `ensureHeaderSlots` 延后（依赖排序修正）**：它治理的是「LLM 未生成插槽 DOM → 头部空白」，其替代物是「插槽 DOM 确定性装配」，属批次 3/4 assembler 职责；现在删＝把「头部空白」缺陷放回，故**不删**，待插槽契约接管后一并删除（其中①插槽名归一/③DOM 去重两个小守卫届时同步收口） |
| 单测 | `resource-mount-plan.spec.ts` 15/15；`visual-order-assign.spec.ts` 新增 5/5（真实 12 卡形态：共享编号/alias 标记/sharedBy/role 独立/幂等）；资源相关 5 套件 81/81 绿；`nest build` ✅ |
| 回放 | 真实形态用例取自 914 §11/§13 取证值（bg-8788/bg-8807/bg-8439、12 卡共享、switch 双态）；真实重生成回放待服务可用补 |
| 门禁数 | 函数级纠偏器 **-3**（另 -3 wrapper、fix 规则 2→1）；门禁编号数不变（这三个是行为纠偏非编号门禁）；新增编号=0 ✅ |

#### 批次 3 · 接管「布局结构」（display/flex/grid + item 顺序）—— 3a/3b/3c 已执行（2026-09-14）

| 项 | 内容 |
|---|---|
| 接管点 | **3a（已执行）**：`figma-section-heights.js` 抽 `alignSectionClasses` 公共对齐 + 新增 `buildSectionLayoutFacts`（section 根 class → `{flexGrow, heightPx, display, gridColumns, flexDirection}`，真值全部来自既有 vision JSON）；engineer 注入 `sectionLayoutFacts` → code-fix-rules 并入 pipeline.context；`fixSectionHeightsForResource` 新增**规则⑤**：布局事实缺则补，**只补不覆盖** LLM 已写 display。**3b（已执行）**：`constraint-reinforcement.js#buildLayoutConstraintReinforcement` 摘除「section 根布局值」要求——改为声明「布局由系统注入（sectionLayoutFacts + 规则⑤），LLM 勿手写/勿覆盖 display/flex/grid」；保留结构数量约束（卡片/列/图表数）；**唯一例外**：双层结构内层栅格（如 @antd/tab 内层 3 列设备栅格）事实表不能表达，内层栅格子约束**仍要求 LLM 遵守**（防塌缩，待事实表支持双层后摘除）。**3c（已执行）**：`references/schemas/preview-analysis-schema.md` 两处示例语义 id（`daily-total`/`jurisdiction-scope`）改为 Figma 节点 id 风格（`2:3550`/`1452:1950`），并加硬约束「section.id 必须用数字:数字，禁止语义字符串」（根治 collectSourceNodeIds 只认数字:数字 → 壳 src=[] 不可锚）。 |
| 删除纠偏 | **本 loop 删 0（依赖排序修正）**：`healGridContainer`/`ensureGridDisplay`/`ensureFlexDirection`/FLEX-001~005 的删除条件是「LLM 不再写布局」——即 3b 完成后**观测触发归零**；`dedupeByWholeRegionShell`/`dedupeDuplicateSections` 的删除条件是「planner 不再产出不可锚壳」——即 3c 完成后**观测触发归零**。**现在删＝拔掉探测器/兜底**。 |
| 单测 | `constraint-reinforcement.spec.ts` **4/4 绿**（原 3 例改写为 3b 语义：外层声明注入+内层栅格例外、grid 顶层不输出内层规则、vertical 声明勿手写）；`figma-section-heights.spec.ts` 9/9；资源 4 套件 67/67；`nest build` ✅ |
| 回放 | 待真实重生成观测 `healGridContainer`/`ensureGridDisplay` 触发次数（目标 0，需 3b 生效若干样本后） |
| 门禁数 | 本 loop 不变（新增编号=0 ✅）；3b/3c 观测归零后删 FLEX-001~005 + 2 布局守卫 + 2 去重器 |

> **依赖排序声明（取代原「一次删完」计划）**：批次 3 的删除对象各有前置：布局类守卫依赖 3b，去重器依赖 3c。**先接管 → 观测触发归零 → 再删除**，顺序不可倒置。3b/3c 代码已落地，等待真实重生成样本验证"探测器不再触发"后即删。

#### 批次 4 · 接管「颜色/文本样式」（fills）—— 🔶 接管前置未就绪，本轮仅记录，不删门禁

| 项 | 内容 |
|---|---|
| 接管点（理想） | assembler 按每个 TEXT node 的 nodeId 绑定 visible `fills/gradientStops` 生成样式，LLM 不生成颜色 |
| 🔴 阻塞事实 | 探查 `figma-connector.js`：**无 nodeId 级 fills 提取能力**（grep `fills/gradientStops/visible color` 为空）。即「assembler 按 nodeId 绑定 fills」的事实源**不存在**，颜色仍只能由 LLM 生成 + 后处理兜底。 |
| 删除纠偏（不可执行） | M5-10 / THEME-COLOR / 刀 19（healClassPrefixedDataKeys）**不能删**——删则颜色错误/数据键类名化复发。 |
| 结论 | 批次 4 的"接管"动作前置缺失，按依赖排序铁律**本轮不动门禁**，仅将此阻塞记入 914 与 memory；待 figma-connector 补 nodeId→fills 提取后，批次 4 才能落地接管并删颜色类后处理。 |
| 门禁数 | 维持基线 34（CODE-001~026 / COMP-001 / FLEX-001~005 / THEME-COLOR / THEME-COLOR-ERROR），未下降（因未删）。 |


#### 批次 3 补充 · 2.1.E 多图互踩（2026-09-14 追加，**真值集驱动版已闭环**）

> 触发：流量监测 `c-traffic-monitor-c6c228fb`（`.checkpoint/visual.json` 的 `charts` = **bar / bar / area** 三种），产物三张图里「流量预测」折线图被画成柱状图。

| 项 | 内容 |
|---|---|
| 根因 | `chart-type-guard.js` 的 `normalizeSeriesInSource(src, block)` 与 `normalizeChartOptionType(option, block)`，其 `block` 只有**一个** `chartType`，调用点取的是 `chartsArr[0]?.type`（`microcode-engineer.js` / `vue3-engineer.js`）→ 全文件所有 `series.type` 都被强制收敛到**第一张图**的类型。多图时「chart A 的真值」被硬塞给 chart B，与 2.1.E 原始事故（真值洗白）同族但更隐蔽：**真值本身合法**，错的是「一个真值跨图适用」这个前提。|
| 与既有守卫的关系 | 2.1.E 原语义是「单图：chartType 由 Manifest/Figma 真值驱动，非法别名 fail-closed」。该语义对单图正确，**多图场景下不成立**——所以不是新增门禁，而是补齐 2.1.E 的适用边界。 |
| 🔴 首版方案失效复盘 | 首版用 `isMultiChartSource(src)`（按**产物源码** series 顶层 type 分布判定多图）。但 T-01 的实锤机制是**逐文件**的：`ContentSection4.vue` 自身只有**一张图**（单 type），永远判为单图 → 走「单图真值覆盖」分支；且该文件产物写的就是**合法名 `bar`**，单图分支 `keepAsIs` 直接放行，**守卫根本没有可改的非法值**。更糟的是 `_truthChartType=chartsArr[0]='bar'`（tunnel 首图）被当成全组件真值传给 4 个文件——这是「首图真值覆盖全文件」的核心危害：**会主动把本应 area 的合法 line/area 改坏**，且对「已写对」的产物无效。故按产物分布判定对 T-01 **完全无效**。 |
| 治本（真值集驱动，§15b.4） | `chart-type-guard.js` 新增 `buildChartTypeTruthSet(charts)`：由 `charts[]` 真值（**真值唯一事实源**，非产物）构造允许集——每种 `chart.type` 经 `resolveEchartsType` 归一后的注册名（流量监测 `bar/bar/area` → 集合 `{bar, line}`，`area` 在 echarts 即 `line` + `areaStyle`）。`normalizeSeriesInSource` / `normalizeChartOptionType` 接收 `block.chartTypeSet`：**逐 series 互不覆盖**——`series.type` 落在集内（`bar`/`line` 等）即合法原样保留，只有落在集外才 fail-closed 收敛到集内（不臆造、不跨图污染）。**「首图真值覆盖全文件」被彻底禁用**。单图（无集合）维持原 2.1.E 真值冻结语义。`isMultiChartSource` 保留为无集合时的兜底自动判定。 |
| 调用点改动 | **非零改动**（首版「调用点零改动」不成立）：`microcode-engineer.js:5686` 与 `vue3-engineer.js:1280` 现构造 `buildChartTypeTruthSet(chartsArr)` 并随 `{ chartType, chartTypeSet }` 传入；日志文案由「真值=首图」改为「真值集={bar,line}」。 |
| 单测 | `chart-type-guard.spec.ts` 重写多图互踩块（**真实 T-01 fixture**：charts 真值集 `{bar,line}`）：`buildChartTypeTruthSet` 归一 / **T-01 核心：area 图（line）绝不被首图真值 bar 覆盖** / 互不覆盖计数 / 集外合法名 fail-closed / 嵌套 type 不被污染 / 单图仍真值覆盖 / `normalizeChartOptionType` 真值集 / 幂等 → 本套件 **53/53 绿**。 |
| 门禁数 | 新增编号 **= 0**（补边界，非新门禁）；纯函数 **+1**（`buildChartTypeTruthSet`，工具函数非门禁）；`isMultiChartSource` 转为兜底。 |
| 参照证据 | 同源样本：设备监测三样本（`54038a3a`/`80021ec7`/`d5cc8a20`）、重点车辆 `c-vehicle-monitor-70347e70` 的对照记录见 `.workbuddy/memory/2026-09-14.md`（rendered.png + mc-preview.png + puppeteer 计算样式）。 |
| 残余 | 守卫只**消除主动破坏**：若 LLM 已把 forecast 图写成 `bar`（c6c228fb 实锤 `ContentSection4.vue:154/176`），因 `bar` 也在真值集内，守卫不会改它。彻底修复需 §16 `StatefulSectionContract` 按「文件→section→chartType」逐文件精确绑定真值（批次 5 同路）。守卫升级使该缺陷**不再被守卫恶化**，但根治仍依赖契约层。 |

#### 批次 3 补充 · 2.1.E/F 形状错配 + RUNTIME-004（2026-09-14 追加，**已闭环**）

> 触发：流量监测 `c-traffic-monitor-6b803ab0`（`mc-max-1789366084119`）运行时门禁**硬 BLOCK** `RUNTIME-004`（预览 `render-error`，`errorType=vue-render`，ErrorBoundary 原文 `xAxis "0" not found`）。详见 §15b.6。

| 项 | 内容 |
|---|---|
| 根因 | `ContentSection4` 是**环形图**（真值 doughnut），LLM 写成 `type:'bar'` + `radius`/`center`（饼图特征 + 错误类型）。echarts 把 bar 当 cartesian → 无 xAxis → `xAxis "0" not found` → mounted 崩溃。属 2.1.E「形状错配」缺口（旧守卫只处理顶层 type 别名）。 |
| 治本 ①（2.1.E） | `rewriteSeriesElementTypes` 新增 `hasPieFeatureKeys`：series 含 `radius`/`center`/`roseType`/`startAngle`/`clockwise`/`selectedMode` 且 type 为 cartesian → 归一 `pie`（doughnut = pie + radius）。饼图特征优先于真值集/单图真值覆盖。 |
| 治本 ②（2.1.F 收敛） | 旧 2.1.F 修正③给 cartesian series **盲注** `xAxisIndex:0/yAxisIndex:0`（假设补索引就安全）。真机证明无轴 option 注入索引**无效**。新增 `hasAxisDeclared` + `rewriteSeriesAxisIndex(arrText, hasAxis)`：**仅当 option 声明轴时才注入**。 |
| 单测 | 形状错配 5 例 + 无轴守卫 2 例 → 套件 **60/60 绿** |
| 真机验证 | puppeteer 双向：`bar+radius`→`CRASH xAxis "0" not found`；`pie+radius`→`OK`。dist 离线回放真实 ContentSection4：`bar+radius/center → type:'pie'`（changed=1），2.1.F changed=0。build ✅，后端已重启（PID 45216）。 |
| 门禁数 | 新增编号 **= 0**；纯函数 +2（`hasPieFeatureKeys`/`hasAxisDeclared`，非门禁）。除减法：2.1.F 修正③「无条件注入」→「有轴才注入」。 |

#### 批次 3 补充 · 2.1.E 形状错配「元素级判定」回归修复（2026-09-14 复查发现，**已闭环**）

> 触发：提交 `7f48773` 自查时发现——`rewriteSeriesElementTypes` 里 `hasPieFeatureKeys(arrText)` 把**整个 series 数组文本**当判定对象。若同一 `series: [{饼图带radius}, {柱图}, {线图}]` 混排，整个数组含 `radius` → **所有元素都被误归一成 `pie`**，柱图/线图被静默改坏（不崩，但类型全错，比原 RUNTIME-004 更隐蔽）。

| 项 | 内容 |
|---|---|
| 根因 | 元素级判定误用**数组级**输入。遍历改写函数在 `bracket===1 && brace===1` 命中 `type` 键时，本应只判**当前元素**，却传入 `arrText`（整个数组）。混排场景下"数组内存在饼图特征"被放大成"每个元素都是饼图"。 |
| 治本 | 进入顶层元素时记录 `elemStart`（`{` 起点，`bracket===1 && brace===0`），命中 type 键时用 `findBalancedSpan(arrText, elemStart, '{','}')` 取**完整元素切片** `elemText`，只对 `elemText` 调 `hasPieFeatureKeys`。2.1.E 形状错配判定归位「元素级」。 |
| 单测 | 新增「同 series 混排 饼图+柱图+线图」用例，断言 pie=1/bar=1/line=1/changed=1 → 套件 **61/61 绿** |
| 回放 | dist 离线回放真实 ContentSection4：changed=1 / 含 pie / 不含 bar（无误伤）；混排回归用例通过。build ✅，后端已重启（PID 51305）。 |
| 门禁数 | 新增编号 **= 0**；不新增函数，仅修正既有判定输入。 |
| 经验（守门人自查清单新增） | 遍历改写类函数中，凡出现 `hasXxxKeys(arrText/wholeSrc)` 而非 `elemText` 即高危——特征判定必须锁定当前元素切片。 |
| 真值源核实 | 已确认 `visual.json.charts[].type` 为 vision 真值（`section-vehicle-distribution` 标 `环形图（doughnut）`，`resolveEchartsType` 正确解析为 `pie`），真值集实际产出 `{bar, pie}`——**2.1.E 真值集是「组件级真值驱动」可达的最佳形态**。`subComponentPlan.effectiveSections` 仅含 `id/sourceNodeIds/title`，**无 `chartType` 字段**，无法做「文件→section→chartType」精确绑定（§16 `StatefulSectionContract` 待建，批次 5 同路）。 |

#### 批次 4 · 接管「颜色/文本样式」（fills）—— 🔶 接管前置未就绪，本轮仅记录，不删门禁

| 项 | 内容 |
|---|---|
| 接管点（理想） | assembler 按每个 TEXT node 的 nodeId 绑定 visible `fills/gradientStops` 生成样式，LLM 不生成颜色；标题归属由契约决定（替代 T1 双写） |
| 删除纠偏（不可执行） | M5-10 硬编码颜色后处理、THEME-* 归一、刀 19 数据键类名化、T1 标题剥离——**本轮不删** |
| 🔴 阻塞事实 | figma-connector 无 nodeId 级 fills 提取能力，颜色事实源缺失 |
| 结论 | 同上方批次 4 详细节（§17.11 批次 4 节） |

#### 批次 5 · 接管「结构完整性」+ 门禁收口—— 🔶 部分基础已落地，删除动作待 3c 观测归零

| 项 | 内容 |
|---|---|
| 已落地基础 | `dedupeDuplicateSections` 已在 subcomponent-planner 生效（子组件 plan 级去重）；`buildDeterministicIndexTemplate` 已生成确定性 index.vue 骨架；`figma-height-ratio.js` 已做 section 级 1:1 配对 |
| 待完成 | planner 输出**唯一** section 集（去重一次到位，依赖 3c 观测不可锚壳归零）；assembler 保证 section→文件 **严格** 1:1（治双 content-section）；删 COMP-001/CODE-021 等 |
| 删除纠偏（待触发归零） | COMP-001（漏组装）、CODE-021（死 import）、剩余已由 assembler 覆盖的编号 |
| 门禁数 | 基线 **34**（CODE-001~026 / COMP-001 / FLEX-001~005 / THEME-COLOR / THEME-COLOR-ERROR），目标个位数；**本轮未删，维持 34** |
| 结论 | 批次 5 的"删门禁"动作依赖 3c 观测归零（planner 不再产不可锚壳）与 3b 观测归零（布局守卫不再触发），二者均待真实重生成样本验证；本轮不强行删，避免退化治标。 |


#### P0-1 追加 · 全 `.vue` 层悬空引用剥离（2026-09-14，**已闭环**）

> 事件：`mc-max-1789376057659-2290591b`（流量监测）在 17:00:31 被判 `RUNTIME-004(preview-status: render-error)` + `RUNTIME-007(HTTP 资源加载错误)` 硬 BLOCK → Phase 2 失败。

| 项 | 内容 |
|---|---|
| 根因（实锤） | 真实崩溃点在**子组件层**：`package/components/ContentSection.vue`（37 行空壳）用 `defineAsyncComponent` 导入了 **7 个从未生成**的兄弟 section（`SubHeaderSection`/`StatGroupSection`/`VehicleDistSection`/`ForecastHeaderSection`/`HourlyChartJinjiangSection`/`HourlyChartBridgeSection`/`ForecastChartSection`）→ 浏览器加载即 404（RUNTIME-007）→ async 组件加载失败抛错 → 整页 render-error（RUNTIME-004）。**同源**，不是两个独立问题。 |
| 既有盲区 | ① `stripUnplannedSubComponentImports`（今日 commit `5461e98`）事实源 `_indexTemplateFacts.componentFiles` **只约束 index.vue 一层**，对子组件层越权 import 零覆盖（实测：index 层悬空 0、子组件层悬空 7）；② `detectDanglingComponentRefs` 能检出这 7 个（已用真实产物验证），但**只发 WARN、不拦不修**；③ 2290591b 跑在 08:46 旧 dist 上，今日代码当时还未 build 部署。 |
| 治本 | 新增 `stripDanglingComponentRefs(files, fileList)`（`section-coverage-guard.js`）——`detectDanglingComponentRefs` 的**修复对偶**，与检测侧共用同一套引用识别正则（同集合）。写盘前对**所有** `.vue` 收口：指向产物中不存在的同目录相对 `.vue` 的 import 一律**整行删除**（① `const X = defineAsyncComponent(() => import('./X.vue'))`、② `const X = () => import(...)`、③ `import X from './X.vue'`；④ 兜底残余裸回调 → `null` 注释），并同步移除模板孤儿标签（⑤ `<X />`、⑥ `<X>…</X>`），保证落盘内容自洽、零悬空、无死声明（避免 CODE-021 / Vue defineAsyncComponent(null) 警告）。 |
| 接线 | `microcode-engineer.js#generateCode` 写盘收口点（`✅ 组件代码分块生成完成` 日志前）：`allFiles` 统一过一遍，命中即 WARN 记录被剥离文件与组件名。fail-open：异常或无可剥离项时原样返回。 |
| 验证（真实产物） | 对 2290591b 的 `package/` 跑 `stripDanglingComponentRefs`：BEFORE 悬空 **7** → AFTER **0**，仅 `ContentSection.vue` 一个文件被改，`HeaderSection`/`ChartSection*`/`ContentSection2~4` 等真实引用**零触碰**；7 个 `defineAsyncComponent(null)` 死声明**整行清除**，保留 `import { defineAsyncComponent } from 'vue'`。 |
| 单测 | `section-coverage-guard.spec.ts` 新增 4 例（越权 import 剥离 / 剥离后自洽 / 存在文件零误伤 / fail-open），36/36 全绿；相关 spec（`code-generator.deterministic-template` / `section-tree`）同步通过，tsc 对本改动文件零错误。 |
| 门禁数 | 维持 **34**（本条是构造保证修复，非新增门禁；`detectDanglingComponentRefs` 原 WARN 保留作观测）。 |

#### P0-1 追加 2 · 悬空引用「剥离」与「解析」收口为单一事实源（2026-09-14，**已闭环**）

> 事件延续：P0-1 修复后巡检发现 **同一概念存在两处实现**（违反「同一概念只允许一处实现」铁律），
> 且旧实现正好对 P0-1 的真实崩溃形态**零覆盖**——若悬空引用在 self-heal 路径才被发现，旧实现会漏剥。

| 项 | 内容 |
|---|---|
| 根因（重复实现） | ① `code-healer.js#pruneDanglingSubComponentImports`（2026-08-30）——正则 `^import X from '...\.vue'` **只认静态 import**，用于 self-heal 路径（`code-healer.js:301` P1-4 降级、`code-fix-rules.js:999` POLISH 阶段）；② `section-coverage-guard.js#stripDanglingComponentRefs`（今日）——认静态 + `defineAsyncComponent(() => import())` 动态形态，用于写盘收口。**两者同概念、能力不对齐**：旧的对 2290591b 的 `defineAsyncComponent` 形态漏剥 → 「自检通过、运行崩」的盲区仍在 self-heal/降级链路上存在。 |
| 根因（解析错位） | 更隐蔽的一处：引用识别正则的前缀 `(?:\.\/)?` 会把 `./` **吃掉**，捕获组拿到的是裸名（`'./X.vue'` → `X.vue`）。原 `detectDanglingComponentRefs` 靠「拼 dir 前缀」判定存在性，而剥离侧若改用 `rel.startsWith('.')` 判相对路径，则**永远为 false** → 把 `import Good from './components/Good.vue'` 这类**存在文件**误判为悬空并误剥。 |
| 治本 | ① 抽出 `resolveSpecifierToPath(fromFile, rel, present)` 作为**悬空解析唯一事实源**：默认按 fromFile 目录解析（`..` 逐级出栈，越界→null），未命中再退化为裸路径直连 present；② `detectDanglingComponentRefs`（报告）与 `stripDanglingComponentRefs`（修复）**共用**该解析器与同一套引用识别正则 → 「报告的」与「能修的」严格同集合；③ `pruneDanglingSubComponentImports` **删除自实现**，改为 `stripDanglingComponentRefs(allFiles, undefined, false)` 的**非变异委派 + 日志**（保持「返回新对象、不改入参」旧契约），并自动获得动态 import 覆盖。 |
| 接线 | 无新增接线（收口既有三处调用点：写盘 choke `microcode-engineer.js:2917`、P1-4 降级 `code-healer.js:301`、POLISH `code-fix-rules.js:999`）。`mutate` 参数区分：写盘 choke `true`（原地改 in-progress `allFiles`）；code-healer 委派 `false`（浅拷贝，保持非变异）。 |
| 验证 | `section-coverage-guard.spec.ts`（36 例）+ `code-healer.spec.ts`（P1-4 降级含「剔除坏子组件后健康子组件零误伤」）**117/117 全绿**；`validators` + `roles/microcode` 全量 **430/430 通过**；`tsc`/`nest build` 通过。委派后旧函数对 `defineAsyncComponent` 形态**新增**覆盖（此前漏剥）。 |
| 门禁数 | 维持 **34**（去重是「减少实现副本」，不是新增门禁；符合「删减法」方向）。 |

#### P0-1 追加 3 · 第三处路径解析副本收口（2026-09-14，**已闭环**）

> 续「继续根治」：抽单一事实源后 grep 发现**第三处同概念实现**——`resource-mounter.js#resolveRelativeVue`（BFS 保留集遍历用，2026-09-08 P0-3 孤儿剔除），静态 import 专用、同样 `startsWith('.')` 门控 + `../` 出栈。

| 项 | 内容 |
|---|---|
| 根因（三处同概念） | 相对 `.vue` specifier → 绝对路径解析在 `section-coverage-guard.detect`、`strip`、`resource-mounter.BFS` 各写一份，行为漂移风险（如其中一处漏 `../` 或误判裸名，孤儿剔除/悬空检测就会不一致）。 |
| 治本 | `resolveSpecifierToPath` **export** 化，`resource-mounter.js#pruneOrphanSubComponents` 删除本地 `resolveRelativeVue` 实现，改为 `present = new Set(keys(allFiles))` + 委托 `resolveSpecifierToPath`。BFS 遍历的保留集解析与悬空检测/剥离**同一套语义**。 |
| 验证 | `resource-mounter.spec.ts`(含 orphan-whitelist) + `section-coverage-guard.spec.ts` + `code-healer.spec.ts` **161/161**；`validators`+`roles/microcode`+`utils` 全量 **1553 通过**（5 个 fail-to-run 是 pre-existing `model-config.js __filename` jest 环境冲突，与本次改动无关）。`nest build` ✅。 |
| 收口后 | 相对 `.vue` 路径解析**仅 `resolveSpecifierToPath` 一处实现**，被 detect/strip/orphan-BFS 三方共用，符合「同一概念只允许一处实现」铁律。 |

#### 批次 3 补充 · 视觉顺序与 flex 比例统一由 Figma bbox 接管（2026-09-14，**已闭环**）

> 触发：用户对 `mc-1789380811352-21e2afd6`（流量监测）截图反馈「糟糕并且可怕」——
> 模块上下颠倒（车型分布跑到两张柱状图之上）、两张**结构完全相同**的柱状图一高一矮。
> 两条现象同一个根因：**Figma `absoluteBoundingBox` 被丢弃**。

| 项 | 内容 |
|---|---|
| 取证 1（顺序） | `analysis.json#subComponentPlan.effectiveSections` 顺序 = 2:3550 → 88:32 → 2:3660 → **2:3438(车型分布)** → 2:3565 → chart-jinjiang → chart-bridge → 流量预测。真图表节点由 `anchorPhantomSections` 追加在**尾部**，所以「车型分布」恒在两张图之前。 |
| 取证 2（比例） | `layoutMetadata.flexGrow` = 3.73（隧道图）/ 0.952（大桥图），3.9 倍差；而 Figma 实测 `2:7459` 与 `2:7628` 高度**都是 131px**。vision 自报系数纯属臆造。（另：所有 `layoutMetadata.height` 全为 0 —— `extractLayoutMetadata` 只读 `absoluteBoundingBox/size/height`，漏了已有的 `styles.figmaHeightPx`。） |
| 事实源在哪 | `planner.plan(state.layoutStructure, { figmaNodeData: state.figmaNodeData })` —— planner 内部**已持有**带 `absoluteBoundingBox` 的 Figma 节点树；`anchorPhantomSections` 早就在消费它。 |
| 治本 1（顺序） | 新增 `section-tree#sortSectionsByFigmaY(sections, figmaRoot)`：可解析者按 `(y, x)` 升序**占回原槽位**，几何缺失者保持原位，可解析者 <2 或 `figmaRoot` 缺失则原样返回（旧调用方零影响）。planner 在 `anchorPhantomSections` **之后**调用（臆造壳此刻才拿到 `sourceNodeIds`）。 |
| 治本 2（比例） | 新增 `planner#applyFigmaHeightGrow`：逐层按 `高度 / 本层平均高度` 重算 `flexGrow`（平均值=1，即 prompt 契约里 flexGrow 的定义），覆盖 vision 自报值；`type==='header'` 的 section 不参与分配也不污染均值。铁律：**事实源优先于 LLM 猜测**（同刀 16b）。 |
| 治本 3（单一事实源） | Figma 节点索引抽为 `indexFigmaNodes` / `figmaSectionBox` 并 export，`anchorPhantomSections` 一并改用（原先各自 walk 一遍节点树 → 存在漂移风险）。 |
| 已证伪并回退的方案 | 「planner 入口统一复用 `isChromeOnlySection` 过滤游离 `sub-header`」。实证：raw section 全为 `role:'inline-row'`、`children[].role==='item'`，而 `hasBusinessBody` 业务正则含 `item` → **恒为 true** → 该判据对 inline-row **永远返回 false**（死判据，加了也不生效）；且它命中即**整节剥离**，会连「当日总流量」「流量预测 tabs」一起删（上游 `headerSlots: []`、`chromeSectionDiagnostics: []`，无兜底）。与「chrome 剥离仅微码」既有契约也冲突。→ 已回退，并留禁令注释说明真正事实源在 `visual-parser#_postProcessAnalysis#stripChromeSectionsInPlace`。 |
| 验证 | `section-tree.spec.ts` + 新增 `subcomponent-planner-visual-order.spec.ts` **49/49 绿**（含真机 8-section fixture：断言还原设计序、两张等高图 grow 必须相等、无 `figmaNodeData` 时原样退回 vision 序与 3.73/0.952）；`roles/__tests__`+`utils` 全量 **89 套件 / 1147 通过**，失败集与**同仓 stash 基线**逐字一致（4 套件 `import.meta` 加载失败 + `manifest-auditor` golden hash，均既有）；`nest build` ✅；重启后 `/api` 与带 `Token: dev-local` 的 `/api/component/list` 均 **200**。commit `d0de018`。 |
| 仍待做 | `ContentSection.vue` 左右站点语义对调（江阴靖江长江隧道 34,620 应在左）、`88:32`/`2:3565` 这类**命名撞 chrome 词表的内容行**应归并为其所属 section 的 header 而不是独立兄弟组件——两者都还未治。 |

#### 批次 3 补充 2 · inline-row 成员顺序按 Figma x 收口（2026-09-14，**已闭环**）

> 续「继续治本」：上一条把**section 之间**的顺序交给了 Figma y，本条治 **section 之内**的成员序。
> 事故现象：总流量统计卡左右写反（左=江阴大桥 82,379 / 右=隧道 34,620），class 与被挂的值也错位。

| 项 | 内容 |
|---|---|
| 取证（真机坐标） | `2:3660` 的 children 数组序 = `[2:3680(x=271.83), 2:3683(x=42.83)]` → **正好倒序**；`88:32` 的 = `[2:3545(x=315.83,y=158.69), 2:3559(x=35.83,y=161.82)]` → 24小时框更高导致 y 更小，同样倒序。LLM 默认「数组序 = 左到右」→ 必然对调。 |
| 根因 | `rebuildSectionsPreservingInlineRows` 第 70 行直接 `groups[g].map(...)`，而 `groups` 是按 **y 升序**扫描 `rows` 得到的；行内兄弟 y 相同/近似 → 稳定排序 = 保留原始数组序 → members 可能是「右→左」。**只按 y 排，从未按 x 排。** |
| 契约破裂 | 消费端 `inline-row-merger` 的注释明确写「其 children 为 members（**按 x 升序还原左右顺序**）」——生产端从未满足该契约，是「契约假设与实现不一致」。 |
| 治本 | members 改为按 `bbox.x` 升序（y 作次级 tiebreak）排序后再映射 id；`@returns` 显式固化「`members` 方向 = 视觉左→右（按 bbox.x 升序）」。一条修复同时覆盖 `2:3660` 与 `88:32` 两处倒序。生产者全仓唯一（仅 visual-parser 调用），修复点唯一。 |
| 验证 | 新增 `inline-row-rebuilder.spec.ts`（该文件此前**无任何 spec**）5 例：断言 `2:3660 → ['2:3683','2:3680']`、`88:32 → ['2:3559','2:3545']`（y 序与 x 序相反时以 x 为准）、本就 x 序者零变化、三成员行、以及下游 merger 的 `children` / `body.children` 顺序契约。+ merger 既有 20 例零回归 = **25/25**；`roles/__tests__`+`utils` 全量 **90 套件 / 1152 通过**，失败集与同仓基线逐字一致；`nest build` ✅；dist 同步（rebuilder:1 / section-tree:0）；重启后 200。commit `6afb307`。 |

#### 批次 3 补充 3 · 真机产物离线重放的两个结论（2026-09-14，一条**证伪**、一条 backlog）

> 用真机 `figma.json` + `visual.json`（同一 Figma 节点 `2:9778`）离线重放确定性管线（不调 LLM），
> 验证顺序/比例/成员序三处治本。结论一为**已证伪并回退**，结论二列入 backlog。

| 项 | 内容 |
|---|---|
| 重放结论 A（证伪 → 已回退） | 曾尝试把 `anchorPhantomSections` ⑤ 的候选池拆成「祖先槽名」与「子树可见文本」，并**只对 chart-ish 壳开放槽名**，以避免同名行壳按槽名抢走图表节点。**该改动被证伪**：现有 spec 中 `flow-prediction`(title=流量预测) 正是靠「槽名匹配」锚定到 `slot-流量预测` 下的图表节点——它与被指控的 `daily-total` 走的是**同一条规则**，限制 chart-ish 会破坏既有意图行为。→ 已 `git checkout` 回退，未进 dist。**教训：锚定规则是否该收紧，必须先确认被指控样本与既有 spec 样本是否同规则。** |
| 重放结论 B（backlog，未修） | 重放 sibling 任务（`mc-max-1789101504359-1a29a03f`）发现：vision 为**已被 inline row 覆盖**的内容多造了一个幻影壳 `daily-total`（title 与柱状图的槽容器名 `slot-当日总流量` 同名）→ ⑤ 按槽名精确命中，抢走 `2:7459`（隧道柱状图）→ ⑥ 顺序 zip 整体错位（tunnel→`2:7628`、bridge→`2:3604`）→ **顺序与 flex 比例被同时写错**。也就是说：**锚定正确性现在是顺序/比例正确性的前提**，幻影壳未去重会把新治本带偏。真机 `21e2afd6` 无此形态（幻影壳恰好 3 个 = @echarts 节点 3 个），故本轮报的事故与本项无关。 |
| 附带发现（低风险，未改） | `figmaSectionBox` 只读 `sourceNodeIds`，不读 `figmaNodeId`；planner 路径无碍（`collectSourceNodeIds` 已回退到 `figmaNode/nodeId`），但直接对 merger 产物调用 `sortSectionsByFigmaY` 会因无 `sourceNodeIds` 而整条 no-op（重放已复现）。 |

#### 贯穿验收（每批次必过）

1. `grep -rE "CODE-[0-9]{3}|FLEX-[0-9]{3}|COMP-[0-9]{3}|THEME-" src/ai-engine/validators/ | sort -u | wc -l` **逐批下降**；
2. 新增门禁编号 **= 0**；
3. 每批至少 1 个真实组件重生成 + 截图对照（设备/流量/重点车辆轮换）；
4. 回滚：每批独立 commit，标注被删函数，失败即 revert 该 commit（不回退已删的旧门禁，只回退新接管逻辑）。

## 批次 4 · 内容/渲染可信度治理（2026-09-14 晚）
事故源：c-traffic-monitor-29570c8e（flex 修复后仍"效果差"）。核心教训：**mc-preview.png 是 Figma 设计图复用（md5 与 temp-preview-images 一致），用它论证"渲染好"是循环论证**；该组件生成时前端 2610 不可达 → RUNTIME-001 降级放行 → 从未真实渲染即发布。

1. **刀⑦ `.less` 残留 SFC 标签剥离**（file-writer#sanitizeFileContent 增加 .less/.css/.scss 分支）：4bda6d13 实锤 common.less:306 残留 `</style>` → LESS 门禁 BLOCK。此前只有 prompt 约束（lite/page-skeleton 才有剥离）。spec file-writer.spec.ts 5 例。
2. **刀⑤ RUNTIME-001 降级可见化**：phase2/vue3 两图 complete 节点把 runtimeVerified:false + issues 写入 component-meta.json（不再静默）。
3. **刀③ mc-preview 语义**：`mc-preview.png` 一直是管线下载的 Figma 设计预览图，合法用途是微码组件缩略图和布局识别；它不是实际渲染截图，也不应被拿来证明生成效果。此前临时增加的 `mc-design.png` / `previewIsDesign` 方案已回退，`ensurePreviewImage` 恢复原行为。真正的生成效果证据仍是 `screenshot.png`。
4. **刀①左右序守卫 + 刀②内容错装守卫**（utils/section-content-guard.js，验证优先不自动改）：Figma 子树文本（t-/d- 前缀归一化）+ bbox.x 为唯一事实源。真机抓到 88:32/2:3660 两处左右反 + 3 处跨组件重复文本。签名选「组件文件中出现最少」的文本消歧（标题类文本跨 tabs/车型分布重复）。spec 5 例。两图 complete 节点留痕 component-meta.contentMappingIssues。
5. **刀⑥ 渲染自给自足**：评估=需自建无头 SFC 打包渲染（=重实现前端预览），P2 工程，本轮不做；由⑤兜底可见化。screenshot-renderer 仍依赖 2610/2611（Vite 易静默退出），这是后续阶段 E 的环境脆弱点。
6. **更正 TEXT-001 结论**：`code-healer#fixTextSiblingOrder` 并非死代码，已由 `code-healer.js`、`code-fix-rules.js` 和 `vue3-engineer.js` 接入，并委托 `text-order-guard#fixTextOrderDrift`。但其覆盖范围仅是同一父节点下的直接 TEXT 兄弟顺序，不能解决 `2:3660` / `88:32` 这类复合成员的标题、数值配对和跨组件归属，因此仍需内容契约与后续高置信 assembler。

## 真机验证方法（可复用）
- 预种子共享缓存 `temp-components/_shared-cache/{fileKey}/{nodeId}/`（figma.json+visual.json 取 clean 无 daily-total 的 sibling，meta.json cachedAt=now 否则 24h TTL miss）→ `POST /api/phase2/generate` `reuseCache:true` + `-H 'Token: dev-local'`（SessionGuard 必须带）。
- 渲染验证必须前端 2610 在线，否则 RUNTIME-001 降级（产物 meta runtimeVerified:false）。

## 更正（2026-09-14 深夜）：刀③ 前提错误，已回退
- **mc-preview.png 本就是 Figma 设计预览图**，合法用途=微码组件预览图缩略图 + 布局识别，不是"冒充渲染"。
- 回退 commit：phase2.service ensurePreviewImage 恢复原样（backend 0b0dc4b）。
- 真正该修的：**L0-B 软失败短路**（code-structure-validator 重试耗尽 `return 'complete'`，绕过 generate-runtime-verify）→ 真实渲染截图 screenshot.png 无法产生，用户永远看不到真实效果。真渲染是 screenshot.png（screenshot-renderer 经前端预览页产出），与 mc-preview.png（设计图）是两回事。

## 通用治理计划 · 确定性事实剥离（执行总纲，2026-09-14 20:54 起按序执行）
> 状态说明：本节不是“已完成”声明。A~E 是执行顺序；每阶段完成前只标记已落地的具体文件、测试和证据，不把目标形态名称当作现有实现。

目标：把「LLM 不该猜的确定性事实」系统性剥离到 planner/assembler，让生成质量不依赖 LLM 运气。
原则：同一概念单点事实源 + 全链路接入 + 落盘闸门收口 + 每阶段可验证。

事实源分层：
- L1 确定性（Figma 直读，LLM 禁管）：布局结构/flex 比例/成员顺序/文本内容与归属/实测颜色尺寸。
- L2 半确定：语义命名（class 名）、组件拆分。
- L3 纯 LLM：视觉修饰、交互、mock 细节。

阶段（依赖序）：
- A 事实源收口：单一 section-facts（sourceNodeIds/bbox/方向/成员title+value+x+color/子文本清单），全部消费端改读此层。
- B 确定性 inline-row 成员生成器：horizontal 且成员可完整解析 → assembler 直接产出成员卡片（顺序/标题/数值/颜色全确定）；解析不全回退 LLM。
- C 守卫升级自愈：①② 从留痕 → 高置信确定性修复（唯一归属文本从非归属组件删除、横向成员按 x 重排），低置信 BLOCK+定向重试。
- D 视觉覆盖门禁：真实渲染截图 vs 设计稿像素/元素级比对（backlog 老账）。
- E 渲染自给自足：screenshot-renderer 不依赖前端 dev server（⑥ 收尾）。

每阶段验证纪律：离线重放 → 真机重生成（前端在线）→ jest 基线逐字同名同数 → commit。

## 阶段A 细化 · 事实源收口（当前执行记录）
定标：结构事实暂以 `section-tree#indexFigmaNodes` 为共享入口（flat Map `id → {name,type,bbox,parentId}`）；section 几何以 `figmaSectionBox` 为共享入口；直接 TEXT 兄弟顺序仍由 `text-order-guard#collectFigmaTextSiblingGroups` 负责。这里的“共享入口”只表示当前已存在且已核实的公共能力，不表示全仓已经唯一化。

**A0 盘点结论（已完成核对，2026-09-14）**：`indexFigmaNodes` 并非全仓唯一索引；`section-content-guard`、`inline-row-rebuilder`、`inline-row-merger`、`container-rebuilder`、`tab-resource-guard` 等模块仍有局部索引/文本/bbox 实现。`text-order-guard` 有真实消费者，不是死代码。`inline-row-rebuilder` 虽导入 `inferFlexDirection`，仍重复实现 `bb/xOverlap/yOverlap/sideBySide`，尚未完成几何事实收口。`inline-row-merger` 与 `container-rebuilder` 职责不同，不能通过合并文件解决重复问题。

**A0 处理边界**：A 阶段只收口可安全共享的底层事实（节点索引、父子邻接、文本原始记录、文本归一化、bbox 几何 primitive）；不合并 TEXT-001 直接兄弟顺序、section 内容归属、标题/数值配对、inline-row 聚类/合并、纵向容器重建和 header slot 业务裁决。

现状（以 A0 盘点为准）：`indexFigmaNodes` 已被 `subcomponent-planner`、`section-content-guard`、`section-tree` 内部等消费，但不是全仓唯一索引；`figma-height-ratio`、`visual-parser`、`figma-connector`、`flex-direction-inferrer`、`inline-row-rebuilder`、`inline-row-merger`、`container-rebuilder`、`tab-resource-guard` 仍需按返回契约逐一评估，不能依据旧的命中数直接替换。

A1 消除并行实现（源码收口已完成，批次验收 ✅，2026-09-15）：
- `section-tree.js` 已提供兼容性底层事实接口：`indexFigmaNodes` 保留 `rawNode`，并新增 `buildChildrenMap`、`normalizeFigmaTextName`、`collectSubtreeTexts`、`getFigmaBox`、`areBoxesSideBySide`；保留需要 `children/characters` 的调用方能力，没有强行改变业务返回契约。
- `section-content-guard.js` 已删除私有 children/text 实现并改用共享入口；section 内容归属、成员配对、重复文本仍是它自己的业务裁决。
- `inline-row-merger`、`container-rebuilder`、`tab-resource-guard`、`figma-height-ratio`、`flex-direction-inferrer`、`inline-row-rebuilder` 已按返回契约迁移底层 index/bbox/几何消费，未合并业务职责。
- 离线真实 fixture 重放：498 个索引节点、105 个 TEXT、88 行；`2:3660` 成员按 bbox.x 输出 `2:3683 → 2:3680`。
- A1 相关 Jest **8 套件 / 124 测试全绿**；context shadow 回归 **147 个完整样本库存、选取 5 个、5/5 通过**（invalid=0、rawFieldLeak=0、sizeMismatch=0、budgetFailure=0）。
- 真机验收：任务 `mc-1789407629732-7e044a94` completed；2610/13030 在线；真实渲染截图 `.mc-gen/screenshots/mc-1789407629732-7e044a94-rendered.png` 67,431 bytes；`component-meta.json.runtimeVerified=true`。该产物仍记录 `memberOrderIssues` 和跨组件重复文本，证明 A1 只完成底层事实收口，不能冒充 B/C 内容治理完成。
- `npm run build` 已通过并刷新 `dist`，`git diff --check` 通过。

A1 已知边界：
- 全量 Jest 仍有仓库既有失败集：ComponentService 权限 2、manifest golden hash 1、HttpExceptionFilter 1，以及若干 `import.meta` / 重复 `__filename` 加载失败；未观察到 A1 相关 suite 失败。
- 当前运行中的 13030 是 build 前进程；下一阶段真机验证前必须按 runbook 先确认端口释放并重启到新 dist。

A2 收敛下游重复（A1 验收后）：按返回契约和调用方向评估 `header-slot-validator` / `inline-header-slot-inferrer` / `header-relation-validator` 等剩余局部事实；每次只收口一个底层事实，不合并业务裁决。
A3 header slot 三处收敛（独立批次，A1/A2 后）：`header-slot-validator` / `inline-header-slot-inferrer` / `header-relation-validator` 的底层节点事实可共享，但 slot 归属裁决仍需单独验证，不能先删任何一个入口。
A4 prompt 反复要求收敛（低风险，A 阶段后半）：先盘点实际引用和冲突，再将 flex/layout 规则收敛到 `layout-rules.md` 单一片段；其余只引用，不重复重写。
不动（生产者保留）：`figma-connector`（Figma API 生产者）、`visual-parser`（视觉分析生产者）；它们可以输出事实，但不应承担下游裁决。

## 阶段 B · 高置信统计型 inline-row 确定性成员装配（执行记录）

**定标**：只对满足高置信条件的统计型横向 inline-row 做确定性成员配对；不满足条件时整节回退 LLM，不产生半确定性混合结构。

**B1 判定与装配纯函数（已完成 ✅，2026-09-15，commit `3e56f77`）**：
- 新增 `utils/inline-row-assembler.js`（纯函数，仅依赖 `section-tree.js` 共享事实）：
  - `assessStatRowConfidence(section, figmaRoot, opts)` → `{verdict:'high'|'fallback', members?, reason?}`。
    高置信条件（全满足才 high）：① 横向 section；② ≥2 成员（sourceNodeIds 排除自身，或 children[].figmaNode）；③ 每成员子树恰好「1 标题 + 1 数值」；④ bbox.x 可解析且严格递增；⑤ 标题/数值跨成员唯一；⑥ 成员子树无图片资源。
  - `assembleStatRowMembers(section, figmaRoot)` → high 返回按 x 升序的 `[{figmaNodeId,title,value,x}]`，否则 null。
- 职责边界：不合并 `inline-row-rebuilder`（几何聚类）、`inline-row-merger`（结构变换）、`section-content-guard`（验证）——本模块只做「高置信判定 + 成员配对」。
- 接入 `section-content-guard.js#buildSectionContentContract`：横向 section 先跑 assess，high → `deterministic:true`（配对含 figmaNodeId）；否则 `deterministic:false` 走既有 LLM 兜底。
- 接入 `microcode-engineer.js` 内容契约注入：`deterministic:true` 用命令式文案「成员配对已由系统确定性确定，禁止互换标题/数值、禁止左右调换、严格按此顺序渲染」。
- 真实 fixture 离线回放（`_shared-cache/1t7Dmmpsl5i0PC8BJt2QLf/2:9778`，c-traffic-monitor）：
  - `2:3660` 统计行 → high，成员按 x 升序配对「江阴靖江长江隧道/34,620 左、江阴大桥/82,379 右」（正确）；
  - `88:32` sub-header（成员无数值配对）→ fallback(member-shape-mismatch)，整节回退 LLM；
  - 关键事实：merger 的 children[].figmaNode 已正确排除 bg 帧 `88:34`，`collectSourceNodeIds` 只收两统计成员，判定不受背景帧干扰。
- 测试：新增 `inline-row-assembler.spec.ts`（12 用例）+ `section-content-guard.spec.ts` 更新 deterministic 正负例；相关 6 suite / 97 tests 全绿。
- `npm run build` 通过，dist 含新模块。

**B2 真机验证（已完成 ✅，2026-09-15，任务 `mc-1789429951534-63bf998c`）**：
- 重启 13030 到最新 dist（PID 53143 → 70196），2610/8080 在线，`reuseCache:true` 重生成。
- 结果：status=completed、error=null、`degradedFiles=[]`、`runtimeVerified=true`（真实渲染链路正常）。
- **`duplicateTextIssues=[]`（消失）**：A1 曾报「24小时/当日总流量」跨组件重复，命令式 prompt 对此生效。
- **`memberOrderIssues` 仍在**（2:3660）：`ContentSection.vue` 仍左右反 + 卡片内标题/数值 class 互换
  （`stat-value` 装「江阴靖江长江隧道」、`stat-name` 装「34,620」）。
- 用 dist 模块对真机 `analysis.json` 复核：`2:3660 → high`（配对「隧道/34,620 左、江阴大桥/82,379 右」正确）、
  `88:32 → fallback`。**deterministic 配对正确产出，但命令式 prompt 无法保证 LLM 遵守**。

**B 结论（真机证伪 prompt 层）**：
- 命令式 prompt 对「跨组件重复文本」有作用（duplicateTextIssues 消失），但对「统计行成员左右配对 / 卡片内标题数值互换」**无效**——LLM 写子组件模板时仍按自身判断猜配对。
- 印证阶段 B 立项判断：「prompt 只能预防，不能保证复杂统计成员配对」。
- **必由之路 = 结构层接管**：让模板确定性装配器直接消费 `deterministic` 配对，生成统计行模板（标题+数值+左右序），跳过 LLM；prompt 层到此为止，不再追加更硬的措辞。

**B3 结构层接管（已完成 ✅，2026-09-15，commit `779a6cb`）**：
- 新增 `inline-row-assembler.js#healStatRowMemberPairing`：**内容驱动**（用 title/value 文本识别槽位，
  不依赖 class 名——LLM 的 stat-name/stat-label 不稳定），严格前置校验（数量/集合匹配、已正确 no-op），
  按 x 升序重写标题/数值槽位文本 → 修复「左右反」。
- 接入 `microcode-engineer.js`：generateCode 早期用 `assignSectionComponentNames` + `assessStatRowConfidence`
  构建 `statRowHealMap`（子组件名 → 确定性配对）；genSubComponents worker 写盘前对命中子组件调 heal。
- 真机验证（任务 `mc-1789432238423-683674de`）：结构层接管日志出现；**`memberOrderIssues=[]`（归零）**——
  A1/B2 都报 2:3660 左右反，结构层接管后彻底修复。产物 ContentSection.vue 标题/数值/左右序全部正确。

**B 结论（结构层接管生效）**：
- 命令式 prompt 无效（B2 实证）→ 结构层接管（写盘前用 facts 确定性对齐 stat 文本）生效，`memberOrderIssues` 归零。
- 印证：**确定性事实必须在生成/写盘链路里由代码强制落盘，不能只靠 prompt 措辞**。

**B 已知边界/残留（后续低优先）**：
- class 互换（标题装进 value 类）：内容驱动只重排文本顺序、不改 class 结构；B2 形态的「卡片内 title/value
  class 互换」残留（文字内容+左右序对、字号错）。需 CSS 字号识别或确定性 class 生成根治。
- `duplicateTextIssues` 偶发（LLM 写重复文本，非系统性）；LLM 偶发拒绝（返回「我需要澄清」非 JSON，重试即成功）。

**B 后续（下一阶段）**：
- 阶段 C（守卫分级：高置信自愈/中置信诊断/低置信 BLOCK）、D（真实截图视觉验证）、E（渲染链路隔离 2610）仍 pending。
