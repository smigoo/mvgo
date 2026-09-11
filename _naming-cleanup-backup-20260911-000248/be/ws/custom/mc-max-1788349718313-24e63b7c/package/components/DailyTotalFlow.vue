<template>
  <div class="c-monitor-daily-flow-root">
    <!-- 标题行：当日总流量 + 时间选择器 -->
    <div class="c-monitor-daily-flow-header">
      <div class="c-monitor-daily-flow-title">
        <img :src="icon1" class="c-monitor-daily-flow-title-icon" alt="" />
        <span class="c-monitor-daily-flow-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-daily-flow-select-wrapper">
        <div class="c-monitor-daily-flow-select-trigger" @click="toggleTimeDropdown">
          <span class="c-monitor-daily-flow-select-value">{{ selectedTime }}</span>
          <span class="c-monitor-daily-flow-select-arrow" :class="{ open: showTimeDropdown }">▼</span>
        </div>
        <div class="c-monitor-daily-flow-select-dropdown" v-show="showTimeDropdown">
          <div
            v-for="opt in timeOptions"
            :key="opt.value"
            class="c-monitor-daily-flow-select-option"
            :class="{ active: selectedTime === opt.label }"
            @click="selectTime(opt)"
          >
            {{ opt.label }}
          </div>
        </div>
      </div>
    </div>

    <!-- 数据展示区：背景图 + 两个统计卡 -->
    <div
      class="c-monitor-daily-flow-body"
      :style="{ backgroundImage: 'url(' + bg1 + ')' }"
    >
      <!-- 江阴靖江长江隧道统计 -->
      <div class="c-monitor-daily-flow-stat-card">
        <div class="c-monitor-daily-flow-stat-label">江阴靖江长江隧道</div>
        <div class="c-monitor-daily-flow-stat-value c-monitor-tunnel">34,620</div>
      </div>

      <!-- 江阴大桥统计 -->
      <div class="c-monitor-daily-flow-stat-card">
        <div class="c-monitor-daily-flow-stat-label">江阴大桥</div>
        <div class="c-monitor-daily-flow-stat-value c-monitor-bridge">82,379</div>
      </div>

      <!-- 标题行背景装饰（bg3, bg5 归属于 t 容器） -->
      <div
        class="c-monitor-daily-flow-bg-tunnel"
        :style="{ backgroundImage: 'url(' + bg3 + ')' }"
      ></div>
      <div
        class="c-monitor-daily-flow-bg-bridge"
        :style="{ backgroundImage: 'url(' + bg5 + ')' }"
      ></div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-3561.png'
import bg1 from '../../resources/images/bg-_m-34.png'
import bg3 from '../../resources/images/bg-3475.png'
const bg5 = bg3


import { ref} from 'vue'

// 接收父组件传递的资源变量
const props = defineProps({
  bg1: { type: String, default: '' },
  bg3: { type: String, default: '' },
  bg5: { type: String, default: '' },
  icon1: { type: String, default: '' }
})

// 时间选择器状态
const showTimeDropdown = ref(false)
const selectedTime = ref('24小时')

const timeOptions = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

const toggleTimeDropdown = () => {
  showTimeDropdown.value = !showTimeDropdown.value
}

const selectTime = (opt) => {
  selectedTime.value = opt.label
  showTimeDropdown.value = false
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-daily-flow-root {// flex-grow 使用与兄弟区块统一的像素量级（Figma 区块高度约 160px）
  flex: 160 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  font-size: var(--fontSize, 14px);

}
.c-monitor-daily-flow-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  height: 30px;
  padding: 0 20px;
  box-sizing: border-box;
}

.c-monitor-daily-flow-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.c-monitor-daily-flow-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-daily-flow-title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.14);
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  white-space: nowrap;
}

// 时间选择器
.c-monitor-daily-flow-select-wrapper {
  position: relative;
  flex-shrink: 0;
}

.c-monitor-daily-flow-select-trigger {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 2px;
  background: #ffffff;
  min-width: 80px;
}

.c-monitor-daily-flow-select-value {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: var(--fontSize, 14px);
  color: #333333;
  flex: 1;
  white-space: nowrap;
}

.c-monitor-daily-flow-select-arrow {
  font-size: calc(var(--fontSize, 14px) * 0.7);
  color: #666666;
  transition: transform 0.2s;
  &.open {
    transform: rotate(180deg);
  }
}

.c-monitor-daily-flow-select-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 100;
  min-width: 80px;
}

.c-monitor-daily-flow-select-option {
  padding: 5px 12px;
  font-size: var(--fontSize, 14px);
  color: #333333;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: rgba(24, 144, 255, 0.08);
  }
  &.active {
    color: #1890ff;
    background: rgba(24, 144, 255, 0.08);
  }
}

// 数据展示区：背景图容器
.c-monitor-daily-flow-body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 8px 20px;
  box-sizing: border-box;
  overflow: hidden;
}

// 统计卡片
.c-monitor-daily-flow-stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  position: relative;
  z-index: 1;
}

.c-monitor-daily-flow-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: var(--fontSize, 14px);
  font-weight: 500;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-daily-flow-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.71);
  font-weight: 900;
  line-height: 1.2;
  white-space: nowrap;

  &.tunnel {
    // 江阴靖江长江隧道：#006fe3
    color: #006fe3;
  }

  &.bridge {
    // 江阴大桥：#0c9dbe
    color: #0c9dbe;
  }
}

// bg3 归属于隧道 t 容器（装饰背景）
.c-monitor-daily-flow-bg-tunnel {
  position: absolute;
  left: 0;
  top: 0;
  width: 50%;
  height: 100%;
  background-size: contain;
  background-position: center center;
  background-repeat: no-repeat;
  pointer-events: none;
  z-index: 0;
  opacity: 0.6;
}

// bg5 归属于大桥 t 容器（装饰背景）
.c-monitor-daily-flow-bg-bridge {
  position: absolute;
  right: 0;
  top: 0;
  width: 50%;
  height: 100%;
  background-size: contain;
  background-position: center center;
  background-repeat: no-repeat;
  pointer-events: none;
  z-index: 0;
  opacity: 0.6;
}
</style>