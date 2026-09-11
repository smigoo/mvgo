<template>
  <!-- 顶部标题区：包含状态指示图标与渐变标题文字 -->
  <div class="mv3-env-monitor-header">
    <div class="header-content">
      <!-- 状态指示小圆点图标（系统自动注入 icon1 变量） -->
      <img :src="icon1" class="header-icon" alt="status" />
      <!-- 渐变标题文字 -->
      <span class="header-title">{{ title }}</span>
    </div>
    <!-- 底部装饰线 -->
    <div class="header-decoration"></div>
  </div>
</template>

<script setup>
const icon1 = new URL('../../resources/images/g-7883.png', import.meta.url).href /** * 环境监测面板 - 顶部标题区子组件 * 渲染面板标题、状态指示图标及底部装饰线 * 数据来源：静态标题文本，图标由系统资源映射自动注入 */
import { ref} from 'vue'

// #region 3. 响应式状态
// 标题文本（支持后续 API 绑定替换）
const title = ref('环境监测') // #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* [Layout Refine] Figma header bbox: x=1495, y=875, width=377, height=28 */
.mv3-env-monitor-header {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 28px;
  box-sizing: border-box;

  /* [Layout Refine] Figma layoutMode=HORIZONTAL → flex-direction: row */
  .header-content {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    height: 19px;

    .header-icon {
      width: 8px;
      height: 8px;
      object-fit: contain;
      flex-shrink: 0;
    }

    /* [Style Refine] fills → gradient from rgb(25,144,255) to rgba(90,126,255,0.83) */
    .header-title {
      font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
      font-size: 16px;
      font-weight: 700;
      line-height: 19px;
      background: linear-gradient(90deg, rgb(25, 144, 255) 0%, rgba(90, 126, 255, 0.83) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
  }

  /* [Style Refine] Vector 1484 stroke gradient + Vector 1476 fill gradient */
  .header-decoration {
    width: 100%;
    height: 6px;
    margin-top: 4px;
    background: linear-gradient(90deg, rgba(85, 158, 255, 0.3) 0%, rgba(85, 158, 255, 0) 100%);
  }
}
</style>