<template>
  <div class="mv3-1785754644510-ef8ff304-container">
    <!-- 顶部标题栏 -->
    <div class="mv3-1785754644510-ef8ff304-header">
      <div class="mv3-1785754644510-ef8ff304-header-left">
        <!-- 标题左侧装饰图标 -->
        <img :src="icongroup4114" class="mv3-1785754644510-ef8ff304-header-icon-main" alt="icon" />
        <img :src="icon1" class="mv3-1785754644510-ef8ff304-header-icon-sub1" alt="icon" />
        <img :src="icon2" class="mv3-1785754644510-ef8ff304-header-icon-sub2" alt="icon" />
        <span class="mv3-1785754644510-ef8ff304-header-title">运单信息</span>
      </div>
      <div class="mv3-1785754644510-ef8ff304-header-right">
        <!-- 车牌号标签 -->
        <span class="mv3-1785754644510-ef8ff304-plate-badge">苏A 12345</span>
        <!-- 关闭按钮（语义化 button） -->
        <button class="mv3-1785754644510-ef8ff304-close-btn" @click="handleClose" aria-label="关闭弹窗">
          <img :src="icon4" class="mv3-1785754644510-ef8ff304-close-icon" alt="关闭" />
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="mv3-1785754644510-ef8ff304-content">
      <!-- 运单列表表格 -->
      <div class="mv3-1785754644510-ef8ff304-table-section">
        <!-- 表头 -->
        <div class="mv3-1785754644510-ef8ff304-table-header" :style="{ backgroundImage: `url(${bg1})` }">
          <div class="mv3-1785754644510-ef8ff304-table-cell col-waybill">运单编号</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-name">危化品名称</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-origin">超运地</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-time">实际发车时间</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-dest">目的地</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-arrive">预计到达时间</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-load">满载情况</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-status">运输状态</div>
        </div>
        <!-- 数据行 -->
        <div
          v-for="row in tableData"
          :key="row.id"
          class="mv3-1785754644510-ef8ff304-table-row"
          :class="{ 'is-active': row.id === selectedRowId }"
          :style="{ backgroundImage: `url(${row.id === selectedRowId ? bg3 : bg2})` }"
          @click="handleRowClick(row.id)"
        >
          <div class="mv3-1785754644510-ef8ff304-table-cell col-waybill">{{ row.waybillNo }}</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-name">{{ row.name }}</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-origin">{{ row.origin }}</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-time">{{ row.startTime }}</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-dest">{{ row.dest }}</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-arrive">{{ row.arriveTime }}</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-load">{{ row.loadStatus }}</div>
          <div class="mv3-1785754644510-ef8ff304-table-cell col-status">{{ row.transportStatus }}</div>
        </div>
      </div>

      <!-- 运单详情区 -->
      <div class="mv3-1785754644510-ef8ff304-details-section" :style="{ backgroundImage: `url(${bg4})` }">
        <div class="mv3-1785754644510-ef8ff304-details-title-bar">
          <!-- [Layout Refine] 补充 Figma 中缺失的标题左侧小方块 -->
          <div class="mv3-1785754644510-ef8ff304-details-title-icon"></div>
          <span class="mv3-1785754644510-ef8ff304-details-title">运单详情</span>
          <div class="mv3-1785754644510-ef8ff304-details-line"></div>
        </div>
        <div class="mv3-1785754644510-ef8ff304-details-body">
          <!-- 左侧文本区 -->
          <div class="mv3-1785754644510-ef8ff304-details-grid">
            <div v-for="item in detailFields" :key="item.label" class="mv3-1785754644510-ef8ff304-detail-item">
              <span class="mv3-1785754644510-ef8ff304-detail-label">{{ item.label }}</span>
              <span class="mv3-1785754644510-ef8ff304-detail-value">{{ item.value }}</span>
            </div>
          </div>
          <!-- 右侧监控截图 -->
          <div class="mv3-1785754644510-ef8ff304-details-image">
            <img :src="img1" class="mv3-1785754644510-ef8ff304-monitor-img" alt="监控截图" />
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

// 运单信息弹窗组件
// 数据来源：Figma 设计稿静态数据与交互配置
// 关键交互：表格行选中联动详情区更新、右上角关闭按钮

import { ref, computed} from 'vue'

// #region 1. Props定义
const props = defineProps({
  isVisible: { type: Boolean, default: true }
})

// #endregion

// #region 2. Emits定义
const emit = defineEmits(['close', 'update:isVisible'])

// #endregion

// #region 3. 响应式状态
// 表格数据（使用 ref 以支持 API 绑定）
const tableData = ref([
  { id: 1, waybillNo: '3203502388…', name: '烟花', origin: '江阴', startTime: '2023-11-22 06:20:46', dest: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { id: 2, waybillNo: '3203502388…', name: '硫酸', origin: '无锡', startTime: '2023-11-20 06:20:46', dest: '泰州', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' },
  { id: 3, waybillNo: '3203502388…', name: '硫酸', origin: '江阴', startTime: '2023-11-19 06:20:46', dest: '靖江', arriveTime: '--', loadStatus: '满载', transportStatus: '在途' }
])

// 当前选中的行 ID（默认选中第一行）
const selectedRowId = ref(1)

// 详情区字段数据（根据选中行计算，此处以第一行数据为例）
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
// #endregion

// #region 5. 方法
// 处理表格行点击选中
const handleRowClick = (id) => {
  selectedRowId.value = id
}

// 处理关闭按钮点击
const handleClose = () => {
  emit('close')
  emit('update:isVisible', false)
}
// #endregion
</script>

<style lang="less" scoped>
@import './resources/styles/index.less';

/* [Style Refine] fills[0].color → #003032 (深青色纯色背景) */
.mv3-1785754644510-ef8ff304-container {
  width: 100%;
  height: 100%;
  background: #003032;
  color: #ffffff;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

/* [Layout Refine] Figma bbox height=34 → height: 34px */
/* [Style Refine] 底部描边 → border-bottom: 1px solid rgba(24, 255, 206, 0.3) */
.mv3-1785754644510-ef8ff304-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(24, 255, 206, 0.3);
  position: relative;

  &-left {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  &-icon-main {
    width: 17px;
    height: 18px;
    object-fit: contain;
  }

  &-icon-sub1 {
    width: 20px;
    height: 1px;
    object-fit: contain;
  }

  &-icon-sub2 {
    width: 12px;
    height: 2px;
    object-fit: contain;
  }

  /* [Style Refine] typography → PangMenZhengDao, 20px, 400, line-height 24px */
  &-title {
    font-family: 'PangMenZhengDao', sans-serif;
    font-size: 20px;
    font-weight: 400;
    color: #ffffff;
    line-height: 24px;
  }

  &-right {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
}

/* [Style Refine] fills → #b07b00, strokes → 1px solid #fff, cornerRadius → 4px */
.mv3-1785754644510-ef8ff304-plate-badge {
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
}

.mv3-1785754644510-ef8ff304-close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  
  &:focus-visible {
    outline: 2px solid #18ffce;
    border-radius: 2px;
  }
}

.mv3-1785754644510-ef8ff304-close-icon {
  width: 15px;
  height: 15px;
  object-fit: contain;
}

/* [Layout Refine] 根据 Figma bbox 计算 padding: 18px 10px 30px 10px */
.mv3-1785754644510-ef8ff304-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 10px 30px 10px;
  gap: 20px;
}

/* [Layout Refine] Figma layoutMode=VERTICAL, gap=4px */
.mv3-1785754644510-ef8ff304-table-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 4px;
}

/* [Style Refine] 背景图精确还原 → background-size: 100% 100% */
.mv3-1785754644510-ef8ff304-table-header,
.mv3-1785754644510-ef8ff304-table-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  background-size: 100% 100%
}

/* [Style Refine] fills[0].color → #00373a */
.mv3-1785754644510-ef8ff304-table-header {
  background-color: #00373a;
  font-weight: 700;
  color: #ffffff;
}

/* [Style Refine] fills[0].color → #00464b */
.mv3-1785754644510-ef8ff304-table-row {
  background-color: #00464b;
  font-weight: 400;
  color: #ffffff;
  cursor: pointer;
  transition: background-color 0.2s;

  /* [Style Refine] fills[0].color → #014347, effects → inset 0 0 13.5px rgba(27, 255, 221, 0.85) */
  &.is-active {
    background-color: #014347;
    box-shadow: inset 0 0 13.5px rgba(27, 255, 221, 0.85);
  }
}

// 表格列宽分配
.col-waybill { width: 15%; }
.col-name { width: 10%; }
.col-origin { width: 10%; }
.col-time { width: 20%; }
.col-dest { width: 10%; }
.col-arrive { width: 15%; }
.col-load { width: 10%; }
.col-status { width: 10%; }

.mv3-1785754644510-ef8ff304-table-cell {
  font-size: 14px;
  line-height: 21px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* [Style Refine] 移除无 Figma 依据的 border 和 border-radius */
/* [Style Refine] 背景图精确还原 → background-size: 100% 100% */
.mv3-1785754644510-ef8ff304-details-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-size: 100% 100%
  padding: 16px;
  box-sizing: border-box;
}

.mv3-1785754644510-ef8ff304-details-title-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

/* [Layout Refine] 补充 Figma 中缺失的标题左侧小方块 Rectangle 346242330 */
/* [Style Refine] fills[0].color → #d9d9d9 */
.mv3-1785754644510-ef8ff304-details-title-icon {
  width: 10px;
  height: 10px;
  background-color: #d9d9d9;
  flex-shrink: 0;
}

/* [Style Refine] typography → 16px, 700, line-height 24px */
.mv3-1785754644510-ef8ff304-details-title {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  line-height: 24px;
}

.mv3-1785754644510-ef8ff304-details-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(24, 255, 206, 0.5) 0%, rgba(24, 255, 206, 0) 100%);
}

.mv3-1785754644510-ef8ff304-details-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 24px;
}

// 左侧文本网格（两列）
/* [Layout Refine] Figma itemSpacing=5, 行间距 8px */
.mv3-1785754644510-ef8ff304-details-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 24px;
  align-content: start;
}

.mv3-1785754644510-ef8ff304-detail-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  line-height: 21px;
}

/* [Style Refine] fills[0].color → #ffffff (修正原代码中的 0.7 透明度) */
/* [Style Refine] typography → 14px, 400 */
.mv3-1785754644510-ef8ff304-detail-label {
  color: #ffffff;
  font-weight: 400;
  flex-shrink: 0;
  min-width: 70px;
  text-align: right;
}

/* [Style Refine] typography → 14px, 700 */
.mv3-1785754644510-ef8ff304-detail-value {
  color: #ffffff;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 右侧监控截图
/* [Style Refine] Figma bbox → width: 237px, height: 155px */
/* [Style Refine] strokes → 1px solid #ffffff */
.mv3-1785754644510-ef8ff304-details-image {
  width: 237px;
  height: 155px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ffffff;
}

.mv3-1785754644510-ef8ff304-monitor-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>