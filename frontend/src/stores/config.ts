import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApiConfig } from '@/types/api'

const CONFIG_KEY = 'mc_generator_config'

export const useConfigStore = defineStore('mc-generator-config', () => {
  const config = ref<ApiConfig>({})
  const isConfigured = ref(false)

  // 加载配置
  function loadConfig() {
    const saved = localStorage.getItem(CONFIG_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // 向后兼容：将旧的 ai* 字段迁移到 text* 字段（若 text* 未设置）
        if (parsed.aiApiKey && !parsed.textApiKey) parsed.textApiKey = parsed.aiApiKey
        if (parsed.aiBaseURL && !parsed.textBaseURL) parsed.textBaseURL = parsed.aiBaseURL
        if (parsed.aiModel && !parsed.textModel) parsed.textModel = parsed.aiModel
        config.value = parsed
        isConfigured.value = !!(config.value.figmaToken || config.value.visionApiKey || config.value.textApiKey || config.value.apifoxToken)
      } catch (e) {
        console.error('[ConfigStore] localStorage 数据损坏，自动清除:', e)
        localStorage.removeItem(CONFIG_KEY)
      }
    }
  }

  // 保存配置
  function saveConfig(newConfig: ApiConfig) {
    try {
      const json = JSON.stringify(newConfig)
      config.value = JSON.parse(json) // 深拷贝，切断 reactive proxy 链
      localStorage.setItem(CONFIG_KEY, json)
      isConfigured.value = !!(newConfig.figmaToken || newConfig.visionApiKey || newConfig.textApiKey || newConfig.apifoxToken)
    } catch (e) {
      console.error('[ConfigStore] 保存配置失败:', e)
    }
  }

  // 清除配置
  function clearConfig() {
    config.value = {}
    localStorage.removeItem(CONFIG_KEY)
    isConfigured.value = false
  }

  // 初始化时加载配置
  loadConfig()

  return {
    config,
    isConfigured,
    loadConfig,
    saveConfig,
    clearConfig
  }
})
