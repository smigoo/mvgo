<template>
  <div class="mv-lite-container">
    <!-- 顶部标题与状态栏 -->
    <header class="top-header">
      <div class="header-left">
        <div class="title-icon">
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M12 2L2 12l10 10 10-10z" fill="#00BFFF" />
            <path d="M12 2L2 12l10 4z" fill="#0080FF" opacity="0.8" />
          </svg>
        </div>
        <h2 class="main-title">今日预警列表</h2>
      </div>
      <div class="header-right">
        <div class="user-status-item">
          <div class="user-icon">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#00FF7F" />
            </svg>
          </div>
          <span class="user-name">张三</span>
          <span class="status-badge">已处理 1</span>
        </div>
        <div class="user-status-item">
          <div class="user-icon">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#00FF7F" />
            </svg>
          </div>
          <span class="user-name">李四</span>
          <span class="status-badge">已处理 0</span>
        </div>
      </div>
    </header>

    <!-- 数据表格区 -->
    <div class="table-container">
      <a-table
        :columns="columns"
        :data-source="data"
        :pagination="false"
        row-key="id"
        class="custom-data-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <span :class="['status-text', record.status === '待处理' ? 'text-warning' : 'text-success']">
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
  {
    title: '预警项',
    dataIndex: 'item',
    key: 'item',
    width: '15%',
  },
  {
    title: '传感器节点',
    dataIndex: 'node',
    key: 'node',
    width: '15%',
  },
  {
    title: '桩号',
    dataIndex: 'pile',
    key: 'pile',
    width: '15%',
  },
  {
    title: '异常原因',
    dataIndex: 'reason',
    key: 'reason',
    width: '20%',
  },
  {
    title: '异常时间',
    dataIndex: 'time',
    key: 'time',
    width: '10%',
  },
  {
    title: '处理结果',
    dataIndex: 'status',
    key: 'status',
    width: '10%',
  },
  {
    title: '操作',
    key: 'action',
    width: '15%',
  },
];

const data = [
  {
    id: '1',
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K5+900',
    reason: '数值偏小异常',
    time: '18:20',
    status: '待处理',
  },
  {
    id: '2',
    item: '接缝位移',
    node: 'ZYN6-3',
    pile: 'K4+200',
    reason: '网络异常',
    time: '18:20',
    status: '待处理',
  },
  {
    id: '3',
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K3+700',
    reason: '网络异常',
    time: '18:20',
    status: '已处理',
  },
];
</script>

<style scoped>
.mv-lite-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #003333;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

/* 顶部栏样式 */
.top-header {
  height: 60px;
  min-height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  background: linear-gradient(180deg, #004040 0%, #003333 100%);
  border-bottom: 1px solid #006666;
  box-shadow: 0 2px 10px rgba(0, 255, 255, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  display: flex;
  align-items: center;
}

.main-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
  letter-spacing: 1px;
}

.header-right {
  display: flex;
  gap: 20px;
}

.user-status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 77, 77, 0.5);
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid #006666;
}

.user-icon {
  display: flex;
  align-items: center;
}

.user-name {
  font-size: 14px;
  color: #ffffff;
}

.status-badge {
  font-size: 12px;
  background: #002222;
  padding: 2px 8px;
  border-radius: 10px;
  color: #ffffff;
  border: 1px solid #004D4D;
}

/* 表格区域样式 */
.table-container {
  flex: 1;
  padding: 10px 20px;
  overflow: auto;
}

/* Ant Design Vue 表格覆盖样式 */
:deep(.custom-data-table) {
  background: transparent;
  color: #ffffff;
}

:deep(.custom-data-table .ant-table-thead > tr > th) {
  background: #004D4D;
  color: #ffffff;
  border-bottom: 1px solid #006666;
  font-weight: bold;
  font-size: 14px;
  padding: 16px 16px;
  text-align: left;
}

:deep(.custom-data-table .ant-table-tbody > tr > td) {
  background: transparent;
  color: #ffffff;
  border-bottom: 1px solid #004040;
  font-size: 14px;
  padding: 16px 16px;
}

:deep(.custom-data-table .ant-table-tbody > tr:hover > td) {
  background: rgba(0, 255, 255, 0.05);
}

:deep(.custom-data-table .ant-table-row) {
  /* 确保行背景透明 */
}

/* 状态文字颜色 */
.status-text {
  font-weight: normal;
}

.text-warning {
  color: #FADB14; /* 黄色 */
}

.text-success {
  color: #00FFFF; /* 浅蓝色/青色 */
}

/* 操作链接样式 */
.action-link {
  color: #00FFFF;
  text-decoration: none;
  cursor: pointer;
}

.action-link:hover {
  color: #ffffff;
  text-decoration: underline;
}
</style>