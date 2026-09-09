# MC 组件生成错误诊断报告

## 错误信息

**错误ID**: mc-max-1787894565773-ad5a19d8, mc-max-1787895614336-2c039926

**错误消息**: `Cannot read properties of undefined (reading 'model')`

**发生位置**: 
```
[INFO] Microcode Engineer 已初始化
[INFO] 🆕 [Context Assembler] 裁决事实已注入 Engineer（仅信任等级 + 问题清单）
[INFO] 开始执行代码生成
[INFO] 开始生成组件代码（自适应分块生成模式）
[ERROR] 代码生成执行失败
[ERROR] 代码生成失败
[FAILED] [代码生成] ❌ 失败: Cannot read properties of undefined (reading 'model')
[ERROR] 节点执行失败
[ERROR] Phase 2 Figma阶段失败
```

## 问题分析

### 可能的根本原因

#### 原因1: `this` 上下文丢失

**代码位置**: `microcode-engineer.js:4803`, `4822`, `4887`, `4996`, `5099`

```javascript
// 这些地方访问 this.model
getModelMaxOutputTokens(this.model, 16000)  // line 4803
getMaxTokens(this.model, 16000)             // line 4822, 4887
model: useLite ? liteModel : this.model     // line 4996, 5099
```

**问题**: 如果某个函数调用栈中 `this` 指向丢失，`this` 会变成 `undefined`，导致 `undefined.model` 报错。

**可能触发场景**:
- 回调函数中的 `this` 丢失（未绑定或使用箭头函数）
- 异步操作中的上下文切换
- 解构赋值导致方法丢失 `this`

#### 原因2: MicrocodeEngineer 实例未正确初始化

**代码位置**: `microcode-engineer.js:119-127`

```javascript
constructor(config = {}) {
  super({
    name: 'microcode-engineer',
    description: '微码组件代码生成器',
    model: config.model || 'claude-sonnet-4-6',  // ← this.model 在这里设置
    temperature: config.temperature || 0,
    maxTokens: config.maxTokens || getMaxTokens(config.model, 16000),
    ...config,
  });
}
```

**问题**: 如果 `super()` 调用失败或 `config` 传递有问题，`this.model` 可能未被正确设置。

**BaseAgent 构造函数**: `base-agent.js:24`

```javascript
constructor(config) {
  this.name = config.name
  this.description = config.description
  this.model = config.model || TEXT_DEFAULTS.model  // ← this.model 在这里设置
  // ...
}
```

如果 `config.model` 是 `undefined` 且 `TEXT_DEFAULTS.model` 也未定义，则 `this.model` 会是 `undefined`。

#### 原因3: 实例被覆盖或污染

**可能场景**:
- Graph 或其他调用方传递的 `config` 对象有问题
- 并发调用导致实例状态混乱
- 某处代码意外修改了 `this.model`

### 诊断步骤

#### Step 1: 检查 `this` 上下文

查找所有访问 `this.model` 的地方，确认是否在正确的上下文中：

```javascript
// microcode-engineer.js 中所有访问 this.model 的位置
// Line 4803
const modelOutputCap = Math.max(
  getModelMaxOutputTokens(this.model, 16000),  // ← 确认 this 是否指向 MicrocodeEngineer 实例
  16000,
);

// Line 4822
this.logger.warn('⚠️ max_tokens 截断（单文件段）：提高到模型输出上限重试', {
  segmentType: chunk.segmentType,
  scriptPart: chunk.scriptPart,
  from: getMaxTokens(this.model, 16000),  // ← 确认 this
  to: modelOutputCap,
  attempt,
});

// Line 4887
: getMaxTokens(this.model, 16000);  // ← 确认 this

// Line 4996
model: useLite ? liteModel : this.model,  // ← 确认 this

// Line 5099
model: useLite ? liteModel : this.model,  // ← 确认 this
```

**检查方法**: 在这些位置之前添加日志：

```javascript
// 临时诊断代码
console.log('[DEBUG] this 类型:', typeof this, 'this.model:', this?.model)
if (!this || typeof this.model === 'undefined') {
  console.error('[ERROR] this 或 this.model 未定义', {
    thisType: typeof this,
    thisKeys: this ? Object.keys(this) : 'N/A',
    thisModel: this?.model
  })
  throw new Error('this.model is undefined - context lost')
}
```

#### Step 2: 检查初始化流程

**查看调用栈**:
1. Graph 如何创建 MicrocodeEngineer 实例？
2. 传递的 `config` 是什么？
3. `super()` 调用是否成功？

**关键检查点**:
```javascript
// 在 constructor 中添加日志
constructor(config = {}) {
  console.log('[DEBUG] MicrocodeEngineer constructor called with config:', config)
  
  super({
    name: 'microcode-engineer',
    description: '微码组件代码生成器',
    model: config.model || 'claude-sonnet-4-6',
    temperature: config.temperature || 0,
    maxTokens: config.maxTokens || getMaxTokens(config.model, 16000),
    ...config,
  });
  
  console.log('[DEBUG] After super(), this.model:', this.model)
  
  if (!this.model) {
    throw new Error('this.model is undefined after super() call')
  }
  
  // ...
}
```

#### Step 3: 检查 TEXT_DEFAULTS

**文件**: `src/ai-engine/utils/ai-defaults.js`

```javascript
// 确认 TEXT_DEFAULTS.model 是否定义
export const TEXT_DEFAULTS = {
  model: 'claude-sonnet-4-6',  // ← 确认这个值存在
  // ...
}
```

如果这个文件缺失或导出有问题，`this.model` 可能未被正确初始化。

### 快速修复方案

#### 修复1: 防御性检查（治标）

在所有访问 `this.model` 的地方添加防御性检查：

```javascript
// microcode-engineer.js:4803
const modelOutputCap = Math.max(
  getModelMaxOutputTokens(this.model || 'claude-sonnet-4-6', 16000),
  16000,
);

// 或者在方法开始时统一检查
async generateComponentCode(input) {
  // 防御性检查
  if (!this.model) {
    this.logger.error('❌ this.model is undefined', {
      thisKeys: Object.keys(this),
      thisConstructor: this.constructor.name
    })
    throw new Error('MicrocodeEngineer.model is undefined - initialization failed')
  }
  
  // ... 原有代码
}
```

#### 修复2: 确保 `this` 绑定（治本）

检查是否有方法调用时 `this` 丢失的情况：

```javascript
// 错误示例：方法被解构导致 this 丢失
const { generateComponentCode } = engineer
await generateComponentCode(input)  // ← this 丢失

// 正确示例：保持实例调用
await engineer.generateComponentCode(input)  // ← this 正确
```

如果发现有解构调用，改为绑定：

```javascript
// 在 constructor 中绑定方法
constructor(config = {}) {
  super(config)
  
  // 绑定所有关键方法
  this.generateComponentCode = this.generateComponentCode.bind(this)
  this._generateChunk = this._generateChunk.bind(this)
  // ...
}
```

#### 修复3: 增强初始化检查

在 constructor 结束时验证关键属性：

```javascript
constructor(config = {}) {
  super({
    name: 'microcode-engineer',
    description: '微码组件代码生成器',
    model: config.model || 'claude-sonnet-4-6',
    temperature: config.temperature || 0,
    maxTokens: config.maxTokens || getMaxTokens(config.model, 16000),
    ...config,
  });

  // ✅ 验证关键属性
  if (!this.model) {
    const error = new Error('MicrocodeEngineer initialization failed: this.model is undefined')
    this.logger?.error('❌ Initialization error', { 
      config,
      thisModel: this.model,
      thisKeys: Object.keys(this)
    })
    throw error
  }

  this.logger.info('✅ MicrocodeEngineer initialized', { 
    model: this.model,
    liteModel: this.liteModel 
  })
  
  // ... 其他初始化代码
}
```

## 临时诊断补丁

为了快速定位问题，可以添加临时诊断代码：

```javascript
// microcode-engineer.js:4800 之前添加
async _generateChunk(chunk, /* ... */) {
  // 🔍 临时诊断代码
  console.log('[DEBUG] _generateChunk called')
  console.log('[DEBUG] this 类型:', typeof this)
  console.log('[DEBUG] this.constructor.name:', this?.constructor?.name)
  console.log('[DEBUG] this.model:', this?.model)
  console.log('[DEBUG] this keys:', this ? Object.keys(this).slice(0, 10) : 'N/A')
  
  if (!this || !this.model) {
    const error = new Error('this.model is undefined in _generateChunk')
    console.error('[ERROR] Context lost', {
      hasThis: !!this,
      thisType: typeof this,
      thisModel: this?.model,
      thisConstructor: this?.constructor?.name
    })
    throw error
  }
  
  // 原有代码...
  const liteModel = tierProfile?.liteModel ?? this.liteModel ?? process.env.LLM_LITE_MODEL ?? null;
  const modelOutputCap = Math.max(
    getModelMaxOutputTokens(this.model, 16000),
    16000,
  );
  // ...
}
```

## 排查优先级

### P0 - 立即检查

1. **查看实际错误日志**
   - 获取完整的错误堆栈
   - 确认准确的报错行号
   - 查看是否有其他相关错误信息

2. **检查 Graph 调用方式**
   - 查看 Graph 如何创建 MicrocodeEngineer 实例
   - 确认传递的 config 对象
   - 确认是否有并发调用

3. **添加临时诊断日志**
   - 在 constructor 中添加日志
   - 在 _generateChunk 开始处添加日志
   - 运行一次，查看日志输出

### P1 - 短期修复

4. **添加防御性检查**
   - 在所有访问 this.model 的地方添加检查
   - 提供默认值兜底

5. **绑定方法**
   - 在 constructor 中绑定关键方法
   - 防止 this 丢失

### P2 - 长期改进

6. **增强类型检查**
   - 使用 TypeScript 或 JSDoc 标注类型
   - 在编译/开发时期发现问题

7. **单元测试**
   - 添加 MicrocodeEngineer 初始化测试
   - 测试各种异常 config 输入

## 预期结果

添加诊断日志后，错误信息应该会更明确：

**场景1: this 丢失**
```
[DEBUG] this 类型: undefined
[ERROR] Context lost { hasThis: false, thisType: 'undefined', ... }
```

**场景2: this.model 未初始化**
```
[DEBUG] this 类型: object
[DEBUG] this.constructor.name: MicrocodeEngineer
[DEBUG] this.model: undefined
[ERROR] Context lost { hasThis: true, thisType: 'object', thisModel: undefined, ... }
```

**场景3: config 传递问题**
```
[DEBUG] MicrocodeEngineer constructor called with config: { /* 查看实际值 */ }
[DEBUG] After super(), this.model: undefined
[ERROR] Initialization error
```

## 下一步行动

1. **获取完整错误堆栈**：查看 logs 目录下的详细日志
2. **添加临时诊断代码**：按上面的补丁添加日志
3. **重现错误**：用相同的输入再次生成，查看诊断日志输出
4. **根据诊断结果修复**：确定是哪种原因后，应用对应的修复方案

---

**状态**: 📋 诊断方案已制定，待验证  
**优先级**: P0 (阻塞性错误)  
**预计修复时间**: 1-2小时（确认原因后）
