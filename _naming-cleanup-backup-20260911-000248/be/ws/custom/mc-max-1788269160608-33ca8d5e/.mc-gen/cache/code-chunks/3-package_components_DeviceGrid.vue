<script setup>
import { ref } from 'vue'
import icon1 from '../../resources/images/icon-8798.png'
import icon2 from '../../resources/images/icon-8817.png'
import icon3 from '../../resources/images/icon-8444.png'
import icon4 from '../../resources/images/icon-8473.png'
import icon5 from '../../resources/images/icon-8503.png'
import icon6 from '../../resources/images/icon-8532.png'
import icon7 from '../../resources/images/icon-8561.png'
import icon8 from '../../resources/images/icon-8590.png'
import icon9 from '../../resources/images/icon-8619.png'
import icon10 from '../../resources/images/icon-8648.png'
import icon11 from '../../resources/images/icon-8677.png'
import icon12 from '../../resources/images/icon-8706.png'
import icon13 from '../../resources/images/icon-8735.png'
import icon14 from '../../resources/images/icon-8764.png'

const devices = ref([
  { name: '摄像机', online: '2', total: '484', icon: icon1 },
  { name: '风速风向仪', online: '1', total: '484', icon: icon2 },
  { name: '超高检测器', online: '0', total: '484', icon: icon3 },
  { name: '烟雾机器人', online: '0', total: '484', icon: icon4 },
  { name: '激光雷达', online: '0', total: '484', icon: icon5 },
  { name: 'CO传感器', online: '0', total: '484', icon: icon6 },
  { name: 'CO/VI检测器', online: '0', total: '484', icon: icon7 },
  { name: '温湿度传感器', online: '0', total: '484', icon: icon8 },
  { name: '压力传感器', online: '0', total: '484', icon: icon9 },
  { name: '光照度变送器', online: '0', total: '484', icon: icon10 },
  { name: '紧急电话', online: '0', total: '484', icon: icon11 },
  { name: '水质监测设备', online: '0', total: '484', icon: icon12 }
])
</script>
