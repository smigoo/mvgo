# 微码组件事件交互规范（重要）

## 🔴 核心原则

**组件间交互必须通过微码平台的事件路由机制，禁止在代码层直接控制其他组件的显示/隐藏。**

---

## ❌ 错误示例（禁止使用）

### 1. 主组件直接控制弹窗显示

```vue
<!-- ❌ 错误：主组件直接用 v-if 控制弹窗组件 -->
<template>
  <base-panel>
    <VehicleType @click="handleVehicleTrendModalShow" />
    
    <!-- 禁止：直接在主组件中控制弹窗显示 -->
    <CTunnelModelDistributionyTrendsModal
      v-if="vehicleTrendModalVisible"
      :section-num="vehicleTrendModalData.sectionNum"
      :section-name="vehicleTrendModalData.sectionName"
      @close="handleVehicleTrendModalClose"
    />
  </base-panel>
</template>

<script setup>
const vehicleTrendModalVisible = ref(false)
const vehicleTrendModalData = ref({ sectionNum: '', sectionName: '' })

// ❌ 错误：直接在主组件中控制弹窗显示
function handleVehicleTrendModalShow(payload) {
  vehicleTrendModalData.value = {
    sectionNum: payload?.sectionNum || '',
    sectionName: payload?.sectionName || ''
  }
  vehicleTrendModalVisible.value = true  // ❌ 直接控制显示
}

function handleVehicleTrendModalClose() {
  vehicleTrendModalVisible.value = false  // ❌ 直接控制关闭
}
</script>
```

### 2. 子组件直接导入并使用弹窗组件

```vue
<!-- ❌ 错误：子组件直接导入弹窗组件 -->
<template>
  <div @click="handleClick">点击</div>
  <ModalComponent v-if="visible" />
</template>

<script setup>
const visible = ref(false)
const handleClick = () => {
  visible.value = true  // ❌ 直接控制显示
}
</script>
```

---

## ✅ 正确示例（微码标准方式）

### 1. 触发方组件（VehicleType.vue）

```vue
<!-- ✅ 正确：只发布事件，不控制目标组件 -->
<script setup>
const { runtimeBuilder } = $mcComponentBuilder()

const handleCardClick = (sectionNum, sectionName) => {
  // ✅ 只发布事件，由微码平台路由到目标组件
  runtimeBuilder.publishEvent('vehicle-card-click', {
    sectionNum,
    sectionName
  })
}
</script>
```

### 2. 目标组件（c-tunnel-model-distributiony-trends-modal/index.vue）

```vue
<!-- ✅ 正确：只监听事件，不依赖外部控制 -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const { runtimeBuilder } = $mcComponentBuilder()

const currentSectionNum = ref('S23-JY')
const currentSectionName = ref('江阴靖江长江隧道')
const refreshKey = ref(0)

// ✅ 监听 show-modal 事件
runtimeBuilder.listenEvent('show-modal', (data) => {
  console.log('[弹窗] 收到 show-modal 事件')
  
  // 从 eventSource 获取原始数据
  const originalPayload = data?.eventSource?.payload?.payload || 
                          data?.payload?.payload || 
                          data?.payload || data
  
  if (originalPayload?.sectionNum) {
    currentSectionNum.value = originalPayload.sectionNum
  }
  if (originalPayload?.sectionName) {
    currentSectionName.value = originalPayload.sectionName
  }
  
  // 刷新数据
  refreshKey.value++
})

// ✅ 发布关闭事件
const handleClose = () => {
  runtimeBuilder.publishEvent('modal-close', {
    sectionNum: currentSectionNum.value
  })
}

// 暴露 close 方法给框架调用
defineExpose({
  close: handleClose
})

onUnmounted(() => {
  runtimeBuilder.removeListener('show-modal')
})
</script>
```

### 3. declare.json 配置

**触发方组件** (`c-tunnel-traffic-monitoring/declare.json`):
```json
{
  "businessEvents": {
    "vehicle-card-click": {
      "eventId": "vehicle-card-click",
      "eventName": "点击车型卡片",
      "eventDataSchema": {
        "sectionNum": { "key": "sectionNum", "name": "路段编码", "type": "string" },
        "sectionName": { "key": "sectionName", "name": "路段名称", "type": "string" }
      }
    }
  }
}
```

**目标组件** (`c-tunnel-model-distributiony-trends-modal/declare.json`):
```json
{
  "businessStatuses": {
    "show-modal": {
      "statusId": "show-modal",
      "statusName": "显示弹窗",
      "parameters": {
        "sectionNum": { "key": "sectionNum", "name": "路段编码", "type": "string" },
        "sectionName": { "key": "sectionName", "name": "路段名称", "type": "string" }
      }
    }
  },
  "businessEvents": {
    "modal-close": {
      "eventId": "modal-close",
      "eventName": "关闭弹窗",
      "eventDataSchema": {
        "sectionNum": { "key": "sectionNum", "name": "路段编码", "type": "string" }
      }
    }
  }
}
```

---

## 🔧 微码平台配置

在微码平台后台配置事件路由：

| 配置项 | 值 |
|--------|---|
| 源事件 ID | `vehicle-card-click` |
| 源组件 ID | `c-tunnel-traffic-monitoring` |
| 目标组件 ID | `c-tunnel-model-distributiony-trends-modal` |
| 目标状态 ID | `show-modal` |

---

## 📋 架构对比

| 方案 | 耦合度 | 可维护性 | 微码规范 | 推荐度 |
|------|--------|----------|---------|--------|
| 直接控制（v-if） | 高 | 低 | ❌ 不符合 | ❌ 禁止 |
| 事件路由 | 低 | 高 | ✅ 符合 | ✅ 推荐 |

---

## 🎯 为什么必须使用事件路由？

### 1. **组件解耦**
- 触发方不需要知道目标组件的存在
- 目标组件不需要知道触发方是谁
- 双方通过事件 ID 和状态 ID 通信

### 2. **平台统一管理**
- 事件路由配置在微码平台后台
- 可以随时修改路由关系，无需改代码
- 支持一对多、多对一等复杂路由

### 3. **生命周期管理**
- 微码框架自动管理组件实例
- 事件路由在正确的时机触发
- 避免内存泄漏和状态混乱

### 4. **可调试性**
- 事件流在平台中可追踪
- 可以查看事件的发布和接收日志
- 便于排查问题

---

## ⚠️ 常见错误

### 错误 1：在主组件中直接控制弹窗
```javascript
// ❌ 错误
const showModal = ref(false)
const openModal = () => { showModal.value = true }
```

### 错误 2：子组件导入并使用弹窗组件
```javascript
// ❌ 错误
import ModalComponent from './ModalComponent.vue'
const visible = ref(false)
```

### 错误 3：使用 provide/inject 传递控制方法
```javascript
// ❌ 错误
provide('openModal', () => { visible.value = true })
```

### 错误 4：通过 DOM 操作显示/隐藏
```javascript
// ❌ 错误
document.querySelector('.modal').style.display = 'block'
```

---

## ✅ 正确做法总结

1. **触发方**：只调用 `runtimeBuilder.publishEvent(eventId, payload)`
2. **目标方**：只调用 `runtimeBuilder.listenEvent(statusId, callback)`
3. **配置**：在 `declare.json` 中声明 `businessEvents` 和 `businessStatuses`
4. **路由**：在微码平台后台配置事件 → 状态路由

---

## 📚 相关文档

- `../patterns/code-patterns.md` - 代码模式
- `../specs/declare-json.md` - declare.json 配置

---

**最后更新**: 2026-06-01  
**适用范围**: 所有微码组件开发场景
