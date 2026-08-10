/**
 * Vue3 Engineer - 普通 Vue3 组件代码生成器（C2/C3 新管线）
 *
 * 与微码工程师（microcode-engineer）的差异：
 * 1. 面板头部与背景 **真实还原**（微码流程为接入宿主 base-panel 而剥离头部/背景）
 * 2. 产物是标准 Vue3 组件包：<template> + <script setup>(JS) + <style lang="less" scoped">
 *    主组件 package/index.vue + 子组件 package/components/*.vue（按功能拆分）
 *    + 共享样式 resources/styles/{index,common,theme-vars}.less（仿微码 less 结构）
 *    **不含** declare.json / component.js / base-panel / $mcComponentBuilder / runtimeBuilder
 * 3. 复用父类的分块调用、截断重试、分隔符解析、文件写盘、资源 import 注入能力
 *
 * 设计参考：VUE3-GENERATION-DESIGN.md §2/§3/§4
 */

import { MicrocodeEngineer } from './microcode-engineer.js'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { createLogger } from '../logger/index.js'
import { sanitizeVueStyleBlock, sanitizeCssContent } from '../utils/css-sanitizer.js'

const logger = createLogger({ name: 'vue3-engineer' })

export class Vue3Engineer extends MicrocodeEngineer {
  constructor(config = {}) {
    super(config)
    this.name = 'vue3-engineer'
    this.description = '普通 Vue3 组件代码生成器（面板头部+背景真实还原）'

    // 加载 vue3 规范（skill context 镜像 references/vue3/），加载失败不阻断
    this.vue3Specs = this.loadReferenceFiles([
      'references/vue3/component-development.md',
      'references/vue3/naming-conventions.md',
      'references/vue3/code-quality.md',
      'references/vue3/user-experience.md'
    ])

    logger.info('Vue3 Engineer 已初始化', {
      specsLoaded: Object.keys(this.vue3Specs).length
    })
  }

  /**
   * L2 后处理：自动将数据型裸 const 转为 ref()
   *
   * 扫描 <script setup> 中的 const 声明，把数组/对象字面量改成 ref() 包裹。
   * 跳过：函数、计算属性、已包裹的 ref/reactive、import 语句等。
   */
  wrapBareConstWithRef(vueContent) {
    if (!vueContent || typeof vueContent !== 'string') return vueContent

    // 提取 <script setup> 块
    const scriptMatch = vueContent.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/)
    if (!scriptMatch) return vueContent

    const scriptBlock = scriptMatch[1]
    const lines = scriptBlock.split('\n')
    let modified = false

    // 匹配 const name = value（非 ref/reactive/函数/箭头函数）
    const bareConstRegex = /^(\s*)const\s+([a-zA-Z_$][\w$]*)\s*=\s*(\[|\{)/

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 跳过注释
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue

      const match = line.match(bareConstRegex)
      if (!match) continue

      const [fullMatch, indent, varName, startChar] = match
      const isArray = startChar === '['
      const wrapper = isArray ? 'ref' : 'reactive'

      // 跳过已包裹的情况（检查同一行或后续行是否有 ref( 或 reactive(）
      const lineAfterAssign = line.substring(line.indexOf('=') + 1).trim()
      if (lineAfterAssign.startsWith('ref(') || lineAfterAssign.startsWith('reactive(')) {
        continue
      }

      // 跳过 import 语句
      if (line.trim().startsWith('import ')) continue

      // 跳过函数声明（箭头函数或 function）
      if (line.includes('=>') || line.includes('function ')) continue

      // 检查是否是字面量（数组或对象）
      const assignIndex = line.indexOf('=')
      if (assignIndex === -1) continue

      const afterAssign = line.substring(assignIndex + 1).trim()
      if (!afterAssign.startsWith('[') && !afterAssign.startsWith('{')) continue

      // 检查是否跨行（查找匹配的 ] 或 }）
      const openChar = isArray ? '[' : '{'
      const closeChar = isArray ? ']' : '}'
      let depth = 0
      let foundClose = false

      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === openChar) depth++
          else if (ch === closeChar) {
            depth--
            if (depth === 0) {
              foundClose = true
              break
            }
          }
        }
        if (foundClose) break
      }

      if (!foundClose) continue // 括号不匹配，跳过

      // 执行替换：在赋值右侧插入 wrapper(，在匹配的 ] 或 } 后插入 )
      const beforeAssign = line.substring(0, assignIndex + 1)
      const afterAssignRest = line.substring(assignIndex + 1)

      // 找到字面量的结束位置
      depth = 0
      let endPos = -1
      for (let k = 0; k < afterAssignRest.length; k++) {
        const ch = afterAssignRest[k]
        if (ch === openChar) depth++
        else if (ch === closeChar) {
          depth--
          if (depth === 0) {
            endPos = k
            break
          }
        }
      }

      if (endPos === -1) continue

      // 构造新行
      const beforeLiteral = afterAssignRest.substring(0, endPos + 1)
      const afterLiteral = afterAssignRest.substring(endPos + 1)
      lines[i] = `${beforeAssign} ${wrapper}(${beforeLiteral.trim()})${afterLiteral}`
      modified = true

      logger.info(`[L2] 自动包裹: ${varName} = ${wrapper}(...)`)
    }

    if (!modified) return vueContent

    // 替换回 <script setup> 块
    const newScriptBlock = lines.join('\n')
    return vueContent.replace(scriptMatch[0], `<script setup>\n${newScriptBlock}\n</script>`)
  }

  /**
   * 覆写：Vue3 专属代码生成 prompt（自包含，不引用微码规范）
   * chunkSpec.middle 由各分块 middle builder 提供「任务要求 + 输出格式」段落
   */
  buildCodePrompt(input, chunkSpec) {
    const {
      layoutStructure, visualElements, componentName, previousCritiques,
      charts, interactions, figmaNodeData, styleMappings, assets,
      headerSlots, elementStyleMap, backgroundBrightness = 'dark',
      resourceDomMapping
    } = input

    if (!componentName || typeof componentName !== 'string') {
      throw new Error(`Invalid componentName: ${typeof componentName}`)
    }

    const isRevision = previousCritiques && previousCritiques.length > 0

    // vue3 规范注入（截断防止 prompt 过大）
    const spec = (key, max) => {
      const content = this.vue3Specs[`references/vue3/${key}`] || ''
      return content.length > max ? content.slice(0, max) + '\n...(截断)' : content
    }

    let prompt = `你是专业的 Vue3 前端工程师，负责把 Figma 设计稿还原为一个**标准 Vue3 组件（主组件 + 子组件 + 共享 less）**。

# 🎯 产物形态（与微码组件的本质区别，必须遵守）

1. 输出**标准 Vue3 组件包**：主组件 \`package/index.vue\` + 子组件 \`package/components/*.vue\`（按功能拆分：头部、卡片、图表卡、列表项等）+ 根共享样式 \`resources/styles/{index,common,theme-vars}.less\`。
2. 每个 \`.vue\` 文件三段齐全：\`<template>\` + \`<script setup>\`（**JavaScript，非 TS**）+ \`<style lang="less" scoped">\`。
3. **禁止**出现以下微码运行时体系内容（出现即为严重错误）：
   - \`<base-panel>\` / \`panelKey\` / 具名插槽 \`#title-left\` / \`#title-right\` / \`#header-right\`
   - \`$mcComponentBuilder\` / \`runtimeBuilder\` / \`$createMcDeclare\`
   - \`declare.json\` / \`component.js\`
4. **LESS 与样式隔离（强制）**：
   - 每个 \`.vue\` 的样式写在 \`<style lang="less" scoped">\` 内，**必须**通过 \`@import\` 引入共享 less。
   - ⚠️ **@import 路径规则**：产物保持 \`package/\` 与根 \`resources/\` 两个目录，所以主组件 \`package/index.vue\` 必须写 \`@import '../resources/styles/index.less';\`；子组件 \`package/components/*.vue\` 必须写 \`@import '../../resources/styles/index.less';\`。禁止按扁平目录使用 \`./resources/\` 或 \`../resources/\`。
   - \`resources/styles/theme-vars.less\`：**仅定义变量与 mixin（不产出实际 class）**，被各组件 @import 共享主题 token；必须定义三个 mixin \`.common()\` / \`.theme-dark()\` / \`.theme-light()\`。
   - ⚠️ **CSS 自定义属性（--var）必须放在选择器内**（如 \`:root { --color-primary: #xxx; }\`），**禁止**直接写在 mixin 根级（LESS 会报 "Properties must be inside selector blocks"）。正确结构：\`.theme-light() { :root { --color-xxx: #xxx; } }\`，末尾调用 \`.theme-light();\` 作为默认值。
   - \`resources/styles/common.less\`：组件内共享的业务 class（建议前缀 \`.mv3-${componentName}-\`），主组件与子组件按需 @import。
   - \`resources/styles/index.less\`：\`@import './theme-vars.less';\` + \`@import './common.less';\`。
   - 样式隔离靠 Vue 的 \`scoped\` 实现，每个组件样式互不污染；**禁止**写全局/裸 class 污染其它组件。
   - **禁止依赖宿主 Tailwind / Inspira**：禁止使用 Tailwind utility class、\`@apply\`、\`@tailwind\`、\`@layer\`，禁止导入 \`tailwindcss\`、\`tw-animate-css\`、\`@inspira-ui/plugins\`。所有布局和视觉样式必须在组件自己的 less 中完整定义。

# 🖼️ 面板头部与背景【必须真实还原】（核心差异）

微码流程会忽略面板背景与标题栏（由宿主面板提供）；**本任务相反**——它们必须渲染为真实 DOM/CSS：

- **外层背景**：若 \`layoutStructure\`、\`visualElements\`、\`resourceDomMapping\` 或 Figma 资源提示表明根面板存在背景（背景图/纯色/渐变），必须在根容器 class 上直接落地真实 CSS。
  背景图必须精确还原 \`background-size / background-position / background-repeat\`（禁止无脑 cover/center/no-repeat）；纯色/渐变用 \`background\`。
- **禁止把根背景降级成主题变量链路**：根容器的关键可见背景、边框、阴影、圆角必须直接写成 Figma 对应值，禁止写成 \`background: var(--color-bg)\`、\`background: var(--colorBg)\`、\`background: transparent\`、\`background: inherit\` 这类间接或失真写法。
- \`theme-vars.less\` 只用于共享 token（文本色、辅助色、spacing 等），不要把根面板是否可见这件事交给 \`:root\` / CSS 自定义属性兜底。
- **标题栏**：渲染真实 \`<div class="xxx-header">\`，包含标题文本、副标题、更新时间、单位等。
- **标题栏右侧控件**：Tab 切换、统计指标、图标按钮等渲染为真实 DOM，位置与 Figma 一致。
- **headerSlots 数据**（下方提供）中的 title-left / title-right / header-right 元素必须渲染为真实 DOM，**不要忽略**。
- 承载背景的容器按需 \`overflow: hidden\`。
- 面板整体尺寸、内边距、圆角、边框、阴影都取自 Figma 数据。

# 📊 图表与面板 UI 还原红线（6 类高频缺陷，强制）

生成图表/面板类组件（流量监测、关键车辆统计等）必须逐条满足，缺一则效果图不合格：

1. **背景图精确还原（bg-size）**：Figma 节点带背景图时，用真实 CSS 还原 \`background-size / background-position / background-repeat\`，**禁止无脑 cover/center/no-repeat**；Figma 标注具体尺寸/位置则逐值对应。
2. **环形图环厚（radius）**：ECharts 环形图必须用 \`radius: [内, 外]\` 数组精确控制环厚（如 \`['55%','75%']\`），**禁止默认 \`radius:'50%'\` 过细或单值失真**；环厚按 Figma 视觉比例设定。
3. **边框生成（border）**：Figma 标注 stroke 的面板/卡片/分区**必须**生成 \`border: <width>px solid <color>\`（圆角对应 \`border-radius\`），**禁止只设背景色漏边框**。
4. **图例位置（legend.position）**：\`legend\` 的 top/bottom/left/right 必须对齐 Figma 图例实际方位，禁止默认堆顶部；多图共享图例时位置一致。
5. **图例存在性（legend 必生成）**：Figma 有图例则**必须**生成对应 \`legend\` 配置，禁止只画 series 不画 legend（导致无法区分数据系列）。
6. **交通预测/趋势卡片（区块还原）**：设计含"交通预测/趋势/预警"等卡片区块时，必须还原为真实 DOM（数值+单位+环比/趋势箭头/状态色），**禁止整块遗漏或用占位文本**。

# 📐 布局还原规则

- 根容器（最外层 div）必须设置 \`width: 100%; height: 100%;\`，**禁止使用 Figma 固定像素宽高**，确保组件在预览 iframe 中完全盛满。
- 根容器使用 \`display: flex; flex-direction: column;\` 组织内部结构，内容区用 \`flex: 1; min-height: 0;\` 自适应填充剩余空间。
- **每个容器节点（含根容器及所有子容器）必须单独判断 Figma layoutMode**：
  - HORIZONTAL → \`display:flex; flex-direction:row\`；VERTICAL → \`flex-direction:column\`。
  - **严禁假设所有子容器都与父容器同方向**——逐节点检查 figmaNodeData 中的 layoutMode 字段。
- primaryAxisAlignItems: MIN→flex-start / CENTER→center / MAX→flex-end / SPACE_BETWEEN→space-between（justify-content）。
- counterAxisAlignItems 同理映射 align-items。
- itemSpacing → gap；padding 逐边精确还原。
- 子元素尺寸按 Figma absoluteBoundingBox 真实比例分配，禁止平分。
- flex 子项补 \`min-height: 0\` / \`min-width: 0\`（尤其图表容器）。

## 🃏 卡片 / 列表项布局规则（CARD_LAYOUT，最高优先级，违反即不合格）

当元素是卡片类（card / stat-card / info-card / device-card / list-item 等），且其子元素**同时包含图标类（icon/image/img）和文字类（text/label/value/name）**时：

- **必须 \`flex-direction: row\`（图标在左、文字在右）**，这是默认且唯一正确的形态。
- 文字部分单独包一层容器，内部才用 \`flex-direction: column\` 纵向堆叠（label 在上、value 在下）。
- 图标必须 \`flex-shrink: 0\`，防止被压缩。
- **严禁**把卡片整体写成 \`flex-direction: column; align-items: center; justify-content: center\` —— 那会变成"图标在上、文字在下、整体居中"，与设计稿完全不符。
- **唯一例外**：figmaNodeData 中该节点明确标注 \`layoutMode: VERTICAL\`，或卡片内**纯文字无图标**时，才可用 column。

**✅ 正确（icon 左 + 文字右）：**
\`\`\`vue
<div v-for="item in list" :key="item.name" class="card-item">
  <img :src="item.icon" class="card-icon" />
  <div class="card-text">
    <div class="card-name">{{ item.name }}</div>
    <div class="card-value">{{ item.value }}</div>
  </div>
</div>
\`\`\`
\`\`\`css
.card-item { display: flex; flex-direction: row; align-items: center; gap: 12px; }
.card-icon { flex-shrink: 0; object-fit: contain; }
.card-text { display: flex; flex-direction: column; gap: 4px; }
\`\`\`

**❌ 错误（整体纵向居中堆叠）：**
\`\`\`css
.card-item { display: flex; flex-direction: column; align-items: center; justify-content: center; }
\`\`\`

**判断口诀**：只要该元素的 children 同时有「图标」和「文字」，就是 row；只有纯文字堆叠才是 column。

## 🔢 文本格式精确还原（强制）

- 数字、比值、单位、括号、分隔符等**必须与 Figma 文本内容逐字符一致**。
- 例：Figma 显示 \`(2/484)\` 就必须输出 \`(2/484)\`，**不得**擅自去掉括号写成 \`2/484\`；Figma 写 \`98%\` 就不得写成 \`98\`。
- 前后缀符号（\`(\` \`)\` \`/\` \`:\` \`~\` \`+\` \`-\` 单位等）一律照抄，禁止"美化"或简化。

# 🖼️ 图标与图片还原规则（强制）

本流程系统会**自动注入图片变量**（bg1 / icon1 / img1 及语义名），你**只能引用变量，禁止手写路径、禁止手写 import**：

- **图标 / 插图 / 3D 模型**：用 \`<img :src="icon1">\` 变量渲染，禁止写 \`<img src="./resources/...">\` 字面量，禁止用 CSS background-image 或空 div 替代。
- **卡片 / 容器背景图**：用 \`:style\` 绑定变量（backgroundImage: url(bg1)），禁止写 \`background-image: url('./resources/...')\` 等字面量 CSS。
- \`<img>\` 必须 \`object-fit: contain\`；容器尺寸取自 Figma 节点 absoluteBoundingBox（width/height）或图片自然比例，**禁止硬编码固定尺寸**（如 40×30）导致截断 / 拉伸。
- **禁止**自行编写 \`import xxx from '...'\` 语句——系统会按下方「🎨 资源使用映射」段自动注入。
- 含半透明 / 特殊效果的图片必须用 \`<img>\` 而非 background，确保透明通道正确。
- 具体变量名、用途、尺寸见下文「🎨 资源使用映射」，必须严格对照使用。
# 📏 Vue3 编码规范（必须遵守）

${spec('component-development.md', 4000)}

## 命名规范
${spec('naming-conventions.md', 1500)}

## 📝 中文注释规范（强制）
- **关键逻辑、复杂样式计算、交互处理、生命周期钩子必须写中文注释**，说明"为什么这么做"。
- 组件/子组件 \`<script setup>\` 顶部写一段中文说明：组件用途、数据来源、关键交互。
- \`<style lang="less" scoped">\` 内对非常规样式（flex 布局、定位、伪元素、响应式断点）也要简要注释。
- 禁止只写代码无注释；也禁止无意义注释（如 \`// 赋值\`）。
- 示例：\`// 监听选中项变化，联动刷新图表数据（避免切换 Tab 后图表不更新）\`。

## 🖱️ 交互实现规范（强制）
- **必须根据 \`interactions\` 数组生成对应的交互代码——不能只识别不实现**。
- 交互必须完整可用：包含 UI、状态管理（ref/watch）、事件处理、数据刷新逻辑。
- 使用 Vue 3 Composition API（ref、watch、onMounted 等）。
- 常见交互实现模板：
  - **Tab 切换（type:"tab-switch"）**：\`ref\` 存当前激活 tab + tab 按钮 \`v-for\` 绑定 \`@click\` 切换 + 高亮 \`active\` 样式 + 切换时刷新数据。
  - **下拉选择（type:"select"）**：\`<select>\` 或自定义下拉 + \`v-model\` 选中值 + \`watch\` 选中值变化刷新数据。
  - **图表 Tooltip**：所有图表必须配 \`tooltip\`（trigger:'axis' 或 'item'），悬停显示详情，\`formatter\` 自定义格式（含单位）。
  - **开关/Toggle（type:"toggle"）**：\`<input type="checkbox" v-model>\` + \`watch\` 触发动作。
- 交互行为清单（来自 interactions，必须在组件中实现）：
${interactions && interactions.length > 0 ? interactions.map(it => `- **${it.trigger}** → ${it.behavior}${it.target ? `（目标: ${it.target}）` : ''}`).join('\n') : '（interactions 为空时，按设计稿中可见的按钮/切换/展开等交互自行合理实现，并保持一致的交互体验）'}

## 质量红线
- **按功能拆分为子组件**：主组件 \`package/index.vue\` + 子组件 \`package/components/*.vue\`（头部 Header、卡片 Card、图表卡 ChartCard、列表项 ListItem 等）；单一职责，每个子组件 ≤300 行、每个函数 ≤50 行
- defineProps({...}) 对象语法带类型与默认值；defineEmits([...])
- 列表渲染必须绑定稳定 key；避免 v-html
- onUnmounted 清理定时器/监听器/图表实例
- 图表用 ECharts 时：容器 ref + onMounted 初始化 + resize 监听 + onUnmounted dispose
- **🚫 CSS 类名禁止含中文/非 ASCII 字符**：如 \`vehicle-type-value客车\` 是非法的，LESS 编译会报 \`Unrecognised input\`。中文语义用 BEM 修饰符替代：\`vehicle-type-value--bus\` / \`vehicle-type-value--truck\`，template 里的 class 属性也必须对应。
- **SFC 标签闭合顺序**：\`<template>\` → \`</template>\` → \`<script setup>\` → \`</script>\` → \`<style lang="less" scoped>\` → \`</style>\`。严禁在 \`</style>\` 后面多加 \`</script>\`，严禁标签交叉闭合。

## 🔗 API 绑定兼容（强制 — 违反将导致绑定失败）

> **核心规则**：所有可能在模板中展示或被 API 接口赋值的数据变量，**必须使用 \`ref()\` 或 \`reactive()\` 包裹**，**严禁**使用裸 \`const\` / \`let\` 定义。
>
> 原因：系统会在生成后对组件执行"API 绑定"，通过替换 \`ref()\` 变量的值来注入真实接口数据。裸 \`const\` 是只读的，无法被赋值覆盖，会直接触发绑定失败（符号冲突错误）。
>
> **✅ 正确写法：**
> \`\`\`js
> import { ref, onMounted } from 'vue'
> const tabs = ref(['选项一', '选项二', '选项三'])
> const cards = ref([])
> const activeTab = ref(0)
> const chartData = ref([])
> \`\`\`
>
> **❌ 错误写法（禁止）：**
> \`\`\`js
> const tabs = ['选项一', '选项二']        // 裸数组，不可写
> const cards = [{ name: 'A' }, ...]      // 裸对象数组，不可写
> let count = 0                           // 裸 let，虽然可写但失去响应式
> const title = '实时监测'                // 纯展示文本可用 const，但含动态数据时必须 ref
> \`\`\`
>
> **判断口诀**：只要这个变量的值来源于接口、用户交互、或未来可能被 API 绑定替换，就必须 \`ref()\`。纯静态常量（如固定标题文字、配置枚举）可以 \`const\`。
`

    if (isRevision) {
      prompt += `\n# ⚠️ 修订指导（第 ${(input.iterationCount || 0) + 2} 轮）\n\n必须修复以下问题（HIGH 优先）：\n`
      previousCritiques.slice(0, 20).forEach((c, i) => {
        prompt += `${i + 1}. [${c.severity}/${c.category}] ${c.issue}${c.location ? `（位置: ${c.location}）` : ''}\n`
      })
    }

    // ── 数据段 ──
    prompt += `\n# 📎 设计稿数据

## 组件名
\`${componentName}\`（根 class 建议 \`${componentName}\`，面板明暗：${backgroundBrightness}）

## 布局结构（layoutStructure — 含 background/header 节点，全部要真实还原）
\`\`\`json
${JSON.stringify(layoutStructure || {}, null, 1)}
\`\`\`

## 视觉元素（visualElements）
\`\`\`json
${JSON.stringify(visualElements || {}, null, 1)}
\`\`\`
`

    // 🆕 Figma 原始节点样式数据（含 layoutMode / 对齐 / 间距 / 尺寸 / fills / 字体）
    // ⚠️ 这是判断每个容器 flex-direction 的**唯一权威依据**，此前遗漏未注入导致
    //    LLM 只能凭经验猜测卡片方向（把 icon+text 卡片错误生成为纵向居中堆叠）。
    if (figmaNodeData) {
      const figmaStyleBlock = this._formatFigmaStyleData(figmaNodeData)
      if (figmaStyleBlock && figmaStyleBlock.trim()) {
        prompt += `\n## Figma 节点样式树（figmaNodeData — flex-direction 的权威依据）

> **逐节点比对**：节点标注 \`布局: HORIZONTAL\` → 该容器必须 \`flex-direction: row\`；
> \`布局: VERTICAL\` → \`flex-direction: column\`。**严禁**假设子容器与父容器同方向。
> 节点未标注 layoutMode 时，按上文「🃏 卡片 / 列表项布局规则」判断（有图标+文字即 row）。

${figmaStyleBlock}
`
      }
    }

    if (headerSlots && headerSlots.length > 0) {
      prompt += `\n## 面板头部元素（headerSlots — 必须全部渲染为真实 DOM）
\`\`\`json
${JSON.stringify(headerSlots, null, 1)}
\`\`\`
`
    }

    if (styleMappings) {
      const sm = elementStyleMap
        ? { ...styleMappings, elementStyleMap }
        : styleMappings
      prompt += `\n## 样式映射（styleMappings — 颜色/字体/阴影/圆角精确值）
\`\`\`json
${JSON.stringify(sm, null, 1)}
\`\`\`
`
    }

    if (charts && charts.length > 0) {
      prompt += `\n## 图表配置\n\`\`\`json\n${JSON.stringify(charts, null, 1)}\n\`\`\`\n`
    }
    if (interactions && interactions.length > 0) {
      prompt += `\n## 交互配置\n\`\`\`json\n${JSON.stringify(interactions, null, 1)}\n\`\`\`\n`
    }
    if (assets && Object.keys(assets || {}).length > 0) {
      // 🆕 v2.2: 分离 CSS 替代资源和图片资源，给 LLM 明确指令
      const assetEntries = Object.values(assets).flat ? Object.values(assets) : [assets]
      const flatAssets = assetEntries.flat()
      const cssAssets = flatAssets.filter(a => a.cssInsteadOfImage)
      const imageAssets = flatAssets.filter(a => !a.cssInsteadOfImage)

      if (cssAssets.length > 0) {
        prompt += `\n## ⚡ CSS 替代资源（不要使用 <img> 标签，直接用 CSS background）
以下资源的 fill 是纯色或渐变，已自动生成 CSS 值，**禁止引用图片文件**，必须在 <style> 中使用对应的 CSS：

\`\`\`json
${JSON.stringify(cssAssets.map(a => ({
  name: a.name,
  nodeId: a.ref,
  cssValue: a.cssValue,
  cssUsage: `background: ${a.cssValue};`
})), null, 1)}
\`\`\`

**规则**：
1. 这些资源 **不要** import 图片文件，**不要** 使用 \`<img>\` 标签
2. 直接在 <style scoped> 中用 \`background: <cssValue>;\` 实现
3. 如果资源是 bg 类型，应用到对应容器的 \`background\` 属性
4. 如果资源是 icon 类型但纯色/渐变可复现，用 CSS \`background\` + 尺寸定位实现
`
      }

      if (imageAssets.length > 0) {
        prompt += `\n## 资源文件（图片由系统按 SFC 深度注入：主组件 ../resources/images/，子组件 ../../resources/images/）
\`\`\`json
${JSON.stringify(imageAssets, null, 1)}
\`\`\`
`
      }
    }

    // 🆕 资源变量映射（系统自动注入 import，LLM 必须使用 bg1/icon1 等变量引用图片）
    if (resourceDomMapping && resourceDomMapping.length > 0) {
      prompt += '\n' + this._formatResourceMapping(resourceDomMapping) + '\n'
    }

    // ── 任务要求 + 输出格式（由分块 middle 提供）──
    if (chunkSpec?.middle) {
      prompt += chunkSpec.middle
    }

    return prompt
  }

  /**
   * Vue3 整文件分块 middle（默认路径：单批输出完整 SFC）
   */
  _buildVue3ChunkMiddle(chunk) {
    const fileList = chunk.files.map(f => `- \`${f}\``).join('\n')
    let contextBlock = ''
    if (chunk.contextFiles && chunk.contextFiles.length > 0) {
      contextBlock = '\n\n# 📎 已生成参考文件（必须保持命名/接口/class 一致）\n\n' +
        chunk.contextFiles.map(cf => `// === ${cf.path} ===\n${(cf.content || '').slice(0, 12000)}\n`).join('\n')
    }
    return `
# 任务要求（第 ${chunk.index || 1}/${chunk.total || 1} 批：${chunk.title || ''}）

本次生成以下文件，每个 \`.vue\` 输出**完整的 Vue3 SFC**（<template> + <script setup> + <style lang="less" scoped> 三段齐全），每个 \`.less\` 输出完整样式文件：

${fileList}
${contextBlock}
# 输出格式

使用文件分隔符格式（不要 JSON、不要 markdown 代码块包裹）：

\`\`\`
// === ${chunk.files[0]} ===
<该文件的完整内容>
\`\`\`

- 每个文件用 \`// === 文件路径 ===\` 分隔符开头，内容为原始代码（不转义换行/引号）
- 分隔符只能标记文件开始，禁止在注释/说明中使用
- **不要**输出 declare.json / component.js / base-panel 等微码运行时文件
- \`.less\` 文件必须输出：\`theme-vars.less\`（变量+mixin，末尾调用 \`.theme-dark()\`）、\`common.less\`（业务 class，建议前缀 \`.mv3-<组件名>-\`）、\`index.less\`（@import 前两者）
- 每个 \`.vue\` 的 \`<style lang="less" scoped">\` 顶部必须 \`@import\` 根共享 less（主组件 \`../resources/styles/index.less\`、子组件 \`../../resources/styles/index.less\`）；禁止按扁平目录少退一级
- 若根面板存在背景，\`package/index.vue\` 的根选择器必须直接出现可执行的 \`background\` / \`background-image\` / \`background-color\` 字面量值，不能只引用 \`var(--color-bg)\` / \`var(--colorBg)\`
`
  }

  /**
   * Vue3 模板段 middle（降级路径）
   */
  _buildVue3TemplateMiddle(chunk) {
    const ctx = (chunk.contextFiles || []).map(cf => `// === ${cf.path} ===\n${(cf.content || '').slice(0, 8000)}`).join('\n')
    return `
# 任务要求（分段生成 ${chunk.index}/${chunk.total}：index.vue 模板段）

只输出 \`package/index.vue\` 的 **<template> 段**（含面板头部真实 DOM 与背景容器结构），不要输出 <script> 和 <style>。
${ctx ? `\n# 参考上下文\n${ctx}\n` : ''}
# 输出格式

\`\`\`
// === package/index.vue ===
<template>
  ...完整模板...
</template>
\`\`\`
`
  }

  /**
   * Vue3 脚本段 middle（降级路径）
   */
  _buildVue3ScriptMiddle(chunk) {
    const ctx = (chunk.contextFiles || []).map(cf => `// === ${cf.path} ===\n${(cf.content || '').slice(0, 12000)}`).join('\n')
    return `
# 任务要求（分段生成 ${chunk.index}/${chunk.total}：index.vue 脚本段）

只输出 \`package/index.vue\` 的 **<script setup> 段**（JavaScript），与下方模板段的 ref/事件/子组件引用严格一致。不要输出 <template> 和 <style>。
${ctx ? `\n# 参考上下文（模板段）\n${ctx}\n` : ''}
# 输出格式

\`\`\`
// === package/index.vue ===
<script setup>
...完整脚本...
</script>
\`\`\`
`
  }

  /**
   * Vue3 样式段 middle（降级路径）
   */
  _buildVue3StyleMiddle(chunk) {
    const ctx = (chunk.contextFiles || []).map(cf => `// === ${cf.path} ===\n${(cf.content || '').slice(0, 12000)}`).join('\n')
    return `
# 任务要求（分段生成 ${chunk.index}/${chunk.total}：index.vue 样式段）

只输出 \`package/index.vue\` 的 **<style lang="less" scoped> 段**，class 与下方模板段严格一致，含面板背景/标题栏样式精确还原；顶部必须通过 \`@import '../resources/styles/index.less';\` 引入根共享 less（theme-vars/common），禁止使用 \`./resources/\`。
${ctx ? `\n# 参考上下文（模板+脚本）\n${ctx}\n` : ''}
# 输出格式

\`\`\`
// === package/index.vue ===
<style scoped>
...完整样式...
</style>
\`\`\`
`
  }

  /**
   * 覆写：在父类清洗基础上，对 .vue 文件的 <style> 块执行 CSS 专项清洗
   *
   * 父类 _sanitizeFileContent 处理：markdown 围栏、<thinking>、闭合标签后文本、虚假换行
   * 本方法额外处理：<style> 内的分隔符碎片、非法 LLM 评论文本、跨行 @import、大括号闭合
   */
  _sanitizeFileContent(content, filePath = '') {
    let base = super._sanitizeFileContent(content, filePath)
    if (filePath.endsWith('.vue') && base) {
      // 🛡️ LLM 分词错误后处理：修复高频 token 拆分错误（formatter → for matter 等）
      base = this._fixLlmTokenizationErrors(base)
      const sanitized = sanitizeVueStyleBlock(base, logger)
      return this._normalizeVue3StyleImportPath(sanitized, filePath)
    }
    return base
  }

  /**
   * 🛡️ LLM 分词错误修复：修复 AI 生成代码时常见的 token 拆分错误
   *
   * 典型案例：`formatter` 被拆成 `for matter`，导致 vue/compiler-sfc 报
   * "Unexpected keyword 'for'"。这是因为 LLM 在生成对象字面量 key 时，
   * 把 `formatter` 拆成了 `for matter`（两个 token）。
   *
   * 本方法使用正则匹配已知的错误模式并自动修复。
   */
  _fixLlmTokenizationErrors(code) {
    if (!code || typeof code !== 'string') return code

    // 已知 LLM 分词错误映射：错误模式 → 正确写法
    // 注意：使用 \b 确保只匹配完整单词边界，避免误修
    const FIXES = [
      { pattern: /\bfor\s+matter\b/g, replacement: 'formatter' },
      // 可继续添加其他已知的 LLM 分词错误
      // { pattern: /\bdef\s+ault\b/g, replacement: 'default' },
      // { pattern: /\bfunc\s+tion\b/g, replacement: 'function' },
    ]

    let fixed = code
    for (const fix of FIXES) {
      if (fix.pattern.test(fixed)) {
        fixed = fixed.replace(fix.pattern, fix.replacement)
        logger.warn(`🛡️ 已修复 LLM 分词错误: ${fix.pattern} → ${fix.replacement}`)
      }
    }

    return fixed
  }

  /**
   * Vue3 workspace 保持 package/ 与根 resources/ 目录：
   * package/index.vue 到 resources/ 退一级，package/components/*.vue 退两级。
   * 写盘前按 SFC 所在深度归一化共享样式路径。
   */
  _normalizeVue3StyleImportPath(content, filePath = '') {
    if (!content || !filePath.endsWith('.vue')) return content

    const isSubComponent = /^package\/components\//.test(filePath)
    const expectedPath = isSubComponent
      ? '../../resources/styles/index.less'
      : '../resources/styles/index.less'

    return content.replace(
      /@import\s+(?:\([^)]*\)\s*)?['"](?:\.\.\/)+resources\/styles\/index\.less['"]\s*;?|@import\s+(?:\([^)]*\)\s*)?['"]\.\/resources\/styles\/index\.less['"]\s*;?/g,
      `@import '${expectedPath}';`
    )
  }

  /**
   * 覆写：Vue3 拼装（真实 style 段，而非微码固定 @import 模板）
   */
  _assembleVue3IndexVue(templateContent, scriptContent, styleContent) {
    const strip = (s) => (s || '').trim().replace(/^\/\/\s*===\s*package\/index\.vue\s*===\s*\n?/i, '')
    let tpl = strip(templateContent)
    let scr = strip(scriptContent)
    let sty = strip(styleContent)

    if (tpl.includes('<template') && !tpl.includes('</template>')) tpl += '\n</template>'
    if (scr.includes('<script') && !scr.includes('</script>')) scr += '\n</script>'
    if (sty.includes('<style') && !sty.includes('</style>')) sty += '\n</style>'

    // 🆕 对 style 内容执行 CSS 清洗（三段拼装路径，writeFiles 之前）
    if (sty && !sty.includes('<style')) {
      sty = sanitizeCssContent(sty, { isLessFile: false })
      sty = `<style lang="less" scoped>\n${sty}\n</style>`
    }

    const parts = []
    if (tpl) parts.push(tpl)
    if (scr) parts.push(scr)
    parts.push(sty || '<style lang="less" scoped>\n/* 样式生成失败，需人工补充 */\n</style>')
    return parts.join('\n\n') + '\n'
  }

  /**
   * 覆写：Vue3 简化分块生成流
   * 默认单批整文件；截断则降级 template → script → style 三段拼装；子组件按 import 检测补生成
   */
  async generateCode(input) {
    logger.info('开始生成 Vue3 组件代码', { componentName: input.componentName })

    const { _l0CodeRetryGuidance, techStackHints, _selfOptimization, targetFiles, reviseTarget, outputPath, previousCritiques } = input

    // 🆕 P1: 按问题类别只修目标文件
    // 仅在“修订模式 + 给定目标文件 + 非全量修订”时启用：只让 LLM 重新生成 targetFiles，
    // 其余文件从磁盘读取现有内容并保留，避免再次全量重做浪费模型调用与时间。
    const targetFileSet = new Set(Array.isArray(targetFiles) && targetFiles.length ? targetFiles : [])
    const isRevision = (previousCritiques && previousCritiques.length > 0) || !!_l0CodeRetryGuidance
    const isPartialRevision = !!isRevision && targetFileSet.size > 0 && reviseTarget && reviseTarget !== 'full'
    const diskContent = (rel) => {
      if (!outputPath) return null
      try {
        return readFileSync(join(outputPath, rel), 'utf-8')
      } catch {
        return null
      }
    }
    const STYLE_FILES = [
      'resources/styles/theme-vars.less',
      'resources/styles/common.less',
      'resources/styles/index.less'
    ]
    const allFiles = {}
    const chunkDebug = []
    if (isPartialRevision) {
      logger.info('🎯 P1: 部分修订模式，仅重做目标文件，其余从磁盘保留', {
        targetFiles: [...targetFileSet],
        reviseTarget
      })
      // 基线：先把未变更的目标外文件从磁盘读入 allFiles，保证部分修订不丢失既有产物
      const knownFiles = Array.isArray(input.generatedFiles) && input.generatedFiles.length
        ? input.generatedFiles
        : ['package/index.vue', ...STYLE_FILES]
      for (const f of knownFiles) {
        if (targetFileSet.has(f)) continue
        const c = diskContent(f)
        if (c != null) allFiles[f] = c
      }
    }

    const appendGuidance = (p) => {
      if (_l0CodeRetryGuidance) p += _l0CodeRetryGuidance

      // 默认技术栈规则（无论是否有 @xxx 标记都生效）
      p += '\n\n## 🔧 默认技术栈规则（强制）\n\n'
      p += '本项目已全局注册 ant-design-vue，组件中直接使用 `<a-xxx>` 标签即可，无需 import。\n\n'
      p += '| 场景 | 默认技术栈 | 说明 |\n|------|-----------|------|\n'
      p += '| 表单组件（输入框/下拉/日期/开关/单选/多选） | ant-design-vue | `<a-input>` / `<a-select>` / `<a-date-picker>` / `<a-switch>` / `<a-radio-group>` / `<a-checkbox-group>` |\n'
      p += '| 数据表格 | ant-design-vue | `<a-table>` |\n'
      p += '| 弹窗 | ant-design-vue | `<a-modal>` |\n'
      p += '| 标签页 | ant-design-vue | `<a-tabs>` + `<a-tab-pane>` |\n'
      p += '| 按钮 | ant-design-vue | `<a-button>` |\n'
      p += '| 图表 | ECharts | `echarts.init()` + `ResizeObserver` + `watch(chartRef)` |\n\n'
      p += 'Figma 节点名标注 `@antd/xxx` 时按标注匹配对应组件；未标注时按上表默认规则选择技术栈。\n\n'
      p += '### ⚠️ antd 样式覆盖必须使用 :deep()\n\n'
      p += '组件使用 `<style lang="less" scoped>`，antd 内部 DOM（`.ant-xxx`）不携带 `data-v-xxx`，直接写 `.ant-xxx` **不生效**。\n\n'
      p += '```less\n/* ✅ 正确 */\n:deep(.ant-input) { background: transparent; border-color: var(--border-color); }\n:deep(.ant-select-selector) { background: transparent; }\n:deep(.ant-table-thead) { background: rgba(0,0,0,0.3); }\n:deep(.ant-table-tbody > tr > td) { border-bottom: 1px solid var(--border-color); }\n:deep(.ant-btn) { border-radius: 4px; }\n\n/* ❌ 错误 — scoped 下不生效 */\n.ant-input { background: transparent; }\n```\n\n'

      if (techStackHints && techStackHints.length > 0) {
        p += '\n## 🔧 Figma 技术栈标记\n\n' + techStackHints.map(h => `- **${h.library}**${h.component ? ` / ${h.component}` : ''}（节点：${h.nodeName}）`).join('\n')
      }
      if (_selfOptimization?.promptAugmentation) {
        p += '\n\n## 🧠 自优化增强\n\n' + _selfOptimization.promptAugmentation
      }
      return p
    }

    const runChunk = async (chunk, middleBuilder) => {
      // 🆕 暂停检查：每个分块生成前等恢复（pauseChecker 由 phase2.service 注入）
      const pauseStatus = await this._awaitIfPaused(input.pauseChecker)
      if (pauseStatus === 'cancelled') {
        throw new Error('任务已被用户取消')
      }

      // 🆕 P1: 部分修订 —— 非目标文件从磁盘保留，跳过 LLM 生成
      if (isPartialRevision) {
        const touchesTarget = (chunk.files || []).some((f) => targetFileSet.has(f))
        if (!touchesTarget) {
          let primed = false
          for (const f of (chunk.files || [])) {
            if (allFiles[f] != null) continue
            const c = diskContent(f)
            if (c != null) {
              allFiles[f] = c
              primed = true
            }
          }
          // 文件均已在内存中（已生成或已从磁盘读取）→ 跳过；
          // 若某文件既不在内存也不在磁盘（新引用子组件等），仍交给 LLM 生成，避免缺失。
          if (primed || (chunk.files || []).every((f) => allFiles[f] != null)) {
            logger.info('⏩ P1: 跳过未变更文件（从磁盘保留）', { files: chunk.files })
            return { files: {}, debug: { skipped: true, reason: 'not-target' } }
          }
        }
      }

      const prompt = appendGuidance(this.buildCodePrompt(input, { middle: middleBuilder.call(this, chunk) }))
      const res = await this._generateSingleChunk(prompt, chunk, input)
      chunkDebug.push(res.debug)
      return res
    }

    try {
      // ── 全量生成闭包（默认路径 + 截断降级；部分修订失败时复用）──
      const runFullGeneration = async () => {
        try {
          const chunkFull = {
            title: 'Vue3 主组件 + 共享样式（index.vue + styles/*.less）',
            files: [
              'package/index.vue',
              'resources/styles/theme-vars.less',
              'resources/styles/common.less',
              'resources/styles/index.less'
            ],
            index: 1, total: 1, contextFiles: []
          }
          const resFull = await runChunk(chunkFull, this._buildVue3ChunkMiddle)
          Object.assign(allFiles, resFull.files)
        } catch (truncErr) {
          // ── 降级路径：template → script → style 三段拼装 ──
          logger.warn('⚠️ Vue3 整文件生成截断，降级为 template/script/style 三段生成', { error: truncErr.message })

          const chunkT = {
            title: 'index.vue 模板段', files: ['package/index.vue'],
            segmentType: 'template', index: 1, total: 3, contextFiles: []
          }
          const resT = await runChunk(chunkT, this._buildVue3TemplateMiddle)
          const tpl = (resT.files['package/index.vue'] || '').trim()

          const chunkS = {
            title: 'index.vue 脚本段', files: ['package/index.vue'],
            segmentType: 'script', index: 2, total: 3,
            contextFiles: [{ path: 'package/index.vue (template)', content: tpl }]
          }
          const resS = await runChunk(chunkS, this._buildVue3ScriptMiddle)
          const scr = (resS.files['package/index.vue'] || '').trim()

          const chunkY = {
            title: 'index.vue 样式段', files: ['package/index.vue'],
            index: 3, total: 3,
            contextFiles: [{ path: 'package/index.vue (template+script)', content: `${tpl}\n\n${scr}` }]
          }
          const resY = await runChunk(chunkY, this._buildVue3StyleMiddle)
          const sty = (resY.files['package/index.vue'] || '').trim()

          allFiles['package/index.vue'] = this._assembleVue3IndexVue(tpl, scr, sty)
          logger.info('✅ Vue3 三段拼装完成', { length: allFiles['package/index.vue'].length })
        }
      }

      if (isPartialRevision) {
        try {
          const wantIndex = targetFileSet.has('package/index.vue')
          const wantStyles = STYLE_FILES.some((f) => targetFileSet.has(f))
          logger.info('🎯 P1: 部分修订分支', { wantIndex, wantStyles })

          if (wantIndex) {
            // 仅重做 index.vue（分段生成，不触碰 less；less 已由基线从磁盘保留）
            const chunkT = {
              title: 'index.vue 模板段', files: ['package/index.vue'],
              segmentType: 'template', index: 1, total: 3, contextFiles: []
            }
            const resT = await runChunk(chunkT, this._buildVue3TemplateMiddle)
            const tpl = (resT.files['package/index.vue'] || '').trim()

            const chunkS = {
              title: 'index.vue 脚本段', files: ['package/index.vue'],
              segmentType: 'script', index: 2, total: 3,
              contextFiles: [{ path: 'package/index.vue (template)', content: tpl }]
            }
            const resS = await runChunk(chunkS, this._buildVue3ScriptMiddle)
            const scr = (resS.files['package/index.vue'] || '').trim()

            const chunkY = {
              title: 'index.vue 样式段', files: ['package/index.vue'],
              index: 3, total: 3,
              contextFiles: [{ path: 'package/index.vue (template+script)', content: `${tpl}\n\n${scr}` }]
            }
            const resY = await runChunk(chunkY, this._buildVue3StyleMiddle)
            const sty = (resY.files['package/index.vue'] || '').trim()

            if (tpl || scr || sty) {
              allFiles['package/index.vue'] = this._assembleVue3IndexVue(tpl, scr, sty)
              logger.info('✅ P1 部分修订: index.vue 重新生成完成', {
                length: allFiles['package/index.vue'].length
              })
            } else {
              throw new Error('部分修订生成 index.vue 失败（三段均为空）')
            }
          }

          if (wantStyles) {
            // 仅重做被 critique 引用的 less 文件；index.vue 由基线从磁盘保留
            const styleChunkFiles = STYLE_FILES.filter((f) => targetFileSet.has(f))
            const chunkStyle = {
              title: '样式文件', files: styleChunkFiles, index: 1, total: 1,
              contextFiles: [{ path: 'package/index.vue', content: allFiles['package/index.vue'] || '' }]
            }
            const resStyle = await runChunk(chunkStyle, this._buildVue3ChunkMiddle)
            Object.assign(allFiles, resStyle.files)
          }
        } catch (partialErr) {
          logger.warn('⚠️ P1 部分修订失败，回退全量生成', { error: partialErr.message })
          for (const k of Object.keys(allFiles)) delete allFiles[k]
          await runFullGeneration()
        }
      } else {
        await runFullGeneration()
      }

      // ── 子组件补生成（复用父类 import 检测）──
      const subComps = this._detectSubComponents(allFiles['package/index.vue'] || '')
      let idx = 2
      for (const subPath of subComps) {
        const subChunk = {
          title: '子组件 ' + subPath, files: [subPath],
          index: idx++, total: 1 + subComps.length,
          contextFiles: [{ path: 'package/index.vue', content: allFiles['package/index.vue'] || '' }]
        }
        const resSub = await runChunk(subChunk, this._buildVue3ChunkMiddle)
        Object.assign(allFiles, resSub.files)
      }

      // 诊断落盘
      try {
        const debugDir = dirname(input.outputPath || process.cwd())
        if (!existsSync(debugDir)) mkdirSync(debugDir, { recursive: true })
        writeFileSync(join(debugDir, 'debug-vue3-ai-response.txt'),
          JSON.stringify({ mode: isPartialRevision ? 'vue3-partial' : 'vue3-adaptive', chunks: chunkDebug }, null, 2), 'utf-8')
      } catch (e) { /* 非阻断 */ }

      // 截断终检
      const truncationIssues = this._detectFileTruncation(allFiles)
      if (truncationIssues.length > 0) {
        throw new Error(`Vue3 输出文件不完整：${truncationIssues.join('；')}`)
      }
      if (Object.keys(allFiles).length === 0) {
        throw new Error('LLM 返回的 files 为空')
      }

      // 防御：剔除 LLM 越权产出的微码运行时文件（注意：Vue3 现合法产出 .less，不再剔除）
      for (const p of Object.keys(allFiles)) {
        if (/declare\.json$|component\.js$|declare\.js$/.test(p)) {
          logger.warn(`⚠️ Vue3 目标下剔除微码运行时文件产出: ${p}`)
          delete allFiles[p]
        }
      }

      return { files: allFiles }
    } catch (error) {
      logger.error('Vue3 代码生成失败', { error: error.message })
      throw error
    }
  }

  /**
   * 覆写：Vue3 execute — 不补微码标准文件、不做微码 validateAndFix
   */
  async execute(params) {
    const {
      componentName, outputPath, previousCritiques, resourceDomMapping
    } = params

    const isRevision = previousCritiques && previousCritiques.length > 0
    logger.info(`开始执行 Vue3 代码${isRevision ? '修订' : '生成'}`, {
      componentName, critiqueCount: previousCritiques?.length || 0
    })

    try {
      const codeResult = await this.generateCode(params)

      // 资源 import 注入（图片等，防止 AI 臆造文件名）
      // Vue3 保持 package/ 与根 resources/：主组件退一级，子组件退两级。
      if (resourceDomMapping) {
        for (const filePath of Object.keys(codeResult.files)) {
          if (!filePath.endsWith('.vue')) continue
          const resourceBase = /^package\/components\//.test(filePath)
            ? '../../resources/images/'
            : '../resources/images/'
          codeResult.files[filePath] = this.injectResourceImports(
            codeResult.files[filePath],
            resourceDomMapping,
            resourceBase
          )
        }
      }

      // 🛡️ 资源 import 去重保险（无条件运行）：
      // 即便 resourceDomMapping 为空、injectResourceImports 未执行，LLM 仍可能手写重复
      // 的 `import bg1 from '...'` 并原样写盘，预览时触发
      // SyntaxError: Identifier 'xxx' has already been declared 导致整个组件崩溃。
      // 这里对生成的所有 .vue 文件的 <script>/<script setup> 块按"默认导入本地名"去重，
      // 同一名字的默认导入只保留首个声明，彻底消除重复声明。
      for (const filePath of Object.keys(codeResult.files)) {
        if (!filePath.endsWith('.vue')) continue
        const dedupRes = this.dedupImportsByLocalName(codeResult.files[filePath])
        if (dedupRes.modified) {
          codeResult.files[filePath] = dedupRes.code
          logger.warn(`🛡️ 已对 ${filePath} 的资源 import 按本地名去重（消除重复声明，防止预览崩溃）`)
        }
      }

      // 🆕 L2 后处理：自动将数据型裸 const 转为 ref()（防止绑定阶段符号冲突）
      for (const [filePath, content] of Object.entries(codeResult.files)) {
        if (filePath.endsWith('.vue') && content.includes('<script setup>')) {
          codeResult.files[filePath] = this.wrapBareConstWithRef(content)
        }
      }

      const writtenFiles = this.writeFiles(codeResult.files, outputPath)

      // 🆕 P2-D: 资源引用安全网（告警级）——校验 LLM 引用的资源变量是否都有对应已下载资源
      if (resourceDomMapping && codeResult.files['package/index.vue']) {
        const code = codeResult.files['package/index.vue']
        const bgM = resourceDomMapping.filter(m => m.downloadStatus === 'success' && m.previewAnalysisRole === 'bg')
        const iconM = resourceDomMapping.filter(m => m.downloadStatus === 'success' && m.previewAnalysisRole === 'icon')
        const imgM = resourceDomMapping.filter(m => m.downloadStatus === 'success' && (m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image'))
        const availableVars = new Set()
        bgM.forEach((m, i) => { availableVars.add(`bg${i + 1}`); if (m.semanticVarName) availableVars.add(m.semanticVarName) })
        iconM.forEach((m, i) => { availableVars.add(`icon${i + 1}`); if (m.semanticVarName) availableVars.add(m.semanticVarName) })
        imgM.forEach((m, i) => { availableVars.add(`img${i + 1}`); if (m.semanticVarName) availableVars.add(m.semanticVarName) })
        const referenced = new Set()
        const varPattern = /\b(bg|icon|img)(\d+)\b/g
        let vm
        while ((vm = varPattern.exec(code)) !== null) referenced.add(vm[0])
        resourceDomMapping.filter(rm => rm.semanticVarName).forEach(rm => {
          if (code.includes(rm.semanticVarName)) referenced.add(rm.semanticVarName)
        })
        const orphan = [...referenced].filter(v => !availableVars.has(v))
        if (orphan.length > 0) {
          logger.warn(`⚠️ Vue3 组件引用了未注入的资源变量：${orphan.join(', ')}（可能指向不存在的图片，渲染将失败）`)
        }
      }

      logger.info('✅ Vue3 组件生成完成', { files: writtenFiles })

      return {
        files: codeResult.files,
        generatedFiles: codeResult.files,
        writtenFiles,
        componentDir: outputPath,
        componentName,
        componentStructure: {
          mainComponent: 'package/index.vue',
          subComponents: writtenFiles.filter(f => f.startsWith('package/components/')),
          styles: writtenFiles.filter(f => f.endsWith('.less'))
        },
        autoFixes: []
      }
    } catch (error) {
      logger.error('Vue3 组件生成失败', { error: error.message })
      throw error
    }
  }

  /**
   * 🛡️ 资源 import 去重保险：对单个 .vue 文件的所有 <script>/<script setup> 块，
   * 按"默认导入本地名"去重（同一名字的 `import X from '...'` 只保留首个声明）。
   *
   * 用途：防御 LLM 手写重复 import 在 injectResourceImports 未运行（resourceDomMapping 为空）
   * 时被原样写盘，导致预览时 SyntaxError: Identifier 'X' has already been declared。
   *
   * 说明：同一模块作用域内不可能存在两个同名的默认导入（这是 JS 重复声明错误），
   * 因此"保留首个、删除其余"永远是安全且正确的修复。
   *
   * @param {string} code 单份 .vue 文件源码
   * @returns {{ code: string, modified: boolean }}
   */
  dedupImportsByLocalName(code) {
    // 匹配每个 <script ...> ... </script> 块（含 <script setup> 与普通 <script>）
    const scriptBlockRe = /<script\b[^>]*>([\s\S]*?)<\/script>/g
    const blocks = []
    let m
    while ((m = scriptBlockRe.exec(code)) !== null) {
      blocks.push({
        index: m.index,
        full: m[0],
        open: m[0].slice(0, m[0].indexOf('>') + 1),
        body: m[1],
        close: '</script>'
      })
    }
    if (blocks.length === 0) return { code, modified: false }

    // 默认导入：`import Name from '...'`
    const importRe = /^[ \t]*import[ \t]+([A-Za-z_$][\w$]*)[ \t]+from[ \t]*['"]([^'"]*)['"][ \t]*;?[ \t]*$/gm

    let modified = false
    let result = ''
    let cursor = 0
    for (const b of blocks) {
      importRe.lastIndex = 0
      const seen = new Set()
      const toRemove = []
      let im
      while ((im = importRe.exec(b.body)) !== null) {
        const name = im[1]
        if (seen.has(name)) toRemove.push(im[0])
        else seen.add(name)
      }
      let newBody = b.body
      if (toRemove.length > 0) {
        for (const line of toRemove) {
          newBody = newBody.split(line).join('')
        }
        newBody = newBody.replace(/\n{3,}/g, '\n\n')
        modified = true
      }
      result += code.slice(cursor, b.index) + b.open + newBody + b.close
      cursor = b.index + b.full.length
    }
    result += code.slice(cursor)
    return { code: result, modified }
  }
}

export default Vue3Engineer
