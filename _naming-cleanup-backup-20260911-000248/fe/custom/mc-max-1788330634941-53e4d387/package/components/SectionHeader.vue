<template>
  <div class="c-env-monitor-header">
    <!-- 装饰圆徽章（Figma 节点 g，8×8） -->
    <div class="c-env-monitor-header-badge" aria-hidden="true">
      <div class="c-env-monitor-header-badge-inner">
        <div class="c-env-monitor-header-badge-core"></div>
      </div>
    </div>
    <!-- 装饰水平线（Figma 节点 Vector 1476，362×6，渐变 #559eff） -->
    <div class="c-env-monitor-header-line" aria-hidden="true"></div>
  </div>
</template>

<script setup>
// SectionHeader：base-panel 标题栏左侧装饰区
// 仅渲染设计稿中的装饰元素（圆徽章 + 水平渐变线），
// 标题文字「环境监测」由 base-panel 按 declare.json.componentName 自动渲染，禁止重复生成。
// 本组件无资源依赖、无 props、无业务逻辑——所有装饰均由 CSS 实现（Figma 节点为纯色/渐变填充，非图片）。
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
// === 标题区装饰（base-panel title_left 插槽） ===
.c-env-monitor-header {
flex: 1 1 0;

  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

// 圆形装饰徽章：外层黑色圆
.c-env-monitor-header-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #000000;  // Figma SOLID #000000;
}

// 内层渐变圆（Figma GRADIENT_LINEAR #1252fa → #d6effc）
.c-env-monitor-header-badge-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
}

// 核心路径装饰（Figma SOLID #559eff）
.c-env-monitor-header-badge-core {
  width: 2.4px;
  height: 2.4px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #559eff;  // Figma SOLID #559eff;
}

// 水平装饰线（Figma GRADIENT_LINEAR #559eff → #559eff）
.c-env-monitor-header-line {
  flex: 1;
  min-width: 0;
  height: 6px;
  background: linear-gradient(180deg, #559eff 0%, #559eff 100%);
}
</style>