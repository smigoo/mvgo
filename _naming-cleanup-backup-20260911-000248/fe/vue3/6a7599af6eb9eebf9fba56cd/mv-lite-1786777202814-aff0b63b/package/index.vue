<template>
  <div class="mv-lite-container">
    <!-- 标题栏 -->
    <div class="header">
      <div class="header-left">
        <div class="title-group">
          <span class="icon-list">☰</span>
          <h2 class="title">运单信息</h2>
          <a-tag color="gold" class="vehicle-tag">苏A 12345</a-tag>
        </div>
      </div>
      <a-button type="text" class="close-btn" @click="handleClose">
        <template #icon><span class="close-icon">✕</span></template>
      </a-button>
    </div>

    <!-- 数据表格 -->
    <div class="table-section">
      <a-table
        :columns="columns"
        :data-source="tableData"
        :pagination="false"
        :row-class-name="getRowClassName"
        :custom-row="customRow"
        size="middle"
        class="custom-table"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'id'">
            <span class="cell-link">{{ record.id }}</span>
          </template>
          <template v-if="column.key === 'loadStatus'">
            <a-tag :color="record.loadStatus === '满载' ? 'orange' : 'blue'">
              {{ record.loadStatus }}
            </a-tag>
          </template>
          <template v-if="column.key === 'status'">
            <a-badge :status="record.status === '在途' ? 'processing' : 'default'" :text="record.status" />
          </template>
        </template>
      </a-table>
    </div>

    <!-- 详情区域 -->
    <div class="detail-section">
      <h3 class="detail-title">
        <span class="diamond">♦</span> 运单详情
      </h3>

      <div class="detail-content">
        <div class="detail-info">
          <a-descriptions :column="2" bordered size="small" class="custom-descriptions">
            <a-descriptions-item label="起运地">
              江苏省无锡市江阴市
            </a-descriptions-item>
            <a-descriptions-item label="危险品名称">
              <a-tag color="red">烟花</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="分类名称">
              危险品(1类4项)
            </a-descriptions-item>
            <a-descriptions-item label="目的地">
              江苏省泰州市靖江市
            </a-descriptions-item>
            <a-descriptions-item label="运输里程">
              200(KM)
            </a-descriptions-item>
            <a-descriptions-item label=" ">
            </a-descriptions-item>
            <a-descriptions-item label="发车时间">
              2023-11-22 06:20:46
            </a-descriptions-item>
            <a-descriptions-item label="预计到达时间">
              2023-11-22 12:04:21
            </a-descriptions-item>
            <a-descriptions-item label="满载情况">
              <a-tag color="orange">满载货物</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="总重量">
              9.8(吨)
            </a-descriptions-item>
            <a-descriptions-item label="驾驶员姓名">
              张悦
            </a-descriptions-item>
            <a-descriptions-item label="驾驶员电话">
              <a-typography-text copyable>13955086495</a-typography-text>
            </a-descriptions-item>
            <a-descriptions-item label="备注" :span="2">
              栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道
            </a-descriptions-item>
          </a-descriptions>
        </div>

        <div class="detail-image">
          <img
            src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80"
            alt="监控画面"
            class="monitor-img"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import {
  Table as ATable,
  Tag as ATag,
  Badge as ABadge,
  Button as AButton,
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  TypographyText as ATypographyText,
} from 'ant-design-vue';

const selectedRowKey = ref('1');

const columns = [
  { title: '运单编号', dataIndex: 'id', key: 'id', width: 140 },
  { title: '危化品名称', dataIndex: 'name', key: 'name', width: 100 },
  { title: '起运地', dataIndex: 'origin', key: 'origin', width: 80 },
  { title: '实际发车时间', dataIndex: 'startTime', key: 'startTime', width: 170 },
  { title: '目的地', dataIndex: 'dest', key: 'dest', width: 80 },
  { title: '预计到达时间', dataIndex: 'endTime', key: 'endTime', width: 130 },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus', width: 100, align: 'center' },
  { title: '运输状态', dataIndex: 'status', key: 'status', width: 100, align: 'center' },
];

const tableData = [
  {
    key: '1',
    id: '3203502388...',
    name: '烟花',
    origin: '江阴',
    startTime: '2023-11-22 06:20:46',
    dest: '靖江',
    endTime: '--',
    loadStatus: '满载',
    status: '在途',
  },
  {
    key: '2',
    id: '3203502388...',
    name: '硫酸',
    origin: '无锡',
    startTime: '2023-11-20 06:20:46',
    dest: '泰州',
    endTime: '--',
    loadStatus: '满载',
    status: '在途',
  },
  {
    key: '3',
    id: '3203502388...',
    name: '硫酸',
    origin: '江阴',
    startTime: '2023-11-19 06:20:46',
    dest: '靖江',
    endTime: '--',
    loadStatus: '空载',
    status: '已完成',
  },
];

const getRowClassName = (record, index) => {
  if (record.key === selectedRowKey.value) return 'active-row';
  return '';
};

const customRow = (record, index) => {
  return {
    onClick: () => {
      selectedRowKey.value = record.key;
    },
    style: { cursor: 'pointer' },
  };
};

const handleClose = () => {
  console.log('Close clicked');
};
</script>

<style scoped>
.mv-lite-container {
  background-color: #00222b;
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 20px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  max-width: 1200px;
  margin: 0 auto;
}

/* 标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: linear-gradient(to right, #00404d, #002b36);
  padding: 10px 15px;
  border-bottom: 2px solid #006666;
}

.header-left {
  display: flex;
  align-items: center;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-list {
  font-size: 18px;
  color: #00ffff;
  margin-right: 5px;
}

.title {
  font-size: 18px;
  font-weight: bold;
  margin: 0;
  color: #ffffff;
  letter-spacing: 1px;
}

.vehicle-tag {
  font-weight: bold;
  border: none;
}

.close-btn {
  color: #ffffff !important;
  border: 1px solid #006666;
  border-radius: 4px;
}

.close-btn:hover {
  color: #00ffff !important;
  background-color: #00404d !important;
}

.close-icon {
  font-size: 12px;
  line-height: 1;
}

/* 表格区域 */
.table-section {
  margin-bottom: 20px;
  border: 1px solid #006666;
  border-radius: 4px;
  overflow: hidden;
}

.cell-link {
  color: #00ffff;
  cursor: pointer;
}

.cell-link:hover {
  text-decoration: underline;
}

/* 强制覆盖 Ant Design Table 样式 - 暗色主题 */
:deep(.ant-table) {
  background-color: transparent !important;
  color: #ffffff;
}

:deep(.ant-table-thead > tr > th),
:deep(.ant-table-thead > tr > td) {
  background-color: #00404d !important;
  color: #ffffff !important;
  border-bottom: 1px solid #006666 !important;
  font-weight: normal;
  text-align: center;
}

:deep(.ant-table-tbody > tr > td) {
  background-color: #00333d !important;
  color: #ffffff !important;
  border-bottom: 1px solid #005555 !important;
  text-align: center;
  transition: background-color 0.2s;
}

:deep(.ant-table-tbody > tr:hover > td) {
  background-color: #004d5c !important;
}

:deep(.ant-table-tbody > tr.active-row > td) {
  background-color: #005566 !important;
  border-left: none;
}

:deep(.ant-table-tbody > tr.active-row > td:first-child) {
  border-left: 3px solid #00ffff;
}

:deep(.ant-table-placeholder > td) {
  background-color: #00333d !important;
}

/* Badge 文字颜色 */
:deep(.ant-badge-status-text) {
  color: #ffffff !important;
}

/* 详情区域 */
.detail-section {
  margin-top: 20px;
}

.detail-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  color: #ffffff;
}

.diamond {
  color: #ffffff;
  margin-right: 8px;
  font-size: 12px;
}

.detail-content {
  display: flex;
  gap: 20px;
  background-color: #002b36;
  padding: 10px;
}

.detail-info {
  flex: 1;
}

/* Descriptions 暗色主题覆盖 */
:deep(.ant-descriptions) {
  color: #ffffff;
}

:deep(.ant-descriptions-item-label) {
  background-color: #00404d !important;
  color: #a0c0c0 !important;
  border-color: #006666 !important;
}

:deep(.ant-descriptions-item-content) {
  background-color: #00333d !important;
  color: #ffffff !important;
  border-color: #006666 !important;
}

:deep(.ant-descriptions-bordered .ant-descriptions-view) {
  border-color: #006666 !important;
}

:deep(.ant-descriptions-bordered .ant-descriptions-row > th),
:deep(.ant-descriptions-bordered .ant-descriptions-row > td) {
  border-color: #006666 !important;
}

/* Typography 复制按钮颜色 */
:deep(.ant-typography-copy) {
  color: #00ffff !important;
}

.detail-image {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.monitor-img {
  width: 100%;
  height: auto;
  border: 1px solid #006666;
  object-fit: cover;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .detail-content {
    flex-direction: column;
  }
  .detail-image {
    width: 100%;
  }
}
</style>
