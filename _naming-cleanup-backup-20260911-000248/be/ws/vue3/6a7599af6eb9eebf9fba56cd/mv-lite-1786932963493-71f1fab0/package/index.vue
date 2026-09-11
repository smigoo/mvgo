<template>
  <div class="root-container">
    <!-- 顶部标题与状态栏 -->
    <div class="header-section">
      <div class="title-group">
        <div class="title-icon">
          <div class="diamond d1"></div>
          <div class="diamond d2"></div>
        </div>
        <h2 class="main-title">今日预警列表</h2>
      </div>
      
      <div class="user-status-group">
        <div 
          class="user-card" 
          :class="{ active: activeUser === 'zhang' }"
          @click="activeUser = 'zhang'"
        >
          <div class="avatar-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="#00D4AA"/>
            </svg>
          </div>
          <span class="user-name">张三</span>
          <span class="status-tag-dark">已处理 1</span>
        </div>

        <div 
          class="user-card" 
          :class="{ active: activeUser === 'li' }"
          @click="activeUser = 'li'"
        >
          <div class="avatar-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="#00D4AA"/>
            </svg>
          </div>
          <span class="user-name">李四</span>
          <span class="status-tag-dark">已处理 0</span>
        </div>
      </div>
    </div>

    <!-- 表格区域 -->
    <div class="table-section">
      <a-table 
        :columns="columns" 
        :data-source="tableData" 
        :pagination="false" 
        row-key="id"
        class="tech-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <span class="status-badge" :class="record.status === 'pending' ? 'status-pending' : 'status-processed'">
              {{ record.status === 'pending' ? '待处理' : '已处理' }}
            </span>
          </template>
          <template v-if="column.key === 'action'">
            <a class="action-link" @click="handleCheck(record)">查看核实</a>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Table as ATable } from 'ant-design-vue';

const activeUser = ref('zhang');

const columns = [
  { title: '预警项', dataIndex: 'item', key: 'item', width: '15%' },
  { title: '传感器节点', dataIndex: 'node', key: 'node', width: '15%' },
  { title: '桩号', dataIndex: 'pile', key: 'pile', width: '12%' },
  { title: '异常原因', dataIndex: 'reason', key: 'reason', width: '20%' },
  { title: '异常时间', dataIndex: 'time', key: 'time', width: '10%' },
  { title: '处理结果', dataIndex: 'status', key: 'status', width: '13%' },
  { title: '操作', key: 'action', width: '15%' },
];

const tableData = ref([
  {
    id: 1,
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K5+900',
    reason: '数值偏小异常',
    time: '18:20',
    status: 'pending',
  },
  {
    id: 2,
    item: '接缝位移',
    node: 'ZYN6-3',
    pile: 'K4+200',
    reason: '网络异常',
    time: '18:20',
    status: 'pending',
  },
  {
    id: 3,
    item: '管片沉降',
    node: 'ZYN6-2',
    pile: 'K3+700',
    reason: '网络异常',
    time: '18:20',
    status: 'processed',
  },
]);

const handleCheck = (record) => {
  console.log('查看核实:', record);
};
</script>

<style scoped>
.root-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #061822;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #ffffff;
  overflow: hidden;
}

/* Header Section */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  height: auto;
  min-height: 40px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.diamond {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #00D4AA;
  transform: rotate(45deg);
  opacity: 0.8;
}

.d1 {
  left: 0;
  top: 2px;
  background: #00D4AA;
}

.d2 {
  left: 6px;
  top: 6px;
  background: #008f73;
}

.main-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: 1px;
  text-shadow: 0 0 10px rgba(0, 212, 170, 0.3);
}

.user-status-group {
  display: flex;
  gap: 16px;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  background: rgba(12, 41, 56, 0.6);
  border: 1px solid #1A3B4D;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.user-card:hover, .user-card.active {
  background: rgba(0, 212, 170, 0.1);
  border-color: #00D4AA;
}

.avatar-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-icon svg {
  width: 20px;
  height: 20px;
}

.user-name {
  font-size: 14px;
  color: #ffffff;
}

.status-tag-dark {
  background: #000000;
  color: #ffffff;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid #333;
}

/* Table Section */
.table-section {
  flex: 1;
  min-height: 0;
  background: #0C2938;
  border: 1px solid #1A3B4D;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Ant Design Vue Overrides */
:deep(.tech-table) {
  background: transparent;
  color: #ffffff;
  flex: 1;
}

:deep(.tech-table .ant-table-container) {
  border-radius: 4px;
}

:deep(.tech-table .ant-table-thead > tr > th) {
  background: #0A2535 !important;
  color: #ffffff;
  border-bottom: 1px solid #1A3B4D;
  font-weight: 600;
  font-size: 15px;
  padding: 16px;
  text-align: left;
}

:deep(.tech-table .ant-table-tbody > tr > td) {
  background: transparent !important;
  color: #e0e0e0;
  border-bottom: 1px solid #1A3B4D;
  font-size: 14px;
  padding: 14px 16px;
}

:deep(.tech-table .ant-table-tbody > tr:last-child > td) {
  border-bottom: none;
}

:deep(.tech-table .ant-table-tbody > tr:hover > td) {
  background: rgba(0, 212, 170, 0.05) !important;
}

/* Custom Components in Table */
.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.status-pending {
  color: #FFD700;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.status-processed {
  color: #00D4AA;
  background: rgba(0, 212, 170, 0.1);
  border: 1px solid rgba(0, 212, 170, 0.3);
}

.action-link {
  color: #00D4AA;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.3s;
}

.action-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}
/* Ant Design Vue Table 内部背景层：避免透明单元格透出默认白底 */
:deep(.tech-table .ant-table),
:deep(.tech-table .ant-table-container),
:deep(.tech-table .ant-table-content),
:deep(.tech-table table) {
  background: transparent;
  color: inherit;
}

/* Ant Design Vue 4 通过单元格状态类控制行悬浮背景 */
:deep(.tech-table .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: rgba(0, 212, 170, 0.05) !important;
}

</style>