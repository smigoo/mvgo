<template>
  <div class="warning-list-container">
    <!-- 顶部导航区 -->
    <header class="header-section">
      <div class="title-area">
        <svg class="icon-decoration" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#00d9b1" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="#00d9b1" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="#00d9b1" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <h1 class="main-title">今日预警列表</h1>
      </div>
      <div class="status-indicators">
        <div class="status-badge">
          <div class="avatar-placeholder"></div>
          <span class="person-name">张三</span>
          <span class="count-badge">已处理 1</span>
        </div>
        <div class="status-badge">
          <div class="avatar-placeholder"></div>
          <span class="person-name">李四</span>
          <span class="count-badge">已处理 0</span>
        </div>
      </div>
    </header>

    <!-- 表格区域 -->
    <div class="table-wrapper">
      <a-table 
        :columns="columns" 
        :data-source="tableData" 
        :pagination="false"
        :bordered="false"
        class="custom-table"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'result'">
            <span :class="['status-label', record.status === 'pending' ? 'status-pending' : 'status-done']">
              {{ record.result }}
            </span>
          </template>
          <template v-if="column.key === 'action'">
            <a class="action-link" @click="handleView(record)">查看核实</a>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Table as ATable } from 'ant-design-vue';

// 表格列定义
const columns = [
  {
    title: '预警项',
    dataIndex: 'item',
    key: 'item',
    align: 'left',
    width: '12%'
  },
  {
    title: '传感器节点',
    dataIndex: 'sensor',
    key: 'sensor',
    align: 'center',
    width: '15%'
  },
  {
    title: '桩号',
    dataIndex: 'pileNo',
    key: 'pileNo',
    align: 'center',
    width: '13%'
  },
  {
    title: '异常原因',
    dataIndex: 'reason',
    key: 'reason',
    align: 'center',
    width: '18%'
  },
  {
    title: '异常时间',
    dataIndex: 'time',
    key: 'time',
    align: 'center',
    width: '13%'
  },
  {
    title: '处理结果',
    dataIndex: 'result',
    key: 'result',
    align: 'center',
    width: '15%'
  },
  {
    title: '操作',
    key: 'action',
    align: 'center',
    width: '14%'
  }
];

// 表格数据
const tableData = ref([
  {
    id: 1,
    item: '管片沉降',
    sensor: 'ZYN6-2',
    pileNo: 'K5+900',
    reason: '数值偏小异常',
    time: '18:20',
    result: '待处理',
    status: 'pending'
  },
  {
    id: 2,
    item: '接缝位移',
    sensor: 'ZYN6-3',
    pileNo: 'K4+200',
    reason: '网络异常',
    time: '18:20',
    result: '待处理',
    status: 'pending'
  },
  {
    id: 3,
    item: '管片沉降',
    sensor: 'ZYN6-2',
    pileNo: 'K3+700',
    reason: '网络异常',
    time: '18:20',
    result: '已处理',
    status: 'done'
  }
]);

// 操作处理
const handleView = (record) => {
  console.log('查看核实:', record);
};
</script>

<style scoped>
.warning-list-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #071a1a;
  color: #e0f2f1;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  overflow: hidden;
}

/* 顶部导航区样式 */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  margin-bottom: 6px;
}

.title-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-decoration {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.main-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0;
  color: #e0f2f1;
  letter-spacing: 1px;
}

.status-indicators {
  display: flex;
  gap: 16px;
  align-items: center;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(12, 40, 40, 0.6);
  border: 1px solid #1a5555;
  border-radius: 4px;
  padding: 4px 12px 4px 8px;
}

.avatar-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d9b1 0%, #0891b2 100%);
  border: 1px solid #00d9b1;
  position: relative;
}

.avatar-placeholder::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
  border: 1px solid #071a1a;
}

.person-name {
  font-size: 14px;
  font-weight: 500;
  color: #e0f2f1;
}

.count-badge {
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  background: rgba(0, 217, 177, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid rgba(0, 217, 177, 0.3);
}

/* 表格区域样式 */
.table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Ant Design Vue Table 样式覆盖 */
:deep(.custom-table) {
  background: transparent;
  flex: 1;
  display: flex;
  flex-direction: column;
}

:deep(.custom-table .ant-table) {
  background: transparent;
  border: none;
  flex: 1;
  display: flex;
  flex-direction: column;
}

:deep(.custom-table .ant-table-container) {
  background: transparent;
  flex: 1;
  display: flex;
  flex-direction: column;
}

:deep(.custom-table .ant-table-content) {
  background: transparent !important;
  flex: 1;
  overflow-y: auto !important;
}

:deep(.custom-table .ant-table-thead > tr > th) {
  background: linear-gradient(180deg, #0c3838 0%, #0c2828 100%) !important;
  border-bottom: 1px solid #1a5555 !important;
  border-right: 1px solid rgba(26, 85, 85, 0.3) !important;
  color: #e0f2f1;
  font-size: 16px;
  font-weight: 600;
  padding: 12px 16px;
  text-align: center;
  white-space: nowrap;
}

:deep(.custom-table .ant-table-thead > tr > th:first-child) {
  text-align: left;
  padding-left: 20px;
}

:deep(.custom-table .ant-table-tbody > tr > td) {
  background: rgba(12, 40, 40, 0.4) !important;
  border-bottom: 1px solid #1a5555 !important;
  border-right: 1px solid rgba(26, 85, 85, 0.3) !important;
  color: #e0f2f1;
  font-size: 14px;
  font-weight: 400;
  padding: 12px 16px;
  line-height: 1.6;
  transition: background 0.2s ease;
}

:deep(.custom-table .ant-table-tbody > tr:hover > td) {
  background: rgba(0, 217, 177, 0.08) !important;
}

:deep(.custom-table .ant-table-tbody > tr > td:first-child) {
  text-align: left;
  padding-left: 20px;
}

:deep(.custom-table .ant-table-thead > tr > th:last-child),
:deep(.custom-table .ant-table-tbody > tr > td:last-child) {
  border-right: none !important;
}

/* 移除默认边框 */
:deep(.custom-table .ant-table) {
  border: none !important;
}

:deep(.custom-table .ant-table-cell-fix-right-first::after) {
  display: none;
}

/* 状态标签样式 */
.status-label {
  font-size: 14px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 2px;
  display: inline-block;
}

.status-pending {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.08);
}

.status-done {
  color: #34d399;
  background: rgba(52, 211, 153, 0.08);
}

/* 操作链接样式 */
.action-link {
  color: #22d3ee;
  cursor: pointer;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  position: relative;
}

.action-link:hover {
  color: #67e8f9;
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
}

.action-link::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: #22d3ee;
  transition: width 0.2s ease;
}

.action-link:hover::after {
  width: 100%;
}

/* 滚动条样式 */
:deep(.custom-table .ant-table-content::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

:deep(.custom-table .ant-table-content::-webkit-scrollbar-track) {
  background: #071a1a;
}

:deep(.custom-table .ant-table-content::-webkit-scrollbar-thumb) {
  background: #1a5555;
  border-radius: 3px;
}

:deep(.custom-table .ant-table-content::-webkit-scrollbar-thumb:hover) {
  background: #2d7a7a;
}
/* Ant Design Vue Table 内部背景层：避免透明单元格透出默认白底 */
:deep(.custom-table table) {
  background: transparent;
  color: inherit;
}

/* Ant Design Vue 4 通过单元格状态类控制行悬浮背景 */
:deep(.custom-table .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: rgba(0, 217, 177, 0.08) !important;
}

</style>