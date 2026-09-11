<template>
  <div class="c-device-monitor-tab">
    <!-- 左侧垂直Tab切换栏 -->
    <div class="c-device-monitor-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="['c-device-monitor-tab-item', { 'c-device-monitor-tab-item--active': activeTab === tab.id }]"
        @click="handleTabClick(tab.id)"
      >
        <div class="c-device-monitor-tab-item-bg"></div>
        <div class="c-device-monitor-tab-item-content">
          <span class="c-device-monitor-tab-item-text">{{ tab.name }}</span>
          <div v-if="tab.badge" class="c-device-monitor-tab-item-badge" :class="tab.badgeType === 'primary' ? 'c-device-monitor-tab-item-badge--primary' : 'c-device-monitor-tab-item-badge--error'">
            {{ tab.badge }}
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div class="c-device-monitor-cons">
      <!-- 设备汇总卡片行 -->
      <div class="c-device-monitor-cons-header">
        <!-- 隧道设备汇总卡 -->
        <div
          class="c-device-monitor-group-2136637321"
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon1" class="c-device-monitor-summary-icon" alt="隧道设备图标" />
          <div class="c-device-monitor-bg">
            <div class="c-device-monitor-summary-title">隧道设备</div>
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-summary-label">总 数:</span>
              <span class="c-device-monitor-summary-value-primary">56302</span>
            </div>
            <div class="c-device-monitor-line2">
              <span class="c-device-monitor-summary-label">异常数:</span>
              <span class="c-device-monitor-summary-value-error">5</span>
            </div>
          </div>
        </div>

        <!-- 南北接线设备汇总卡 -->
        <div
          class="c-device-monitor-group-2136637552"
          :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon2" class="c-device-monitor-summary-icon" alt="南北接线设备图标" />
          <div class="c-device-monitor-bg">
            <div class="c-device-monitor-summary-title">南北接线 设备</div>
            <div class="c-device-monitor-line1">
              <span class="c-device-monitor-summary-label">总 数:</span>
              <span class="c-device-monitor-summary-value-primary">1280</span>
            </div>
            <div class="c-device-monitor-line2">
              <span class="c-device-monitor-summary-label">异常数:</span>
              <span class="c-device-monitor-summary-value-error">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备类型监测网格 -->
      <div class="c-device-monitor-cons-grid">
        <!-- 摄像机 -->
        <div
          class="c-device-monitor-group-2136637321-extra"
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon3" class="c-device-monitor-device-icon" alt="摄像机" />
          <span class="c-device-monitor-device-name">摄像机</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-error">(2/484)</span>
          </div>
        </div>

        <!-- 风速风向仪 -->
        <div
          class="c-device-monitor-group-2136637552-extra"
          :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon4" class="c-device-monitor-device-icon" alt="风速风向仪" />
          <span class="c-device-monitor-device-name">风速风向仪</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-error">(1/484)</span>
          </div>
        </div>

        <!-- 超高检测器 -->
        <div
          class="c-device-monitor-group-2136637555"
          :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon5" class="c-device-monitor-device-icon" alt="超高检测器" />
          <span class="c-device-monitor-device-name">超高检测器</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- 烟道机器人 -->
        <div
          class="c-device-monitor-group-2136637558"
          :style="{ backgroundImage: `url(${bg6})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon6" class="c-device-monitor-device-icon" alt="烟道机器人" />
          <span class="c-device-monitor-device-name">烟道机器人</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- 激光雷达 -->
        <div
          class="c-device-monitor-group-2136637550"
          :style="{ backgroundImage: `url(${bg7})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon7" class="c-device-monitor-device-icon" alt="激光雷达" />
          <span class="c-device-monitor-device-name">激光雷达</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- CO2传感器 -->
        <div
          class="c-device-monitor-group-2136637553"
          :style="{ backgroundImage: `url(${bg8})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon8" class="c-device-monitor-device-icon" alt="CO2传感器" />
          <span class="c-device-monitor-device-name">CO2传感器</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- CO/VI检测器 -->
        <div
          class="c-device-monitor-group-2136637556"
          :style="{ backgroundImage: `url(${bg9})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon9" class="c-device-monitor-device-icon" alt="CO/VI检测器" />
          <span class="c-device-monitor-device-name">CO/VI检测器</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- 温湿度传感器 -->
        <div
          class="c-device-monitor-group-2136637559"
          :style="{ backgroundImage: `url(${bg10})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon10" class="c-device-monitor-device-icon" alt="温湿度传感器" />
          <span class="c-device-monitor-device-name">温湿度传感器</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- 压力传感器 -->
        <div
          class="c-device-monitor-group-2136637551"
          :style="{ backgroundImage: `url(${bg11})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon11" class="c-device-monitor-device-icon" alt="压力传感器" />
          <span class="c-device-monitor-device-name">压力传感器</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- 光照度变送器 -->
        <div
          class="c-device-monitor-group-2136637554"
          :style="{ backgroundImage: `url(${bg12})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon12" class="c-device-monitor-device-icon" alt="光照度变送器" />
          <span class="c-device-monitor-device-name">光照度变送器</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- 紧急电话 -->
        <div
          class="c-device-monitor-group-2136637557"
          :style="{ backgroundImage: `url(${bg13})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <span class="c-device-monitor-device-icon c-device-monitor-device-icon--placeholder"></span>
          <span class="c-device-monitor-device-name">紧急电话</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>

        <!-- 水质监测设备 -->
        <div
          class="c-device-monitor-group-2136637560"
          :style="{ backgroundImage: `url(${bg14})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <span class="c-device-monitor-device-icon c-device-monitor-device-icon--placeholder"></span>
          <span class="c-device-monitor-device-name">水质监测设备</span>
          <div class="c-device-monitor-device-value">
            <span class="c-device-monitor-device-num-secondary">(0/484)</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  activeTab: {
    type: String,
    default: 'monitor'
  }
})

const emit = defineEmits(['tab-change'])

const tabs = ref([
  { id: 'monitor', name: '监控', badge: '3/3740', badgeType: 'primary' },
  { id: 'lighting', name: '照明', badge: '3', badgeType: 'error' },
  { id: 'ventilation', name: '通风', badge: null },
  { id: 'power', name: '供配电', badge: null },
  { id: 'fire', name: '消防', badge: null },
  { id: 'traffic', name: '交通诱导', badge: null }
])

const handleTabClick = (tabId) => {
  emit('tab-change', tabId)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-tab {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.c-device-monitor-tabs {
  display: flex;
  flex-direction: column;
  width: 46px;
  flex-shrink: 0;
  align-items: center;
  padding-top: 4px;
  gap: 2px;
}

.c-device-monitor-tab-item {
  position: relative;
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 6px 0;
  border-radius: 4px;

  &--active {
    .c-device-monitor-tab-item-text {
      color: var(--colorPrimary, @color-primary);
      font-weight: 700;
    }

    .c-device-monitor-tab-item-bg {
      background: var(--colorBgWhite, @color-bg-white);
      border-radius: 4px;
    }
  }
}

.c-device-monitor-tab-item-bg {
  position: absolute;
  inset: 0;
  border-radius: 4px;
}

.c-device-monitor-tab-item-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.c-device-monitor-tab-item-text {
  font-size: calc(@fontSize * 1);
  color: var(--colorTextSecondary, @color-text-secondary);
  font-weight: 400;
  writing-mode: vertical-lr;
  text-orientation: upright;
  line-height: 16px;
  white-space: nowrap;
}

.c-device-monitor-tab-item-badge {
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  border-radius: 7px;
  padding: 0 3px;
  min-width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;

  &--primary {
    background: var(--colorPrimaryBg, @color-primary-bg);
    color: var(--colorPrimary, @color-primary);
    border: 1px solid var(--colorPrimary, @color-primary);
    font-size: calc(@fontSize * 0.786);
  }

  &--error {
    background: var(--colorError, @color-error);
    color: var(--colorBgWhite, @color-bg-white);
  }
}

.c-device-monitor-cons {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 4px;
}

.c-device-monitor-cons-header {
  display: flex;
  flex-direction: row;
  gap: 6px;
  flex-shrink: 0;
  height: 65px;
}

.c-device-monitor-group-2136637321,
.c-device-monitor-group-2136637552 {
  flex: 1 1 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 6px 8px;
  gap: 8px;
  min-width: 0;
  border-radius: 6px;
  overflow: hidden;
}

.c-device-monitor-summary-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-device-monitor-bg {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 0;
}

.c-device-monitor-summary-title {
  font-size: calc(@fontSize * 0.857);
  color: var(--colorTextBase, @color-text-primary);
  font-weight: 400;
  white-space: nowrap;
}

.c-device-monitor-line1,
.c-device-monitor-line2 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-device-monitor-summary-label {
  font-size: calc(@fontSize * 1);
  color: var(--colorTextBase, @color-text-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-summary-value-primary {
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorPrimary, @color-primary);
  font-family: Roboto, sans-serif;
}

.c-device-monitor-summary-value-error {
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  color: var(--colorError, @color-error);
  font-family: Roboto, sans-serif;
}

.c-device-monitor-cons-grid {
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  overflow: hidden;
}

.c-device-monitor-group-2136637321-extra,
.c-device-monitor-group-2136637552-extra,
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
  gap: 3px;
  padding: 6px 4px;
  overflow: hidden;
  border-radius: 4px;
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;

  &--placeholder {
    display: block;
    width: 27px;
    height: 32px;
  }
}

.c-device-monitor-device-name {
  font-size: calc(@fontSize * 0.857);
  color: var(--colorTextBase, @color-text-primary);
  text-align: center;
  font-weight: 400;
  line-height: 18px;
  white-space: nowrap;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.c-device-monitor-device-num-error {
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: var(--colorError, @color-error);
  font-family: Roboto, sans-serif;
}

.c-device-monitor-device-num-secondary {
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: var(--colorTextSecondary, @color-text-secondary);
  font-family: Roboto, sans-serif;
}
</style>