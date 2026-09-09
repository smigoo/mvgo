import http from '@/core/http'

/**
 * 读取组件的 declare.json 文件
 * 使用现有的 /api/component/:componentId/file 端点
 * @param {string} componentId - 组件ID
 * @returns {Promise<Object>} JSON数据
 */
export async function readDeclareJson(componentId) {
  try {
    const result = await http.get(`/api/component/${componentId}/file`, {
      path: 'declare.json'
    })
    if (result?.success) {
      return JSON.parse(result.content)
    } else {
      throw new Error(result.error || '读取失败')
    }
  } catch (error) {
    console.error('读取declare.json失败:', error)
    throw error
  }
}

/**
 * 写入组件的 declare.json 文件
 * 使用现有的 /api/component/:componentId/file 端点
 * @param {string} componentId - 组件ID
 * @param {Object} data - 要写入的JSON数据
 * @returns {Promise<Object>} 操作结果
 */
export async function writeDeclareJson(componentId, data) {
  try {
    const result = await http.post(
      `/api/component/${componentId}/file`,
      { content: JSON.stringify(data, null, 2) },
      { params: { path: 'declare.json' } }
    )
    if (result?.success) {
      return result.data
    } else {
      throw new Error(result.error || '写入失败')
    }
  } catch (error) {
    console.error('写入declare.json失败:', error)
    throw error
  }
}
