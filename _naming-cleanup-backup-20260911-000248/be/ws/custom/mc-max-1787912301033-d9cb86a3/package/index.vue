<template>
  <base-panel panelKey="default-panel">
    <div :class="['c-monitor-root', componentProps.themeType || 'light']">
      <HeaderStats :stats="headerStats" />
      <MainContent 
        :nav-items="navItems"
        :device-list="deviceList"
        :active-category="activeCategory"
        @category-change="handleCategoryChange"
      />
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/icon-8798.png'
import bg3 from '../resources/images/bg-8807.png'


import { ref, onMounted, onUnmounted} from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import MainContent from './components/MainContent.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 顶部统计数据
const headerStats = ref([
  { label: '设备监测', value: '', icon: icon1 },
  { label: '设备类型', value: '28', color: 'primary' },
  { label: '设备总数', value: '68562', color: 'primary' },
  { label: '完好率', value: '98%', color: 'success' }
])

// 左侧导航项
const navItems = ref([
  { key: 'monitor', label: '监控', badge: '3/3740', active: true },
  { key: 'lighting', label: '照明', badge: '3', active: false },
  { key: 'ventilation', label: '通风', active: false },
  { key: 'power', label: '供配电', active: false },
  { key: 'fire', label: '消防', active: false },
  { key: 'traffic', label: '交通诱导', active: false }
])

// 当前激活分类
const activeCategory = ref('monitor')

// 设备列表
const deviceList = ref([
  { id: 'device-1', name: '摄像机', count: '(2/484)', icon: bg3 },
  { id: 'device-2', name: '风速风向仪', count: '(1/484)', icon: bg3 },
  { id: 'device-3', name: '超高检测器', count: '(0/484)', icon: bg3 },
  { id: 'device-4', name: '烟雾机器人', count: '(0/484)', icon: bg3 },
  { id: 'device-5', name: '激光雷达', count: '(0/484)', icon: bg3 },
  { id: 'device-6', name: 'CO₂传感器', count: '(0/484)', icon: bg3 },
  { id: 'device-7', name: 'CO/VI检测器', count: '(0/484)', icon: bg3 },
  { id: 'device-8', name: '温湿度传感器', count: '(0/484)', icon: bg3 },
  { id: 'device-9', name: '压力传感器', count: '(0/484)', icon: bg3 },
  { id: 'device-10', name: '光照度变送器', count: '(0/484)', icon: bg3 },
  { id: 'device-11', name: '紧急电话', count: '(0/484)', icon: bg3 },
  { id: 'device-12', name: '水质监测设备', count: '(0/484)', icon: bg3 }
])

// 分类切换
const handleCategoryChange = (key) => {
  activeCategory.value = key
  navItems.value.forEach(item => {
    item.active = item.key === key
  })
}

// 触发加载完成事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理资源
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  overflow: hidden;
}
</style>