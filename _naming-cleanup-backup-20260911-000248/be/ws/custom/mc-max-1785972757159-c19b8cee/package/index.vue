<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor">
      <!-- Header -->
      <div class="c-device-monitor__header">
        <div class="c-device-monitor__title">设备监测</div>
        <div class="c-device-monitor__stats">
          <div class="c-device-monitor__stat-item">
            <span class="c-device-monitor__stat-label">设备类型</span>
            <span class="c-device-monitor__stat-value primary">28</span>
          </div>
          <div class="c-device-monitor__stat-item">
            <span class="c-device-monitor__stat-label">设备总数</span>
            <span class="c-device-monitor__stat-value primary">68562</span>
          </div>
          <div class="c-device-monitor__stat-item">
            <span class="c-device-monitor__stat-label">完好率</span>
            <span class="c-device-monitor__stat-value success">98%</span>
          </div>
        </div>
        <div class="c-device-monitor__tip">*数据实时更新</div>
      </div>

      <!-- Content -->
      <div class="c-device-monitor__content">
        <!-- Switch -->
        <div class="c-device-monitor__switch">
          <div class="c-device-monitor__switch-card active">
            <div class="c-device-monitor__switch-icon"></div>
            <div class="c-device-monitor__switch-info">
              <div class="c-device-monitor__switch-title">隧道设备</div>
              <div class="c-device-monitor__switch-row">
                <span class="c-device-monitor__switch-label">总数:</span>
                <span class="c-device-monitor__switch-value primary">56302</span>
              </div>
              <div class="c-device-monitor__switch-row">
                <span class="c-device-monitor__switch-label">异常数:</span>
                <span class="c-device-monitor__switch-value error">5</span>
              </div>
            </div>
          </div>
          <div class="c-device-monitor__switch-card">
            <div class="c-device-monitor__switch-icon"></div>
            <div class="c-device-monitor__switch-info">
              <div class="c-device-monitor__switch-title">南北接线设备</div>
              <div class="c-device-monitor__switch-row">
                <span class="c-device-monitor__switch-label">总数:</span>
                <span class="c-device-monitor__switch-value primary">1280</span>
              </div>
              <div class="c-device-monitor__switch-row">
                <span class="c-device-monitor__switch-label">异常数:</span>
                <span class="c-device-monitor__switch-value error">3</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs & Grid -->
        <div class="c-device-monitor__main">
          <div class="c-device-monitor__tabs">
            <div class="c-device-monitor__tab active">
              <div class="c-device-monitor__tab-badge">3/3740</div>
              <div class="c-device-monitor__tab-text">监控</div>
            </div>
            <div class="c-device-monitor__tab">
              <div class="c-device-monitor__tab-text">照明</div>
              <div class="c-device-monitor__tab-dot">3</div>
            </div>
            <div class="c-device-monitor__tab">
              <div class="c-device-monitor__tab-text">通风</div>
            </div>
            <div class="c-device-monitor__tab">
              <div class="c-device-monitor__tab-text">供配电</div>
            </div>
            <div class="c-device-monitor__tab">
              <div class="c-device-monitor__tab-text">消防</div>
            </div>
            <div class="c-device-monitor__tab">
              <div class="c-device-monitor__tab-text">交通诱导</div>
            </div>
          </div>
          <div class="c-device-monitor__grid">
            <div class="c-device-monitor__device" v-for="item in devices" :key="item.name">
              <div class="c-device-monitor__device-icon"></div>
              <div class="c-device-monitor__device-info">
                <div class="c-device-monitor__device-name">{{ item.name }}</div>
                <div class="c-device-monitor__device-value">{{ item.value }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

const devices = ref([
  { name: '摄像机', value: '(2/484)' },
  { name: '风速风向仪', value: '(1/484)' },
  { name: '超高检测器', value: '(0/484)' },
  { name: '烟道机器人', value: '(0/484)' },
  { name: '激光雷达', value: '(0/484)' },
  { name: 'CO₂传感器', value: '(0/484)' },
  { name: 'CO/VI检测器', value: '(0/484)' },
  { name: '温湿度传感器', value: '(0/484)' },
  { name: '压力传感器', value: '(0/484)' },
  { name: '光照度变送器', value: '(0/484)' },
  { name: '紧急电话', value: '(0/484)' },
  { name: '水质监测设备', value: '(0/484)' }
])
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>