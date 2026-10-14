<template>
  <div class="c-aiot-dpjh-bsjd-content" style="display:flex;flex-direction:column;">
    <div
      v-for="(item, index) in nodeList"
      :key="index"
      class="c-aiot-dpjh-bsjd-group-2136638414"
    >
      <img :src="item.icon" class="c-aiot-dpjh-bsjd-icon" alt="节点图标" />
      <div class="c-aiot-dpjh-bsjd-info">
        <div class="c-aiot-dpjh-bsjd-node-name">{{ item.name }}</div>
        <div class="c-aiot-dpjh-bsjd-node-addr">{{ item.address }}</div>
      </div>
      <div class="c-aiot-dpjh-bsjd-node-stat">
        <span class="c-aiot-dpjh-bsjd-node-online">{{ item.online }}</span>
        <span class="c-aiot-dpjh-bsjd-node-online-label">在线</span>
      </div>
      <div class="c-aiot-dpjh-bsjd-node-stat-offline">
        <span class="c-aiot-dpjh-bsjd-node-offline-dot"></span>
        <span class="c-aiot-dpjh-bsjd-node-offline-value">{{ item.offline }}</span>
        <span class="c-aiot-dpjh-bsjd-node-offline-label">离线</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon4 from '../../resources/images/icon-5808.png'
import icon5 from '../../resources/images/icon-5823.png'


import { ref} from 'vue'

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