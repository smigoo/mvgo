<template>
  <div class="mv-container">
    <!-- 顶部标题与状态栏 -->
    <div class="header-bar">
      <div class="header-left">
        <div class="icon-cube">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#00e5ff">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" opacity="0.8"/>
            <path d="M12 22V12" stroke="#00e5ff" stroke-width="2"/>
          </svg>
        </div>
        <span class="main-title">今日预警列表</span>
      </div>
      <div class="header-right">
        <div class="user-status">
          <div class="icon-user">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#52c41a">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <span class="user-name">张三</span>
          <span class="status-badge">已处理 1</span>
        </div>
        <div class="user-status">
          <div class="icon-user">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#52c41a">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <span class="user-name">李四</span>
          <span class="status-badge">已处理 0</span>
        </div>
      </div>
    </div>

    <!-- 数据表格区 -->
    <div class="table-container">
      <a-table
        :columns="columns"
        :data-source="tableData"
        :pagination="false"
        row-key="id"
        class="dark-table"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <span :class="['status-text', record.status === '待处理' ? 'text-warning' : 'text-processed']">
              {{ record.status }}
            </span>
          </template>
          <template v-if="column.key === 'action'">
            <a class="action-link">查看核实</a>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup>
import { Table as ATable } from 'ant-design-vue';

const columns = [
  { title: '预警项', dataIndex: 'item', key: 'item', width: '14%' },
  { title: '传感器节点', dataIndex: 'node', key: 'node', width: '14%' },
  { title: '桩号', dataIndex: 'pile', key: 'pile', width: '12%' },
  { title: '异常原因', dataIndex: 'reason', key: 'reason', width: '18%' },
  { title: '异常时间', dataIndex: 'time', key: 'time', width: '12%' },
  { title: '处理结果', dataIndex: 'status', key: 'status', width: '14%' },
  { title: '操作', dataIndex: 'action', key: 'action', width: '16%' },
];

const tableData = [
  {
    id: '1',
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K5+900',
    reason: '数值偏小异常',
    time: '18:20',
    status: '待处理',
    action: '查看核实',
  },
  {
    id: '2',
    item: '接缝位移',
    node: 'ZYN6-3',
    pile: 'K4+200',
    reason: '网络异常',
    time: '18:20',
    status: '待处理',
    action: '查看核实',
  },
  {
    id: '3',
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K3+700',
    reason: '网络异常',
    time: '18:20',
    status: '已处理',
    action: '查看核实',
  },
];
</script>

<style scoped>
.mv-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #002b36; /* 深色背景基调 */
  background-image: linear-gradient(180deg, #003333 0%, #001a1a 100%);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

/* 顶部标题栏 */
.header-bar {
  height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  background: linear-gradient(90deg, rgba(0, 77, 77, 0.8) 0%, rgba(0, 51, 51, 0.4) 100%);
  border-bottom: 1px solid #006666;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-cube {
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-title {
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
  letter-spacing: 1px;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.user-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #cccccc;
}

.icon-user {
  display: flex;
  align-items: center;
}

.user-name {
  color: #ffffff;
  font-weight: 500;
}

.status-badge {
  background-color: #004040;
  padding: 2px 8px;
  border-radius: 4px;
  color: #ffffff;
  font-size: 12px;
  border: 1px solid #006666;
}

/* 表格区域 */
.table-container {
  flex: 1;
  padding: 10px 20px;
  overflow: auto;
  min-height: 0;
}

/* Ant Design Vue 表格样式覆盖 */
:deep(.dark-table) {
  background: transparent;
  color: #ffffff;
}

:deep(.dark-table .ant-table-thead > tr > th) {
  background-color: #004d4d;
  color: #ffffff;
  border-bottom: 1px solid #006666;
  font-weight: bold;
  font-size: 14px;
  padding: 12px 8px;
  text-align: left;
}

:deep(.dark-table .ant-table-tbody > tr > td) {
  background-color: transparent;
  color: #e0e0e0;
  border-bottom: 1px solid #004040;
  font-size: 13px;
  padding: 10px 8px;
}

:deep(.dark-table .ant-table-tbody > tr:hover > td) {
  background-color: rgba(0, 255, 255, 0.05);
}

:deep(.dark-table .ant-table-row) {
  background-color: transparent;
}

/* 状态文本颜色 */
.status-text {
  font-weight: 500;
}

.text-warning {
  color: #faad14; /* 黄色 */
}

.text-processed {
  color: #13c2c2; /* 浅蓝/青色 */
}

/* 操作链接 */
.action-link {
  color: #00ffff;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.3s;
}

.action-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}
/* Ant Design Vue Table 内部背景层：避免透明单元格透出默认白底 */
:deep(.dark-table .ant-table),
:deep(.dark-table .ant-table-container),
:deep(.dark-table .ant-table-content),
:deep(.dark-table table) {
  background: transparent;
  color: inherit;
}

/* Ant Design Vue 4 通过单元格状态类控制行悬浮背景 */
:deep(.dark-table .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background-color: rgba(0, 255, 255, 0.05);
}

</style>