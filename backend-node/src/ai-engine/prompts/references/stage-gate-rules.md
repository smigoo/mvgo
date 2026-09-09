# frontend-mc-code-reviewer 阶段门禁规则

> 目标：把原本分散在 `stage*-review-report`、validator、prompt 里的 reviewer 标准统一下来。当前阶段先外置规则，不改 gate 计算内核。

## 0. 产物新鲜度检查（前置步骤）

审查前必须先检查产物新鲜度：

### 检查步骤
1. 读取 `.mc-gen/env.json.stateFingerprint`
2. 读取 `.mc-gen/cache/stage*-review-report.md` 的修改时间
3. 对比当前代码文件的实际大小/行数

### 判断逻辑
```
如果 stateFingerprint.timestamp > review-report 修改时间:
  → 产物已变更，旧报告失效，需重新审查

如果 当前文件大小/行数 ≠ stateFingerprint 记录:
  → 产物已变更，fingerprint 未更新，需重新审查

否则:
  → 产物未变更，可参考旧报告
```

### 输出示例
```markdown
## 产物新鲜度
- stateFingerprint: 2026-05-08 15:30:00
- 最新 review report: 2026-05-08 14:20:00
- 结论: ⚠️ 产物在审查后被修改，需重新审查
```

## 1. 审查总原则

- 以当前代码和当前产物为准，旧 report 只能参考。
- 优先指出根因，而不是只描述现象。
- 能精确到文件、产物、阶段，就必须精确。
- reviewer 不负责直接放行，只给 `PASS / WARN / BLOCK`。

## 2. 结论定义

### PASS

- 当前阶段目标已达成
- 没有阻断下一阶段的严重问题

### WARN

- 当前阶段基本可继续
- 有非阻断风险，知用户

### BLOCK

- 存在结构、规范、资源、视觉归属、运行时或配置消费问题
- 修复前不得进入下一阶段

## 2.5 错误分级标注

审查时必须标注错误级别，便于 frontend-mc-leader 路由处理。

### 标注格式

```markdown
## 阻断项
- [L1] 图表 tooltip 被禁用
- [L3] 所有图表都缺少容器高度链（疑似脚本问题）

## 非阻断提醒
- [L2] 头部对齐偏差 3px（可优化）
- [L3] tab 切换器位置不明确（需确认设计）
```

### 结论判断规则

- **只有 L1**: `PASS` → 可快速修复，不阻断
- **有 L2**: `WARN` → 需确认，但可继续
- **有 L3**: `BLOCK` → 需处理根因，暂停推进

### 特殊情况

如果 L3 问题不影响当前阶段目标，可标记为 `WARN` 并注明：
```
- [L3 non-blocking] requirement 配置项语义不明 → 不影响 preview 阶段，可继续
```

## 2.6 差异化检查策略（能耗优化）

### 检查深度定义

**quick（快速验证）**：
- 只检查视觉还原度
- 跳过结构和规范检查
- 预计耗时：5-10秒

**medium（中度检查）**：
- 检查配置消费链路
- 验证声明与代码一致性
- 预计耗时：10-15秒

**full（完整检查）**：
- 全面审查所有维度
- 按标准门禁规则执行
- 预计耗时：20-30秒

### 检查策略路由

```
收到 frontend-mc-developer 反馈 → 读取修改类型 → 选择检查深度

style-tweak → quick
config-update → medium
structure-change → full
feature-add → full
```

### 自动通过清单

以下修改可自动标记为 PASS，无需详细审查：

**样式类**：
- 颜色值在色板范围内的调整
- 间距调整 ±5px 以内
- 字号在层级规范内的调整

**配置类**：
- describe 字段补充
- 注释更新
- 示例值更新

**判断逻辑**：
```
如果修改符合自动通过清单:
  → 输出: 结论 PASS（自动通过）
  → 说明: 修改符合规范，无需详细审查
  → 耗时: <1秒
```

### 输出格式

```markdown
# frontend-mc-code-reviewer 审查结果
- 检查深度: quick（基于修改类型 style-tweak）
- 检查项: 视觉还原度
- 跳过项: 结构检查、规范检查（未变更）
- 结论: PASS
```

## 2.7 增量与回归检查规划

### 影响范围分析

| 修改类型 | 影响范围 | 影响深度 | 回归策略 |
|---------|---------|---------|---------|
| style-tweak | 局部 | 表层 | 纯增量 |
| config-update | 中等 | 中层 | 增量+轻量回归 |
| structure-change | 全局 | 深层 | 完整+全面回归 |
| feature-add | 全局 | 深层 | 完整+全面回归 |

### 检查策略矩阵

**策略1：纯增量检查**
- 适用：局部影响的修改
- 检查：只检查修改的文件
- 回归：不检查其他部分
- 耗时：5-10秒

**策略2：增量 + 轻量回归**
- 适用：中等影响的修改
- 检查：修改的文件 + 直接关联部分
- 回归：同类元素、配置消费链路
- 耗时：15-20秒

**策略3：完整检查 + 全面回归**
- 适用：全局影响的修改
- 检查：所有文件和关联功能
- 回归：所有基础交互、配置、事件
- 耗时：30-40秒

### 累积修改监控

**触发条件**（满足任一即触发全面回归）：
```
累积修改次数 ≥ 5次
或
涉及文件数 ≥ 3个
或
距离上次回归 ≥ 30分钟
或
累积风险分数 ≥ 10分
```

**风险分数**：
- style-tweak: 1分
- config-update: 2分
- structure-change: 5分
- feature-add: 5分

### 轻量回归清单

```markdown
## 轻量回归检查项

### 视觉一致性
- [ ] 同类元素字号一致
- [ ] 同类元素颜色一致
- [ ] 间距符合栅格规范

### 配置消费
- [ ] 新增配置在代码中被消费
- [ ] 配置变更后组件响应正确

### 基础交互（仅检查相关部分）
- [ ] 修改区域的交互正常
- [ ] 相关联动未被破坏
```

### 全面回归清单

```markdown
## 全面回归检查项

### 结构完整性
- [ ] base-panel 结构正确
- [ ] 插槽归属正确
- [ ] DOM 层级合理

### 所有基础交互
- [ ] tab 切换正常
- [ ] tooltip 显示正常
- [ ] legend 联动正常
- [ ] resize 响应正常

### 所有配置消费
- [ ] businessConfig 全部生效
- [ ] cssVariableConfig 全部生效
- [ ] layoutConfig 切换正常

### 所有事件链路
- [ ] onload 事件触发
- [ ] 业务事件发布正常
- [ ] 状态变更正常
```

### 审查输出格式扩展

```markdown
# frontend-mc-code-reviewer 审查结果
- 组件：`c-lljc`
- 阶段：`preview`
- 检查策略：增量 + 轻量回归
- 修改影响：中等（字号调整影响同类元素）
- 回归范围：视觉一致性、相关交互
- 累积状态：3次修改，风险分数 4/10
- 结论：`PASS`
- 是否允许进入下一阶段：`是`

## 阻断项
- 无

## 非阻断提醒
- 建议下次累积达到5次修改时进行全面回归

## 下一步建议
- 可继续下一阶段
```

## 2.8 自动修复建议（效率优化）

### 目标
为L1和L2问题自动生成修复建议，减少developer分析时间。

### L1问题修复建议模板

对于L1可自动修复的问题，提供完整的修复代码：

```markdown
## 阻断项
- [L1] 图表tooltip缺失

**自动修复建议**：
```javascript
// 修复位置：package/components/chart.vue:45
// 在 option 中添加
tooltip: {
  trigger: 'axis',
  axisPointer: {
    type: 'cross'
  }
}
```

**预计耗时**：<1分钟
**修复后需验证**：tooltip显示正常
```

### L2问题修复方案

对于L2需确认的问题，提供多个方案：

```markdown
## 非阻断提醒
- [L2] 头部对齐偏差3px

**修复方案**：

**方案A（推荐）**：使用flex布局
```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```
优点：响应式，易维护
缺点：需调整现有结构

**方案B**：使用margin
```css
.header-right {
  margin-left: auto;
}
```
优点：改动最小
缺点：不够灵活

**方案C**：固定间距
```css
.header-right {
  margin-left: 3px;
}
```
优点：精确控制
缺点：不响应式
```

### 修复建议生成规则

**必须包含**：
- 修复位置（文件路径和行号）
- 具体修复代码
- 预计耗时
- 修复后验证项

**可选包含**：
- 多个方案（L2问题）
- 方案优缺点对比
- 相关文档链接

## 3. preview gate

### 必查

- 文件完整性
- placeholder / TODO / Markdown 围栏残留
- 微码规范是否满足
- 头部与内容区边界
- 图表是否可见
- tooltip 是否可用
- 是否臆造卡片壳、边框、阴影、背景
- **🔴 视觉还原度检查（新增）**：是否缺少预览图中明确可见的样式

### 🔴 视觉还原度检查（详细说明）

**检查方法：**
1. 对比预览图和生成的代码，逐个元素检查样式完整性
2. 重点检查以下样式是否缺失：
   - 卡片背景色/渐变效果
   - 导航项背景色/高亮效果
   - 阴影效果
   - 边框
   - 圆角
3. 如果预览图中明确可见某个样式，但代码中没有生成，标记为 BLOCK

**判断标准：**
- ✅ PASS：生成的样式与预览图基本一致，主要视觉元素都已还原
- ⚠️ WARN：缺少部分次要样式（如细微的阴影、圆角等），但不影响整体视觉效果
- ❌ BLOCK：缺少主要样式（如卡片背景色、导航高亮等），导致视觉效果与预览图差距很大

**示例：**
```markdown
## 视觉还原度检查
- 预览图中顶部卡片有蓝色渐变背景 → 代码中缺失 → ❌ BLOCK
- 预览图中左侧导航项有背景色和高亮效果 → 代码中缺失 → ❌ BLOCK
- 预览图中设备卡片有白色背景和阴影 → 代码中缺失 → ❌ BLOCK
```

### 典型 BLOCK

- `base-panel` 或 `$mcComponentBuilder()` 缺失
- 标题区控件出现在内容区
- 图表容器存在但图表不可见
- 面板头部装饰被错误复制到内容区

## 4. figma gate

### 必查

- 是否保留 preview 正确结构
- Figma 资源是否被实际引用
- 头部插槽归属是否正确
- 是否出现无证据的通用卡片壳或装饰样式
- 图表尺寸链路、tooltip、背景尺寸是否正确
- 视觉语义是否与设计一致

### 典型 BLOCK

- preview 正确布局被推翻
- 头部圆点、分割线、tab 装饰泄漏到内容区
- 子组件被统一套上白底、阴影、边框
- 背景图存在但未设置尺寸 / 定位导致视觉缺失

## 5. req-d gate

### 必查

- 是否只更新 `requirement.md`
- 是否误改代码文件

### 典型 BLOCK

- `requirement.md` 外的文件被修改

## 6. req gate

### 必查

- 事件、状态、接口是否与 requirement 对齐
- 是否破坏 preview / figma 已有结构
- 是否删除已有正确基础交互

### 典型 BLOCK

- requirement 未要求的交互被擅自加入
- 原有 tab / tooltip / resize / legend 联动被破坏

## 7. req-s gate

### 必查

- 新增配置是否真正被代码消费
- 是否只改声明不改运行时代码
- 是否引入新的不可控结构偏移

### 典型 BLOCK

- `declare.json` 有配置项，但组件代码未消费

## 8. reviewer 输出模板

```markdown
# frontend-mc-code-reviewer 审查结果
- 组件：`<name>`
- 阶段：`<stage>`
- 结论：`PASS / BLOCK / WARN`
- 是否允许进入下一阶段：`是 / 否`

## 阻断项
- ...

## 非阻断提醒
- ...

## 下一步建议
- ...
```

## 10. 专项规范校验

### 10.1 多布局组件校验

适用条件：组件存在多个布局变体（如 `layout-default` 和 `layout-two` 目录）

#### 校验项

| 校验项 | 严重级别 | 说明 |
|--------|----------|------|
| 主入口有布局切换逻辑 | L2 | `package/index.vue` 必须根据 `layoutType` 动态切换布局 |
| 主入口有 base-panel | L2 | 必须使用 `base-panel` 包裹内容 |
| declare.json 有 layoutConfig | L3 | 必须定义 `layoutConfig` 配置 |
| declare.json 有 layoutType | L3 | `businessConfig` 必须有 `layoutType` 配置项 |
| 布局入口引入样式 | L2 | 每个布局入口必须引入 `index.less` 和布局特定样式 |
| 布局目录命名正确 | L2 | 目录名必须与 `layoutConfig.list[].componentsDir` 一致 |

#### 校验示例

```javascript
// 检查主入口
const hasLayoutSwitch = indexVueContent.includes('v-if="isDefaultLayout"') ||
                        indexVueContent.includes('v-if="layoutType"');
const hasBasePanel = indexVueContent.includes('<base-panel');

// 检查 declare.json
const hasLayoutConfig = declareJson.layoutConfig?.list?.length >= 2;
const hasLayoutTypeConfig = declareJson.businessConfig?.some(
  item => item.key === 'layoutType'
);
```

### 10.2 CSS 变量配置校验

适用条件：组件声明了 `cssVariableConfig`

#### 校验项

| 校验项 | 严重级别 | 说明 |
|--------|----------|------|
| CSS 变量使用 camelCase | L2 | 必须使用 `--fontSize` 而非 `--font-size` |
| theme-vars.less 有变量映射 | L3 | `.common()` mixin 必须映射所有 CSS 变量到 Less 变量 |
| .common() 被调用 | L3 | 文件末尾必须有 `.common();` 调用 |
| 样式使用 var() | L2 | 必须使用 `var(--key, @fallback)` 形式 |

#### CSS 变量命名规范

| declare.json key | ✅ 正确 CSS 变量 | ❌ 错误写法 |
|------------------|------------------|-------------|
| `fontSize` | `--fontSize` | `--font-size` |
| `colorTextBase` | `--colorTextBase` | `--color-text-base` |
| `fontWeightStrong` | `--fontWeightStrong` | `--font-weight-strong` |
| `colorPrimary` | `--colorPrimary` | `--color-primary` |

#### 校验示例

```javascript
// 检查 CSS 变量命名
const hasKebabCase = lessContent.match(/--font-size|--color-text-base/);
if (hasKebabCase) {
  return { level: 'L2', message: 'CSS 变量必须使用 camelCase 格式' };
}

// 检查 .common() mixin
const hasCommonMixin = themeVarsContent.includes('.common()') &&
                       themeVarsContent.includes('.common();');
if (!hasCommonMixin) {
  return { level: 'L3', message: 'theme-vars.less 缺少 .common() mixin 或调用' };
}

// 检查变量映射
const cssVarKeys = declareJson.cssVariableConfig.map(c => c.key);
const hasAllMappings = cssVarKeys.every(key => 
  themeVarsContent.includes(`@${key}:`)
);
if (!hasAllMappings) {
  return { level: 'L3', message: `.common() 未映射所有 CSS 变量: ${cssVarKeys}` };
}
```

### 10.3 校验命令速查

```bash
# 多布局校验
grep -r "layoutType\|layout-two\|layout-default" package/
grep "layoutConfig" declare.json

# CSS 变量命名校验
grep -r "\-\-font-size\|\-\-color-text-base\|\-\-font-weight" resources/styles/
grep "\.common();" resources/styles/themes/theme-vars.less

# 检查 .common() 映射
grep -E "@fontSize:|@colorTextBase:|@colorPrimary:" resources/styles/themes/theme-vars.less
```
