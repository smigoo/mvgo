# Less Class 命名约定

## 1. 前缀体系

| 前缀格式 | 用途 | 示例 |
|---------|------|------|
| `.c-{componentId}-` | 组件级公共 class（放入 common.less） | `.c-mmmm-tab-item` |
| （无前缀） | 组件内部私有 class（仅在单个 .vue 的 scoped 中使用） | `.active`, `.hover` |
| `--em-` | CSS 变量（放入 vars.less） | `--em-primary` |

## 2. BEM 风格变体

微码组件采用**简化 BEM** 格式：

```
.block__element--modifier

示例:
.c-mmmm                    → Block (根容器)
.c-mmmm__header            → Element (头部区域)
.c-mmmm__tab--active       → Element + Modifier (激活状态的 tab)
.c-mmmm__badge--alert      → Element + Modifier (告警状态的徽章)
```

**注意**：这是推荐风格而非强制。对于简单组件，扁平化的 `.c-{id}-{name}` 也完全可以接受。

## 3. 状态类命名

表示交互/显示状态的 class：

```less
// 推荐使用 & 结合符
.c-mmmm-tab-item {
  &--active { ... }     // 激活态
  &--disabled { ... }   // 禁用态
  &--hover { ... }      // 悬停态（通常用 &:hover 替代）
}

// 或者用 .is- 前缀（传统方式也可）
.c-mmmm-tab-item.is-active { ... }
.c-mmmm-tab-item.is-disabled { ... }
```

## 4. 间距/尺寸类命名

如果需要在 common.less 中定义间距工具类：

```less
// ✅ 带前缀
.c-mmmm-mt-xs { margin-top: 4px; }
.c-mmmm-mt-sm { margin-top: 8px; }
.c-mmmm-mt-md { margin-top: 16px; }
.c-mmmm-gap-sm { gap: 8px; }

// ❌ 通用工具类（容易冲突，不建议放在 common.less）
.mt-4 { margin-top: 4px; }
.gap-2 { gap: 8px; }
```

## 5. 禁止使用的命名

以下 class 名称**禁止**出现在 common.less 中：

```
.container, .wrapper, .content, .main
.item, .box, .card, .row, .col
.text, .title, .header, .footer, .sidebar
.btn, .button, .input, .form, .label
.icon, .image, .img, .avatar
.active, .selected, .current, .visible, .hidden
.show, .hide, .open, .close
.first, .last, .next, .prev
.left, .right, .top, .bottom
.big, .small, .large, .medium
.red, .blue, .green, .yellow (颜色名)
```

如需使用上述词语，**必须加组件前缀限定**：`.c-mmmm-btn`, `.c-mmmm-header`
