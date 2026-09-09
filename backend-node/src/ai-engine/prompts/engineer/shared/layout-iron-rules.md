## 📐 flex 布局铁律（P0-4）
- 纵向堆叠（从上到下）**优先用块级流（默认 block）**，不要为了"看起来整齐"给每个容器都加 `display:flex; flex-direction:column`。
- **仅当需要以下能力时才使用 `flex-direction: column`**：
  1. 剩余空间分配：某子元素要 `flex: 1` 吃满父级剩余高度（如"固定 header/footer + 弹性中间"的面板结构）；
  2. 垂直对齐：需要 `align-items` / `justify-content` 对齐多个子元素。
- **硬性配套（必须成对）**：凡 column-flex 容器内存在 `flex: 1` 子元素，父容器与子元素**都必须写 `min-height: 0`**（flex 子项默认 `min-height:auto`，内容一多就会撑破父级，echarts/表格类容器尤其致命）。
- ❌ 禁止：单层只放一两个块级子元素、无 flex 子属性（无 flex:1 / 无 align / 无 justify）却加 `display:flex; flex-direction:column` —— 与块布局完全等价，纯冗余，还会引入 flex 格式化上下文。
- ✅ 横向排列（图标+文字、tab 列表、统计卡）才用 `flex-direction: row`。
