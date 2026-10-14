<template>
  <div class="c-aiot-dpjh-bsjd-group-con" data-section-id="48:5801">
    <!-- 节点卡片列表：6 个同构单元纵向堆叠，内部横向（icon 左 + 文字列右） -->
    <div
      v-for="(node, index) in nodeList"
      :key="index"
      class="c-aiot-dpjh-bsjd-group-2136638414"
    >
      <!-- 左侧图标 -->
      <div class="c-aiot-dpjh-bsjd-icon">
        <img :src="node.icon" class="c-aiot-dpjh-bsjd-icon-img" alt="" />
      </div>

      <!-- 右侧信息列（纵向：名称/地址 在上，在线/离线 数值在下） -->
      <div class="c-aiot-dpjh-bsjd-info">
        <div class="c-aiot-dpjh-bsjd-info-main">
          <span class="c-aiot-dpjh-bsjd-node-name">{{ node.name }}</span>
          <span class="c-aiot-dpjh-bsjd-node-addr">{{ node.address }}</span>
        </div>
        <div class="c-aiot-dpjh-bsjd-info-value">
          <div class="c-aiot-dpjh-bsjd-value-online-stat"><span class="c-aiot-dpjh-bsjd-value-online">{{ node.online }}</span>
          <span class="c-aiot-dpjh-bsjd-value-label">在线</span></div><div class="c-aiot-dpjh-bsjd-value-online-stat"><span class="c-aiot-dpjh-bsjd-value-offline">{{ node.offline }}</span>
          <span class="c-aiot-dpjh-bsjd-value-label">离线</span></div>
        </div>
      </div>
    </div>

    <!-- 底部统计：共 N 个节点 / 接入设备 N -->
    <div class="c-aiot-dpjh-bsjd-summary">
      <span class="c-aiot-dpjh-bsjd-summary-item">共 6 个节点</span>
      <span class="c-aiot-dpjh-bsjd-summary-item">接入设备 10810</span>
    </div>
  </div>
</template>

<script setup>
import icon4 from '../../resources/images/icon-5808.png'
import icon5 from '../../resources/images/icon-5823.png'

import { ref} from 'vue'

// 资源变量由系统注入，禁止手写 import
// bg1 → 状态背景图；icon4 → 江苏联网节点图标
const nodeList = ref([
  {
    name: '江苏联网节点',
    address: '江苏省南京市建邺区江东中路',
    online: '3,792',
    offline: '28',
    icon: icon4
  },
  {
    name: '江苏沿江公司节点',
    address: '江苏省南京市建邺区江东中路',
    online: '2,138',
    offline: '12',
    icon: icon5
  },
  {
    name: '湖南交通厅节点',
    address: '湖南省长沙市芙蓉区五一大道',
    online: '1,665',
    offline: '15',
    icon: icon5
  },
  {
    name: '湖南交建局节点',
    address: '湖南省长沙市芙蓉区五一大道',
    online: '1,415',
    offline: '5',
    icon: icon5
  },
  {
    name: '安徽交控节点',
    address: '安徽省合肥市包河区徽州大道',
    online: '965',
    offline: '15',
    icon: icon5
  },
  {
    name: '平陆运河节点',
    address: '广西壮族自治区南宁市青秀区',
    online: '752',
    offline: '8',
    icon: icon5
  }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>