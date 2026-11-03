# 🚫 代码生成强制规范清单（违反即失败）

**在开始编写代码前，必须确保以下规范100%执行：**

## 1️⃣ 资源使用（RESOURCE_UTILIZATION）

🔴 **bg 资源（背景图）— 必须使用**：
- 已下载的 bg1, bg2, bg3 等背景图资源**必须**在模板中通过 :style backgroundImage 引用
- **禁止**用 CSS gradient 替代已下载的 bg 资源
- **禁止**用纯色 background 替代图片背景资源
- 🛡️ **使用位置判定（重要）**：
  - 「用法: backgroundStyle」的 bg：仅在 layoutStructure.backgroundImage（根容器/content）或 section body 明确标注该背景图时才作为整体背景；否则说明它属于某个具体区块，必须放进对应区块
  - 「用法: backgroundBlock」的 bg：**只允许**作为具体卡片/区块的局部背景，**绝对禁止**贴到根容器或整面板背景
  - **横向装饰横幅**（宽高比 > 2.5，如 852x184）：是区块内的装饰元素，用 backgroundSize: 'auto 100%' 或适当尺寸放在对应区块（如统计数字之间的装饰条），**禁止** '100% 100%' 拉伸到根容器

🟡 **icon 资源（图标）— 按需使用，不强求**：
- 已下载的 icon1, icon2 等图标资源**建议使用，但不强制**
- 只有当该 icon 在布局结构（layoutStructure）中有**明确的自然位置**时才使用
- **如果找不到自然使用位置，不要强行插入！**强行塞入会破坏布局（如 icon 跑到 subheader 或卡片右上角）
- **禁止**用内联 SVG 替代可用 icon 资源（仅当使用该 icon 时适用）

🔴 **icon 归属判定（RESOURCE_DOM_MAPPING）— 防止用错图标**：
- 每个 icon 必须放回 `resourceDomMapping` 标注的**原始 DOM 位置**——映射表记录了它属于哪个区块/哪个元素，禁止跨区块挪用。
- **装饰性图形 ≠ 功能图标**：Figma 中的 Group/Frame 矢量组（如菱形、圆环、光效、波纹）是装饰元素，常见于数值周围或卡片角落；**禁止**把这类装饰图当成章节标题图标、列表 bullet 或按钮图标使用。
- **尺寸是重要线索**：与设计稿中标题文字（14-20px）相当的小图才是标题图标；宽高 ≥40px 的矢量组几乎一定是装饰元素，只能放在它原来的位置。
- **拿不准就不放**：若 `resourceDomMapping` 中某 icon 的归属不明确，宁可不渲染该 icon，也不要猜一个位置塞进去。

✅ **通用规则**：
- **标准变量名**：bg1, bg2, bg3, icon1, icon2, icon3, img1, img2 等
- 在模板中通过 :src 或 :style backgroundImage 引用这些变量
- **禁止自行编写 import 语句**，系统会自动注入
- **backgroundSize/backgroundPosition/backgroundRepeat 必须从 layoutStructure 中精确还原**，不要默认使用 cover/center/no-repeat

🔴 **只能引用「资源清单里真实存在」的变量（防臆造，高频严重违规）**：
- 允许引用的变量名 **完全等于** 上方资源清单 / `resourceDomMapping` 列出的那些，**一个都不能多**
- ❌ 致命错误：清单只有 bg1~bg3，却写 `url(${bg4})`、`url(${bg5})`
  → 系统只为真实资源注入 import，臆造变量最终**没有任何 import**，运行时直接报错或静默渲染失败
  （实测后果：Tab 激态背景、设备卡片底图整块消失）
- ⚠️ **资源清单为空（0 条）时**：模板里**禁止出现任何** `bg*` / `icon*` / `img*` 变量引用，
  该元素的视觉一律用 common.less 的 CSS（纯色 / 渐变 / 边框 / 圆角）表达
- 拿不准某个变量在不在清单里 → **不要引用它**

⚠️ **Figma 数据精确还原要求**：
- 必须使用 Figma 数据的精确像素值（禁止估算）
- 颜色从 fills.color 精确转换（r*255, g*255, b*255）
- 圆角从 cornerRadius 提取
- 阴影从 effects 提取（DROP_SHADOW → box-shadow）
- 边框从 strokes 提取
- 子组件高度按 Figma bbox 真实比例分配（禁止平分）
- 纯色背景用 CSS，禁止用 background-image

**正确示例**：
```vue
<template>
  <div :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <img :src="icon1" />
  </div>
</template>
<script setup>
// 不要写 import！系统会自动注入 bg1, icon1 等变量
</script>
```
