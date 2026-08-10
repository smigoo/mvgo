# HTML 任务 `MODEL_NOT_FOUND / 404` 分析结论

## 结论
这次 `html-upload-test-1` 以及同类 HTML/Lite 任务持续报错，**根因已经定位到后端视觉模型请求的“供应商路由判断错误”**，不是前端批次页本身，也不再是 `generate-split` 没带 `config` 的问题。

## 关键证据

### 1) 前端现在已经把 AI 配置透传给 HTML 拆分生成
文件：`frontend/src/views/generate/components.vue`
- `go()` 在 HTML 模式下会先 `validateAiConfig()`，然后调用 `generateSplit(aiConfig)`
- `generateSplit(aiConfig)` 发请求时已带上：

```json
{
  "htmlContent": "...",
  "htmlFileName": "...",
  "groupId": "default-group",
  "config": "aiConfig",
  "selections": []
}
```

对应位置：
- `components.vue:1617-1620`
- `components.vue:1342-1372`

### 2) 后端 `generate-split` 入口也确实接收并继续透传了 `config`
文件：`backend-node/src/lite/lite.controller.ts`
- `POST /api/lite/generate-split` 已接收 `body.config`
- 并传给 `htmlSplitService.generateSelectedComponents(...)`

对应位置：
- `lite.controller.ts:230-261`

文件：`backend-node/src/lite/html-split.service.ts`
- 生成每个拆分子任务时：`dto.config = config`

对应位置：
- `html-split.service.ts:146-152`

**所以：前端漏传配置这条旧问题，代码层面已经补上。**

---

## 当前真正的根因

### 3) 服务端保存的视觉配置是：
文件：`backend-node/data/ai-config.json`
- `visionBaseURL`: `https://code.newcli.com/claude/ultra/v1`
- `visionModel`: `claude-opus-4-8`

这类地址是 **OpenAI 兼容 `/v1` 网关样式**，不是原生 Anthropic 官方地址。

### 4) 但 `VisionAgent` 误把这类地址当成 Anthropic SDK 直连
文件：`backend-node/src/ai-engine/agents/vision-agent.js`
当前判断逻辑：
```js
this.isOpenAICompatible = this.baseURL &&
  (this.baseURL.includes('dashscope.aliyuncs.com') ||
   this.baseURL.includes('openai.com'))
```

问题在这里：
- `https://code.newcli.com/claude/ultra/v1` **不包含** `dashscope.aliyuncs.com`
- 也 **不包含** `openai.com`
- 结果 `isOpenAICompatible = false`
- 于是代码走了：
```js
logger.info('使用 Anthropic Claude API', { model: this.model })
this.llm = new ChatAnthropic(...)
```

对应位置：
- `vision-agent.js:43-68`

### 5) 日志已经证明它确实走错了路
文件：`backend-node/server.log`
证据链：
- `VisionAgent 配置`：model=`claude-opus-4-8`，baseURL=`https://code.newcli.com/claude/ultra/v1`
- `API 类型判断`：`isOpenAICompatible=false`
- `使用 Anthropic Claude API`
- 随后立刻报：`404 ... MODEL_NOT_FOUND`

典型日志位置：
- `server.log:55191-55206`

这说明：
**同一份配置，被文本模型链路当成 OpenAI 兼容网关在用，而视觉模型链路却当成 Anthropic 原生 SDK 在打，最终请求路径/协议不匹配，直接 404。**

---

## 为什么之前“补了 config 透传”还是继续报错
因为那只是修掉了“配置没传过去”的一层。

现在即便配置成功传到了后端，后端 `VisionAgent` 仍然会把：
- `code.newcli.com/claude/ultra/v1`
- `claude-opus-4-8`

错误地按 **Anthropic 原生接口** 发请求。

所以它还会继续报同一个 `MODEL_NOT_FOUND / 404`。

---

## 对“后面生产还会不会有这个问题”的判断
**会。** 只要生产环境继续使用这类 `/v1` 兼容网关，并且 `vision-agent.js` 的供应商判断不修，这类 HTML/Lite 视觉分析任务还会继续炸。

它不是偶发，不是某个 HTML 文件脏数据导致，而是：
- **配置形态** 与
- **视觉请求通道选择逻辑**

之间存在确定性错配。

---

## 建议的下一步修复方向
优先级从高到低：

1. **修 `backend-node/src/ai-engine/agents/vision-agent.js` 的 `isOpenAICompatible` 判定**
   - 至少补上 `/v1`、`openai.`、`api.deepseek.com` 这类兼容网关判断
   - 最好直接与 `base-agent.js` 采用同一套判断口径，避免文本/视觉两条链再次漂移

2. **增加启动日志或请求日志，明确输出视觉链最终采用的 provider**
   - 例如：`anthropic` / `openai-compatible`
   - 现在其实已有部分日志，但建议做成统一字段，排查会更快

3. **补一条回归验证**
   - 使用 `visionBaseURL=https://code.newcli.com/claude/ultra/v1`
   - `visionModel=claude-opus-4-8`
   - 验证 HTML/Lite 首阶段视觉分析不再 404

---

## 本次分析结论（一句话版）
**不是 HTML 拆分页面又坏了，而是后端视觉模型把 `code.newcli.com/claude/ultra/v1` 这种 OpenAI 兼容网关误识别成了 Anthropic 原生接口，所以持续 404。**
