<template>
  <div class="c-monitor-daily-total">
    <!-- sub-header：标题（左） + 时间范围下拉（右） -->
    <div class="c-monitor-daily-header">
      <div class="c-monitor-daily-title">
        <img :src="icon1" class="c-monitor-daily-title-icon" alt="icon" />
        <span class="c-monitor-daily-title-text">当日总流量</span>
      </div>
      <a-select
        v-model:value="timeRange"
        class="c-monitor-daily-select"
        size="small"
        :options="timeOptions"
        :bordered="true"
      />
    </div>

    <!-- body：整块背景横幅 + 两侧统计 -->
    <div
      class="c-monitor-daily-body"
      :style="{
        backgroundImage: `url(${bg1})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <!-- 江阴靖江长江隧道 -->
      <div class="c-monitor-daily-stat">
        <span class="c-monitor-daily-label">江阴靖江长江隧道</span>
        <span class="c-monitor-daily-value c-monitor-daily-value-tunnel">{{ tunnelValue }}</span>
      </div>

      <!-- 中部装饰留白（Figma 地图球体装饰位，原图缺失） -->
      <div class="c-monitor-daily-decoration"></div>

      <!-- 江阴大桥 -->
      <div class="c-monitor-daily-stat c-monitor-daily-stat-right">
        <span class="c-monitor-daily-label">江阴大桥</span>
        <span class="c-monitor-daily-value c-monitor-daily-value-bridge">{{ bridgeValue }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 父组件透传的业务配置（可选）
const props = defineProps({
  businessConfig: {
    type: Object,
    default: () => ({})
  }
})

// 时间范围下拉（Figma @ant/select，仅 24小时 一个选项，来源：设计稿文字清单）
const timeRange = ref('24h')
const timeOptions = ref([{ label: '24小时', value: '24h' }])

// 统计数值（逐字取自设计稿文字清单，颜色取自 Figma fills）
const tunnelValue = ref('34,620') // 江阴靖江长江隧道 #006fe3
const bridgeValue = ref('82,379') // 江阴大桥 #0c9dbe
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-total {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* sub-header：标题左对齐，下拉靠右 */
.c-monitor-daily-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 30px;
}

.c-monitor-daily-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-monitor-daily-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-title-text {
  /* Figma: 当日总流量 16px/500 #333333 */
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-daily-select {
  margin-left: auto;
  width: 100px;
  flex-shrink: 0;
}

:deep(.ant-select-selector) {
  /* Figma: 白→浅蓝渐变 + 描边 #a1ceff + 圆角4 */
  background: linear-gradient(90deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%) !important;
  border: 1px solid #a1ceff !important;
  border-radius: 4px !important;
}

:deep(.ant-select-selection-item) {
  font-size: 14px;
  color: #333333;
}

/* body：整块背景横幅 */
.c-monitor-daily-body {
  flex: 91 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.c-monitor-daily-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: 4px;
}

.c-monitor-daily-stat-right {
  align-items: flex-end;
  padding-left: 0;
  padding-right: 4px;
}

.c-monitor-daily-label {
  /* label：14px 半透明深灰 */
  font-size: 14px;
  line-height: 20px;
  color: rgba(51, 51, 51, 0.65);
  white-space: nowrap;
}

.c-monitor-daily-value {
  font-family: Roboto, 'Source Han Sans CN', sans-serif;
  font-size: 30px;
  font-weight: 900;
  line-height: 1.1;
  white-space: nowrap;
}

.c-monitor-daily-value-tunnel {
  color: #006fe3;
}

.c-monitor-daily-value-bridge {
  color: #0c9dbe;
}

/* 中部装饰位（Figma 球体/地图装饰，原图缺失，仅占位保持两侧对称） */
.c-monitor-daily-decoration {
  flex: 1;
  min-width: 0;
  height: 100%;
}
</style>
