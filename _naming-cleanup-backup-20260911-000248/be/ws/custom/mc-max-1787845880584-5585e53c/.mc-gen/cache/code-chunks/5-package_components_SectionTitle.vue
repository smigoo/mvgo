<template>
  <div class="c-env-monitor-section-title">
    <div class="c-env-monitor-title-wrapper">
      <div class="c-env-monitor-title-icon"></div>
      <div 
        class="c-env-monitor-title-line" 
        :style="{ backgroundImage: 'url(' + bg2 + ')' }"
      ></div>
      <span class="c-env-monitor-title-text">环境监测</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量（系统注入）
const bg2 = ref('../resources/images/bg-7890.png')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
```

**生成说明**：

1. **组件结构**：根据 layoutStructure 中 `section-title` 的定义，这是一个包含标题文字和装饰元素的区域
2. **资源使用**：
   - `bg2` 用于标题装饰线背景图
   - 使用 `:style` 动态绑定背景图（不在 CSS 中使用变量）
3. **Class 命名**：所有 class 使用 `.c-env-monitor-` 前缀
4. **样式导入**：使用 `<style lang="less" scoped>` 并导入 `index.less`
5. **文字内容**：严格使用设计稿文字清单中的"环境监测"

该组件是一个展示型组件，无交互逻辑，样式将在 `common.less` 中统一定义。