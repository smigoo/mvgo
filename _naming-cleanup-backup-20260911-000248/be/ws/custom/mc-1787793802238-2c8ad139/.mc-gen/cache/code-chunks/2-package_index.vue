<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 设备概览区域 -->
      <section class="c-monitor-overview">
        <div
          class="c-monitor-overview-bg"
          :style="{ backgroundImage: `url(${bg1})` }"
        ></div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">设备总览</span>
          <span class="c-monitor-stat-value">56302</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">商社挂接设备</span>
          <span class="c-monitor-stat-value">1280</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-label">完好率</span>
          <span class="c-monitor-stat-value">98%</span>
        </div>
      </section>

      <!-- 设备类型分类区域 -->
      <section class="c-monitor-categories">
        <div class="c-monitor-categories-header">
          <span class="c-monitor-categories-title">设备类型分类</span>
        </div>
        <div class="c-monitor-categories-body">
          <div
            class="c-monitor-device-grid"
            :style="{ backgroundImage: `url(${bg2})` }"
          >
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-camera"></div>
              <span class="c-monitor-device-name">摄像机</span>
              <span class="c-monitor-device-value">(2/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-wind"></div>
              <span class="c-monitor-device-name">风速风向仪</span>
              <span class="c-monitor-device-value">(1/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-height"></div>
              <span class="c-monitor-device-name">超高检测器</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-robot"></div>
              <span class="c-monitor-device-name">值道机器人</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-radar"></div>
              <span class="c-monitor-device-name">激光雷达</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-co"></div>
              <span class="c-monitor-device-name">CO传感器</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-covi"></div>
              <span class="c-monitor-device-name">CO/VI检测器</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-temp"></div>
              <span class="c-monitor-device-name">温湿度传感器</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-pressure"></div>
              <span class="c-monitor-device-name">压力传感器</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-light"></div>
              <span class="c-monitor-device-name">光照度变送器</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-phone"></div>
              <span class="c-monitor-device-name">紧急电话</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
            <div class="c-monitor-device-item">
              <div class="c-monitor-device-icon c-monitor-device-icon-water"></div>
              <span class="c-monitor-device-name">水质监测设备</span>
              <span class="c-monitor-device-value">(0/484)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </base-panel>
</template>