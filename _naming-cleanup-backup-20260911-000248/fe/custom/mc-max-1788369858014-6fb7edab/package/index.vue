<template>
  <base-panel class="c-mc-max-1788369858014-6fb7edab" panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 统计横幅 + 左侧导航区域 -->
      <div class="c-monitor-main-layout">
        <!-- 左侧导航 -->
        <LeftNav
          :active-tab="activeNavTab"
          @tab-change="handleNavTabChange"
        />
        <!-- 右侧内容区 -->
        <div class="c-monitor-content-area">
          <!-- 统计横幅 -->
          <StatsBanner
            :tunnel-stats="tunnelStats"
            :bridge-stats="bridgeStats"
          />
          <!-- 设备网格 -->
          <DeviceGrid
            :active-tab="activeNavTab"
            :devices="currentDevices"
          />
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import LeftNav from './components/LeftNav.vue'
import StatsBanner from './components/StatsBanner.vue'
import DeviceGrid from './components/DeviceGrid.vue'

// $mcComponentBuilder 调用（仅一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 左侧导航激活状态
const activeNavTab = ref('监控')

// 隧道设备统计数据
const tunnelStats = ref({
  label: '隧道设备',
  total: '56302',
  abnormal: '5'
})

// 桥梁设备统计数据
const bridgeStats = ref({
  label: '南北接线 / 设备',
  total: '1280',
  abnormal: '3'
})

// 各导航分类对应的设备数据
const deviceDataMap = {
  监控: [
    { id: 'device-1', label: '摄像机', online: 2, total: 484 },
    { id: 'device-2', label: '风速风向仪', online: 1, total: 484 },
    { id: 'device-3', label: '超高检测器', online: 0, total: 484 },
    { id: 'device-4', label: '烟道机器人', online: 0, total: 484 },
    { id: 'device-5', label: '激光雷达', online: 0, total: 484 },
    { id: 'device-6', label: 'CO2传感器', online: 0, total: 484 },
    { id: 'device-7', label: 'CO/VI检测器', online: 0, total: 484 },
    { id: 'device-8', label: '温湿度传感器', online: 0, total: 484 },
    { id: 'device-9', label: '压力传感器', online: 0, total: 484 },
    { id: 'device-10', label: '光照度变送器', online: 0, total: 484 },
    { id: 'device-11', label: '紧急电话', online: 0, total: 484 },
    { id: 'device-12', label: '水质监测设备', online: 0, total: 484 }
  ],
  照明: [
    { id: 'device-1', label: '摄像机', online: 0, total: 484 },
    { id: 'device-2', label: '风速风向仪', online: 0, total: 484 },
    { id: 'device-3', label: '超高检测器', online: 0, total: 484 },
    { id: 'device-4', label: '烟道机器人', online: 0, total: 484 },
    { id: 'device-5', label: '激光雷达', online: 0, total: 484 },
    { id: 'device-6', label: 'CO2传感器', online: 0, total: 484 },
    { id: 'device-7', label: 'CO/VI检测器', online: 0, total: 484 },
    { id: 'device-8', label: '温湿度传感器', online: 0, total: 484 },
    { id: 'device-9', label: '压力传感器', online: 0, total: 484 },
    { id: 'device-10', label: '光照度变送器', online: 0, total: 484 },
    { id: 'device-11', label: '紧急电话', online: 0, total: 484 },
    { id: 'device-12', label: '水质监测设备', online: 0, total: 484 }
  ],
  通风: [
    { id: 'device-1', label: '摄像机', online: 0, total: 484 },
    { id: 'device-2', label: '风速风向仪', online: 0, total: 484 },
    { id: 'device-3', label: '超高检测器', online: 0, total: 484 },
    { id: 'device-4', label: '烟道机器人', online: 0, total: 484 },
    { id: 'device-5', label: '激光雷达', online: 0, total: 484 },
    { id: 'device-6', label: 'CO2传感器', online: 0, total: 484 },
    { id: 'device-7', label: 'CO/VI检测器', online: 0, total: 484 },
    { id: 'device-8', label: '温湿度传感器', online: 0, total: 484 },
    { id: 'device-9', label: '压力传感器', online: 0, total: 484 },
    { id: 'device-10', label: '光照度变送器', online: 0, total: 484 },
    { id: 'device-11', label: '紧急电话', online: 0, total: 484 },
    { id: 'device-12', label: '水质监测设备', online: 0, total: 484 }
  ],
  消防: [
    { id: 'device-1', label: '摄像机', online: 0, total: 484 },
    { id: 'device-2', label: '风速风向仪', online: 0, total: 484 },
    { id: 'device-3', label: '超高检测器', online: 0, total: 484 },
    { id: 'device-4', label: '烟道机器人', online: 0, total: 484 },
    { id: 'device-5', label: '激光雷达', online: 0, total: 484 },
    { id: 'device-6', label: 'CO2传感器', online: 0, total: 484 },
    { id: 'device-7', label: 'CO/VI检测器', online: 0, total: 484 },
    { id: 'device-8', label: '温湿度传感器', online: 0, total: 484 },
    { id: 'device-9', label: '压力传感器', online: 0, total: 484 },
    { id: 'device-10', label: '光照度变送器', online: 0, total: 484 },
    { id: 'device-11', label: '紧急电话', online: 0, total: 484 },
    { id: 'device-12', label: '水质监测设备', online: 0, total: 484 }
  ],
  交通诱导: [
    { id: 'device-1', label: '摄像机', online: 0, total: 484 },
    { id: 'device-2', label: '风速风向仪', online: 0, total: 484 },
    { id: 'device-3', label: '超高检测器', online: 0, total: 484 },
    { id: 'device-4', label: '烟道机器人', online: 0, total: 484 },
    { id: 'device-5', label: '激光雷达', online: 0, total: 484 },
    { id: 'device-6', label: 'CO2传感器', online: 0, total: 484 },
    { id: 'device-7', label: 'CO/VI检测器', online: 0, total: 484 },
    { id: 'device-8', label: '温湿度传感器', online: 0, total: 484 },
    { id: 'device-9', label: '压力传感器', online: 0, total: 484 },
    { id: 'device-10', label: '光照度变送器', online: 0, total: 484 },
    { id: 'device-11', label: '紧急电话', online: 0, total: 484 },
    { id: 'device-12', label: '水质监测设备', online: 0, total: 484 }
  ],
  供配电: [
    { id: 'device-1', label: '摄像机', online: 0, total: 484 },
    { id: 'device-2', label: '风速风向仪', online: 0, total: 484 },
    { id: 'device-3', label: '超高检测器', online: 0, total: 484 },
    { id: 'device-4', label: '烟道机器人', online: 0, total: 484 },
    { id: 'device-5', label: '激光雷达', online: 0, total: 484 },
    { id: 'device-6', label: 'CO2传感器', online: 0, total: 484 },
    { id: 'device-7', label: 'CO/VI检测器', online: 0, total: 484 },
    { id: 'device-8', label: '温湿度传感器', online: 0, total: 484 },
    { id: 'device-9', label: '压力传感器', online: 0, total: 484 },
    { id: 'device-10', label: '光照度变送器', online: 0, total: 484 },
    { id: 'device-11', label: '紧急电话', online: 0, total: 484 },
    { id: 'device-12', label: '水质监测设备', online: 0, total: 484 }
  ]
}

// 当前显示的设备列表（根据激活导航动态切换）
const currentDevices = ref(deviceDataMap['监控'])

// 导航切换处理
const handleNavTabChange = (tab) => {
  activeNavTab.value = tab
  currentDevices.value = deviceDataMap[tab] || deviceDataMap['监控']
}

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>