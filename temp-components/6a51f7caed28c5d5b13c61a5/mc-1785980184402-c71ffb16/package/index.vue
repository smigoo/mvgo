<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-1785980184402-c71ffb16-root">
      <!-- [Layout Refine] Figma header GROUP → 顶部标题与统计 -->
      <div class="c-mc-1785980184402-c71ffb16-header">
        <span class="c-mc-1785980184402-c71ffb16-title">设备监测</span>
        <div class="c-mc-1785980184402-c71ffb16-stats">
          <div class="c-mc-1785980184402-c71ffb16-stat-item">
            <span class="c-mc-1785980184402-c71ffb16-stat-label">设备类型</span>
            <span class="c-mc-1785980184402-c71ffb16-stat-value">28</span>
          </div>
          <div class="c-mc-1785980184402-c71ffb16-stat-item">
            <span class="c-mc-1785980184402-c71ffb16-stat-label">设备总数</span>
            <span class="c-mc-1785980184402-c71ffb16-stat-value">68562</span>
          </div>
          <div class="c-mc-1785980184402-c71ffb16-stat-item">
            <span class="c-mc-1785980184402-c71ffb16-stat-label">完好率</span>
            <span class="c-mc-1785980184402-c71ffb16-stat-value">98%</span>
          </div>
        </div>
        <span style="font-size: 14px; color: #1990FF;">*数据实时更新</span>
      </div>

      <!-- [Layout Refine] Figma slot-con → 内容区 -->
      <div class="c-mc-1785980184402-c71ffb16-content">
        <!-- [Layout Refine] Figma switch FRAME → 区域统计卡片 -->
        <div class="c-mc-1785980184402-c71ffb16-switch">
          <div class="c-mc-1785980184402-c71ffb16-switch-card active">
            <div class="c-mc-1785980184402-c71ffb16-switch-info">
              <div class="c-mc-1785980184402-c71ffb16-switch-row">
                <span>总数:</span>
                <span class="c-mc-1785980184402-c71ffb16-switch-val">56302</span>
              </div>
              <div class="c-mc-1785980184402-c71ffb16-switch-row">
                <span>异常数:</span>
                <span class="c-mc-1785980184402-c71ffb16-switch-val error">5</span>
              </div>
            </div>
            <span class="c-mc-1785980184402-c71ffb16-switch-title">隧道设备</span>
          </div>
          <div class="c-mc-1785980184402-c71ffb16-switch-card default">
            <div class="c-mc-1785980184402-c71ffb16-switch-info">
              <div class="c-mc-1785980184402-c71ffb16-switch-row">
                <span>总数:</span>
                <span class="c-mc-1785980184402-c71ffb16-switch-val">1280</span>
              </div>
              <div class="c-mc-1785980184402-c71ffb16-switch-row">
                <span>异常数:</span>
                <span class="c-mc-1785980184402-c71ffb16-switch-val error">3</span>
              </div>
            </div>
            <span class="c-mc-1785980184402-c71ffb16-switch-title">南北接线设备</span>
          </div>
        </div>

        <!-- [Layout Refine] Figma @antd/tab → 分类与设备列表 -->
        <div class="c-mc-1785980184402-c71ffb16-tab-grid">
          <div class="c-mc-1785980184402-c71ffb16-tabs">
            <div class="c-mc-1785980184402-c71ffb16-tab-item active">
              <span>监控</span>
              <span class="c-mc-1785980184402-c71ffb16-tab-badge">3/3740</span>
            </div>
            <div class="c-mc-1785980184402-c71ffb16-tab-item">
              <span>照明</span>
              <span class="c-mc-1785980184402-c71ffb16-tab-badge">3</span>
            </div>
            <div class="c-mc-1785980184402-c71ffb16-tab-item"><span>通风</span></div>
            <div class="c-mc-1785980184402-c71ffb16-tab-item"><span>供配电</span></div>
            <div class="c-mc-1785980184402-c71ffb16-tab-item"><span>消防</span></div>
            <div class="c-mc-1785980184402-c71ffb16-tab-item"><span>交通诱导</span></div>
          </div>
          
          <!-- [Layout Refine] Figma cons GROUP → 12个设备卡片网格 -->
          <div class="c-mc-1785980184402-c71ffb16-grid">
            <div v-for="device in devices" :key="device.name" class="c-mc-1785980184402-c71ffb16-device-card">
              <div class="c-mc-1785980184402-c71ffb16-device-icon"></div>
              <div class="c-mc-1785980184402-c71ffb16-device-info">
                <span class="c-mc-1785980184402-c71ffb16-device-name">{{ device.name }}</span>
                <span class="c-mc-1785980184402-c71ffb16-device-val">({{ device.val }})</span>
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
  { name: '摄像机', val: '2/484' },
  { name: '风速风向仪', val: '1/484' },
  { name: '超高检测器', val: '0/484' },
  { name: '烟道机器人', val: '0/484' },
  { name: '激光雷达', val: '0/484' },
  { name: 'CO2传感器', val: '0/484' },
  { name: 'CO/VI检测器', val: '0/484' },
  { name: '温湿度传感器', val: '0/484' },
  { name: '压力传感器', val: '0/484' },
  { name: '光照度变送器', val: '0/484' },
  { name: '紧急电话', val: '0/484' },
  { name: '水质监测设备', val: '0/484' }
])
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>