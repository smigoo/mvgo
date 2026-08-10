<template>
  <div class="test-less-unclosed">LESS error test</div>
</template>
<script setup>
const msg = 'hello'
</script>
<style lang="less" scoped>
/* === 分区标题（故意不闭合注释）
.box { color: red; }
</style>
