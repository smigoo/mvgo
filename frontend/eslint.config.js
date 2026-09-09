import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import fs from 'fs'
import path from 'path'

// 读取 unplugin-auto-import 生成的全局变量配置
function loadAutoImportGlobals() {
  const filepath = path.resolve('scaffold-config/.eslint-global-variables.json')
  try {
    const content = fs.readFileSync(filepath, 'utf-8')
    const config = JSON.parse(content)
    const globalsConfig = {}
    if (config.globals) {
      Object.keys(config.globals).forEach((key) => {
        globalsConfig[key] = config.globals[key] === true ? 'readonly' : config.globals[key]
      })
    }
    return globalsConfig
  } catch {
    return {}
  }
}

const autoImportGlobals = loadAutoImportGlobals()

// 补充项目特定全局变量
const additionalGlobals = {
  log: 'readonly',
  logger: 'readonly',
  $config: 'readonly',
  $api: 'readonly',
  $utils: 'readonly',
  $message: 'readonly',
  $modal: 'readonly',
  $notification: 'readonly',
  $processEnv: 'readonly',
  AMap: 'readonly',
  __dirname: 'readonly',
  process: 'readonly'
}

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettier,
  // JS/TS 文件配置
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoImportGlobals,
        ...additionalGlobals
      }
    }
  },
  // Vue 单文件组件配置
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vue.parser,
      parserOptions: {
        parser: ts.parser,
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoImportGlobals,
        ...additionalGlobals
      }
    }
  },
  // 通用规则
  {
    files: ['**/*.{js,ts,vue}'],
    rules: {
      'no-console': 'off',
      'no-debugger': 'off',
      'vue/no-multiple-template-root': 'off',
      // 允许catch空着
      'no-empty': ['error', { allowEmptyCatch: true }],
      'vue/multi-word-component-names': 'off', // 关闭组件名需要多个单词组成的规则
      'no-unused-vars': 'off', // 已声明但未在代码中任何地方使用的变量
      // TypeScript 相关规则
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // TS 未使用变量
      '@typescript-eslint/no-explicit-any': 'off', // 允许使用 any
      '@typescript-eslint/no-empty-object-type': 'off', // 允许空对象类型
      '@typescript-eslint/no-unused-expressions': 'off', // 允许未使用的表达式（如方法调用）
      'no-control-regex': 2, //正则表达式中不允许出现控制字符
      'no-dupe-args': 2, //函数定义的时候不允许出现重复的参数
      'no-dupe-keys': 2, //对象中不允许出现重复的键
      'no-duplicate-case': 2, //switch语句中不允许出现重复的case标签
      'no-redeclare': 2, //不允许变量重复声明
      'no-shadow-restricted-names': 2, //js关键字和保留字不能作为函数名或者变量名
      'comma-style': [2, 'last'], //逗号风格
      'no-multiple-empty-lines': [
        2,
        {
          // 禁止多个空行
          max: 1
        }
      ],
      'space-before-blocks': [2, 'always'], // 不要存在多余的块空间
      'no-const-assign': 2 // 禁止修改使用const声明的变量
    }
  },
  // 忽略目录
  {
    ignores: ['dist/**', 'node_modules/**', '*.d.ts', 'coverage/**']
  }
]
