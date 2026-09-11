<template>
  <div class="waybill-container">
    <!-- 顶部标题栏 -->
    <div class="waybill-header">
      <div class="waybill-header-left">
        <img :src="icongroup4114" class="waybill-header-icon-main" alt="icon" />
        <img :src="icon1" class="waybill-header-icon-sub1" alt="icon" />
        <img :src="icon2" class="waybill-header-icon-sub2" alt="icon" />
        <span class="waybill-header-title">运单信息</span>
      </div>
      <div class="waybill-header-right">
        <span class="waybill-plate-badge">苏A 12345</span>
        <button class="waybill-close-btn" @click="handleClose" aria-label="关闭弹窗">
          <img :src="icon4" class="waybill-close-icon" alt="关闭" />
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="waybill-content">
      <!-- 运单列表表格 -->
      <div class="waybill-table-section">
        <!-- 表头 -->
        <div class="waybill-table-header" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
          <div class="waybill-cell col-waybill">运单编号</div>
          <div class="waybill-cell col-name">危化品名称</div>
          <div class="waybill-cell col-origin">超运地</div>
          <div class="waybill-cell col-time">实际发车时间</div>
          <div class="waybill-cell col-dest">目的地</div>
          <div class="waybill-cell col-arrive">预计到达时间</div>
          <div class="waybill-cell col-load">满载情况</div>
          <div class="waybill-cell col-status">运输状态</div>
        </div>
        <!-- 数据行 -->
        <div
          v-for="row in tableData"
          :key="row.id"
          class="waybill-table-row"
          :class="{ 'is-active': row.id === selectedRowId }"
          :style="{ backgroundImage: 'url(' + (row.id === selectedRowId ? bg3 : bg2) + ')' }"
          @click="handleRowClick(row.id)"
        >
          <div class="waybill-cell col-waybill">{{ row.waybillNo }}</div>
          <div class="waybill-cell col-name">{{ row.name }}</div>
          <div class="waybill-cell col-origin">{{ row.origin }}</div>
          <div class="waybill-cell col-time">{{ row.startTime }}</div>
          <div class="waybill-cell col-dest">{{ row.dest }}</div>
          <div class="waybill-cell col-arrive">{{ row.arriveTime }}</div>
          <div class="waybill-cell col-load">{{ row.loadStatus }}</div>
          <div class="waybill-cell col-status">{{ row.transportStatus }}</div>
        </div>
      </div>

      <!-- 运单详情区 -->
      <div class="waybill-details-section" :style="{ backgroundImage: 'url(' + bg4 + ')' }">
        <div class="waybill-details-title-bar">
          <div class="waybill-details-title-icon"></div>
          <span class="waybill-details-title">运单详情</span>
          <div class="waybill-details-line"></div>
        </div>
        <div class="waybill-details-body">
          <!-- 左侧文本区 -->
          <div class="waybill-details-grid">
            <div v-for="item in detailFields" :key="item.label" class="waybill-detail-item">
              <span class="waybill-detail-label">{{ item.label }}</span>
              <span class="waybill-detail-value">{{ item.value }}</span>
            </div>
          </div>
          <!-- 右侧监控截图 -->
          <div class="waybill-details-image">
            <img :src="img1" class="waybill-monitor-img" alt="监控截图" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
// === API 对接注入 (自动生成，请勿手动修改) ===
import flowApi from './api/flow.mjs'  // slot-2: #region 3. 响应式状态
// === END API imports ===

// === API 对接调用 ===
onMounted(async () => {
  // slot-2: #region 3. 响应式状态 → flow.getHazardousVehicleList
  try {
    const __res_slot_2 = await flowApi.getHazardousVehicleList({"sectionNum":"1"})
    if (__res_slot_2?.code === 200 || __res_slot_2?.data) {
      tableData.value = __res_slot_2.data || __res_slot_2
    }
  } catch (e) { console.error('slot-2 flowApi.getHazardousVehicleList({"sectionNum":"1"}):', e) }

})
// === END API 对接注入 ===

import icon1 from './resources/images/矩形-98954.png'
import icon2 from './resources/images/矩形备份-98955.png'
import icon4 from './resources/images/Union-98964.png'
import bg1 from './resources/images/bg-2.png'
import bg3 from './resources/images/bg-98983.png'
import bg2 from './resources/images/bg-98973.png'
import bg4 from './resources/images/bg-98993.png'
import img1 from './resources/images/img-99044.png'
import icongroup4114 from './resources/images/Group_4114-98956.png'

import { ref, computed } from 'vue'

const props = defineProps({
  isVisible: { type: Boolean, default: true }
})

const emit = defineEmits(['close', 'update:isVisible'])

// 表格数据
const tableData = ref([
  { id: 1, waybillNo: '3203502388…', name: '烟花', origin: '江阴', startTime: '2023-11-22 06:20:46', dest: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { id: 2, waybillNo: '3203502388…', name: '硫酸', origin: '无锡', startTime: '2023-11-20 06:20:46', dest: '泰州', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { id: 3, waybillNo: '3203502388…', name: '硫酸', origin: '江阴', startTime: '2023-11-19 06:20:46', dest: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' }
])

const selectedRowId = ref(1)

const detailFields = computed(() => {
  const selectedRow = tableData.value.find(r => r.id === selectedRowId.value) || tableData.value[0]
  return [
    { label: '起运地', value: '江苏省无锡市江阴市' },
    { label: '危化品名称', value: selectedRow.name },
    { label: '分类名称', value: '危险品(1类4项)' },
    { label: '目的地', value: '江苏省泰州市靖江市' },
    { label: '运输里程', value: '200(KM)' },
    { label: '发车时间', value: selectedRow.startTime },
    { label: '预计到达时间', value: '2023-11-22 12:04:21' },
    { label: '满载情况', value: '满载货物' },
    { label: '总重量', value: '9.8(吨)' },
    { label: '驾驶员姓名', value: '张悦' },
    { label: '驾驶员电话', value: '13955086495' },
    { label: '备注', value: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道' }
  ]
})

const handleRowClick = (id) => {
  selectedRowId.value = id
}

const handleClose = () => {
  emit('close')
  emit('update:isVisible', false)
}
</script>

<style lang="less" scoped>
/* ========== 容器 ========== */
.waybill-container {
  width: 100%;
  height: 100%;
  background: #003032;
  color: #ffffff;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ========== 顶部标题栏 ========== */
.waybill-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  min-height: 34px;
  padding: 0 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(24, 255, 206, 0.3);
  position: relative;
  box-sizing: border-box;
}

.waybill-header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.waybill-header-icon-main {
  width: 17px;
  height: 18px;
  object-fit: contain;
}

.waybill-header-icon-sub1 {
  width: 20px;
  height: 1px;
  object-fit: contain;
}

.waybill-header-icon-sub2 {
  width: 12px;
  height: 2px;
  object-fit: contain;
}

.waybill-header-title {
  font-size: 20px;
  font-weight: 400;
  color: #ffffff;
  line-height: 24px;
}

.waybill-header-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

/* ========== 车牌号标签 ========== */
.waybill-plate-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  height: 24px;
  background-color: #b07b00;
  border: 1px solid #ffffff;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 400;
  color: #ffffff;
  line-height: 24px;
  white-space: nowrap;
}

/* ========== 关闭按钮 ========== */
.waybill-close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}

.waybill-close-icon {
  width: 15px;
  height: 15px;
  object-fit: contain;
}

/* ========== 内容区 ========== */
.waybill-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 10px 10px 10px;
  gap: 12px;
  overflow: hidden;
}

/* ========== 表格区域 ========== */
.waybill-table-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 2px;
}

/* 表头行 */
.waybill-table-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 32px;
  min-height: 32px;
  padding: 0 12px;
  background-color: #00373a;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  box-sizing: border-box;
}

/* 数据行 */
.waybill-table-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 32px;
  min-height: 32px;
  padding: 0 12px;
  background-color: #00464b;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  cursor: pointer;
  transition: background-color 0.2s;
  box-sizing: border-box;
}

.waybill-table-row.is-active {
  background-color: #014347;
  box-shadow: inset 0 0 13.5px rgba(27, 255, 221, 0.85);
}

/* 列宽分配 */
.col-waybill { width: 15%; }
.col-name { width: 10%; }
.col-origin { width: 8%; }
.col-time { width: 18%; }
.col-dest { width: 10%; }
.col-arrive { width: 17%; }
.col-load { width: 10%; }
.col-status { width: 12%; }

/* 单元格通用样式 */
.waybill-cell {
  font-size: 14px;
  line-height: 32px;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  box-sizing: border-box;
}

.waybill-table-header .waybill-cell {
  font-weight: 700;
  color: #ffffff;
}

.waybill-table-row .waybill-cell {
  font-weight: 400;
  color: #ffffff;
}

/* ========== 详情区域 ========== */
.waybill-details-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: #004045;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  padding: 12px 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.waybill-details-title-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.waybill-details-title-icon {
  width: 10px;
  height: 10px;
  background-color: #d9d9d9;
  flex-shrink: 0;
}

.waybill-details-title {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  line-height: 24px;
  white-space: nowrap;
}

.waybill-details-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(24, 255, 206, 0.5) 0%, rgba(24, 255, 206, 0) 100%);
}

.waybill-details-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 20px;
  overflow: hidden;
}

/* 左侧详情网格 */
.waybill-details-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 20px;
  align-content: start;
  overflow: hidden;
}

.waybill-detail-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  line-height: 22px;
  min-height: 22px;
}

.waybill-detail-label {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
  font-size: 14px;
  flex-shrink: 0;
  white-space: nowrap;
}

.waybill-detail-value {
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧监控截图 */
.waybill-details-image {
  width: 237px;
  height: 155px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ffffff;
  overflow: hidden;
}

.waybill-monitor-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
