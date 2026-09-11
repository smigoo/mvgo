<script setup>
import { ref } from 'vue'

// Tab 状态
const activeTab = ref('monitor')

// Tab 列表
const tabs = [
  { key: 'monitor', label: '监控', badge: '3/3740' },
  { key: 'lighting', label: '照明', badge: '3' },
  { key: 'ventilation', label: '通风', badge: null },
  { key: 'power', label: '供配电', badge: null },
  { key: 'fire', label: '消防', badge: null },
  { key: 'traffic', label: '交通诱导', badge: null }
]

// 设备列表数据
const devices = [
  { icon: 'icon3', name: '摄像机', count: '2/484', isDanger: true },
  { icon: 'icon4', name: '风速风向仪', count: '1/484', isDanger: true },
  { icon: 'icon5', name: '超高检测器', count: '0/484', isDanger: false },
  { icon: 'icon6', name: '烟道机器人', count: '0/484', isDanger: false },
  { icon: 'icon7', name: '激光雷达', count: '0/484', isDanger: false },
  { icon: 'icon8', name: 'CO₂传感器', count: '0/484', isDanger: false },
  { icon: 'icon9', name: 'CO/VI检测器', count: '0/484', isDanger: false },
  { icon: 'icon10', name: '温湿度传感器', count: '0/484', isDanger: false },
  { icon: 'icon11', name: '压力传感器', count: '0/484', isDanger: false },
  { icon: 'icon12', name: '光照度变送器', count: '0/484', isDanger: false },
  { icon: 'icon13', name: '紧急电话', count: '0/484', isDanger: false },
  { icon: 'icon14', name: '水质监测设备', count: '0/484', isDanger: false }
]

// 图标映射（系统注入的变量）
const iconMap = {
  icon3, icon4, icon5, icon6, icon7, icon8, icon9, icon10, icon11, icon12, icon13, icon14
}

// Tab 切换
const handleTabChange = (key) => {
  activeTab.value = key
}
</script>

<template>
  <div class="c-monitor-main-content">
    <!-- 竖向 Tab 栏 -->
    <div class="c-monitor-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.key }]"
        @click="handleTabChange(tab.key)"
      >
        <span class="c-monitor-tab-label">{{ tab.label }}</span>
        <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 设备网格列表（修正：bg3-bg14 整块背景挂在容器上，不是每个卡片单独引用） -->
    <div class="c-monitor-device-grid" :style="{ backgroundImage: `url(${bg3})` }">
      <div
        v-for="device in devices"
        :key="device.icon"
        class="c-monitor-device-card"
      >
        <img :src="iconMap[device.icon]" class="c-monitor-device-icon" alt="" />
        <span class="c-monitor-device-name">{{ device.name }}</span>
        <span
          :class="[
            'c-monitor-device-count',
            { 'c-monitor-device-count--danger': device.isDanger }
          ]"
        >
          {{ device.count }}
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
