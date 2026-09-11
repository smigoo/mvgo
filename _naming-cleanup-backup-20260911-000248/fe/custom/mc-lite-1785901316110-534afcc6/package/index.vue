<template>
  <div class="mc-lite-table-test">
    <!-- 顶部标题栏 -->
    <div class="header">
      <div class="header-left">
        <span class="title">运单信息</span>
        <span class="license-tag">苏A 12345</span>
      </div>
      <div class="close-btn" @click="handleClose">✕</div>
    </div>

    <!-- 运单列表表格 -->
    <div class="table-container">
      <!-- 搜索筛选交互 (布局补充要求) -->
      <div class="filter-bar">
        <input 
          v-model="searchKeyword" 
          placeholder="搜索危化品名称/超运地..." 
          class="search-input"
        />
      </div>
      
      <a-table
        :columns="columns"
        :data-source="filteredData"
        :pagination="false"
        :rowClassName="setRowClassName"
        @rowClick="handleRowClick"
        rowKey="id"
        class="custom-table"
      />
    </div>

    <!-- 运单详情 -->
    <div class="detail-container">
      <div class="detail-header">
        <span class="diamond-icon">♦</span>
        <span class="detail-title-text">运单详情</span>
      </div>
      
      <div class="detail-content">
        <div class="detail-info">
          <div class="info-grid">
            <div class="info-row">
              <span class="label">起运地</span>
              <span class="value">{{ currentDetail.origin }}</span>
            </div>
            <div class="info-row">
              <span class="label">危险品名称</span>
              <span class="value">{{ currentDetail.productName }}</span>
            </div>
            <div class="info-row">
              <span class="label">分类名称</span>
              <span class="value">{{ currentDetail.category }}</span>
            </div>
            <div class="info-row">
              <span class="label">目的地</span>
              <span class="value">{{ currentDetail.destination }}</span>
            </div>
            <div class="info-row">
              <span class="label">运输里程</span>
              <span class="value">{{ currentDetail.distance }}</span>
            </div>
            <div class="info-row">
              <span class="label">发车时间</span>
              <span class="value">{{ currentDetail.departTime }}</span>
            </div>
            <div class="info-row">
              <span class="label">预计到达时间</span>
              <span class="value">{{ currentDetail.arriveTime }}</span>
            </div>
            <div class="info-row">
              <span class="label">满载情况</span>
              <span class="value">{{ currentDetail.loadStatus }}</span>
            </div>
            <div class="info-row">
              <span class="label">总重量</span>
              <span class="value">{{ currentDetail.weight }}</span>
            </div>
            <div class="info-row">
              <span class="label">驾驶员姓名</span>
              <span class="value">{{ currentDetail.driverName }}</span>
            </div>
            <div class="info-row">
              <span class="label">驾驶员电话</span>
              <span class="value">{{ currentDetail.driverPhone }}</span>
            </div>
          </div>
          <div class="remark-row">
            <span class="label">备注</span>
            <span class="value">{{ currentDetail.remark }}</span>
          </div>
        </div>
        
        <div class="detail-image-wrapper">
          <!-- 模拟监控截图 -->
          <div class="monitor-image">
             <div class="monitor-overlay-top">
               <span> 卡口抓拍</span>
               <span>2023年11月22日 06:21:07</span>
             </div>
             <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80" alt="车辆监控" class="truck-img" />
             <div class="monitor-overlay-bottom">
               <span>黄 苏APM32</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Table as ATable } from 'ant-design-vue';

// 状态管理
const searchKeyword = ref('');
const selectedRowId = ref(1);

// 模拟数据
const tableData = [
  {
    id: 1,
    orderNo: '3203502388...',
    productName: '烟花',
    originPlace: '江阴',
    departTime: '2023-11-22 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    status: '在途',
    // 详情数据
    detail: {
      origin: '江苏省无锡市江阴市',
      productName: '烟花',
      category: '危险品(1类4项)',
      destination: '江苏省泰州市靖江市',
      distance: '200(KM)',
      departTime: '2023-11-22 06:20:46',
      arriveTime: '2023-11-22 12:04:21',
      loadStatus: '满载货物',
      weight: '9.8(吨)',
      driverName: '张悦',
      driverPhone: '13955086495',
      remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道'
    }
  },
  {
    id: 2,
    orderNo: '3203502388...',
    productName: '硫酸',
    originPlace: '无锡',
    departTime: '2023-11-20 06:20:46',
    destination: '泰州',
    arriveTime: '--',
    loadStatus: '满载',
    status: '在途',
    detail: {
      origin: '江苏省无锡市',
      productName: '硫酸',
      category: '危险品(8类)',
      destination: '江苏省泰州市',
      distance: '150(KM)',
      departTime: '2023-11-20 06:20:46',
      arriveTime: '2023-11-20 10:00:00',
      loadStatus: '满载货物',
      weight: '20.0(吨)',
      driverName: '李四',
      driverPhone: '13800000000',
      remark: '常规运输路线'
    }
  },
  {
    id: 3,
    orderNo: '3203502388...',
    productName: '硫酸',
    originPlace: '江阴',
    departTime: '2023-11-19 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    status: '在途',
    detail: {
      origin: '江苏省无锡市江阴市',
      productName: '硫酸',
      category: '危险品(8类)',
      destination: '江苏省泰州市靖江市',
      distance: '200(KM)',
      departTime: '2023-11-19 06:20:46',
      arriveTime: '2023-11-19 12:00:00',
      loadStatus: '满载货物',
      weight: '18.5(吨)',
      driverName: '王五',
      driverPhone: '13900000000',
      remark: '夜间行驶注意'
    }
  }
];

// 当前详情数据
const currentDetail = ref(tableData[0].detail);

// 表格列定义
const columns = [
  { title: '运单编号', dataIndex: 'orderNo', key: 'orderNo', width: 120 },
  { title: '危化品名称', dataIndex: 'productName', key: 'productName', width: 100 },
  { title: '超运地', dataIndex: 'originPlace', key: 'originPlace', width: 80 },
  { title: '实际发车时间', dataIndex: 'departTime', key: 'departTime', width: 160 },
  { title: '目的地', dataIndex: 'destination', key: 'destination', width: 80 },
  { title: '预计到达时间', dataIndex: 'arriveTime', key: 'arriveTime', width: 120 },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus', width: 80 },
  { title: '运输状态', dataIndex: 'status', key: 'status', width: 80 },
];

// 搜索过滤逻辑
const filteredData = computed(() => {
  if (!searchKeyword.value) return tableData;
  const lowerKey = searchKeyword.value.toLowerCase();
  return tableData.filter(item => 
    item.productName.toLowerCase().includes(lowerKey) || 
    item.originPlace.toLowerCase().includes(lowerKey)
  );
});

// 行样式
const setRowClassName = (record) => {
  return record.id === selectedRowId.value ? 'row-selected' : 'row-normal';
};

// 行点击事件
const handleRowClick = (record) => {
  selectedRowId.value = record.id;
  currentDetail.value = record.detail;
};

// 关闭按钮
const handleClose = () => {
  console.log('Close clicked');
};

</script>

<style scoped>
/* 整体容器 */
.mc-lite-table-test {
  background-color: #002222;
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 10px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid #004444;
}

/* 顶部标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to right, #003333, #002222);
  padding: 8px 15px;
  margin-bottom: 10px;
  border-bottom: 2px solid #005555;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 18px;
  font-weight: bold;
  color: #fff;
}

.license-tag {
  background-color: #e6b800;
  color: #000;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  cursor: pointer;
  font-size: 16px;
  color: #aaa;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #fff;
}

/* 表格区域 */
.table-container {
  margin-bottom: 15px;
  flex-shrink: 0;
}

.filter-bar {
  margin-bottom: 8px;
  display: flex;
  justify-content: flex-end;
}

.search-input {
  background: #003333;
  border: 1px solid #006666;
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  outline: none;
  font-size: 12px;
  width: 200px;
}

.search-input::placeholder {
  color: #88aaaa;
}

/* Ant Design Vue 表格样式覆盖 */
:deep(.custom-table) {
  background: transparent;
  color: #fff;
  font-size: 13px;
}

:deep(.ant-table-thead > tr > th) {
  background: #004444 !important;
  color: #fff !important;
  border-bottom: 1px solid #006666 !important;
  font-weight: bold;
  padding: 10px 8px;
}

:deep(.ant-table-tbody > tr > td) {
  background: #002b2b !important;
  color: #ddd !important;
  border-bottom: 1px solid #004444 !important;
  padding: 8px;
}

:deep(.ant-table-tbody > tr:hover > td) {
  background: #003d3d !important;
}

:deep(.row-selected) {
  background: #006666 !important;
}

:deep(.row-selected > td) {
  background: #006666 !important;
  color: #fff !important;
  font-weight: bold;
}

/* 详情区域 */
.detail-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: bold;
}

.diamond-icon {
  color: #fff;
  font-size: 12px;
  margin-right: 8px;
}

.detail-content {
  display: flex;
  gap: 20px;
  height: 100%;
}

.detail-info {
  flex: 2;
  display: flex;
  flex-direction: column;
  padding-left: 10px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
  margin-bottom: 10px;
}

.info-row {
  display: flex;
  font-size: 13px;
  line-height: 1.8;
}

.label {
  color: #aaa;
  margin-right: 10px;
  min-width: 80px;
}

.value {
  color: #fff;
}

.remark-row {
  display: flex;
  font-size: 13px;
  line-height: 1.5;
  margin-top: auto;
}

.remark-row .label {
  min-width: 40px;
}

/* 图片区域 */
.detail-image-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 250px;
}

.monitor-image {
  position: relative;
  width: 100%;
  max-width: 300px;
  border: 2px solid #fff;
  background: #000;
}

.truck-img {
  width: 100%;
  height: auto;
  display: block;
  opacity: 0.9;
}

.monitor-overlay-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  padding: 2px 5px;
  display: flex;
  justify-content: space-between;
}

.monitor-overlay-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  padding: 2px 5px;
}
</style>