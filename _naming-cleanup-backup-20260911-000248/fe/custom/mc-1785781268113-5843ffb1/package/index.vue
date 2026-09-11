<template>
  <base-panel panelKey="model-panels">
    <div class="c-mc-1785781268113-5843ffb1-content">
      <!-- Header -->
      <div class="c-mc-1785781268113-5843ffb1-header">
        <div class="c-mc-1785781268113-5843ffb1-header-content">
          <span class="c-mc-1785781268113-5843ffb1-title">常住人口</span>
          <span class="c-mc-1785781268113-5843ffb1-tag">常住人口</span>
          <div class="c-mc-1785781268113-5843ffb1-close-btn" @click="handleClose"></div>
        </div>
      </div>
      
      <!-- Body -->
      <div class="c-mc-1785781268113-5843ffb1-body">
        <!-- Table -->
        <div class="c-mc-1785781268113-5843ffb1-table-wrapper">
          <div class="c-mc-1785781268113-5843ffb1-table-header">
            <div class="c-mc-1785781268113-5843ffb1-th">运单编号</div>
            <div class="c-mc-1785781268113-5843ffb1-th">危化品名称</div>
            <div class="c-mc-1785781268113-5843ffb1-th">超运地</div>
            <div class="c-mc-1785781268113-5843ffb1-th">实际发车时间</div>
            <div class="c-mc-1785781268113-5843ffb1-th">目的地</div>
            <div class="c-mc-1785781268113-5843ffb1-th">预计到达时间</div>
            <div class="c-mc-1785781268113-5843ffb1-th">满载情况</div>
            <div class="c-mc-1785781268113-5843ffb1-th">运输状态</div>
          </div>
          <div class="c-mc-1785781268113-5843ffb1-table-row active">
            <div class="c-mc-1785781268113-5843ffb1-td">3203502388...</div>
            <div class="c-mc-1785781268113-5843ffb1-td">烟花</div>
            <div class="c-mc-1785781268113-5843ffb1-td">江阴</div>
            <div class="c-mc-1785781268113-5843ffb1-td">2023-11-22 06:20:46</div>
            <div class="c-mc-1785781268113-5843ffb1-td">靖江</div>
            <div class="c-mc-1785781268113-5843ffb1-td">--</div>
            <div class="c-mc-1785781268113-5843ffb1-td">满载</div>
            <div class="c-mc-1785781268113-5843ffb1-td">在途</div>
          </div>
          <div class="c-mc-1785781268113-5843ffb1-table-row">
            <div class="c-mc-1785781268113-5843ffb1-td">3203502388...</div>
            <div class="c-mc-1785781268113-5843ffb1-td">硫酸</div>
            <div class="c-mc-1785781268113-5843ffb1-td">无锡</div>
            <div class="c-mc-1785781268113-5843ffb1-td">2023-11-20 06:20:46</div>
            <div class="c-mc-1785781268113-5843ffb1-td">泰州</div>
            <div class="c-mc-1785781268113-5843ffb1-td">--</div>
            <div class="c-mc-1785781268113-5843ffb1-td">满载</div>
            <div class="c-mc-1785781268113-5843ffb1-td">在途</div>
          </div>
          <div class="c-mc-1785781268113-5843ffb1-table-row">
            <div class="c-mc-1785781268113-5843ffb1-td">3203502388...</div>
            <div class="c-mc-1785781268113-5843ffb1-td">硫酸</div>
            <div class="c-mc-1785781268113-5843ffb1-td">江阴</div>
            <div class="c-mc-1785781268113-5843ffb1-td">2023-11-19 06:20:46</div>
            <div class="c-mc-1785781268113-5843ffb1-td">靖江</div>
            <div class="c-mc-1785781268113-5843ffb1-td">--</div>
            <div class="c-mc-1785781268113-5843ffb1-td">满载</div>
            <div class="c-mc-1785781268113-5843ffb1-td">在途</div>
          </div>
        </div>

        <!-- Details Title -->
        <div class="c-mc-1785781268113-5843ffb1-details-title">
          <div class="c-mc-1785781268113-5843ffb1-diamond-icon"></div>
          <span class="c-mc-1785781268113-5843ffb1-details-title-text">运单详情</span>
          <div class="c-mc-1785781268113-5843ffb1-title-line"></div>
        </div>

        <!-- Details Content -->
        <div class="c-mc-1785781268113-5843ffb1-details-content">
          <div class="c-mc-1785781268113-5843ffb1-details-left">
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label c-mc-1785781268113-5843ffb1-label-right">起运地</span>
              <span class="c-mc-1785781268113-5843ffb1-value">江苏省无锡市江阴市</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label">分类名称</span>
              <span class="c-mc-1785781268113-5843ffb1-value">危险品(1类4项)</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label">运输里程</span>
              <span class="c-mc-1785781268113-5843ffb1-value">200(KM)</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label">发车时间</span>
              <span class="c-mc-1785781268113-5843ffb1-value">2023-11-22 06:20:46</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label">满载情况</span>
              <span class="c-mc-1785781268113-5843ffb1-value">满载货物</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label">驾驶员姓名</span>
              <span class="c-mc-1785781268113-5843ffb1-value">张悦</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label">备注</span>
              <span class="c-mc-1785781268113-5843ffb1-value c-mc-1785781268113-5843ffb1-value-long">栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道</span>
            </div>
          </div>
          <div class="c-mc-1785781268113-5843ffb1-details-right">
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label c-mc-1785781268113-5843ffb1-label-right">危险品名称</span>
              <span class="c-mc-1785781268113-5843ffb1-value">烟花</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label c-mc-1785781268113-5843ffb1-label-right">目的地</span>
              <span class="c-mc-1785781268113-5843ffb1-value">江苏省泰州市靖江市</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label c-mc-1785781268113-5843ffb1-label-right">预计到达时间</span>
              <span class="c-mc-1785781268113-5843ffb1-value">2023-11-22 12:04:21</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label c-mc-1785781268113-5843ffb1-label-right">总重量</span>
              <span class="c-mc-1785781268113-5843ffb1-value">9.8(吨)</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-info-row">
              <span class="c-mc-1785781268113-5843ffb1-label c-mc-1785781268113-5843ffb1-label-right">驾驶员电话</span>
              <span class="c-mc-1785781268113-5843ffb1-value">13955086495</span>
            </div>
            <div class="c-mc-1785781268113-5843ffb1-img-wrapper">
              <img src="../resources/images/img-99044.png" alt="监控截图" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[mc-1785781268113-5843ffb1] $mcComponentBuilder 初始化失败:', e)
}

const handleClose = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785781268113-5843ffb1-close', {
      componentId: 'mc-1785781268113-5843ffb1',
      timestamp: Date.now()
    })
  }
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785781268113-5843ffb1-onload', {
      componentId: 'mc-1785781268113-5843ffb1',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
