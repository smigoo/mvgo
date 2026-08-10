# Figma 预览图覆盖核查

## 结论
当前**不能认定所有已生成组件都一定有 Figma 预览图**。

更准确地说：
- **生成链路默认会产出**预览图，且 Vue3 / 微码两条链路都大量存在 `resources/images/mc-preview.png`
- 但这件事目前是**约定型产物**，不是**强制型约束**
- 因此历史组件里已经出现了**缺失样本**，不能直接把“应该有”当成“全部都有”

## 代码链路判断

### Vue3 组件
- 组件记录会保存 `figmaFileKey` / `figmaNodeId` / `figmaWidth` / `figmaHeight`
- 位置：`backend-node/src/vue3/vue3.service.ts`
- 关键行为：
  - `createComponent(...)` 会把 Figma 关联信息写入组件记录
  - `copyToWorkspaceVue3(...)` 会把生成产物复制到前后端 workspace
  - 当前 `saveComponentMeta(...)` 只写 `requirementDoc` / `docAnalysis`，**并不负责保存 Figma 预览图状态**

### 微码组件
- 组件记录同样会保存 `figmaFileKey` / `figmaNodeId` / `figmaWidth` / `figmaHeight`
- 位置：`backend-node/src/phase2/phase2.service.ts`
- 微码目录里通常还能看到：
  - `resources/images/mc-preview.png`
  - `.checkpoint/figma.json`
- 说明微码链路对 Figma 侧缓存更完整一些，但同样没有看到“缺图即失败”的硬校验

### 前端消费方式
- 组件详情页用 `metadata.figmaFileKey` + `metadata.figmaNodeId` 组装 Figma 源链接
- 位置：`frontend/src/views/components/ComponentDetail.vue`
- 这说明系统依赖 Figma 元信息，但**并没有在详情页层面校验 `mc-preview.png` 必须存在**

## 当前 workspace 实际扫描结果

### 前端 workspace
扫描目录：`frontend/workspace`

#### Vue3
- 总数：13
- 有 `resources/images/mc-preview.png`：12
- 缺失：1
  - `mv-1785682295659-bf908f99`

#### 微码
- 总数：5
- 有 `resources/images/mc-preview.png`：5
- 缺失：0
- 且 5/5 都有 `.checkpoint/figma.json`

### 后端 workspace
扫描目录：`backend-node/workspace`

#### Vue3
- 总数：15
- 有 `resources/images/mc-preview.png`：13
- 缺失：2
  - `mv-1785682295659-bf908f99`
  - `mv-1785691963555-bec4826c.quality-backup-74517-1785694830917`

#### 微码
- 总数：12
- 有 `resources/images/mc-preview.png`：10
- 缺失：2
  - `mv-1785476361986-656d534c`
  - `mv-1785590539039-fe143a0f`

> 注：后端 `custom-components` 下出现了部分 `mv-*` 目录，这些命名不符合标准微码组件 `mc-*` 习惯，更像历史迁移 / 异常落盘 / 兼容目录，不能直接当成干净样本。

## 关键判断
1. **现状不是全量齐备**
   - 至少 Vue3 已存在缺图样本
   - 后端 workspace 还有历史/备份/异常目录混杂

2. **“有 Figma 关联信息” 不等于 “有本地 Figma 预览图”**
   - `figmaFileKey` / `figmaNodeId` 可以存在
   - 但 `mc-preview.png` 仍可能缺失

3. **当前没有硬保证机制**
   - 生成成功并不会因为 `mc-preview.png` 缺失而失败
   - 也没有统一巡检把缺图组件标红或补齐

## 如果你的要求是“以后必须都有”
需要把它从“约定”升成“规则”。建议这样定：

### 1. 定义统一标准
无论 Vue3 还是微码，统一以：
- `resources/images/mc-preview.png`
作为**组件 Figma 预览图标准路径**

### 2. 生成阶段加硬校验
在组件生成完成前增加校验：
- 如果 `mc-preview.png` 不存在，任务状态不能记为成功
- 至少应标记为“部分成功 / 待补图”

### 3. 组件入库时记录显式字段
建议新增统一元数据字段，例如：
- `figmaPreviewPath`
- `hasFigmaPreview: true/false`
- `figmaPreviewGeneratedAt`

这样后面做 AI 对比按钮时，不用再靠扫目录推断

### 4. 增加历史补齐脚本
对现有组件跑一次巡检：
- 有 `figmaFileKey + figmaNodeId` 但没图：重新拉 Figma 图
- 连 Figma 元信息都没有：标记为不可比对

## 建议的业务结论
如果你现在就要推进“AI 优化按钮”，前置条件不要写成“我假设所有组件都已有 Figma 预览图”。

更稳的前置条件应该是：
- **第一步先补齐并强制化 Figma 预览图资产**
- 然后再上“截图对比 -> 分析报告 -> AI 优化”链路

否则你后面会在按钮点击时遇到一类很烦的异常：
- 有组件能分析
- 有组件只有 Figma ID 没本地图
- 有组件既没图也没足够元信息

这会把一个本来应该稳定的按钮做成半随机功能。

## 推荐下一步
1. 先做“Figma 预览图强约束方案”
2. 再做“历史组件补图脚本”
3. 最后接 AI 对比/优化按钮
