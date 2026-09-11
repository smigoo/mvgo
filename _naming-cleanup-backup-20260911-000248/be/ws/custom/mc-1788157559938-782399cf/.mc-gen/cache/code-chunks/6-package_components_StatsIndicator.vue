<template>
  <div class="c-env-monitor-stats-indicator">
    <!-- 柱状图图标按钮 -->
    <div class="c-env-monitor-stat-icon-btn" title="柱状图">
      <img :src="icon1" alt="柱状图" class="c-env-monitor-stat-icon" />
    </div>
    <!-- 列表详情图标按钮（含计数徽标） -->
    <div class="c-env-monitor-stat-icon-btn" title="列表详情">
      <img :src="icon2" alt="列表详情" class="c-env-monitor-stat-icon" />
      <span class="c-env-monitor-stat-badge">6</span>
    </div>
  </div>
</template>

<script setup>
// 资源变量 icon1 / icon2 由系统自动注入，禁止手写 import
// 本区块为纯展示型统计指标图标区（无交互证据，按静态展示实现）
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
// === 统计指标区（icon 按钮组，含红色计数徽标）===
.c-env-monitor-stats-indicator {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-shrink: 0;
  width: 100%;
  height: 24px; // tabs-icon 区 Figma 高度 24px
  min-width: 0;
}

// 图标按钮：24×24（Figma tabs-icon 内 icon 尺寸），禁止 border
.c-env-monitor-stat-icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

// icon 图标本体：柱状图 Vector 16×15.5、列表 Vector 14.625×14.625，统一按 18px 内容尺寸还原
.c-env-monitor-stat-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
}

// 红色计数徽标：Figma num 节点 14×14、cornerRadius 29、#f53f3f、白字 12px
.c-env-monitor-stat-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f53f3f; // Figma num-bg fills SOLID #f53f3f
  border-radius: 29px; // Figma num cornerRadius 29
  color: #ffffff; // Figma "6" fills SOLID #ffffff
  font-size: calc(@fontSize * 0.86); // 设计稿 12px（@fontSize 基准换算，禁止硬编码 px）
  font-weight: 500; // Figma "6" font-weight 500
  line-height: 14px;
}
</style>
