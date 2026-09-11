<template>
  <base-panel class="c-mc-max-1787796602021-5c7bd55e" panelKey="default-panel">
    <!-- 标题栏左侧装饰：header 区域 g 组装饰点 -->
    <template #title_left>
      <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-header-decoration">
        <i class="c-mc-max-1787796602021-5c7bd55e-c-monitor-header-dot"></i>
      </div>
    </template>

    <!-- 副标题/更新时间 -->
    

    <!-- 标题栏右侧：顶部统计栏（设备类型/设备总数/完好率） -->
    

    <!-- 业务内容区 -->
    <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-root">
      <!-- 上部：汇总卡片区（两列并排） -->
      <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-summary-cards">
        <!-- 隧道设备卡（渐变蓝） -->
        <div class="c-monitor-card c-mc-max-1787796602021-5c7bd55e-c-monitor-card-tunnel">
          <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-row">
            <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-icon-wrap">
              <img :src="icon10" alt="隧道图标" class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-icon" />
            </div>
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-total c-mc-max-1787796602021-5c7bd55e-c-monitor-card-total-light">总数:56302</span>
          </div>
          <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-row c-mc-max-1787796602021-5c7bd55e-c-monitor-card-row-bottom">
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-name c-mc-max-1787796602021-5c7bd55e-c-monitor-card-name-light">隧道设备</span>
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-abnormal c-mc-max-1787796602021-5c7bd55e-c-monitor-card-abnormal-danger">异常数:5</span>
          </div>
        </div>

        <!-- 南北接线设备卡（浅灰蓝） -->
        <div class="c-monitor-card c-mc-max-1787796602021-5c7bd55e-c-monitor-card-north-south">
          <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-row">
            <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-icon-wrap">
              <img :src="icon16" alt="接线图标" class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-icon" />
            </div>
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-total c-mc-max-1787796602021-5c7bd55e-c-monitor-card-total-blue">总数:1280</span>
          </div>
          <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-row c-mc-max-1787796602021-5c7bd55e-c-monitor-card-row-bottom">
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-name c-mc-max-1787796602021-5c7bd55e-c-monitor-card-name-dark">南北接线设备</span>
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-card-abnormal c-mc-max-1787796602021-5c7bd55e-c-monitor-card-abnormal-danger">异常数:3</span>
          </div>
        </div>
      </div>

      <!-- 下部：设备列表与导航（横向排布） -->
      <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-main-content">
        <!-- 左侧垂直 Tab 导航 -->
        <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-vertical-tabs">
          <div
            v-for="tab in monitorTabs"
            :key="tab.name"
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item-active': tab.active }]"
            @click="handleMonitorTabChange(tab.name)"
          >
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-tab-text" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '34px 40px', backgroundPosition: '0px 4px', backgroundRepeat: 'no-repeat' }">{{ tab.name }}</span>
            <span v-if="tab.badge" class="c-mc-max-1787796602021-5c7bd55e-c-monitor-tab-badge" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '34px 40px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备状态网格（3 列） -->
        <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-device-grid">
          <div
            v-for="device in monitorDevices"
            :key="device.name"
            class="c-mc-max-1787796602021-5c7bd55e-c-monitor-device-item"
          >
            <div class="c-mc-max-1787796602021-5c7bd55e-c-monitor-device-icon-wrap">
              <img :src="device.icon" alt="设备图标" class="c-mc-max-1787796602021-5c7bd55e-c-monitor-device-icon" />
            </div>
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-device-name">{{ device.name }}</span>
            <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-device-value">
              <span :class="['c-monitor-device-count', { 'c-monitor-device-count-danger': device.countColor === 'danger', 'c-monitor-device-count-normal': device.countColor === 'normal' }]">({{ device.abnormal }}</span>
              <span class="c-mc-max-1787796602021-5c7bd55e-c-monitor-device-total">/484)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon10 from '../resources/images/隧道_1-8804.png'
import icon16 from '../resources/images/extension-cord_1-8823.png'
import icon27 from '../resources/images/Group_1321317970-8459.png'
import icon76 from '../resources/images/Group_1321317970-8605.png'
import icon112 from '../resources/images/Group_1321317970-8692.png'
import icon29 from '../resources/images/icon-8473.png'
import icon64 from '../resources/images/Group_1321317970-8576.png'
import icon124 from '../resources/images/Group_1321317970-8721.png'
import icon40 from '../resources/images/Group_1321317970-8518.png'
import icon88 from '../resources/images/Group_1321317970-8634.png'
import icon136 from '../resources/images/Group_1321317970-8750.png'
import icon52 from '../resources/images/Group_1321317970-8547.png'
import icon100 from '../resources/images/Group_1321317970-8663.png'
import icon148 from '../resources/images/Group_1321317970-8779.png'


import { ref, onMounted} from 'vue'

// 微码组件构建器：只能调用一次，直接解构
const { runtimeBuilder } = $mcComponentBuilder()

// 左侧垂直 Tab 导航（监控/照明/通风/供配电/消防/交通诱导）
const monitorTabs = ref([
  { name: '监控', active: true, badge: '' },
  { name: '照明', active: false, badge: '3' },
  { name: '通风', active: false, badge: '' },
  { name: '供配电', active: false, badge: '' },
  { name: '消防', active: false, badge: '' },
  { name: '交通诱导', active: false, badge: '' }
])

// 默认设备列表（监控分类，数据/颜色/图标均来自设计稿）
const defaultDevices = [
  { name: '摄像机', abnormal: 2, countColor: 'danger', icon: icon27 },
  { name: '风速风向仪', abnormal: 1, countColor: 'danger', icon: icon76 },
  { name: '超高检测器', abnormal: 0, countColor: 'normal', icon: icon112 },
  { name: '烟道机器人', abnormal: 0, countColor: 'normal', icon: icon29 },
  { name: '激光雷达', abnormal: 0, countColor: 'normal', icon: icon64 },
  { name: 'CO2传感器', abnormal: 0, countColor: 'normal', icon: icon124 },
  { name: 'CO/VI检测器', abnormal: 0, countColor: 'normal', icon: icon40 },
  { name: '温湿度传感器', abnormal: 0, countColor: 'normal', icon: icon88 },
  { name: '压力传感器', abnormal: 0, countColor: 'normal', icon: icon136 },
  { name: '光照度变送器', abnormal: 0, countColor: 'normal', icon: icon52 },
  { name: '紧急电话', abnormal: 0, countColor: 'normal', icon: icon100 },
  { name: '水质监测设备', abnormal: 0, countColor: 'normal', icon: icon148 }
]

// 当前展示的设备网格（Tab 切换时联动刷新）
const monitorDevices = ref([...defaultDevices])

// 切换设备分类：更新 Tab 激活态 + 刷新设备网格
const handleMonitorTabChange = (name) => {
  monitorTabs.value.forEach((tab) => {
    tab.active = tab.name === name
  })
  // 仅“监控”分类有设计稿设备数据，其余分类无数据证据时展示空列表
  monitorDevices.value = name === '监控' ? [...defaultDevices] : []
}

// 组件加载完成事件
const emitMonitorLoad = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitMonitorLoad()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>