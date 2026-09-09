<template>
  <div class="share-verify-page">
    <div class="verify-card">
      <!-- 百度网盘Logo -->
      <div class="logo-wrapper">
        <img src="/public/favicon.png" alt="感动科技" class="pan-logo" />
      </div>

      <!-- 标题 -->
      <h2 class="title">{{ shareConfig.title }}</h2>

      <!-- 4位提取码输入框 -->
      <div class="input-wrapper">
        <a-form>
          <input type="text" autocomplete="username" style="display: none" hidden />
          <a-input
            type="password"
            v-model:value="code"
            :placeholder="shareConfig.placeHolder"
            :max-length="shareConfig.inputLength"
            class="code-input"
            autocomplete="current-password"
            @keyup.enter="handleSubmit"
          />
        </a-form>
      </div>

      <!-- 提取文件按钮 -->
      <a-button type="primary" class="submit-btn" @click="handleSubmit">
        {{ shareConfig.btnText }}
      </a-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import api from '@/api'
const SHARE_CONMIT = 'TXpFeU5UazQ='
const router = useRouter()
const code = ref('')
const shareConfig = ref(window.SHARE_CONFIG)
// 2. 最终提交校验（可选，更严谨）
const validateCode = (val) => {
  // 正则：必须全部是 数字/英文
  const reg = /^[0-9a-zA-Z@￥$%&*]+$/
  return reg.test(val)
}
// 提交验证
const handleSubmit = () => {
  // 没填写内容时 处理提示未输入
  if (code.value.length === 0) {
    $message.warning(shareConfig.value.placeHolder)
    return
  }
  if (!validateCode(code.value)) {
    $message.warning('只能输入英文和数字，不允许中文！')
    return
  }
  // 填写内容超出后 提示超出并提示最多可填写的长度
  if (code.value.length > shareConfig.value.inputLength) {
    $message.warning('最大可输入长度' + shareConfig.value.inputLength)
    return
  }

  api.submitTrace({ password: btoa(btoa(code.value)) }).then((res) => {
    if (res.data) {
      // 成功后跳转
      // 为避免用户绕过登录直接访问链路追踪页面
      // 验证成功后才去注册访问路由
      registerRouter()
    } else {
      // 失败后继续保持原有位置 并提示用户错误
      $message.error('错误！请重试！')
    }
  })
}

const registerRouter = () => {
  // 首先注册可以访问的路由
  router.addRoute({
    path: '/jaeger', // 完整子路由路径
    name: 'jaeger',
    component: () => import('@/views/jaeger/index.vue'),
    meta: { title: '链路追踪' }
  })
  // 注册结束 直接跳转
  router.push('/jaeger')
}
</script>

<style scoped>
/* 页面整体居中 */
.share-verify-page {
  width: 100vw;
  min-height: 100vh;
  background-color: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* 卡片 */
.verify-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 2px 20px var(--shadow-sm);
  padding: 45px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

/* Logo */
.logo-wrapper {
  margin-bottom: 24px;
}
.pan-logo {
  width: 50px;
  height: auto;
}

/* 标题 */
.title {
  font-size: 22px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 30px;
}

/* 输入框 */
.input-wrapper {
  width: 100%;
  margin-bottom: 24px;
}
.code-input {
  font-size: 16px;
  letter-spacing: 0px;
  text-align: center;
}
.code-input :deep(.ant-input) {
  height: 46px;
  font-size: 18px;
  border-radius: var(--radius-sm);
}

/* 按钮 */
.submit-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  border-radius: var(--radius-sm);
  background: var(--brand-light);
  border: none;
}
.submit-btn:disabled {
  background: #bddaf7 !important;
  cursor: not-allowed;
}

/* 底部链接 */
.footer-links {
  margin-top: 30px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.footer-links a {
  color: var(--text-tertiary);
  text-decoration: none;
  margin: 0 8px;
}
.footer-links a:hover {
  color: var(--brand-light);
}
</style>
