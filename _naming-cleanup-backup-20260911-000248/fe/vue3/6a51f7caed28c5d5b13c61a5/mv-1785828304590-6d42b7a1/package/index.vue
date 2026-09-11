<template>
  <div class="mv3-mv-1785828304590-6d42b7a1">
    <!-- 顶部标题栏 -->
    <div class="panel-header">
      <div class="header-left">
        <img :src="icongroup4114" class="header-icon" alt="标题图标" />
        <span class="header-title">运单信息</span>
        <img :src="icon2" class="header-deco-1" alt="装饰线1" />
        <img :src="icon3" class="header-deco-2" alt="装饰线2" />
      </div>
      <div class="header-center">
        <div class="license-plate">苏A 12345</div>
      </div>
      <div class="header-right">
        <img :src="icon5" class="close-icon" alt="关闭" @click="handleClose" />
      </div>
    </div>

    <!-- 内容区 -->
    <div class="panel-content">
      <!-- 运单列表表格 -->
      <div class="table-section">
        <a-table 
          :columns="columns" 
          :data-source="tableData" 
          :pagination="false" 
          :row-class-name="getRowClassName" 
          :custom-row="customRow" 
          class="custom-table" 
          size="small" 
        />
      </div>

      <!-- 运单详情 -->
      <div class="details-section">
        <div class="details-title">
          <!-- [Style Refine] Figma Rectangle 346242330 → 10x10 灰色方块 -->
          <span class="title-block"></span>
          <span class="title-text">运单详情</span>
          <img :src="icon1" class="title-divider" alt="分割线" />
        </div>
        <div class="details-content">
          <!-- 左侧文本列表 -->
          <div class="details-left">
            <div 
              v-for="item in detailList" 
              :key="item.label" 
              class="detail-item" 
              :class="{ 'full-width': item.fullWidth }" 
            >
              <span class="detail-label">{{ item.label }}</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>
          <!-- 右侧车辆监控图片 -->
          <div class="details-right">
            <img :src="img1" class="monitor-img" alt="车辆监控" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../resources/images/矩形-98954.png'
import icon3 from '../resources/images/矩形备份-98955.png'
import icon5 from '../resources/images/Union-98964.png'
import icon1 from '../resources/images/分割线-98952.png'
import img1 from '../resources/images/img-99044.png'
import icongroup4114 from '../resources/images/Group_4114-98956.png'

/**
 * 运单信息弹窗组件
 * 展示危化品运输运单列表及选中运单的详细信息
 * 支持点击表格行切换选中状态，联动更新下方详情数据
 */
import { ref, computed } from 'vue'

// #region 1. Props & Emits
const props = defineProps({ 
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'update:visible']) 
// #endregion

// #region 2. 响应式状态
// 当前选中的运单 key
const selectedRowKey = ref('1')

// 运单列表数据
const tableData = ref([
  { 
    key: '1', 
    waybillNo: '3203502388...', 
    hazName: '烟花', 
    origin: '江阴', 
    startTime: '2023-11-22 06:20:46', 
    dest: '靖江', 
    arriveTime: '--', 
    loadStatus: '满载', 
    transportStatus: '在途', 
    details: { 
      originAddr: '江苏省无锡市江阴市', 
      hazName: '烟花', 
      className: '危险品(1类4项)', 
      destAddr: '江苏省泰州市靖江市', 
      mileage: '200(KM)', 
      startTime: '2023-11-22 06:20:46', 
      arriveTime: '2023-11-22 12:04:21', 
      loadStatus: '满载货物', 
      totalWeight: '9.8(吨)', 
      driverName: '张悦', 
      driverPhone: '13955086495', 
      remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道' 
    }
  },
  {
    key: '2',
    waybillNo: '3203502388...',
    hazName: '硫酸',
    origin: '无锡',
    startTime: '2023-11-20 06:20:46',
    dest: '泰州',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    details: {
      originAddr: '江苏省无锡市',
      hazName: '硫酸',
      className: '危险品(8类)',
      destAddr: '江苏省泰州市',
      mileage: '150(KM)',
      startTime: '2023-11-20 06:20:46',
      arriveTime: '2023-11-20 10:00:00',
      loadStatus: '满载货物',
      totalWeight: '15.0(吨)',
      driverName: '李明',
      driverPhone: '13800138000',
      remark: '京沪高速'
    }
  },
  {
    key: '3',
    waybillNo: '3203502388...',
    hazName: '硫酸',
    origin: '江阴',
    startTime: '2023-11-19 06:20:46',
    dest: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    details: {
      originAddr: '江苏省无锡市江阴市',
      hazName: '硫酸',
      className: '危险品(8类)',
      destAddr: '江苏省泰州市靖江市',
      mileage: '180(KM)',
      startTime: '2023-11-19 06:20:46',
      arriveTime: '2023-11-19 11:30:00',
      loadStatus: '满载货物',
      totalWeight: '12.5(吨)',
      driverName: '王强',
      driverPhone: '13900139000',
      remark: '锡澄高速'
    }
  }
])
// #endregion

// #region 3. 计算属性
// 表格列配置
const columns = [
  { title: '运单编号', dataIndex: 'waybillNo', width: 100 },
  { title: '危化品名称', dataIndex: 'hazName', width: 80 },
  { title: '超运地', dataIndex: 'origin', width: 60 },
  { title: '实际发车时间', dataIndex: 'startTime', width: 140 },
  { title: '目的地', dataIndex: 'dest', width: 60 },
  { title: '预计到达时间', dataIndex: 'arriveTime', width: 140 },
  { title: '满载情况', dataIndex: 'loadStatus', width: 80 },
  { title: '运输状态', dataIndex: 'transportStatus', width: 80 }
]

// 当前选中运单的详情数据
const currentDetails = computed(() => {
  const row = tableData.value.find(item => item.key === selectedRowKey.value)
  return row?.details || {}
})

// 详情列表展示数据
const detailList = computed(() => {
  const d = currentDetails.value
  return [
    { label: '起运地', value: d.originAddr },
    { label: '危险品名称', value: d.hazName },
    { label: '分类名称', value: d.className },
    { label: '目的地', value: d.destAddr },
    { label: '运输里程', value: d.mileage },
    { label: '发车时间', value: d.startTime },
    { label: '预计到达时间', value: d.arriveTime },
    { label: '满载情况', value: d.loadStatus },
    { label: '总重量', value: d.totalWeight },
    { label: '驾驶员姓名', value: d.driverName },
    { label: '驾驶员电话', value: d.driverPhone },
    { label: '备注', value: d.remark, fullWidth: true }
  ]
})
// #endregion

// #region 4. 方法
// 表格行点击事件，切换选中行并联动更新详情
const customRow = (record) => ({
  onClick: () => {
    selectedRowKey.value = record.key
  },
  style: {
    cursor: 'pointer'
  }
})

// 获取行类名，用于高亮选中行
const getRowClassName = (record) => {
  return record.key === selectedRowKey.value ? 'selected-row' : ''
}

// 关闭弹窗
const handleClose = () => {
  emit('close')
  emit('update:visible', false)
}
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* [Style Refine] Figma bg fills → #003032, strokes → 1px solid border */
.mv3-mv-1785828304590-6d42b7a1 {
  width: 100%;
  height: 100%;
  background: #003032;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  color: #fff;
  font-family: 'Source Han Sans CN', sans-serif;
  overflow: hidden;
}

/* [Layout Refine] Figma header height=34 → height: 34px */
.panel-header {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  /* [Style Refine] Figma 矩形备份 24 fills → #0ecdbe */
  background: #0ecdbe;
  position: relative;
  flex-shrink: 0;
  /* [Style Refine] Figma INNER_SHADOW → box-shadow inset */
  box-shadow: inset 0 0 20px rgba(4, 254, 197, 0.2);

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;

    .header-icon {
      width: 17px;
      height: 18px;
      object-fit: contain;
    }

    /* [Style Refine] Figma typography → PangMenZhengDao, 20px, 400, 24px */
    .header-title {
      font-size: 20px;
      font-weight: 400;
      color: #fff;
      font-family: 'PangMenZhengDao', sans-serif;
      line-height: 24px;
    }

    .header-deco-1 {
      width: 20px;
      height: 1px;
      object-fit: contain;
    }

    .header-deco-2 {
      width: 12px;
      height: 2px;
      object-fit: contain;
    }
  }

  .header-center {
    /* [Style Refine] Figma Frame 2136639137 fills → #b07b00, stroke → 1px #fff, radius → 4px */
    .license-plate {
      background: #b07b00;
      border: 1px solid #fff;
      border-radius: 4px;
      padding: 0 6px;
      /* [Style Refine] Figma typography → Roboto, 14px, 400, 24px */
      font-size: 14px;
      color: #fff;
      line-height: 24px;
      font-weight: 400;
      font-family: 'Roboto', sans-serif;
    }
  }

  .header-right {
    .close-icon {
      width: 15px;
      height: 15px;
      object-fit: contain;
      cursor: pointer;
      transition: opacity 0.2s;

      &:hover {
        opacity: 0.7;
      }
    }
  }
}

/* [Layout Refine] Figma slot-con padding → 18px 24px 30px 10px */
.panel-content {
  flex: 1;
  min-height: 0;
  padding: 18px 24px 30px 10px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* [Layout Refine] Figma @antd/table height=140 → height: 140px */
.table-section {
  height: 140px;
  flex-shrink: 0;

  .custom-table {
    :deep(.ant-table) {
      background: transparent;
      color: #fff;
    }

    /* [Style Refine] Figma bg fills → #00373a */
    :deep(.ant-table-thead > tr > th) {
      background: #00373a !important;
      color: #fff;
      border-bottom: none;
      /* [Style Refine] Figma typography → 14px, 700, 21px */
      font-weight: 700;
      font-size: 14px;
      line-height: 21px;
      padding: 5px 8px;
    }

    /* [Style Refine] Figma row height=32 → height: 32px */
    :deep(.ant-table-tbody > tr > td) {
      /* [Style Refine] Figma Rectangle 346241254 fills → #00464a */
      background: #00464a !important;
      color: #fff;
      border-bottom: none;
      font-size: 14px;
      font-weight: 400;
      line-height: 21px;
      padding: 5px 8px;
      height: 32px;
    }

    /* [Style Refine] Figma Rectangle 346241252 fills → #014347, INNER_SHADOW → inset 0 0 13.5px rgba(27, 255, 221, 0.85) */
    :deep(.ant-table-tbody > tr.selected-row > td) {
      background: #014347 !important;
      box-shadow: inset 0 0 13.5px rgba(27, 255, 221, 0.85);
    }
  }
}

/* [Layout Refine] Figma details section flex=1 */
.details-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  .details-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    flex-shrink: 0;

    /* [Style Refine] Figma Rectangle 346242330 → 10x10 #d9d9d9 */
    .title-block {
      width: 10px;
      height: 10px;
      background: #d9d9d9;
      flex-shrink: 0;
    }

    /* [Style Refine] Figma typography → 16px, 700, 24px */
    .title-text {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      line-height: 24px;
      flex-shrink: 0;
    }

    .title-divider {
      flex: 1;
      height: 4px;
      object-fit: contain;
      min-width: 0;
    }
  }

  .details-content {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 20px;

    /* [Layout Refine] Figma left grid gap → 8px 20px */
    .details-left {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 20px;
      align-content: start;

      .detail-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 14px;
        line-height: 21px;

        &.full-width {
          grid-column: 1 / -1;
        }

        /* [Style Refine] Figma label fills → #fff, weight 400 */
        .detail-label {
          color: #fff;
          font-weight: 400;
          flex-shrink: 0;
        }

        /* [Style Refine] Figma value fills → #fff, weight 700 */
        .detail-value {
          color: #fff;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }

    /* [Layout Refine] Figma img bbox → 237x155, stroke → 1px #fff */
    .details-right {
      width: 237px;
      flex-shrink: 0;

      .monitor-img {
        width: 100%;
        height: 155px;
        object-fit: cover;
        border: 1px solid #fff;
      }
    }
  }
}
</style>