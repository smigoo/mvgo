/**
 * Playground AI 对话 composable
 * 
 * 用法：
 * const { aiMessages, aiInput, aiLoading, memoryEnabled, selectedFiles, showFileSelector,
 *          sendAIMessage, loadChatHistory, clearChatHistory } = useAIChat(componentId, componentFiles, reloadAllFiles, refreshPreview, updateModificationCount)
 */
import { ref, nextTick } from 'vue'
import http from '@/core/http'

const CHAT_STORAGE_PREFIX = 'playground_chat_'

export function useAIChat(componentId, componentFiles, reloadAllFiles, refreshPreview, updateModificationCount) {
  const aiMessages = ref([])
  const aiInput = ref('')
  const aiLoading = ref(false)
  const memoryEnabled = ref(false)
  const aiMessagesRef = ref(null)
  const selectedFiles = ref([])
  const showFileSelector = ref(false)

  function saveChatHistory() {
    try {
      sessionStorage.setItem(
        CHAT_STORAGE_PREFIX + componentId.value,
        JSON.stringify(aiMessages.value.slice(-50))
      )
    } catch {}
  }

  function loadChatHistory() {
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_PREFIX + componentId.value)
      if (raw) aiMessages.value = JSON.parse(raw)
    } catch {}
  }

  function clearChatHistory() {
    aiMessages.value = []
    try {
      sessionStorage.removeItem(CHAT_STORAGE_PREFIX + componentId.value)
    } catch {}
  }

  async function sendAIMessage() {
    if (!aiInput.value.trim()) return

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: aiInput.value
    }
    aiMessages.value.push(userMessage)
    saveChatHistory()

    const userInput = aiInput.value
    aiInput.value = ''
    aiLoading.value = true

    try {
      // 获取选中的文件内容
      const selectedFilesContent = []
      for (const filePath of selectedFiles.value) {
        const file = componentFiles.value.find((f) => f.path === filePath)
        if (file) {
          const content = file.content
          if (!content) {
            try {
              const data = await http.get(`/api/component/${componentId.value}/file`, {
                path: filePath
              })
              if (data.success) {
                selectedFilesContent.push({ path: filePath, name: file.name, content: data.data.content })
              }
            } catch (err) {
              console.error('加载文件失败:', filePath, err)
            }
          } else {
            selectedFilesContent.push({ path: filePath, name: file.name, content: content || '' })
          }
        }
      }

      // 读取全局配置
      const { useConfigStore } = await import('@/stores/config')
      const configStore = useConfigStore()
      const globalConfig = configStore.config || {}
      const llmConfig = {
        apiKey: globalConfig.textApiKey || globalConfig.aiApiKey || undefined,
        baseURL: globalConfig.textBaseURL || globalConfig.aiBaseURL || undefined,
        model: globalConfig.textModel || globalConfig.aiModel || undefined,
      }

      // SSE 流式响应
      const response = await http.stream('/api/demo/ai-chat/stream', {
        message: userInput,
        componentId: componentId.value,
        selectedFiles: selectedFilesContent,
        history: memoryEnabled.value ? aiMessages.value : [],
        llmConfig,
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantContent = ''

      const streamMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: '思考中...'
      }
      aiMessages.value.push(streamMessage)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) continue
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6))
              if (eventData.name && eventData.args) {
                streamMessage.content = assistantContent || `🔧 正在调用 ${eventData.name}...`
              } else if (typeof eventData.content === 'string') {
                assistantContent = eventData.content
              } else if (eventData.type === 'status' && eventData.message) {
                streamMessage.content = eventData.message
              }
            } catch {}
          }
        }
        streamMessage.content = assistantContent || streamMessage.content
      }

      streamMessage.content = assistantContent || '处理完成'
      saveChatHistory()

      await reloadAllFiles()
      refreshPreview()
      await updateModificationCount()

      nextTick(() => {
        if (aiMessagesRef.value) {
          aiMessagesRef.value.scrollTop = aiMessagesRef.value.scrollHeight
        }
      })
    } catch (error) {
      console.error('AI请求失败:', error)
      aiMessages.value.push({
        id: Date.now() + 1,
        role: 'assistant',
        content: `抱歉，请求失败：${error.message}`
      })
    } finally {
      aiLoading.value = false
    }
  }

  return {
    aiMessages, aiInput, aiLoading, memoryEnabled, aiMessagesRef,
    selectedFiles, showFileSelector,
    loadChatHistory, clearChatHistory, sendAIMessage,
  }
}
