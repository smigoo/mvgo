<template>
  <base-panel panelKey="model-panels">
    <template #title-left>
      <img :src="icongroup4114" class="c-mc-1785821926851-9df16da1-title-icon" alt="title-icon" />
    </template>
    <template #title-right>
      <span class="c-mc-1785821926851-9df16da1-plate-tag">苏A 12345</span>
    </template>
    <template #header-right>
      <img :src="icon5" class="c-mc-1785821926851-9df16da1-close-btn" alt="close" @click="handleClose" />
    </template>

    <div class="c-mc-1785821926851-9df16da1-content">
      <!-- 运单列表表格 -->
      <div class="c-mc-1785821926851-9df16da1-table">
        <div class="c-mc-1785821926851-9df16da1-table-header">
          <div class="c-mc-1785821926851-9df16da1-th col-id">运单编号</div>
          <div class="c-mc-1785821926851-9df16da1-th col-name">危化品名称</div>
          <div class="c-mc-1785821926851-9df16da1-th col-origin">超运地</div>
          <div class="c-mc-1785821926851-9df16da1-th col-depart">实际发车时间</div>
          <div class="c-mc-1785821926851-9df16da1-th col-dest">目的地</div>
          <div class="c-mc-1785821926851-9df16da1-th col-arrive">预计到达时间</div>
          <div class="c-mc-1785821926851-9df16da1-th col-load">满载情况</div>
          <div class="c-mc-1785821926851-9df16da1-th col-status">运输状态</div>
        </div>

        <div
          v-for="(row, index) in tableData"
          :key="index"
          class="c-mc-1785821926851-9df16da1-table-row"
          :class="{ 'is-active': activeRowIndex === index }"
          @click="activeRowIndex = index"
        >
          <div class="c-mc-1785821926851-9df16da1-td col-id">{{ row.id }}</div>
          <div class="c-mc-1785821926851-9df16da1-td col-name">{{ row.name }}</div>
          <div class="c-mc-1785821926851-9df16da1-td col-origin">{{ row.origin }}</div>
          <div class="c-mc-1785821926851-9df16da1-td col-depart">{{ row.departTime }}</div>
          <div class="c-mc-1785821926851-9df16da1-td col-dest">{{ row.dest }}</div>
          <div class="c-mc-1785821926851-9df16da1-td col-arrive">{{ row.arriveTime }}</div>
          <div class="c-mc-1785821926851-9df16da1-td col-load">{{ row.load }}</div>
          <div class="c-mc-1785821926851-9df16da1-td col-status">{{ row.status }}</div>
        </div>
      </div>

      <!-- 运单详情 -->
      <div class="c-mc-1785821926851-9df16da1-detail">
        <div class="c-mc-1785821926851-9df16da1-detail-header">
          <span class="c-mc-1785821926851-9df16da1-detail-title">运单详情</span>
        </div>
        
        <div class="c-mc-1785821926851-9df16da1-detail-body">
          <div class="c-mc-1785821926851-9df16da1-detail-grid">
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-right">起运地</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.origin }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-right">危险品名称</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.name }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-left">分类名称</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.category }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-right">目的地</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.dest }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-left">运输里程</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.distance }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-right">预计到达时间</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.arriveTime }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-left">发车时间</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.departTime }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-left">满载情况</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.load }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-right">总重量</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.weight }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-left">驾驶员姓名</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.driver }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field">
              <span class="c-mc-1785821926851-9df16da1-label align-right">驾驶员电话</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.phone }}</span>
            </div>
            <div class="c-mc-1785821926851-9df16da1-field full-width">
              <span class="c-mc-1785821926851-9df16da1-label align-left">备注</span>
              <span class="c-mc-1785821926851-9df16da1-value">{{ currentDetail.remark }}</span>
            </div>
          </div>

          <div class="c-mc-1785821926851-9df16da1-monitor-wrapper">
            <img :src="img1" class="c-mc-1785821926851-9df16da1-monitor-img" alt="monitor" />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon5 from '../resources/images/Union-98964.png'
import img1 from '../resources/images/img-99044.png'
import icongroup4114 from '../resources/images/Group_4114-98956.png'

import { ref, computed, onMounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[运单信息] $mcComponentBuilder 失败:', e)
}

// 表格数据
const tableData = ref([
  { id: '3203502388...', name: '烟花', origin: '江阴', departTime: '2023-11-22 06:20:46', dest: '靖江', arriveTime: '--', load: '满载', status: '在途' },
  { id: '3203502388...', name: '硫酸', origin: '无锡', departTime: '2023-11-20 06:20:46', dest: '泰州', arriveTime: '--', load: '满载', status: '在途' },
  { id: '3203502388...', name: '硫酸', origin: '江阴', departTime: '2023-11-19 06:20:46', dest: '靖江', arriveTime: '--', load: '满载', status: '在途' }
])

// 详情数据
const detailData = ref([
  { origin: '江苏省无锡市江阴市', name: '烟花', category: '危险品(1类4项)', dest: '江苏省泰州市靖江市', distance: '200(KM)', departTime: '2023-11-22 06:20:46', arriveTime: '2023-11-22 12:04:21', load: '满载货物', weight: '9.8(吨)', driver: '张悦', phone: '13955086495', remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道' },
  { origin: '江苏省无锡市', name: '硫酸', category: '危险品(8类)', dest: '江苏省泰州市', distance: '150(KM)', departTime: '2023-11-20 06:20:46', arriveTime: '2023-11-20 10:00:00', load: '满载货物', weight: '15.2(吨)', driver: '李明', phone: '13800138000', remark: '无' },
  { origin: '江苏省无锡市江阴市', name: '硫酸', category: '危险品(8类)', dest: '江苏省泰州市靖江市', distance: '180(KM)', departTime: '2023-11-19 06:20:46', arriveTime: '2023-11-19 11:30:00', load: '满载货物', weight: '12.5(吨)', driver: '王强', phone: '13900139000', remark: '注意限速' }
])

const activeRowIndex = ref(0)
const currentDetail = computed(() => detailData.value[activeRowIndex.value] || detailData.value[0])

// 关闭弹窗
const handleClose = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('modal-close', {})
  }
}

// 组件加载事件
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785821926851-9df16da1-onload', {
      componentId: 'mc-1785821926851-9df16da1',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>