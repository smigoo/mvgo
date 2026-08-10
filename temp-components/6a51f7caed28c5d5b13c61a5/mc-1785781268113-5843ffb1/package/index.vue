<template>
  <base-panel panelKey="model-panels">
    <div class="c-mc-1785781268113-5843ffb1-content">
      <!-- Header -->
      <div class="header">
        <div class="header-content">
          <span class="title">常住人口</span>
          <span class="tag">常住人口</span>
          <div class="close-btn" @click="handleClose"></div>
        </div>
      </div>
      
      <!-- Body -->
      <div class="body">
        <!-- Table -->
        <div class="table-wrapper">
          <div class="table-header">
            <div class="th">运单编号</div>
            <div class="th">危化品名称</div>
            <div class="th">超运地</div>
            <div class="th">实际发车时间</div>
            <div class="th">目的地</div>
            <div class="th">预计到达时间</div>
            <div class="th">满载情况</div>
            <div class="th">运输状态</div>
          </div>
          <div class="table-row active">
            <div class="td">3203502388...</div>
            <div class="td">烟花</div>
            <div class="td">江阴</div>
            <div class="td">2023-11-22 06:20:46</div>
            <div class="td">靖江</div>
            <div class="td">--</div>
            <div class="td">满载</div>
            <div class="td">在途</div>
          </div>
          <div class="table-row">
            <div class="td">3203502388...</div>
            <div class="td">硫酸</div>
            <div class="td">无锡</div>
            <div class="td">2023-11-20 06:20:46</div>
            <div class="td">泰州</div>
            <div class="td">--</div>
            <div class="td">满载</div>
            <div class="td">在途</div>
          </div>
          <div class="table-row">
            <div class="td">3203502388...</div>
            <div class="td">硫酸</div>
            <div class="td">江阴</div>
            <div class="td">2023-11-19 06:20:46</div>
            <div class="td">靖江</div>
            <div class="td">--</div>
            <div class="td">满载</div>
            <div class="td">在途</div>
          </div>
        </div>

        <!-- Details Title -->
        <div class="details-title">
          <div class="diamond-icon"></div>
          <span class="details-title-text">运单详情</span>
          <div class="title-line"></div>
        </div>

        <!-- Details Content -->
        <div class="details-content">
          <div class="details-left">
            <div class="info-row">
              <span class="label label-right">起运地</span>
              <span class="value">江苏省无锡市江阴市</span>
            </div>
            <div class="info-row">
              <span class="label">分类名称</span>
              <span class="value">危险品(1类4项)</span>
            </div>
            <div class="info-row">
              <span class="label">运输里程</span>
              <span class="value">200(KM)</span>
            </div>
            <div class="info-row">
              <span class="label">发车时间</span>
              <span class="value">2023-11-22 06:20:46</span>
            </div>
            <div class="info-row">
              <span class="label">满载情况</span>
              <span class="value">满载货物</span>
            </div>
            <div class="info-row">
              <span class="label">驾驶员姓名</span>
              <span class="value">张悦</span>
            </div>
            <div class="info-row">
              <span class="label">备注</span>
              <span class="value value-long">栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道</span>
            </div>
          </div>
          <div class="details-right">
            <div class="info-row">
              <span class="label label-right">危险品名称</span>
              <span class="value">烟花</span>
            </div>
            <div class="info-row">
              <span class="label label-right">目的地</span>
              <span class="value">江苏省泰州市靖江市</span>
            </div>
            <div class="info-row">
              <span class="label label-right">预计到达时间</span>
              <span class="value">2023-11-22 12:04:21</span>
            </div>
            <div class="info-row">
              <span class="label label-right">总重量</span>
              <span class="value">9.8(吨)</span>
            </div>
            <div class="info-row">
              <span class="label label-right">驾驶员电话</span>
              <span class="value">13955086495</span>
            </div>
            <div class="img-wrapper">
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