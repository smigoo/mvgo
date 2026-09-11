<template>
  <base-panel panelKey="model-panels">
    <!-- 标题栏右侧：车牌号标签 -->
    <template #title-right>
      <div class="c-mc-1785773052434-99c7a448-plate-tag-wrapper">
        <span class="c-mc-1785773052434-99c7a448-plate-tag">苏A 12345</span>
      </div>
    </template>

    <!-- 标题栏左侧：装饰图标 -->
    <template #title-left>
      <div class="c-mc-1785773052434-99c7a448-title-deco">
        <img :src="icon2" alt="装饰" class="c-mc-1785773052434-99c7a448-deco-rect" />
        <img :src="icon3" alt="装饰" class="c-mc-1785773052434-99c7a448-deco-rect-backup" />
        <img :src="icon1" alt="分割线" class="c-mc-1785773052434-99c7a448-deco-line" />
      </div>
    </template>

    <!-- 默认插槽：业务内容 -->
    <div 
      class="c-mc-1785773052434-99c7a448-content" 
      :style="{ 
        backgroundImage: `url(${bg4})`, 
        backgroundSize: '100% 100%', 
        backgroundPosition: 'center center', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <!-- 表格区域 -->
      <div 
        class="c-mc-1785773052434-99c7a448-table-section"
        :style="{ 
          backgroundImage: `url(${bg1})`, 
          backgroundSize: '100% 100%', 
          backgroundPosition: 'center center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <a-table
          :columns="tableColumns"
          :data-source="tableData"
          :pagination="false"
          :row-class-name="getRowClassName"
          :custom-row="customRow"
          :scroll="{ x: '100%' }"
          class="c-mc-1785773052434-99c7a448-data-table"
          size="small"
        />
      </div>

      <!-- 详情区域 -->
      <div class="c-mc-1785773052434-99c7a448-details-section">
        <div class="c-mc-1785773052434-99c7a448-details-header">
          <div class="c-mc-1785773052434-99c7a448-details-deco"></div>
          <span class="c-mc-1785773052434-99c7a448-details-title">运单详情</span>
          <div class="c-mc-1785773052434-99c7a448-details-line"></div>
        </div>
        
        <div class="c-mc-1785773052434-99c7a448-details-body">
          <!-- 左侧文本区 -->
          <div 
            class="c-mc-1785773052434-99c7a448-info-text-block"
            :style="{ 
              backgroundImage: `url(${bg2})`, 
              backgroundSize: '100% 100%', 
              backgroundPosition: 'center center', 
              backgroundRepeat: 'no-repeat' 
            }"
          >
            <div class="c-mc-1785773052434-99c7a448-info-grid">
              <div v-for="item in detailInfo" :key="item.label" class="c-mc-1785773052434-99c7a448-info-item">
                <span class="c-mc-1785773052434-99c7a448-info-label">{{ item.label }}</span>
                <span class="c-mc-1785773052434-99c7a448-info-value">{{ item.value }}</span>
              </div>
            </div>
          </div>

          <!-- 右侧图片区 -->
          <div 
            class="c-mc-1785773052434-99c7a448-monitor-image-wrapper"
            :style="{ 
              backgroundImage: `url(${bg3})`, 
              backgroundSize: '100% 100%', 
              backgroundPosition: 'center center', 
              backgroundRepeat: 'no-repeat' 
            }"
          >
            <img :src="img1" alt="监控抓拍图" class="c-mc-1785773052434-99c7a448-monitor-image" />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/分割线-98952.png'
import icon2 from '../resources/images/矩形-98954.png'
import icon3 from '../resources/images/矩形备份-98955.png'
import bg4 from '../resources/images/bg-98993.png'
import bg1 from '../resources/images/bg-2.png'
import bg2 from '../resources/images/bg-98973.png'
import bg3 from '../resources/images/bg-98983.png'
import img1 from '../resources/images/img-99044.png'

import { ref, onMounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[运单信息] $mcComponentBuilder 失败:', e)
}

const tableColumns = ref([
  { title: '运单编号', dataIndex: 'waybillNo', key: 'waybillNo', width: 120 },
  { title: '危化品名称', dataIndex: 'hazardName', key: 'hazardName', width: 90 },
  { title: '起运地', dataIndex: 'origin', key: 'origin', width: 70 },
  { title: '实际发车时间', dataIndex: 'departTime', key: 'departTime', width: 150 },
  { title: '目的地', dataIndex: 'destination', key: 'destination', width: 70 },
  { title: '预计到达时间', dataIndex: 'arriveTime', key: 'arriveTime', width: 150 },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus', width: 80 },
  { title: '运输状态', dataIndex: 'transportStatus', key: 'transportStatus', width: 80 }
])

const tableData = ref([
  { key: '1', waybillNo: '3203502388...', hazardName: '烟花', origin: '江阴', departTime: '2023-11-22 06:20:46', destination: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { key: '2', waybillNo: '3203502388...', hazardName: '硫酸', origin: '无锡', departTime: '2023-11-20 06:20:46', destination: '泰州', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { key: '3', waybillNo: '3203502388...', hazardName: '硫酸', origin: '江阴', departTime: '2023-11-19 06:20:46', destination: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' }
])

const selectedRowKey = ref('1')

const detailInfo = ref([
  { label: '起运地', value: '江苏省无锡市江阴市' },
  { label: '危险品名称', value: '烟花' },
  { label: '分类名称', value: '危险品(1类4项)' },
  { label: '目的地', value: '江苏省泰州市靖江市' },
  { label: '运输里程', value: '200(KM)' },
  { label: '发车时间', value: '2023-11-22 06:20:46' },
  { label: '预计到达时间', value: '2023-11-22 12:04:21' },
  { label: '满载情况', value: '满载货物' },
  { label: '总重量', value: '9.8(吨)' },
  { label: '驾驶员姓名', value: '张悦' },
  { label: '驾驶员电话', value: '13955086495' },
  { label: '备注', value: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道' }
])

const getRowClassName = (record) => {
  return record.key === selectedRowKey.value ? 'c-mc-1785773052434-99c7a448-row-highlight' : ''
}

const customRow = (record) => {
  return {
    onClick: () => {
      selectedRowKey.value = record.key
    },
    style: { cursor: 'pointer' }
  }
}

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785773052434-99c7a448-onload', {
      componentId: 'mc-1785773052434-99c7a448',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* [Layout Refine] Figma slot-con padding: top 18, right 20, bottom 30, left 10 */
.c-mc-1785773052434-99c7a448-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 20px 30px 10px;
  box-sizing: border-box;
  overflow: hidden;
  gap: 20px;
}

/* [Layout Refine] Figma header deco layout */
.c-mc-1785773052434-99c7a448-title-deco {
  display: flex;
  align-items: center;
  gap: 4px;
  
  .c-mc-1785773052434-99c7a448-deco-rect {
    width: 20px;
    height: 1px;
  }
  .c-mc-1785773052434-99c7a448-deco-rect-backup {
    width: 12px;
    height: 2px;
  }
  .c-mc-1785773052434-99c7a448-deco-line {
    width: 100%;
    max-width: 200px;
    height: 4px;
  }
}

/* [Style Refine] Figma Frame 2136639137 fills & strokes */
.c-mc-1785773052434-99c7a448-plate-tag-wrapper {
  display: flex;
  align-items: center;
}

.c-mc-1785773052434-99c7a448-plate-tag {
  display: inline-block;
  padding: 0 6px;
  background-color: #B07B00;
  color: #FFFFFF;
  border: 1px solid #FFFFFF;
  border-radius: 4px;
  font-family: 'Roboto', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

/* [Layout Refine] Figma @antd/table bbox height 140 */
.c-mc-1785773052434-99c7a448-table-section {
  width: 100%;
  height: 140px;
  flex-shrink: 0;
  overflow: hidden;
}

.c-mc-1785773052434-99c7a448-data-table {
  width: 100%;
  height: 100%;
  
  :deep(.ant-table) {
    background: transparent;
    color: #FFFFFF;
  }
  
  /* [Style Refine] Figma table header bg #00373A, font 14px 700 */
  :deep(.ant-table-thead > tr > th) {
    background: #00373A;
    color: #FFFFFF;
    font-family: 'Source Han Sans CN', sans-serif;
    font-size: 14px;
    font-weight: 700;
    border-bottom: none;
    padding: 6px 8px;
  }
  
  /* [Style Refine] Figma table row bg #00464B, font 14px 400 */
  :deep(.ant-table-tbody > tr > td) {
    background: #00464B;
    color: #FFFFFF;
    font-family: 'Source Han Sans CN', sans-serif;
    font-size: 14px;
    font-weight: 400;
    border-bottom: none;
    padding: 6px 8px;
  }
  
  :deep(.ant-table-body) {
    max-height: 108px;
    overflow-y: auto;
    
    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(24, 255, 206, 0.3);
      border-radius: 2px;
    }
  }
  
  /* [Style Refine] Figma selected row bg #014347, inner shadow rgba(27, 255, 220, 0.85) */
  :deep(.c-mc-1785773052434-99c7a448-row-highlight) {
    td {
      background: #014347 !important;
      box-shadow: inset 0 0 13.5px rgba(27, 255, 220, 0.85);
    }
  }
}

/* [Layout Refine] Figma details section flex layout */
.c-mc-1785773052434-99c7a448-details-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
}

.c-mc-1785773052434-99c7a448-details-header {
  height: 33px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* [Style Refine] Figma Rectangle 346242330 fills #D9D9D9 */
.c-mc-1785773052434-99c7a448-details-deco {
  width: 10px;
  height: 10px;
  background-color: #D9D9D9;
}

/* [Style Refine] Figma title font 16px 700 */
.c-mc-1785773052434-99c7a448-details-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: #FFFFFF;
}

.c-mc-1785773052434-99c7a448-details-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, #18FFCE, transparent);
}

.c-mc-1785773052434-99c7a448-details-body {
  flex: 1;
  display: flex;
  gap: 28px;
  min-height: 0;
  padding-top: 16px;
}

.c-mc-1785773052434-99c7a448-info-text-block {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}

/* [Layout Refine] Figma left grid 2 columns, gap 8px 24px */
.c-mc-1785773052434-99c7a448-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 24px;
  width: 100%;
  align-content: start;
}

.c-mc-1785773052434-99c7a448-info-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  line-height: 21px;
  
  &:last-child {
    grid-column: 1 / -1;
  }
}

/* [Style Refine] Figma label font 14px 400, value font 14px 700 */
.c-mc-1785773052434-99c7a448-info-label {
  color: #FFFFFF;
  font-weight: 400;
  white-space: nowrap;
}

.c-mc-1785773052434-99c7a448-info-value {
  color: #FFFFFF;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* [Layout Refine] Figma img bbox width 237, height 155 */
.c-mc-1785773052434-99c7a448-monitor-image-wrapper {
  width: 237px;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
}

/* [Style Refine] Figma img stroke 1px solid #FFFFFF */
.c-mc-1785773052434-99c7a448-monitor-image {
  width: 100%;
  height: 155px;
  object-fit: cover;
  border: 1px solid #FFFFFF;
  box-sizing: border-box;
}
</style>