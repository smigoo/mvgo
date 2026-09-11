<template>
  <div class="warning-list-container">
    <!-- 顶部标题与状态栏 -->
    <div class="header-bar">
      <div class="header-left">
        <svg class="icon-crystal" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7L12 22L22 7L12 2Z" fill="#00BFFF" opacity="0.8"/>
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00FFFF" opacity="0.9"/>
          <path d="M12 12L2 7V17L12 22V12Z" fill="#0080FF" opacity="0.6"/>
          <path d="M12 12L22 7V17L12 22V12Z" fill="#0066CC" opacity="0.7"/>
        </svg>
        <span class="title-text">今日预警列表</span>
      </div>
      <div class="header-right">
        <div class="user-status">
          <svg class="icon-user-crystal" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 22L22 7L12 2Z" fill="#00BFFF" opacity="0.8"/>
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00FFFF" opacity="0.9"/>
            <path d="M12 12L2 7V17L12 22V12Z" fill="#0080FF" opacity="0.6"/>
            <path d="M12 12L22 7V17L12 22V12Z" fill="#0066CC" opacity="0.7"/>
          </svg>
          <span class="user-name">张三</span>
          <span class="status-text">已处理 1</span>
        </div>
        <div class="user-status">
          <svg class="icon-user-crystal" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 22L22 7L12 2Z" fill="#00BFFF" opacity="0.8"/>
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00FFFF" opacity="0.9"/>
            <path d="M12 12L2 7V17L12 22V12Z" fill="#0080FF" opacity="0.6"/>
            <path d="M12 12L22 7V17L12 22V12Z" fill="#0066CC" opacity="0.7"/>
          </svg>
          <span class="user-name">李四</span>
          <span class="status-text">已处理 0</span>
        </div>
      </div>
    </div>

    <!-- 数据表格区 -->
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
            <span :class="['result-text', record.status === 'pending' ? 'pending' : 'processed']">
              {{ record.result }}
            </span>
          </template>
          <template v-if="column.key === 'action'">
            <span class="action-link" @click="handleView(record)">查看核实</span>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Table as ATable } from 'ant-design-vue';

const columns = [
  { title: '预警项', dataIndex: 'item', key: 'item', align: 'center' },
  { title: '传感器节点', dataIndex: 'sensor', key: 'sensor', align: 'center' },
  { title: '桩号', dataIndex: 'pileNo', key: 'pileNo', align: 'center' },
  { title: '异常原因', dataIndex: 'reason', key: 'reason', align: 'center' },
  { title: '异常时间', dataIndex: 'time', key: 'time', align: 'center' },
  { title: '处理结果', dataIndex: 'result', key: 'result', align: 'center' },
  { title: '操作', key: 'action', align: 'center' }
];

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
    status: 'processed'
  }
]);

const handleView = (record) => {
  console.log('查看核实:', record);
};
</script>

<style scoped>
.warning-list-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #003333;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
}

/* 顶部标题栏 */
.header-bar {
  height: 15%;
  min-height: 36px;
  background: linear-gradient(90deg, #002b2b 0%, #003d3d 50%, #002b2b 100%);
  border-bottom: 1px solid #006666;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-crystal {
  width: 20px;
  height: 20px;
}

.title-text {
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
}

.header-right {
  display: flex;
  gap: 24px;
  align-items: center;
}

.user-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-user-crystal {
  width: 16px;
  height: 16px;
}

.user-name {
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 500;
}

.status-text {
  color: #E0E0E0;
  font-size: 13px;
  margin-left: 4px;
}

/* 表格区域 */
.table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background-color: #003333;
}

/* 表格样式覆盖 */
:deep(.custom-table) {
  background: transparent !important;
}

:deep(.custom-table .ant-table) {
  background: transparent !important;
  border: none !important;
}

:deep(.custom-table .ant-table-thead > tr > th) {
  background-color: #004444 !important;
  color: #FFFFFF !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  border-bottom: 1px solid #006666 !important;
  padding: 12px 8px !important;
  text-align: center !important;
}

:deep(.custom-table .ant-table-tbody > tr > td) {
  background-color: #003d3d !important;
  color: #FFFFFF !important;
  font-size: 13px !important;
  border-bottom: 1px solid #005555 !important;
  padding: 12px 8px !important;
  text-align: center !important;
}

:deep(.custom-table .ant-table-tbody > tr:hover > td) {
  background-color: #004d4d !important;
}

:deep(.custom-table .ant-table-placeholder) {
  background-color: transparent !important;
  border: none !important;
}

/* 状态文字样式 */
.result-text {
  font-weight: 500;
}

.result-text.pending {
  color: #FFD700;
}

.result-text.processed {
  color: #00FFFF;
}

/* 操作链接样式 */
.action-link {
  color: #00FFFF;
  cursor: pointer;
  text-decoration: underline;
  transition: all 0.2s ease;
}

.action-link:hover {
  color: #33FFFF;
  text-shadow: 0 0 6px rgba(0, 255, 255, 0.6);
}
/* Ant Design Vue Table 内部背景层：避免透明单元格透出默认白底 */
:deep(.custom-table .ant-table-container),
:deep(.custom-table .ant-table-content),
:deep(.custom-table table) {
  background: transparent;
  color: inherit;
}

/* Ant Design Vue 4 通过单元格状态类控制行悬浮背景 */
:deep(.custom-table .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background-color: #004d4d !important;
}

</style>