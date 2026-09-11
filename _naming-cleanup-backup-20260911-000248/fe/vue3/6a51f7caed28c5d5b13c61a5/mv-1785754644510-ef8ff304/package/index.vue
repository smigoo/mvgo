<template>
  <div class="waybill-container">
    <!-- 顶部标题栏 -->
    <div class="waybill-header">
      <div class="waybill-header-left">
        <img :src="icongroup4114" class="waybill-header-icon-main" alt="icon" />
        <img :src="icon1" class="waybill-header-icon-sub1" alt="icon" />
        <img :src="icon2" class="waybill-header-icon-sub2" alt="icon" />
        <span class="waybill-header-title">运单信息</span>
      </div>
      <div class="waybill-header-right">
        <span class="waybill-plate-badge">苏A 12345</span>
        <a-button class="waybill-close-btn" type="text" size="small" @click="handleClose" aria-label="关闭弹窗">
          <img :src="icon4" class="waybill-close-icon" alt="关闭" />
        </a-button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="waybill-content">
      <!-- 运单列表表格 — 改用 a-table -->
      <div class="waybill-table-section">
        <a-table
          :data-source="tableData"
          :columns="tableColumns"
          :pagination="false"
          size="small"
          :row-class-name="rowClassName"
          :custom-row="customRow"
          row-key="id"
        />
      </div>

      <!-- 运单详情区 -->
      <div class="waybill-details-section" :style="{ backgroundImage: 'url(' + bg4 + ')' }">
        <div class="waybill-details-title-bar">
          <div class="waybill-details-title-icon"></div>
          <span class="waybill-details-title">运单详情</span>
          <div class="waybill-details-line"></div>
        </div>
        <div class="waybill-details-body">
          <!-- 左侧文本区 -->
          <div class="waybill-details-grid">
            <div v-for="item in detailFields" :key="item.label" class="waybill-detail-item">
              <span class="waybill-detail-label">{{ item.label }}</span>
              <span class="waybill-detail-value">{{ item.value }}</span>
            </div>
          </div>
          <!-- 右侧监控截图 -->
          <div class="waybill-details-image">
            <img :src="img1" class="waybill-monitor-img" alt="监控截图" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from './resources/images/矩形-98954.png'
import icon2 from './resources/images/矩形备份-98955.png'
import icon4 from './resources/images/Union-98964.png'
import bg4 from './resources/images/bg-98993.png'
import img1 from './resources/images/img-99044.png'
import icongroup4114 from './resources/images/Group_4114-98956.png'

import { ref, computed } from 'vue'

const props = defineProps({
  isVisible: { type: Boolean, default: true }
})

const emit = defineEmits(['close', 'update:isVisible'])

// 表格列定义
const tableColumns = ref([
  { title: '运单编号', dataIndex: 'waybillNo', key: 'waybillNo', width: '15%' },
  { title: '危化品名称', dataIndex: 'name', key: 'name', width: '10%' },
  { title: '超运地', dataIndex: 'origin', key: 'origin', width: '8%' },
  { title: '实际发车时间', dataIndex: 'startTime', key: 'startTime', width: '18%' },
  { title: '目的地', dataIndex: 'dest', key: 'dest', width: '10%' },
  { title: '预计到达时间', dataIndex: 'arriveTime', key: 'arriveTime', width: '17%' },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus', width: '10%' },
  { title: '运输状态', dataIndex: 'transportStatus', key: 'transportStatus', width: '12%' }
])

// 表格数据
const tableData = ref([
  { id: 1, waybillNo: '3203502388…', name: '烟花', origin: '江阴', startTime: '2023-11-22 06:20:46', dest: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { id: 2, waybillNo: '3203502388…', name: '硫酸', origin: '无锡', startTime: '2023-11-20 06:20:46', dest: '泰州', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { id: 3, waybillNo: '3203502388…', name: '硫酸', origin: '江阴', startTime: '2023-11-19 06:20:46', dest: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' }
])

const selectedRowId = ref(1)

const rowClassName = (record) => {
  return record.id === selectedRowId.value ? 'waybill-row-active' : ''
}

const customRow = (record) => {
  return {
    onClick: () => { selectedRowId.value = record.id }
  }
}

const detailFields = computed(() => {
  const selectedRow = tableData.value.find(r => r.id === selectedRowId.value) || tableData.value[0]
  return [
    { label: '起运地', value: '江苏省无锡市江阴市' },
    { label: '危化品名称', value: selectedRow.name },
    { label: '分类名称', value: '危险品(1类4项)' },
    { label: '目的地', value: '江苏省泰州市靖江市' },
    { label: '运输里程', value: '200(KM)' },
    { label: '发车时间', value: selectedRow.startTime },
    { label: '预计到达时间', value: '2023-11-22 12:04:21' },
    { label: '满载情况', value: '满载货物' },
    { label: '总重量', value: '9.8(吨)' },
    { label: '驾驶员姓名', value: '张悦' },
    { label: '驾驶员电话', value: '13955086495' },
    { label: '备注', value: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道' }
  ]
})

const handleClose = () => {
  emit('close')
  emit('update:isVisible', false)
}
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* ========== 容器 ========== */
.waybill-container {
  width: 100%;
  height: 100%;
  background: #003032;
  color: #ffffff;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ========== 顶部标题栏 ========== */
.waybill-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  min-height: 34px;
  padding: 0 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(24, 255, 206, 0.3);
  position: relative;
  box-sizing: border-box;
}

.waybill-header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.waybill-header-icon-main {
  width: 17px;
  height: 18px;
  object-fit: contain;
}

.waybill-header-icon-sub1 {
  width: 20px;
  height: 1px;
  object-fit: contain;
}

.waybill-header-icon-sub2 {
  width: 12px;
  height: 2px;
  object-fit: contain;
}

.waybill-header-title {
  font-size: 20px;
  font-weight: 400;
  color: #ffffff;
  line-height: 24px;
}

.waybill-header-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

/* ========== 车牌号标签 ========== */
.waybill-plate-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  height: 24px;
  background-color: #b07b00;
  border: 1px solid #ffffff;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 400;
  color: #ffffff;
  line-height: 24px;
  white-space: nowrap;
}

/* ========== 关闭按钮 — :deep() 覆盖 a-button ========== */
.waybill-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.ant-btn) {
  background: transparent;
  border: none;
  color: #ffffff;
  padding: 0;
  min-height: auto;
  height: auto;
}

:deep(.ant-btn:hover) {
  background: transparent;
  border: none;
  color: rgba(24, 255, 206, 0.8);
}

.waybill-close-icon {
  width: 15px;
  height: 15px;
  object-fit: contain;
}

/* ========== 内容区 ========== */
.waybill-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 10px 10px 10px;
  gap: 12px;
  overflow: hidden;
}

/* ========== 表格区域 ========== */
.waybill-table-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 2px;
}

/* ========== :deep() 覆盖 a-table 样式 — 核心测试区 ========== */

/* 表头背景 */
:deep(.ant-table-thead > tr > th) {
  background: #00373a;
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  border-bottom: 1px solid rgba(24, 255, 206, 0.3);
  padding: 0 12px;
  height: 32px;
  line-height: 32px;
}

/* 表头单元格 hover */
:deep(.ant-table-thead > tr > th:hover) {
  background: #00373a;
}

/* 表体行 */
:deep(.ant-table-tbody > tr > td) {
  background: #00464b;
  color: #ffffff;
  font-size: 14px;
  border-bottom: 2px solid transparent;
  padding: 0 12px;
  height: 32px;
  line-height: 32px;
}

/* 表体行 hover */
:deep(.ant-table-tbody > tr:hover > td) {
  background: #015156 !important;
}

/* 选中行高亮 */
:deep(.ant-table-tbody > tr.waybill-row-active > td) {
  background: #014347 !important;
  box-shadow: inset 0 0 13.5px rgba(27, 255, 221, 0.85);
}

/* 表格容器 */
:deep(.ant-table) {
  background: transparent;
  font-size: 14px;
}

/* 表格内容溢出 */
:deep(.ant-table-cell-content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表格 wrapper */
:deep(.ant-table-wrapper) {
  background: transparent;
}

/* 移除表格默认边框 */
:deep(.ant-table-container) {
  border: none !important;
}

:deep(.ant-table-container table > thead > tr:first-child th:first-child) {
  border-top-left-radius: 0;
}

:deep(.ant-table-container table > thead > tr:first-child th:last-child) {
  border-top-right-radius: 0;
}

/* ========== 详情区域 ========== */
.waybill-details-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: #004045;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  padding: 12px 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.waybill-details-title-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.waybill-details-title-icon {
  width: 10px;
  height: 10px;
  background-color: #d9d9d9;
  flex-shrink: 0;
}

.waybill-details-title {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  line-height: 24px;
  white-space: nowrap;
}

.waybill-details-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(24, 255, 206, 0.5) 0%, rgba(24, 255, 206, 0) 100%);
}

.waybill-details-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 20px;
  overflow: hidden;
}

/* 左侧详情网格 */
.waybill-details-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 20px;
  align-content: start;
  overflow: hidden;
}

.waybill-detail-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  line-height: 22px;
  min-height: 22px;
}

.waybill-detail-label {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
  font-size: 14px;
  flex-shrink: 0;
  white-space: nowrap;
}

.waybill-detail-value {
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧监控截图 */
.waybill-details-image {
  width: 237px;
  height: 155px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ffffff;
  overflow: hidden;
}

.waybill-monitor-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
