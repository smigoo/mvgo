<template>
  <div class="info-title">
    <a-form
      ref="formRef"
      :model="queryForm"
      layout="inline"
      @finish="handleSubmit"
      class="query-form"
    >
      <!-- 服务名称 → 下拉框 -->
      <a-form-item label="服务名称">
        <!-- mc-framework -->
        <a-select v-model:value="queryForm.service" placeholder="请选择服务" style="width: 120px">
          <a-select-option value="mc-framework">mc-framework</a-select-option>
          <a-select-option value="mc-component-warehouse">mc-component-warehouse</a-select-option>
        </a-select>
      </a-form-item>

      <!-- 操作 → 下拉框 -->
      <!-- <a-form-item label="操作(operation)">
      <a-select v-model:value="queryForm.operation" placeholder="" style="width: 120px">
        <a-select-option :value="null">全部</a-select-option>
      </a-select>
    </a-form-item> -->

      <!-- 标签 → 下拉框 -->
      <a-form-item label="标签(Tags)">
        <a-select
          v-model:value="tagsValue"
          placeholder="请选择标签"
          style="width: 160px"
          @change="tagChange"
        >
          <a-select-option :value="null">全部</a-select-option>
          <a-select-option :value="0">错误(error=true)</a-select-option>
          <!-- <a-select-option :value="1">成功(http.status_code=200)</a-select-option> -->
        </a-select>
      </a-form-item>

      <!-- 回溯时间 -->
      <a-form-item label="回溯时间">
        <a-range-picker
          v-model:value="lookback"
          show-time
          style="width: 200px"
          format="YYYY-MM-DD HH:mm:ss"
          valueFormat="YYYY-MM-DD HH:mm:ss"
        />
      </a-form-item>

      <!-- 最小时长 -->
      <a-form-item label="最小时长">
        <a-input
          v-model:value="queryForm.minDuration"
          placeholder="1.2s,1000ms,500us"
          style="width: 120px"
        />
      </a-form-item>

      <!-- 最大时长 -->
      <a-form-item label="最大时长">
        <a-input
          v-model:value="queryForm.maxDuration"
          placeholder="1.2s,1000ms,500us"
          style="width: 120px"
        />
      </a-form-item>

      <!-- 每页条数 -->
      <a-form-item label="每页条数">
        <a-input-number v-model:value="queryForm.limit" :min="1" style="width: 120px" />
      </a-form-item>

      <a-form-item label="排序(sort)">
        <a-select v-model:value="sortValue" style="width: 160px">
          <a-select-option :value="1">请求时间</a-select-option>
          <a-select-option :value="2">实际耗时</a-select-option>
        </a-select>
      </a-form-item>

      <!-- 按钮 -->
      <a-form-item>
        <a-button type="primary" html-type="submit">查询</a-button>
        <a-button style="margin-left: 8px" @click="handleReset">重置</a-button>
      </a-form-item>
    </a-form>
  </div>
  <traceList :rawData="rawData" :sortValue="sortValue"></traceList>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import dayjs from 'dayjs'
import traceList from './components/trace-list/index.vue'
import api from '@/api/index'
const formRef = ref()
const lookback = ref([])
const queryForm = reactive({
  end: null,
  limit: 20,
  lookback: 'custom',
  operation: null,
  maxDuration: '',
  minDuration: '',
  service: 'mc-framework', // 默认选中
  start: null,
  tags: 0 // 默认选中
})
// ====================== 你的真实数据 ======================
const rawData = ref()

const sortValue = ref(1)

const tagsValue = ref()
const TagsList = [{ error: 'true' }]

const tagChange = () => {
  if (null == tagsValue.value) {
    queryForm.tags = null
  } else {
    queryForm.tags = JSON.stringify(TagsList[tagsValue.value])
  }
}
// 提交
const handleSubmit = () => {
  queryForm.start = dayjs(lookback.value[0]).valueOf() + '000'
  queryForm.end = dayjs(lookback.value[1]).valueOf() + '000'
  console.log('提交参数：', JSON.stringify(queryForm, null, 2))

  api
    .getTraceData(queryForm)
    .then((res) => {
      if (res.data && res.data.data && res.data.data.length) {
        rawData.value = res.data.data
      } else {
        rawData.value = []
      }
    })
    .catch(() => {
      rawData.value = []
    })
}

// 重置
const handleReset = () => {
  const now = dayjs().valueOf()
  const day = dayjs().subtract(12, 'hour').valueOf()
  lookback.value = [
    dayjs(day).format('YYYY-MM-DD HH:mm:ss'),
    dayjs(now).format('YYYY-MM-DD HH:mm:ss')
  ]
  sortValue.value = 1
  tagsValue.value = 0
  Object.assign(queryForm, {
    end: now,
    limit: 20,
    lookback: 'custom',
    maxDuration: '',
    minDuration: '',
    operation: null,
    service: 'mc-framework',
    start: day,
    tags: JSON.stringify(TagsList[0])
  })
  handleSubmit()
}
onMounted(() => {
  handleReset()
})
</script>

<style scoped>
.info-title {
  padding: 5px 16px;
  background: var(--bg-hover);
  border-radius: var(--radius-xs);
  height: 5rem;
}
.query-form {
  align-items: center;
  padding: 0 16px;
  background: var(--bg-card);
  height: 100%;
  border-radius: var(--radius-xs);
  box-shadow: 0 2px 0.5rem var(--shadow-sm);
}
</style>
