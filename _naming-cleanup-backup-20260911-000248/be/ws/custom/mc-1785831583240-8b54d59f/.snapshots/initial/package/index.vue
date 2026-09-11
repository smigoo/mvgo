<template>
  <base-panel panelKey="model-panels">
    <div class="c-mc-1785831583240-8b54d59f-modal">
      <!-- Header -->
      <div class="c-mc-1785831583240-8b54d59f-header">
        <div class="c-mc-1785831583240-8b54d59f-header-title">
          <span class="c-mc-1785831583240-8b54d59f-title-text">常住人口</span>
          <span class="c-mc-1785831583240-8b54d59f-title-tag">常住人口</span>
        </div>
        <div class="c-mc-1785831583240-8b54d59f-header-close" @click="handleClose">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M1 13L13 1" stroke="#fff" stroke-width="1.5"/>
          </svg>
        </div>
      </div>

      <!-- Content -->
      <div class="c-mc-1785831583240-8b54d59f-content">
        <!-- Table -->
        <div class="c-mc-1785831583240-8b54d59f-table">
          <div class="c-mc-1785831583240-8b54d59f-table-header">
            <span>运单编号</span>
            <span>危化品名称</span>
            <span>超运地</span>
            <span>实际发车时间</span>
            <span>目的地</span>
            <span>预计到达时间</span>
            <span>满载情况</span>
            <span>运输状态</span>
          </div>
          <div class="c-mc-1785831583240-8b54d59f-table-row active">
            <span>3203502388…</span>
            <span>烟花</span>
            <span>江阴</span>
            <span>2023-11-22 06:20:46</span>
            <span>靖江</span>
            <span>--</span>
            <span>满载</span>
            <span>在途</span>
          </div>
          <div class="c-mc-1785831583240-8b54d59f-table-row">
            <span>3203502388…</span>
            <span>硫酸</span>
            <span>无锡</span>
            <span>2023-11-20 06:20:46</span>
            <span>泰州</span>
            <span>--</span>
            <span>满载</span>
            <span>在途</span>
          </div>
          <div class="c-mc-1785831583240-8b54d59f-table-row">
            <span>3203502388…</span>
            <span>硫酸</span>
            <span>江阴</span>
            <span>2023-11-19 06:20:46</span>
            <span>靖江</span>
            <span>--</span>
            <span>满载</span>
            <span>在途</span>
          </div>
        </div>

        <!-- Details -->
        <div class="c-mc-1785831583240-8b54d59f-details">
          <div class="c-mc-1785831583240-8b54d59f-details-header">
            <span class="c-mc-1785831583240-8b54d59f-details-icon"></span>
            <span class="c-mc-1785831583240-8b54d59f-details-title">运单详情</span>
            <div class="c-mc-1785831583240-8b54d59f-details-line"></div>
          </div>
          <div class="c-mc-1785831583240-8b54d59f-details-body">
            <div class="c-mc-1785831583240-8b54d59f-details-info">
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label">起运地</span>
                <span class="value">江苏省无锡市江阴市</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label">危险品名称</span>
                <span class="value">烟花</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label left">分类名称</span>
                <span class="value">危险品(1类4项)</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label">目的地</span>
                <span class="value">江苏省泰州市靖江市</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label left">运输里程</span>
                <span class="value">200(KM)</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label">预计到达时间</span>
                <span class="value">2023-11-22 12:04:21</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label left">发车时间</span>
                <span class="value">2023-11-22 06:20:46</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label">总重量</span>
                <span class="value">9.8(吨)</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label left">满载情况</span>
                <span class="value">满载货物</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label">驾驶员电话</span>
                <span class="value">13955086495</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item">
                <span class="label left">驾驶员姓名</span>
                <span class="value">张悦</span>
              </div>
              <div class="c-mc-1785831583240-8b54d59f-info-item full">
                <span class="label left">备注</span>
                <span class="value">栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道</span>
              </div>
            </div>
            <div class="c-mc-1785831583240-8b54d59f-details-img">
              <img src="../resources/images/img-99044.png" alt="监控截图" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

const handleClose = () => {
  console.log('close modal')
}
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>