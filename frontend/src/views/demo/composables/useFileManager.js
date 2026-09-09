/**
 * Playground 文件��理 composable
 * 
 * 用法：
 * const { componentFiles, openedFiles, activeFile, activeCanvasTab,
 *          fileContentCache, loadComponentFiles, openFile, closeFile, saveFile, revertFile,
 *          onCodeChange, reloadAllFiles, getFileLanguage, isImageFile } = useFileManager(componentId)
 */
import { ref, reactive, computed } from 'vue'
import http from '@/core/http'

export function useFileManager(componentId) {
  const componentFiles = ref([])
  const openedFiles = ref([])
  const activeFile = ref('')
  const activeCanvasTab = ref('preview')
  const fileContentCache = reactive({})

  async function loadComponentFiles() {
    try {
      const data = await http.get(`/api/component/${componentId.value}/files`)

      if (data.success) {
        componentFiles.value = data.data.files.map((file) => ({
          name: file.name,
          path: file.path,
          type: file.type,
          content: ''
        }))
        console.log('文件列表加载成功', componentFiles.value)
        return true
      } else {
        console.error('加载文件列表失败:', data.data.error)
        return false
      }
    } catch (error) {
      console.error('加载文件���表失败:', error)
      return false
    }
  }

  async function openFile(file) {
    activeFile.value = file.path
    const isOpened = openedFiles.value.find((f) => f.path === file.path)

    if (!isOpened) {
      // 优先从缓存恢复
      const cached = fileContentCache[file.path]
      if (cached) {
        const restoredFile = {
          ...file,
          content: cached.content,
          originalContent: cached.originalContent,
          isImage: cached.isImage || false,
          imageUrl: cached.imageUrl || null,
        }
        openedFiles.value.push(restoredFile)
        console.log('文件从缓存恢复:', file.name)
        activeCanvasTab.value = file.path
        return
      }

      // 加载文件内容
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']
      const isImage = imageExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))

      if (isImage) {
        const newFile = {
          ...file,
          isImage: true,
          imageUrl: `/api/component/${componentId.value}/file?path=${encodeURIComponent(file.path)}&raw=1`,
          content: ''
        }
        openedFiles.value.push(newFile)
      } else {
        try {
          const data = await http.get(`/api/component/${componentId.value}/file`, {
            path: file.path
          })
          if (data.success) {
            const newFile = {
              ...file,
              content: data.content,
              originalContent: data.content
            }
            openedFiles.value.push(newFile)
          } else {
            openedFiles.value.push({ ...file, content: `// 加载失败: ${data.error}` })
          }
        } catch (error) {
          openedFiles.value.push({ ...file, content: `// 加载失败: ${error.message}` })
        }
      }
    }

    activeCanvasTab.value = file.path
  }

  function closeFile(filePath) {
    const index = openedFiles.value.findIndex((f) => f.path === filePath)
    if (index !== -1) {
      const file = openedFiles.value[index]
      // 保留到缓存
      if (file.content && !fileContentCache[file.path]) {
        fileContentCache[file.path] = {
          content: file.content,
          originalContent: file.originalContent,
          isImage: file.isImage || false,
          imageUrl: file.imageUrl || null,
        }
      }
      openedFiles.value.splice(index, 1)
      if (activeCanvasTab.value === filePath) {
        activeCanvasTab.value = 'preview'
      }
    }
  }

  async function saveFile(file) {
    if (!file.modified) return

    file.saving = true
    try {
      const data = await http.post(
        `/api/component/${componentId.value}/file?path=${encodeURIComponent(file.path)}`,
        { content: file.content }
      )
      if (data.success) {
        file.originalContent = file.content
        file.modified = false
        // 更新缓存
        if (fileContentCache[file.path]) {
          fileContentCache[file.path].content = file.content
          fileContentCache[file.path].originalContent = file.content
        }
      } else {
        throw new Error(data.data.error || '保存失败')
      }
    } catch (error) {
      console.error('保存失败:', error)
      throw error
    } finally {
      file.saving = false
    }
  }

  function revertFile(file) {
    file.content = file.originalContent
    file.modified = false
  }

  function onCodeChange(file) {
    file.modified = file.content !== file.originalContent
  }

  async function reloadAllFiles() {
    await loadComponentFiles()
    // 重载已打开文件
    for (const file of openedFiles.value) {
      if (file.isImage || isImageFile(file.name)) {
        file.imageUrl = `/api/component/${componentId.value}/file?path=${encodeURIComponent(file.path)}&raw=1&_t=${Date.now()}`
        continue
      }

      try {
        const data = await http.get(`/api/component/${componentId.value}/file`, {
          path: file.path
        })
        if (data.success) {
          file.content = data.content
          file.originalContent = data.content
          file.modified = false
        }
      } catch {}
    }
  }

  function getFileLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    const languageMap = {
      vue: 'html', js: 'javascript', ts: 'typescript',
      json: 'json', css: 'css', less: 'less', scss: 'scss',
      md: 'markdown', html: 'html', xml: 'xml'
    }
    return languageMap[ext] || 'plaintext'
  }

  function isImageFile(filename) {
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
      .includes(filename.split('.').pop().toLowerCase())
  }

  // 根据文件后缀返回语义化图标
  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    if (filename === 'declare.json') return '◆'
    if (ext === 'vue') return '⌘'
    if (['less', 'css', 'scss'].includes(ext)) return '⌗'
    if (ext === 'json') return '◇'
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '◐'
    if (['js', 'ts'].includes(ext)) return '⌬'
    return '≡'
  }

  // 文件树（含修改标记）
  const fileTree = computed(() => {
    const tree = []
    const map = {}
    const modifiedPaths = new Set(
      openedFiles.value.filter(f => f.content !== f.originalContent).map(f => f.path)
    )

    componentFiles.value.forEach((file) => {
      const parts = file.path.split('/')
      let currentLevel = tree

      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1
        const key = parts.slice(0, index + 1).join('/')

        if (!map[key]) {
          const isModified = isFile && modifiedPaths.has(file.path)
          const node = {
            title: part,
            key: key,
            isLeaf: isFile,
            icon: isFile ? getFileIcon(part) : '▣',
            children: isFile ? undefined : [],
            file: isFile ? file : null,
            // 附加节点类型用于 CSS 选择
            _type: isFile ? 'file' : 'dir',
            _ext: isFile ? (part.split('.').pop() || '').toLowerCase() : '',
            _modified: isModified
          }
          map[key] = node
          currentLevel.push(node)
          if (!isFile) currentLevel = node.children
        } else if (!isFile) {
          currentLevel = map[key].children
        }
      })
    })

    return tree
  })

  // 微码组件识别
  const isMcComponent = computed(() => {
    if (componentFiles.value.length === 0) {
      return componentId.value.startsWith('mc-')
    }
    return componentFiles.value.some(f => f.path === 'declare.json')
  })

  return {
    componentFiles, openedFiles, activeFile, activeCanvasTab,
    fileContentCache, fileTree, isMcComponent,
    loadComponentFiles, openFile, closeFile, saveFile, revertFile,
    onCodeChange, reloadAllFiles, getFileLanguage, isImageFile,
  }
}
