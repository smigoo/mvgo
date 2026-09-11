<template>
  <div class="c-mc-1785752098305-41f2ffab-section">
    <div class="c-mc-1785752098305-41f2ffab-sub-header">
      <div class="c-mc-1785752098305-41f2ffab-title-group">
        <img :src="icon3" class="c-mc-1785752098305-41f2ffab-title-icon" alt="icon" />
        <span class="c-mc-1785752098305-41f2ffab-title-text">当日总流量</span>
      </div>
      <div class="c-mc-1785752098305-41f2ffab-select-wrapper">
        <div class="c-mc-1785752098305-41f2ffab-select-trigger" @click="showDropdown = !showDropdown">
          <span>{{ selectedTime }}</span>
          <span class="c-mc-1785752098305-41f2ffab-select-arrow" :class="{ up: showDropdown }"></span>
        </div>
        <div class="c-mc-1785752098305-41f2ffab-select-dropdown" v-show="showDropdown">
          <div
            v-for="opt in timeOptions"
            :key="opt"
            class="c-mc-1785752098305-41f2ffab-select-option"
            @click="selectTime(opt)"
          >
            {{ opt }}
          </div>
        </div>
      </div>
    </div>
    <div
      class="c-mc-1785752098305-41f2ffab-stats-row"
      :style="{ backgroundImage: `url(${bgm_2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-mc-1785752098305-41f2ffab-stat-item">
        <span class="c-mc-1785752098305-41f2ffab-stat-label">江阴靖江长江隧道</span>
        <span class="c-mc-1785752098305-41f2ffab-stat-value tunnel">34,620</span>
      </div>
      <div class="c-mc-1785752098305-41f2ffab-stat-item">
        <span class="c-mc-1785752098305-41f2ffab-stat-label">江阴大桥</span>
        <span class="c-mc-1785752098305-41f2ffab-stat-value bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import bgm_2 from '../../resources/images/bg-_m-34.png'
import { ref } from 'vue'

const emit = defineEmits(['timeChange'])

const selectedTime = ref('24小时')
const showDropdown = ref(false)
const timeOptions = ref(['24小时', '12小时', '6小时'])

const selectTime = (val) => {
  selectedTime.value = val
  showDropdown.value = false
  emit('timeChange', val)
}

defineExpose({ selectedTime })
</script>
