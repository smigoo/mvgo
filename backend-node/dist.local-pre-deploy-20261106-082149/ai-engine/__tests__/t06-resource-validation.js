/**
 * T06: 静态资源验证测试
 * 验证背景图资源是否正确下载并使用
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'

test('T06-A: 资源文件存在性验证', async () => {
  // 检查 workspace 中是否有资源文件
  const resourceDir = path.join(process.cwd(), 'workspace/custom-components')
  
  try {
    const components = await fs.readdir(resourceDir)
    let foundResource = false
    
    for (const component of components) {
      const imgDir = path.join(resourceDir, component, 'resources/images')
      try {
        const files = await fs.readdir(imgDir)
        if (files.length > 0) {
          foundResource = true
          // 验证文件不是空的
          for (const file of files) {
            const filePath = path.join(imgDir, file)
            const stat = await fs.stat(filePath)
            assert.ok(stat.size > 0, `资源文件 ${file} 不应为空`)
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
        // 目录不存在，跳过
      }
    }
    
    if (!foundResource) {
      console.log('⏭️  跳过测试：未找到资源文件')
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('⏭️  跳过测试：workspace/custom-components 不存在')
      return
    }
    throw err
  }
})

test('T06-B: 资源引用格式验证', async () => {
  const resourceDir = path.join(process.cwd(), 'workspace/custom-components')
  
  try {
    const components = await fs.readdir(resourceDir)
    
    for (const component of components) {
      const packageDir = path.join(resourceDir, component, 'package')
      try {
        const files = await fs.readdir(packageDir)
        
        for (const file of files) {
          if (!file.endsWith('.vue')) continue
          
          const filePath = path.join(packageDir, file)
          const content = await fs.readFile(filePath, 'utf-8')
          
          // 检查背景图引用格式
          const bgRefs = content.match(/url\(['"]?resources\/images\/[^'")\s]+['"]?\)/g) || []
          
          for (const ref of bgRefs) {
            // 验证引用格式正确
            assert.ok(
              /url\(['"]?resources\/images\/[\w-]+\.(png|jpg|jpeg|svg)['"]?\)/.test(ref),
              `资源引用格式应正确: ${ref}`
            )
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('⏭️  跳过测试：workspace/custom-components 不存在')
      return
    }
    throw err
  }
})

test('T06-C: 资源文件与引用一致性验证', async () => {
  const resourceDir = path.join(process.cwd(), 'workspace/custom-components')
  
  try {
    const components = await fs.readdir(resourceDir)
    
    for (const component of components) {
      const imgDir = path.join(resourceDir, component, 'resources/images')
      const packageDir = path.join(resourceDir, component, 'package')
      
      try {
        // 获取实际资源文件列表
        const actualFiles = await fs.readdir(imgDir)
        
        // 扫描所有 .vue 文件中的资源引用
        const referencedFiles = new Set()
        const vueFiles = await scanVueFiles(packageDir)
        
        for (const { content } of vueFiles) {
          const refs = content.match(/resources\/images\/([\w-]+\.(png|jpg|jpeg|svg))/g) || []
          refs.forEach(ref => {
            const fileName = ref.replace('resources/images/', '')
            referencedFiles.add(fileName)
          })
        }
        
        // 验证：引用的文件都应存在
        for (const refFile of referencedFiles) {
          assert.ok(
            actualFiles.includes(refFile),
            `引用的资源文件 ${refFile} 应存在`
          )
        }
        
        // 警告：存在的文件应被引用（不强制，仅提示）
        const unusedFiles = actualFiles.filter(f => !referencedFiles.has(f))
        if (unusedFiles.length > 0) {
          console.log(`⚠️  ${component} 有未使用的资源文件: ${unusedFiles.join(', ')}`)
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('⏭️  跳过测试：workspace/custom-components 不存在')
      return
    }
    throw err
  }
})

async function scanVueFiles(dir) {
  const files = []
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        const subFiles = await scanVueFiles(fullPath)
        files.push(...subFiles)
      } else if (entry.isFile() && entry.name.endsWith('.vue')) {
        const content = await fs.readFile(fullPath, 'utf-8')
        files.push({ path: fullPath, content })
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  
  return files
}
