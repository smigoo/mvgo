<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <!-- [Layout Refine] Figma header GROUP → flex row, space-between -->
      <div class="c-device-monitor-header">
        <div class="c-device-monitor-header-left">
          <span class="c-device-monitor-title">设备监测</span>
          <div class="c-device-monitor-stat">
            <span class="c-device-monitor-stat-label">设备类型</span>
            <span class="c-device-monitor-stat-value text-gradient-primary">28</span>
          </div>
          <div class="c-device-monitor-stat">
            <span class="c-device-monitor-stat-label">设备总数</span>
            <span class="c-device-monitor-stat-value text-gradient-primary">68562</span>
          </div>
          <div class="c-device-monitor-stat">
            <span class="c-device-monitor-stat-label">完好率</span>
            <span class="c-device-monitor-stat-value text-gradient-secondary">98%</span>
          </div>
        </div>
        <span class="c-device-monitor-header-right">*数据实时更新</span>
      </div>

      <div class="c-device-monitor-content">
        <!-- [Layout Refine] Figma switch FRAME → flex row, 2 cards -->
        <div class="c-device-monitor-switch">
          <div class="c-device-monitor-switch-card active">
            <div class="switch-card-icon">
              <img :src="icon1" class="switch-icon-img" />
            </div>
            <div class="switch-card-info">
              <div class="switch-card-row">
                <span class="switch-label">总数:</span>
                <span class="switch-value text-gradient-white">56302</span>
              </div>
              <div class="switch-card-row">
                <span class="switch-label">异常数:</span>
                <span class="switch-value text-gradient-danger">5</span>
              </div>
            </div>
            <span class="switch-card-title">隧道设备</span>
          </div>
          <div class="c-device-monitor-switch-card">
            <div class="switch-card-icon">
              <img :src="icon2" class="switch-icon-img" />
            </div>
            <div class="switch-card-info">
              <div class="switch-card-row">
                <span class="switch-label">总数:</span>
                <span class="switch-value text-gradient-primary">1280</span>
              </div>
              <div class="switch-card-row">
                <span class="switch-label">异常数:</span>
                <span class="switch-value text-gradient-danger">3</span>
              </div>
            </div>
            <span class="switch-card-title">南北接线设备</span>
          </div>
        </div>

        <!-- [Layout Refine] Figma @antd/tab → flex row, tabs + grid -->
        <div class="c-device-monitor-main">
          <div class="c-device-monitor-tabs">
            <div class="tab-item active">
              <div class="tab-badge-white">3/3740</div>
              <span class="tab-text">监控</span>
            </div>
            <div class="tab-item">
              <span class="tab-text">照明</span>
              <div class="tab-badge-red">3</div>
            </div>
            <div class="tab-item"><span class="tab-text">通风</span></div>
            <div class="tab-item"><span class="tab-text">供配电</span></div>
            <div class="tab-item"><span class="tab-text">消防</span></div>
            <div class="tab-item"><span class="tab-text">交通诱导</span></div>
          </div>
          
          <div class="c-device-monitor-grid">
            <div v-for="(item, index) in gridItems" :key="index" class="grid-item">
              <div class="grid-item-icon">
                <img :src="getIcon(index)" class="grid-icon-img" />
              </div>
              <div class="grid-item-info">
                <span class="grid-item-name">{{ item.name }}</span>
                <span class="grid-item-value" :class="item.abnormal > 0 ? 'has-abnormal' : 'no-abnormal'">
                  <template v-if="item.abnormal > 0">
                    <span class="val-danger">({{ item.abnormal }}</span>
                    <span class="val-primary">/{{ item.total }})</span>
                  </template>
                  <template v-else>
                    ({{ item.abnormal }}/{{ item.total }})
                  </template>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-8421.png'
import icon2 from '../resources/images/Frame-8856.png'
import icon3 from '../resources/images/icon-8798.png'
import icon4 from '../resources/images/icon-8817.png'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[c-device-monitor] $mcComponentBuilder 失败:', e)
}

// [Data Fidelity] 严格使用 Figma 数据，禁止臆造
const gridItems = [
  { name: '摄像机', abnormal: 2, total: 484 },
  { name: '风速风向仪', abnormal: 1, total: 484 },
  { name: '超高检测器', abnormal: 0, total: 484 },
  { name: '烟道机器人', abnormal: 0, total: 484 },
  { name: '激光雷达', abnormal: 0, total: 484 },
  { name: 'CO2传感器', abnormal: 0, total: 484 },
  { name: 'CO/VI检测器', abnormal: 0, total: 484 },
  { name: '温湿度传感器', abnormal: 0, total: 484 },
  { name: '压力传感器', abnormal: 0, total: 484 },
  { name: '光照度变送器', abnormal: 0, total: 484 },
  { name: '紧急电话', abnormal: 0, total: 484 },
  { name: '水质监测设备', abnormal: 0, total: 484 }
]

const icons = [icon1, icon2, icon3, icon4]
const getIcon = (index) => icons[index % icons.length]

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('c-device-monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>