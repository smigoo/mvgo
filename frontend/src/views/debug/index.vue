<script setup>
import container from './container-config.json'
onMounted(() => {
  const demo = new Function(
    "return (data) => { return {'fileUrl':'http://1.13.18.141/file/voice/1450503ef68643b8bdb1ba2b190e6a87.wav'}}"
  )
  console.log('function ', demo())
  console.log('function ', demo()())
})
</script>

<template>
  <Suspense>
    <DynamicContainer v-bind="container"></DynamicContainer>
  </Suspense>
</template>

<style>
.container {
  padding: 10px;
}
#layout-ditu-1 {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
}
#layout-left-box {
  position: absolute;
  left: 0;
  top: 0;
}
#layout-right-box {
  position: absolute;
  right: 0;
  top: 0;
}
.direction-cell {
  display: flex;
  flex-direction: column;
}
.direction-row {
  display: flex;
}
</style>
