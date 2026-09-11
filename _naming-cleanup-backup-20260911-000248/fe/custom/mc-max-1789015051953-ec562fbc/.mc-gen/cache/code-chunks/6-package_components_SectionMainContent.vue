<template>
  <div class="c-device-monitor-section-main-content">
    <!-- 左侧垂直Tab切换栏 -->
    <div class="c-device-monitor-tab">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="['c-device-monitor-tab-item', { 'c-device-monitor-tab-item--active': activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        <span class="c-device-monitor-tab-item-text">{{ tab.name }}</span>
        <span v-if="tab.badge" class="c-device-monitor-tab-item-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div class="c-device-monitor-right-content">
      <!-- 设备汇总卡片行 -->
      <div class="c-device-monitor-switch">
        <!-- 隧道设备汇总卡（active状态） -->
        <div
          class="c-device-monitor-active"
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-tab-text-group">
            <span class="c-device-monitor-tab-name">隧道设备</span>
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-summary-label">总数:</span>
              <span class="c-device-monitor-summary-value-primary">56302</span>
            </div>
            <div class="c-device-monitor-line2">
              <span class="c-device-monitor-summary-label">异常数:</span>
              <span class="c-device-monitor-summary-value-error">5</span>
            </div>
          </div>
          <div class="c-device-monitor-icon">
            <img :src="icon1" class="c-device-monitor-tab-icon" alt="隧道设备图标" />
          </div>
        </div>

        <!-- 南北接线设备汇总卡（default状态） -->
        <div
          class="c-device-monitor-default"
          :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-tab-text-group">
            <span class="c-device-monitor-tab-name c-device-monitor-tab-name--default">南北接线 / 设备</span>
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-summary-label">总数:</span>
              <span class="c-device-monitor-summary-value-primary">1280</span>
            </div>
            <div class="c-device-monitor-line2">
              <span class="c-device-monitor-summary-label">异常数:</span>
              <span class="c-device-monitor-summary-value-error">3</span>
            </div>
          </div>
          <div class="c-device-monitor-icon">
            <img :src="icon2" class="c-device-monitor-tab-icon" alt="南北接线设备图标" />
          </div>
        </div>
      </div>

      <!-- 设备类型监测网格（cons区） -->
      <div class="c-device-monitor-cons">
        <!-- 摄像机 -->
        <div
          class="c-device-monitor-group-2136637321"
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon3" class="c-device-monitor-device-icon" alt="摄像机图标" />
          </div>
          <span class="c-device-monitor-device-name">摄像机</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-error">(2/484)</span>
          </span>
        </div>

        <!-- 烟道机器人 -->
        <div
          class="c-device-monitor-group-2136637552"
          :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon4" class="c-device-monitor-device-icon" alt="烟道机器人图标" />
          </div>
          <span class="c-device-monitor-device-name">烟道机器人</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- CO/VI检测器 -->
        <div
          class="c-device-monitor-group-2136637555"
          :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon5" class="c-device-monitor-device-icon" alt="CO/VI检测器图标" />
          </div>
          <span class="c-device-monitor-device-name">CO/VI检测器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- 光照度变送器 -->
        <div
          class="c-device-monitor-group-2136637558"
          :style="{ backgroundImage: `url(${bg6})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon6" class="c-device-monitor-device-icon" alt="光照度变送器图标" />
          </div>
          <span class="c-device-monitor-device-name">光照度变送器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- 激光雷达 -->
        <div
          class="c-device-monitor-group-2136637550"
          :style="{ backgroundImage: `url(${bg7})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon7" class="c-device-monitor-device-icon" alt="激光雷达图标" />
          </div>
          <span class="c-device-monitor-device-name">激光雷达</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- 风速风向仪 -->
        <div
          class="c-device-monitor-group-2136637553"
          :style="{ backgroundImage: `url(${bg8})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon8" class="c-device-monitor-device-icon" alt="风速风向仪图标" />
          </div>
          <span class="c-device-monitor-device-name">风速风向仪</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-error">(1/484)</span>
          </span>
        </div>

        <!-- 温湿度传感器 -->
        <div
          class="c-device-monitor-group-2136637556"
          :style="{ backgroundImage: `url(${bg9})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon9" class="c-device-monitor-device-icon" alt="温湿度传感器图标" />
          </div>
          <span class="c-device-monitor-device-name">温湿度传感器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- 紧急电话 -->
        <div
          class="c-device-monitor-group-2136637559"
          :style="{ backgroundImage: `url(${bg10})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon10" class="c-device-monitor-device-icon" alt="紧急电话图标" />
          </div>
          <span class="c-device-monitor-device-name">紧急电话</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- 超高检测器 -->
        <div
          class="c-device-monitor-group-2136637551"
          :style="{ backgroundImage: `url(${bg11})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon11" class="c-device-monitor-device-icon" alt="超高检测器图标" />
          </div>
          <span class="c-device-monitor-device-name">超高检测器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- CO2传感器 -->
        <div
          class="c-device-monitor-group-2136637554"
          :style="{ backgroundImage: `url(${bg12})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon12" class="c-device-monitor-device-icon" alt="CO2传感器图标" />
          </div>
          <span class="c-device-monitor-device-name">CO2传感器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- 压力传感器 -->
        <div
          class="c-device-monitor-group-2136637557"
          :style="{ backgroundImage: `url(${bg13})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon13" class="c-device-monitor-device-icon" alt="压力传感器图标" />
          </div>
          <span class="c-device-monitor-device-name">压力传感器</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>

        <!-- 水质监测设备 -->
        <div
          class="c-device-monitor-group-2136637560"
          :style="{ backgroundImage: `url(${bg14})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-device-monitor-bg">
            <img :src="icon14" class="c-device-monitor-device-icon" alt="水质监测设备图标" />
          </div>
          <span class="c-device-monitor-device-name">水质监测设备</span>
          <span class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 系统自动注入资源变量，无需手写 import
const tabs = [
  { id: 'monitor', name: '监控', badge: '3/3740' },
  { id: 'lighting', name: '照明', badge: '3' },
  { id: 'ventilation', name: '通风', badge: null },
  { id: 'power', name: '供配电', badge: null },
  { id: 'fire', name: '消防', badge: null },
  { id: 'traffic', name: '交通诱导', badge: null },
]

const activeTab = ref('monitor')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-section-main-content {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.c-device-monitor-tab {
  display: flex;
  flex-direction: column;
  width: 46px;
  flex-shrink: 0;
  overflow: hidden;
}

.c-device-monitor-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  cursor: pointer;
  position: relative;
  min-height: 40px;

  .c-device-monitor-tab-item-text {
    font-size: calc(@fontSize * 1);
    font-family: 'Source Han Sans CN', sans-serif;
    font-weight: 400;
    color: var(--colorTextSecondary, #666666);
    writing-mode: vertical-lr;
    text-align: center;
    line-height: 16px;
  }

  .c-device-monitor-tab-item-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 14px;
    height: 14px;
    padding: 0 2px;
    border-radius: 7px;
    font-size: calc(@fontSize * 0.857);
    font-family: 'Roboto', sans-serif;
    font-weight: 500;
    line-height: 14px;
    text-align: center;
    background: var(--colorError, #ff4d4f);
    color: #ffffff;
  }

  &.c-device-monitor-tab-item--active {
    .c-device-monitor-tab-item-text {
      font-weight: 700;
      color: var(--colorPrimary, #1990ff);
    }

    .c-device-monitor-tab-item-badge {
      background: var(--colorPrimaryBg, #edf4fb);
      color: var(--colorPrimary, #1990ff);
      border: 1px solid var(--colorPrimary, #1990ff);
    }
  }
}

.c-device-monitor-right-content {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.c-device-monitor-switch {
  display: flex;
  flex-direction: row;
  flex: 0 0 65px;
  gap: 8px;
  overflow: hidden;
}

.c-device-monitor-active,
.c-device-monitor-default {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-width: 0;
  align-items: center;
  padding: 8px;
  gap: 8px;
  border-radius: 6px;
  overflow: hidden;
}

.c-device-monitor-tab-text-group {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  gap: 2px;
}

.c-device-monitor-tab-name {
  font-family: 'YouSheBiaoTiHei', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: #ffffff;
  line-height: 1.3;

  &.c-device-monitor-tab-name--default {
    color: var(--colorTextBase, #333333);
  }
}

.c-device-monitor-line1,
.c-device-monitor-line2 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-monitor-summary-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: var(--colorTextBase, #333333);
  line-height: 21px;
}

.c-device-monitor-summary-value-primary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorPrimary, #1990ff);
  line-height: 23px;
}

.c-device-monitor-summary-value-error {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorError, #ff4d4f);
  line-height: 23px;
}

.c-device-monitor-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-device-monitor-tab-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-monitor-cons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  flex: 1 1 0;
  min-height: 0;
  gap: 4px;
  overflow: hidden;
}

.c-device-monitor-group-2136637321,
.c-device-monitor-group-2136637552,
.c-device-monitor-group-2136637555,
.c-device-monitor-group-2136637558,
.c-device-monitor-group-2136637550,
.c-device-monitor-group-2136637553,
.c-device-monitor-group-2136637556,
.c-device-monitor-group-2136637559,
.c-device-monitor-group-2136637551,
.c-device-monitor-group-2136637554,
.c-device-monitor-group-2136637557,
.c-device-monitor-group-2136637560 {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  overflow: hidden;
}

.c-device-monitor-bg {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: var(--colorTextBase, #333333);
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.c-device-monitor-device-num-error {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: var(--colorError, #ff4d4f);
  line-height: 18.75px;
}

.c-device-monitor-device-num-secondary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: var(--colorTextSecondary, #666666);
  line-height: 18.75px;
}
</style>