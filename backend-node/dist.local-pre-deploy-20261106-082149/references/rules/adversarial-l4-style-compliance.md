# Adversarial Checker L4 样式合规规则

> v3.0 新增 — 检查生成的代码是否符合 scoped + less + 前缀规范

## 规则列表

### L4-001: scoped-required
- **严重性**: BLOCK
- **描述**: 每个 .vue 文件的 style 块必须同时具有 scoped 和 less 属性
- **检查逻辑**: 
  1. 找到所有 `<style ...>...</style>` 块
  2. 对于超过 3 行的块（排除纯变量定义），必须同时包含 `scoped` 和 `lang="less"`
  3. 文件中必须至少存在一个这样的有效块

### L4-002: import-index-less
- **严重性**: BLOCK  
- **描述**: scoped style 块必须引入 index.less
- **检查逻辑**:
  1. 检查 .vue 文件内容是否包含 `@import` 和 `index.less`
  2. 缺少则报告

### L4-003: class-prefix-compliance
- **严重性**: WARN
- **描述**: common.less 中的 class 应带组件前缀
- **检查逻辑**:
  1. 只检查 common.less 文件
  2. 提取所有 class 选择器 `.xxx {`
  3. 排除已有 `.c-{componentId}-` 前缀的
  4. 排除伪类 (`&`, `:root`) 和 `@keyframes`

### L4-004: no-inline-style
- **严重性**: WARN
- **描述**: 禁止静态内联 style 属性
- **检查逻辑**:
  1. 匹配 `style="..."` 模式
  2. 排除动态绑定 `:style=` 或 `${` 模板字符串
  3. 报告静态内联数量

### L4-005: sub-component-scoped
- **严重性**: BLOCK
- **描述**: 子组件 .vue 文件也必须有 scoped less
- **检查逻辑**:
  1. 只对 `components/` 目录下的 .vue 文件生效
  2. 检查是否包含 `<style lang="less" scoped`

## 输出格式

L4 检查结果合并到现有的 checkResult 输出中：

```json
{
  "checkResult": "needs_revision",
  "qualityScore": 72,
  "critiques": [...],
  "issueCategories": {
    "compliance": ["L4-001", "L4-005"],
    "structural": [],
    "stylistic": [],
    "layout": []
  },
  "l4Details": [
    {
      "ruleId": "L4-001",
      "severity": "BLOCK",
      "file": "package/components/Header.vue",
      "message": "缺少 <style lang=\"less\" scoped>"
    }
  ]
}
```
