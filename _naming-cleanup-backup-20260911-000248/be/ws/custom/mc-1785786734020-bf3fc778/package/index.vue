<template>
  <base-panel panelKey="model-panels">
    <!-- 标题左侧装饰图标 -->
    <template #title-left>
      <img :src="icongroup4114" alt="标题装饰" class="c-mc-1785786734020-bf3fc778-title-decor" />
    </template>

    <!-- 标题右侧：车牌号标签 -->
    <template #title-right>
      <div class="c-mc-1785786734020-bf3fc778-plate-tag">
        <span>苏A 12345</span>
      </div>
    </template>

    <!-- 头部右侧：关闭按钮 -->
    <template #header-right>
      <button 
        class="c-mc-1785786734020-bf3fc778-close-btn" 
        @click="handleClose" 
        aria-label="关闭弹窗" 
        title="关闭弹窗"
      >
        <img :src="icon5" alt="关闭" />
      </button>
    </template>

    <!-- 默认插槽：业务内容 -->
    <div class="c-mc-1785786734020-bf3fc778-content">
      <!-- 表格区域 -->
      <div class="c-mc-1785786734020-bf3fc778-table-wrapper">
        <!-- 表头 -->
        <div class="c-mc-1785786734020-bf3fc778-table-header">
          <div class="c-mc-1785786734020-bf3fc778-th">运单编号</div>
          <div class="c-mc-1785786734020-bf3fc778-th">危化品名称</div>
          <div class="c-mc-1785786734020-bf3fc778-th">超运地</div>
          <div class="c-mc-1785786734020-bf3fc778-th">实际发车时间</div>
          <div class="c-mc-1785786734020-bf3fc778-th">目的地</div>
          <div class="c-mc-1785786734020-bf3fc778-th">预计到达时间</div>
          <div class="c-mc-1785786734020-bf3fc778-th">满载情况</div>
          <div class="c-mc-1785786734020-bf3fc778-th">运输状态</div>
        </div>

        <!-- 表格行 -->
        <div
          v-for="row in tableData"
          :key="row.id"
          :class="['c-mc-1785786734020-bf3fc778-table-row', { 'is-active': selectedRowId === row.id }]"
          @click="selectRow(row)"
        >
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.waybillNo }}</div>
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.hazmatName }}</div>
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.origin }}</div>
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.departTime }}</div>
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.destination }}</div>
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.arriveTime }}</div>
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.loadStatus }}</div>
          <div class="c-mc-1785786734020-bf3fc778-td">{{ row.transportStatus }}</div>
        </div>
      </div>

      <!-- 详情区域 -->
      <div class="c-mc-1785786734020-bf3fc778-detail-wrapper">
        <div class="c-mc-1785786734020-bf3fc778-detail-header">
          <div class="c-mc-1785786734020-bf3fc778-detail-diamond"></div>
          <span class="c-mc-1785786734020-bf3fc778-detail-title">运单详情</span>
          <div class="c-mc-1785786734020-bf3fc778-detail-line"></div>
        </div>

        <div class="c-mc-1785786734020-bf3fc778-detail-body">
          <!-- 左侧信息网格 -->
          <div class="c-mc-1785786734020-bf3fc778-detail-info">
            <div class="c-mc-1785786734020-bf3fc778-info-grid">
              <div 
                v-for="item in currentDetail.infoList" 
                :key="item.label" 
                :class="['c-mc-1785786734020-bf3fc778-info-item', { 'is-full': item.span === 2 }]"
              >
                <span class="c-mc-1785786734020-bf3fc778-info-label">{{ item.label }}</span>
                <span class="c-mc-1785786734020-bf3fc778-info-value">{{ item.value }}</span>
              </div>
            </div>
          </div>
          
          <!-- 右侧监控截图 -->
          <div class="c-mc-1785786734020-bf3fc778-detail-image">
            <img :src="img1" alt="监控截图" class="c-mc-1785786734020-bf3fc778-monitor-img" />
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

import { ref, onMounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder({
    componentId: 'mc-1785786734020-bf3fc778',
    componentProps: {},
    componentName: '运单信息'
  }) : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[运单信息] $mcComponentBuilder 失败:', e)
}

const tableData = ref([
  {
    id: 1,
    waybillNo: '3203502388...',
    hazmatName: '烟花',
    origin: '江阴',
    departTime: '2023-11-22 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    detail: {
      infoList: [
        { label: '起运地', value: '江苏省无锡市江阴市' },
        { label: '危险品名称', value: '烟花' },
        { label: '分类名称', value: '危险品(1类4项)' },
        { label: '目的地', value: '江苏省泰州市靖江市' },
        { label: '运输里程', value: '200(KM)' },
        { label: '发车时间', value: '2023-11-22 06:20:46' },
        { label: '预计到达时间', value: '2023-11-22 12:04:21' },
        { label: '满载情况', value: '满载货物' },
        { label: '总重量', value: '9.8(吨)' },
        { label: '驾驶员姓名', value: '张悦' },
        { label: '驾驶员电话', value: '13955086495' },
        { label: '备注', value: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道', span: 2 }
      ]
    }
  },
  {
    id: 2,
    waybillNo: '3203502388...',
    hazmatName: '硫酸',
    origin: '无锡',
    departTime: '2023-11-20 06:20:46',
    destination: '泰州',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    detail: {
      infoList: [
        { label: '起运地', value: '江苏省无锡市' },
        { label: '危险品名称', value: '硫酸' },
        { label: '分类名称', value: '危险品(8类)' },
        { label: '目的地', value: '江苏省泰州市' },
        { label: '运输里程', value: '150(KM)' },
        { label: '发车时间', value: '2023-11-20 06:20:46' },
        { label: '预计到达时间', value: '--' },
        { label: '满载情况', value: '满载货物' },
        { label: '总重量', value: '15.0(吨)' },
        { label: '驾驶员姓名', value: '李四' },
        { label: '驾驶员电话', value: '13800138000' },
        { label: '备注', value: '无', span: 2 }
      ]
    }
  },
  {
    id: 3,
    waybillNo: '3203502388...',
    hazmatName: '硫酸',
    origin: '江阴',
    departTime: '2023-11-19 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    detail: {
      infoList: [
        { label: '起运地', value: '江苏省无锡市江阴市' },
        { label: '危险品名称', value: '硫酸' },
        { label: '分类名称', value: '危险品(8类)' },
        { label: '目的地', value: '江苏省泰州市靖江市' },
        { label: '运输里程', value: '180(KM)' },
        { label: '发车时间', value: '2023-11-19 06:20:46' },
        { label: '预计到达时间', value: '--' },
        { label: '满载情况', value: '满载货物' },
        { label: '总重量', value: '12.5(吨)' },
        { label: '驾驶员姓名', value: '王五' },
        { label: '驾驶员电话', value: '13900139000' },
        { label: '备注', value: '无', span: 2 }
      ]
    }
  }
])

const selectedRowId = ref(1)
const currentDetail = ref(tableData.value[0].detail)

const selectRow = (row) => {
  selectedRowId.value = row.id
  currentDetail.value = row.detail
}

const handleClose = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('modal-close', {})
  }
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785786734020-bf3fc778-onload', {
      componentId: 'mc-1785786734020-bf3fc778',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>