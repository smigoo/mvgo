<template>
  <div class="container">
    <!-- 顶部标题栏 -->
    <div class="header">
      <div class="title-section">
        <div class="title-icon"></div>
        <span class="title-text">今日预警列表</span>
      </div>
      <div class="user-section">
        <div class="user-item">
          <div class="user-avatar">
            <svg viewBox="0 0 24 24" fill="#00e5ff" width="20" height="20">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <span class="user-name">张三</span>
          <span class="badge">已处理 1</span>
        </div>
        <div class="user-item">
          <div class="user-avatar">
            <svg viewBox="0 0 24 24" fill="#00e5ff" width="20" height="20">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <span class="user-name">李四</span>
          <span class="badge">已处理 0</span>
        </div>
      </div>
    </div>

    <!-- 数据表格区 -->
    <div class="table-wrapper">
      <a-table
        :columns="columns"
        :data-source="tableData"
        :pagination="false"
        row-key="key"
        class="custom-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <span :class="['status-text', record.status === '待处理' ? 'text-warning' : 'text-success']">
              {{ record.status }}
            </span>
          </template>
          <template v-if="column.key === 'action'">
            <span class="action-link" @click="handleCheck(record)">查看核实</span>
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
    width: '12%',
  },
  {
    title: '异常原因',
    dataIndex: 'reason',
    key: 'reason',
    width: '18%',
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
    width: '12%',
  },
  {
    title: '操作',
    key: 'action',
    width: '18%',
  },
];

const tableData = [
  {
    key: '1',
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K5+900',
    reason: '数值偏小异常',
    time: '18:20',
    status: '待处理',
  },
  {
    key: '2',
    item: '接缝位移',
    node: 'ZYN6-3',
    pile: 'K4+200',
    reason: '网络异常',
    time: '18:20',
    status: '待处理',
  },
  {
    key: '3',
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K3+700',
    reason: '网络异常',
    time: '18:20',
    status: '已处理',
  },
];

const handleCheck = (record) => {
  console.log('查看核实', record);
};
</script>

<style scoped>
.container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: linear-gradient(180deg, #003333 0%, #001a1a 100%);
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #ffffff;
  overflow: hidden;
}

.header {
  height: 60px;
  min-height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background: rgba(0, 60, 60, 0.6);
  border-bottom: 1px solid #005555;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.title-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  width: 16px;
  height: 16px;
  background: #00aaff;
  transform: rotate(45deg);
  box-shadow: 0 0 8px #00aaff;
  border-radius: 2px;
}

.title-text {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
}

.user-section {
  display: flex;
  gap: 40px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 0 3px #00e5ff);
}

.user-name {
  color: #ffffff;
}

.badge {
  background: #002222;
  border: 1px solid #004444;
  padding: 2px 12px;
  border-radius: 12px;
  font-size: 12px;
  color: #ffffff;
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.5);
}

.table-wrapper {
  flex: 1;
  padding: 10px 20px;
  overflow: auto;
}

/* Ant Design Vue Table Overrides */
:deep(.custom-table),
:deep(.custom-table .ant-table),
:deep(.custom-table .ant-table-container),
:deep(.custom-table .ant-table-content),
:deep(.custom-table table) {
  background: transparent;
  color: #ffffff;
}

:deep(.custom-table .ant-table-thead > tr > th) {
  background: rgba(0, 77, 77, 0.8);
  color: #ffffff;
  border-bottom: 1px solid #006666;
  font-weight: bold;
  font-size: 14px;
  padding: 12px 16px;
  text-align: left;
}

:deep(.custom-table .ant-table-tbody > tr > td) {
  background: transparent;
  color: #e0e0e0;
  border-bottom: 1px solid #004444;
  font-size: 13px;
  padding: 12px 16px;
}

:deep(.custom-table .ant-table-tbody > tr:hover > td),
:deep(.custom-table .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: rgba(0, 255, 255, 0.05);
}

:deep(.custom-table .ant-table-tbody > tr:last-child > td) {
  border-bottom: none;
}

.status-text {
  font-weight: normal;
}

.text-warning {
  color: #faad14; /* 黄色 */
}

.text-success {
  color: #00ffff; /* 青色 */
}

.action-link {
  color: #00ffff;
  cursor: pointer;
  text-decoration: none;
  transition: opacity 0.3s;
}

.action-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>