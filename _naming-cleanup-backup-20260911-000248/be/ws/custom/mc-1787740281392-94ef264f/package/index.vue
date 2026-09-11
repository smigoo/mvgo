<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-title-left">
        <img :src="icon1" class="c-mc-max-1787739503358-290d5fa6-c-monitor-title-dot" alt="" />
        <img :src="icon2" class="c-monitor-title-dot c-mc-max-1787739503358-290d5fa6-c-monitor-title-dot--small" alt="" />
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
      </div>
    </template>

    

    

    <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-root">
      <section class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview">
        <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-section-header">
          <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-section-title">设备概览</span>
        </div>
        <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-body">
          <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-card">
            <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-value">56302</span>
            <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-label">设备总览</span>
          </div>
          <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-card">
            <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-value">1280</span>
            <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-label">商社挂接设备</span>
          </div>
          <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-card">
            <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-value c-mc-max-1787739503358-290d5fa6-c-monitor-overview-value--health">98%</span>
            <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-overview-label">完好率</span>
          </div>
        </div>
      </section>

      <section class="c-mc-max-1787739503358-290d5fa6-c-monitor-categories">
        <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-section-header">
          <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-section-title">设备类型分类</span>
          <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch">
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-active" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '193px 65px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
              <img :src="icon10" class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-name">隧道设备</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-line">总数: 56302</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-line">异常数: 5</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-default" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '193px 65px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
              <img :src="icon16" class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-name">南北接线 / 设备</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-line">总数: 1280</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-switch-line">异常数: 3</span>
              </div>
            </div>
          </div>
        </div>

        <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-categories-body">
          <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-tab-rail" :style="{ backgroundImage: `url(${bg7})`, backgroundSize: '34px 72px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
            <div class="c-monitor-tab-card c-mc-max-1787739503358-290d5fa6-c-monitor-tab-card--active" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '34px 40px', backgroundPosition: '0px 4px', backgroundRepeat: 'no-repeat' }">
              <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-tab-text" :style="{ backgroundImage: `url(${bg8})`, backgroundSize: '34px 56px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">监控</span>
              <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-tab-number">3/3740</span>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-tab-item">照明</div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-tab-item">通风</div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-tab-item">消防</div>
            <div class="c-monitor-tab-item c-mc-max-1787739503358-290d5fa6-c-monitor-tab-item--tall" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '34px 40px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">交通诱导</div>
            <div class="c-monitor-tab-item c-mc-max-1787739503358-290d5fa6-c-monitor-tab-item--medium" :style="{ backgroundImage: `url(${bg6})`, backgroundSize: '34px 40px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">供配电</div>
          </div>

          <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-grid">
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">摄像机</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(2/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">风速风向仪</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(1/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">超高检测器</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">值道机器人</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">激光雷达</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">CO传感器</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">CO/VI检测器</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">温湿度传感器</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">压力传感器</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">光照度变送器</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">紧急电话</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
            <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-card">
              <img :src="icon29" class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-icon" alt="" />
              <div class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-text">
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-name">水质监测设备</span>
                <span class="c-mc-max-1787739503358-290d5fa6-c-monitor-device-value">(0/484)</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/circle-8422.png'
import icon2 from '../resources/images/circle-8423.png'
import icon10 from '../resources/images/隧道_1-8804.png'
import icon16 from '../resources/images/extension-cord_1-8823.png'
import icon29 from '../resources/images/icon-8473.png'


// 1. 一次调用 $mcComponentBuilder 并直接解构（const 解构=声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 在 onMounted 中触发 onload 事件
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