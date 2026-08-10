<template>
  <base-panel panelKey="model-panels">
    <template #title-left>
      <img :src="icongroup4114" class="c-mc-1785828298676-31f24bbd-title-icon" alt="装饰图标" />
    </template>
    <template #title-right>
      <div class="c-mc-1785828298676-31f24bbd-plate-badge">
        苏A 12345
      </div>
    </template>

    <div class="c-mc-1785828298676-31f24bbd-content">
      <!-- 运单列表表格 -->
      <div class="c-mc-1785828298676-31f24bbd-table-wrapper">
        <div class="c-mc-1785828298676-31f24bbd-table-header">
          <span v-for="col in tableColumns" :key="col" class="c-mc-1785828298676-31f24bbd-th">{{ col }}</span>
        </div>
        <div class="c-mc-1785828298676-31f24bbd-table-body">
          <div
            v-for="row in tableData"
            :key="row.id"
            :class="['c-mc-1785828298676-31f24bbd-tr', { 'c-mc-1785828298676-31f24bbd-tr--active': selectedRowId === row.id }]"
            @click="selectRow(row)"
          >
            <span v-for="(cell, cIndex) in row.data" :key="cIndex" class="c-mc-1785828298676-31f24bbd-td">{{ cell }}</span>
          </div>
        </div>
      </div>

      <!-- 运单详情 -->
      <div class="c-mc-1785828298676-31f24bbd-detail-wrapper">
        <div class="c-mc-1785828298676-31f24bbd-detail-header">
          <span class="c-mc-1785828298676-31f24bbd-detail-title">运单详情</span>
        </div>
        <div class="c-mc-1785828298676-31f24bbd-detail-body">
          <div class="c-mc-1785828298676-31f24bbd-detail-text">
            <div class="c-mc-1785828298676-31f24bbd-detail-col">
              <div v-for="item in currentDetail.left" :key="item.label" class="c-mc-1785828298676-31f24bbd-detail-item">
                <span class="c-mc-1785828298676-31f24bbd-detail-label">{{ item.label }}</span>
                <span class="c-mc-1785828298676-31f24bbd-detail-value">{{ item.value }}</span>
              </div>
            </div>
            <div class="c-mc-1785828298676-31f24bbd-detail-col">
              <div v-for="item in currentDetail.right" :key="item.label" class="c-mc-1785828298676-31f24bbd-detail-item">
                <span class="c-mc-1785828298676-31f24bbd-detail-label">{{ item.label }}</span>
                <span class="c-mc-1785828298676-31f24bbd-detail-value">{{ item.value }}</span>
              </div>
            </div>
          </div>
          <div class="c-mc-1785828298676-31f24bbd-detail-image">
            <img :src="img1" alt="监控截图" class="c-mc-1785828298676-31f24bbd-monitor-img" />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import img1 from '../resources/images/img-99044.png'
import icongroup4114 from '../resources/images/Group_4114-98956.png'

import { ref, onMounted } from 'vue'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// 表格列配置
const tableColumns = ref([
  '运单编号', '危化品名称', '超运地', '实际发车时间', '目的地', '预计到达时间', '满载情况', '运输状态'
])

// 表格数据
const tableData = ref([
  { id: 'row-1', data: ['3203502388...', '烟花', '江阴', '2023-11-22 06:20:46', '靖江', '--', '满载', '在途'] },
  { id: 'row-2', data: ['3203502388...', '硫酸', '无锡', '2023-11-20 06:20:46', '泰州', '--', '满载', '在途'] },
  { id: 'row-3', data: ['3203502388...', '硫酸', '江阴', '2023-11-19 06:20:46', '靖江', '--', '满载', '在途'] }
])

// 详情数据
const detailData = {
  'row-1': {
    left: [
      { label: '起运地', value: '江苏省无锡市江阴市' },
      { label: '分类名称', value: '危险品(1类4项)' },
      { label: '运输里程', value: '200(KM)' },
      { label: '发车时间', value: '2023-11-22 06:20:46' },
      { label: '满载情况', value: '满载货物' },
      { label: '驾驶员姓名', value: '张悦' },
      { label: '备注', value: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道' }
    ],
    right: [
      { label: '危化品名称', value: '烟花' },
      { label: '目的地', value: '江苏省泰州市靖江市' },
      { label: '预计到达时间', value: '2023-11-22 12:04:21' },
      { label: '总重量', value: '9.8(吨)' },
      { label: '驾驶员电话', value: '13955086495' }
    ]
  },
  'row-2': {
    left: [
      { label: '起运地', value: '江苏省无锡市无锡市' },
      { label: '分类名称', value: '危险品(8类)' },
      { label: '运输里程', value: '150(KM)' },
      { label: '发车时间', value: '2023-11-20 06:20:46' },
      { label: '满载情况', value: '满载货物' },
      { label: '驾驶员姓名', value: '李四' },
      { label: '备注', value: '无' }
    ],
    right: [
      { label: '危化品名称', value: '硫酸' },
      { label: '目的地', value: '江苏省泰州市泰州市' },
      { label: '预计到达时间', value: '2023-11-20 12:04:21' },
      { label: '总重量', value: '10.5(吨)' },
      { label: '驾驶员电话', value: '13800138000' }
    ]
  },
  'row-3': {
    left: [
      { label: '起运地', value: '江苏省无锡市江阴市' },
      { label: '分类名称', value: '危险品(8类)' },
      { label: '运输里程', value: '200(KM)' },
      { label: '发车时间', value: '2023-11-19 06:20:46' },
      { label: '满载情况', value: '满载货物' },
      { label: '驾驶员姓名', value: '王五' },
      { label: '备注', value: '无' }
    ],
    right: [
      { label: '危化品名称', value: '硫酸' },
      { label: '目的地', value: '江苏省泰州市靖江市' },
      { label: '预计到达时间', value: '2023-11-19 12:04:21' },
      { label: '总重量', value: '9.8(吨)' },
      { label: '驾驶员电话', value: '13900139000' }
    ]
  }
}

const selectedRowId = ref('row-1')
const currentDetail = ref(detailData['row-1'])

// 选中行切换
const selectRow = (row) => {
  selectedRowId.value = row.id
  currentDetail.value = detailData[row.id]
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785828298676-31f24bbd-onload', {
      componentId: 'mc-1785828298676-31f24bbd',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>