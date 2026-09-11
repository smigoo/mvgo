<template>
  <!-- 环境监测面板标题区：包含左侧装饰图标、标题文字、底部渐变分隔线 -->
  <div class="section-header">
    <!-- 标题行：装饰图标 + 标题文字 -->
    <div class="header-top">
      <!-- 左侧装饰图标组（圆形+菱形组合） -->
      <div class="header-decoration">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- 外圆（黑色描边） -->
          <circle cx="4" cy="4" r="3.5" stroke="#000000" stroke-width="1" fill="none" />
          <!-- 内圆（渐变填充） -->
          <circle cx="4" cy="4" r="3" fill="url(#gradient-circle)" />
          <!-- 菱形装饰 -->
          <path d="M4 1.6L5.2 4L4 6.4L2.8 4Z" fill="#559eff" />
          <defs>
            <linearGradient id="gradient-circle" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1252fa" />
              <stop offset="100%" stop-color="#d6effc" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <!-- 标题文字（渐变色） -->
      <div class="header-title">环境监测</div>
    </div>

    <!-- 渐变分隔线 -->
    <div class="header-divider"></div>
  </div>
</template>

<script setup>
// #region Props定义
// 无需接收外部数据，标题文字固定为"环境监测"
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 标题区容器 */
.section-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

/* 标题行：横向排列装饰图标和文字 */
.header-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

/* 左侧装饰图标容器 */
.header-decoration {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 标题文字：渐变色 #1990ff → #5a7eff */
.header-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.05em;
}

/* 渐变分隔线（Vector 1476）：蓝色 → 透明 */
.header-divider {
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, #559eff 0%, rgba(85, 158, 255, 0) 100%);
}
</style>