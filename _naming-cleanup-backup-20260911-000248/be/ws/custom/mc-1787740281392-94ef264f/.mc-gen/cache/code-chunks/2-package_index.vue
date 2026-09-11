<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-monitor-title-left">
        <img :src="icon1" class="c-monitor-title-dot" alt="" />
        <img :src="icon2" class="c-monitor-title-dot c-monitor-title-dot--small" alt="" />
        <span class="c-monitor-title-text">设备监测</span>
      </div>
    </template>

    <template #title_right>
      <span class="c-monitor-title-tip">*数据实时更新</span>
    </template>

    <template #header_right>
      <div class="c-monitor-header-metrics">
        <div class="c-monitor-header-metric">
          <span class="c-monitor-header-metric-label">设备类型</span>
          <span class="c-monitor-header-metric-value">28</span>
        </div>
        <div class="c-monitor-header-metric">
          <span class="c-monitor-header-metric-label">设备总数</span>
          <span class="c-monitor-header-metric-value">68562</span>
        </div>
        <div class="c-monitor-header-metric">
          <span class="c-monitor-header-metric-label">完好率</span>
          <span class="c-monitor-header-metric-value c-monitor-header-metric-value--health">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <section class="c-monitor-overview">
        <div class="c-monitor-section-header">
          <span class="c-monitor-section-title">设备概览</span>
        </div>
        <div class="c-monitor-overview-body">
          <div class="c-monitor-overview-card">
            <span class="c-monitor-overview-value">56302</span>
            <span class="c-monitor-overview-label">设备总览</span>
          </div>
          <div class="c-monitor-overview-card">
            <span class="c-monitor-overview-value">1280</span>
            <span class="c-monitor-overview-label">商社挂接设备</span>
          </div>
          <div class="c-monitor-overview-card">
            <span class="c-monitor-overview-value c-monitor-overview-value--health">98%</span>
            <span class="c-monitor-overview-label">完好率</span>
          </div>
        </div>
      </section>

      <section class="c-monitor-categories">
        <div class="c-monitor-section-header">
          <span class="c-monitor-section-title">设备类型分类</span>
          <div class="c-monitor-switch">
            <div class="c-monitor-switch-active">
              <img :src="icon10" class="c-monitor-switch-icon" alt="" />
              <div class="c-monitor-switch-text">
                <span class="c-monitor-switch-name">隧道设备</span>
                <span class="c-monitor-switch-line">总数: 56302</span>
                <span class="c-monitor-switch-line">异常数: 5</span>
              </div>
            </div>
            <div class="c-monitor-switch-default">
              <img :src="icon16" class="c-monitor-switch-icon" alt="" />
              <div class="c-monitor-switch-text">
                <span class="c-monitor-switch-name">南北接线 / 设备</span>
                <span class="c-monitor-switch-line">总数: 1280</span>
                <span class="c-monitor-switch-line">异常数: 3</span>
              </div>
            </div>
          </div>
        </div>

        <div class="c-monitor-categories-body">
          <div class="c-monitor-tab-rail">
            <div class="c-monitor-tab-card c-monitor-tab-card--active">
              <span class="c-monitor-tab-text">监控</span>
              <span class="c-monitor-tab-number">3/3740</span>
            </div>
            <div class="c-monitor-tab-item">照明</div>
            <div class="c-monitor-tab-item">通风</div>
            <div class="c-monitor-tab-item">消防</div>
            <div class="c-monitor-tab-item c-monitor-tab-item--tall">交通诱导</div>
            <div class="c-monitor-tab-item c-monitor-tab-item--medium">供配电</div>
          </div>

          <div class="c-monitor-device-grid">
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">摄像机</span>
                <span class="c-monitor-device-value">(2/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">风速风向仪</span>
                <span class="c-monitor-device-value">(1/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">超高检测器</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">值道机器人</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">激光雷达</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">CO传感器</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">CO/VI检测器</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">温湿度传感器</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">压力传感器</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">光照度变送器</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">紧急电话</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-monitor-device-card">
              <img :src="icon29" class="c-monitor-device-icon" alt="" />
              <div class="c-monitor-device-text">
                <span class="c-monitor-device-name">水质监测设备</span>
                <span class="c-monitor-device-value">(0/484)</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </base-panel>
</template>