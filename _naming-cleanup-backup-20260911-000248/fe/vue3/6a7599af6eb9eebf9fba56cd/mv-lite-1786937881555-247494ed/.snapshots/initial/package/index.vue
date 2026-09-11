<template>
  <div class="warning-list-container">
    <!-- 头部区域 -->
    <div class="header-section">
      <div class="title-area">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#00d4aa" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="#00d4aa" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="#00d4aa" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <span class="main-title">今日预警列表</span>
      </div>
      
      <div class="user-tags">
        <div 
          class="user-tag" 
          :class="{ active: activeUser === 'zhang' }"
          @click="activeUser = 'zhang'"
        >
          <div class="avatar">
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%2300d4aa'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='%230b1f1c' font-size='14' font-weight='bold'%3E张%3C/text%3E%3C/svg%3E" alt="张三" />
          </div>
          <span class="user-name">张三</span>
          <span class="process-count">已处理 1</span>
        </div>
        
        <div 
          class="user-tag" 
          :class="{ active: activeUser === 'li' }"
          @click="activeUser = 'li'"
        >
          <div class="avatar">
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%234a90a4'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='%230b1f1c' font-size='14' font-weight='bold'%3E李%3C/text%3E%3C/svg%3E" alt="李四" />
          </div>
          <span class="user-name">李四</span>
          <span class="process-count">已处理 0</span>
        </div>
      </div>
    </div>

    <!-- 表格区域 -->
    <div class="table-wrapper">
      <a-table
        :columns="columns"
        :data-source="tableData"
        :pagination="false"
        :row-class-name="() => 'custom-row'"
        class="custom-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <span class="status-tag" :class="record.status === '待处理' ? 'pending' : 'done'">
              {{ record.status }}
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
import { ref } from vue;
import { Table as ATable } from ant-design-vue;

const activeUser = ref('zhang');

const columns = [
  {
    title: '预警项',
    dataIndex: 'warningItem',
    key: 'warningItem',
    width: '15%',
  },
  {
    title: '传感器节点',
    dataIndex: 'sensorNode',
    key: 'sensorNode',
    width: '18%',
  },
  {
    title: '桩号',
    dataIndex: 'pileNumber',
    key: 'pileNumber',
    width: '13%',
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
    width: '12%',
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
    width: '12%',
  },
];

const tableData = ref([
  {
    key: '1',
    warningItem: '管片沉降',
    sensorNode: 'ZYN6-2',
    pileNumber: 'K5+900',
    reason: '数值偏小异常',
    time: '18:20',
    status: '待处理',
  },
  {
    key: '2',
    warningItem: '接缝位移',
    sensorNode: 'ZYN6-3',
    pileNumber: 'K4+200',
    reason: '网络异常',
    time: '18:20',
    status: '待处理',
  },
  {
    key: '3',
    warningItem: '管片沉降',
    sensorNode: 'ZYN6-2',
    pileNumber: 'K3+700',
    reason: '网络异常',
    time: '18:20',
    status: '已处理',
  },
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
  background-color: #0b1f1c;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-radius: 8px;
}

/* 头部区域 */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 48px;
  flex-shrink: 0;
}

.title-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  width: 28px;
  height: 28px;
  filter: drop-shadow(0 0 4px rgba(0, 212, 170, 0.5));
}

.main-title {
  font-size: 20px;
  font-weight: 600;
  color: #e0f7f4;
  letter-spacing: 1px;
  text-shadow: 0 0 10px rgba(0, 212, 170, 0.3);
}

/* 用户标签 */
.user-tags {
  display: flex;
  gap: 12px;
}

.user-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 6px;
  background: rgba(13, 41, 36, 0.8);
  border: 1px solid #1a4d43;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.user-tag::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(0, 212, 170, 0.1) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.user-tag:hover::before,
.user-tag.active::before {
  opacity: 1;
}

.user-tag.active {
  border-color: #00d4aa;
  box-shadow: 0 0 12px rgba(0, 212, 170, 0.25);
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(0, 212, 170, 0.3);
  flex-shrink: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-name {
  font-size: 13px;
  color: #e0f7f4;
  font-weight: 500;
}

.process-count {
  font-size: 11px;
  color: #8fb8b0;
}

/* 表格区域 */
.table-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.custom-table {
  flex: 1;
  min-height: 0;
}

:deep(.custom-table .ant-table) {
  background: transparent !important;
}

:deep(.custom-table .ant-table-thead > tr > th) {
  background: linear-gradient(180deg, rgba(26, 77, 67, 0.9) 0%, rgba(13, 41, 36, 0.95) 100%) !important;
  border-bottom: 1px solid #1a4d43 !important;
  color: #e0f7f4 !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  padding: 14px 16px !important;
  text-align: left !important;
}

:deep(.custom-table .ant-table-tbody > tr) {
  transition: all 0.2s ease;
}

:deep(.custom-table .ant-table-tbody > tr > td) {
  background: rgba(13, 41, 36, 0.6) !important;
  border-bottom: 1px solid rgba(26, 77, 67, 0.5) !important;
  color: #e0f7f4 !important;
  font-size: 14px !important;
  padding: 14px 16px !important;
}

:deep(.custom-table .ant-table-tbody > tr:hover > td) {
  background: rgba(0, 212, 170, 0.08) !important;
}

:deep(.custom-table .ant-table-placeholder) {
  background: transparent !important;
}

/* 状态标签 */
.status-tag {
  font-size: 13px;
  font-weight: 500;
  padding: 2px 0;
}

.status-tag.pending {
  color: #f0c040;
  text-shadow: 0 0 6px rgba(240, 192, 64, 0.4);
}

.status-tag.done {
  color: #40e0d0;
  text-shadow: 0 0 6px rgba(64, 224, 208, 0.4);
}

/* 操作链接 */
.action-link {
  color: #40a0ff;
  cursor: pointer;
  font-size: 14px;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
  transition: all 0.2s ease;
}

.action-link:hover {
  color: #60c0ff;
  text-shadow: 0 0 8px rgba(64, 160, 255, 0.5);
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
  background: rgba(0, 212, 170, 0.08) !important;
}

</style>