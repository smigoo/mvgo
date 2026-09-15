import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage } from '@langchain/core/messages';
import { ApifoxService, ApiCatalog } from '../apifox/apifox.service';
import { AnalyzeFromDocDto } from './dto/analyze-from-doc.dto';
import { SlotAnalyzerService } from './slot-analyzer.service';
import { attachUnifiedInvoke, executeModelRequest } from '../ai-engine/utils/ai-request-gateway.js';
import { coerceLLMText } from '../ai-engine/utils/model-config.js';
import { buildChatUrl } from '../ai-engine/utils/chat-url.js'
import { isOpenAICompatibleBaseURL } from '../ai-engine/utils/provider-utils.js';

export interface DocBindingSuggestion {
  refName: string;
  slotType: string;
  description: string;
  moduleName: string | null;
  functionName: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

@Injectable()
export class DocAnalyzerService {
  private readonly logger = new Logger(DocAnalyzerService.name);

  constructor(
    private readonly apifoxService: ApifoxService,
    private readonly slotAnalyzer: SlotAnalyzerService,
  ) {}

  /**
   * 需求文档智能分析（模式B：LLM 语义理解）
   */
  async analyzeFromDoc(dto: AnalyzeFromDocDto): Promise<{
    success: boolean;
    bindings: DocBindingSuggestion[];
    summary: string;
  }> {
    // 1. 读取 SFC 源码
    const sfcContent = this.slotAnalyzer.readSFC(dto.componentId, dto.groupId);

    // 2. 加载 API 目录
    const catalog = this.apifoxService.getCatalog(dto.catalogId);
    if (!catalog) {
      throw new NotFoundException(`API 目录不存在: ${dto.catalogId}`);
    }

    // 3. 先跑模式A获取数据槽（提供给 LLM 参考）
    const { slots } = await this.slotAnalyzer.analyzeSlots(dto.componentId, dto.groupId);

    // 4. 构造精简的 API 目录描述（避免 token 过长）
    const catalogBrief = this.buildCatalogBrief(catalog);

    // 5. 构造 prompt
    const prompt = this.buildPrompt(sfcContent, dto.requirementsDoc, catalogBrief, slots);

    // 6. 调用 LLM
    this.logger.log(`[DocAnalyzer] 调用 LLM 分析，组件 ${dto.componentId}`);
    const llmResponse = await this.callLLM(prompt, dto.aiConfig);

    // 7. 解析 LLM 返回的 JSON
    const bindings = this.parseLLMResponse(llmResponse);

    // 🛡️ 2026-09-03：refName 合法性校正（确定性兜底，不依赖 LLM 守约）。
    // LLM 常臆造 chartData/tableData 等组件中不存在的变量名 → 绑定后 checkSlotConsumption
    // 必然告警「未被消费」且注入代码不生效。这里把臆造名映射回模式A真实槽位 refName：
    //   ① 已命中白名单 → 原样保留
    //   ② 臆造名 → 按 slotType 找最匹配的真实槽位，校正 refName（children 数据源优先）
    //   ③ 无匹配槽位 → 丢弃该条（组件 UI 根本不需要这份数据）
    const correctedBindings = this.correctRefNames(bindings, slots);

    const matched = correctedBindings.filter((b) => b.moduleName && b.functionName).length;
    const summary = `共分析 ${correctedBindings.length} 个数据需求，${matched} 个匹配成功，${correctedBindings.length - matched} 个无匹配（已建议模拟数据）`;

    this.logger.log(`[DocAnalyzer] 分析完成: ${summary}`);
    return { success: true, bindings: correctedBindings, summary };
  }

  /**
   * 🛡️ 2026-09-03：把 LLM 臆造的 refName 校正为组件真实数据槽。
   * @param bindings LLM 返回的绑定建议
   * @param slots 模式A自动分析的组件数据槽（含 children 数据源）
   */
  private correctRefNames(
    bindings: DocBindingSuggestion[],
    slots: any[],
  ): DocBindingSuggestion[] {
    if (!bindings.length || !slots.length) return bindings;

    // 白名单：所有槽位顶层 refName + children 数据源 refName
    const validNames = new Set<string>();
    const chartSeriesNames: string[] = [];
    const tableListNames: string[] = [];
    for (const s of slots) {
      const top = String(s.refName || '');
      if (top) validNames.add(top);
      for (const c of s.children || []) {
        const child = String(c.refName || '');
        if (!child) continue;
        validNames.add(child);
        const role = String(c.role || '');
        const type = String(s.slotType || '');
        if (role.includes('chart.series') || child.toLowerCase().includes('series')) {
          chartSeriesNames.push(child);
        }
        if (type === 'table' || type === 'list' || role.includes('table') || role.includes('list')) {
          tableListNames.push(child);
        }
      }
      if (String(s.slotType || '') === 'chart') {
        const topName = top.toLowerCase();
        if (topName.includes('option') || topName.includes('ref')) chartSeriesNames.push(top);
      }
    }

    const corrected: DocBindingSuggestion[] = [];
    const seenRefs = new Set<string>();
    for (const b of bindings) {
      const raw = String(b.refName || '').trim();
      const slotType = String(b.slotType || 'stat').toLowerCase();
      if (!raw) continue;

      // ① 已命中白名单（含 children 数据源名）→ 原样保留
      if (validNames.has(raw)) {
        if (!seenRefs.has(raw)) {
          seenRefs.add(raw);
          corrected.push(b);
        }
        continue;
      }

      // ② 臆造名：按类型就近校正
      const normalized = raw.toLowerCase();
      let resolved: string | null = null;

      // 图表类臆造（chartData / chartOption / option 等）→ 图表 series 数据源
      if (slotType === 'chart' || /chart|option|series/.test(normalized)) {
        resolved =
          chartSeriesNames.find((n) => /series|data/.test(n.toLowerCase())) ||
          chartSeriesNames[0] ||
          null;
      }
      // 表格/列表类臆造（tableData / listData 等）→ 列表数据源
      if (!resolved && (slotType === 'table' || slotType === 'list' || /table|list|record|row/.test(normalized))) {
        resolved = tableListNames[0] || null;
      }

      if (resolved && !seenRefs.has(resolved)) {
        seenRefs.add(resolved);
        this.logger.warn(
          `[DocAnalyzer] refName 校正: "${raw}" (${slotType}) → "${resolved}"（组件真实数据槽）`,
        );
        corrected.push({ ...b, refName: resolved });
      } else {
        // ③ 无法匹配真实槽位 → 丢弃（组件 UI 不需要这份数据，绑定只会制造悬空注入）
        this.logger.warn(
          `[DocAnalyzer] refName 丢弃: "${raw}" (${slotType})——组件无对应数据槽，绑定将无效`,
        );
      }
    }
    return corrected;
  }

  /**
   * 构造精简的 API 目录描述（避免 token 过长）
   */
  private buildCatalogBrief(catalog: ApiCatalog): string {
    const lines: string[] = [];
    for (const mod of catalog.modules) {
      lines.push(`\n### 模块: ${mod.moduleName} (${mod.service})`);
      for (const fn of mod.functions) {
        const params = fn.params.length
          ? fn.params.map((p) => `${p.name}(${p.in}${p.required ? ',必填' : ''})`).join(', ')
          : '无';
        lines.push(
          `- ${fn.method} ${fn.path} → ${fn.name}() | 参数: ${params} | 返回: ${fn.responsePreview} | 说明: ${fn.summary}`,
        );
      }
    }
    return lines.join('\n');
  }

  /**
   * 构造 LLM prompt
   */
  private buildPrompt(sfc: string, doc: string, catalog: string, slots: any[]): string {
    // 🛡️ 2026-09-03：槽位参考只保留 refName + slotType 白名单，并显式给出「唯一可绑定名」。
    // LLM 之前会臆造 chartData / tableData 等不存在的变量 → 绑定后组件不消费 → 图表保持静态。
    // 真实可绑名必须以模式A扫描出的 refName（含 children 数据源，如 seriesData.value）为准。
    const validSlotNames = new Set<string>();
    for (const s of slots) {
      validSlotNames.add(String(s.refName || ''));
      for (const c of s.children || []) validSlotNames.add(String(c.refName || ''));
    }
    const slotNamesBrief = [...validSlotNames].filter(Boolean).join(', ');
    const slotsBrief = slots.length
      ? slots.map((s) => `- ${s.refName} [${s.slotType}] 行${s.sourceLine}: ${s.sourceContext}${s.children?.length ? ` | 数据源: ${s.children.map((c: any) => c.refName).join(', ')}` : ''}`).join('\n')
      : '（未检测到明显数据槽）';

    return `你是一个前端接口对接分析师。

## 组件源码（Vue3 SFC）
\`\`\`vue
${sfc}
\`\`\`

## 需求文档
${doc}

## 已检测到的数据槽（模式A自动分析结果，供参考）
${slotsBrief}

## 可用 API 目录
${catalog}

## 任务
1. 分析需求文档，提取组件需要的数据需求
2. 将每个数据需求对应到 SFC 中的一个变量/ref
3. 从 API 目录中为每个数据需求匹配最合适的接口函数
4. 如果某个数据需求在 API 目录中找不到匹配接口，标记 moduleName=null, functionName=null, confidence="none"

## 🛡️ refName 硬性约束（必须遵守）
- "refName" 字段**只能**从上面「已检测到的数据槽」中精确选取（顶层 refName 或其"数据源"子项），
  例如数据源列表中的 seriesData.value、xAxisFullData.value 等。
- **禁止**自行编造或改写变量名（如把 seriesData 臆造成 chartData、把告警数据臆造成 tableData）。
- 若某个数据需求对应不到任何已检测槽位，说明该数据不是组件 UI 需要的数据，请直接丢弃该条，
  不要新造一个 refName。
- 唯一可用的 refName 白名单：${slotNamesBrief || '（无，此时应返回空数组）'}

返回 JSON 数组（不要包含 markdown 代码围栏，直接返回纯 JSON）：
[
  {
    "refName": "seriesData",
    "slotType": "chart",
    "description": "环境监测24小时趋势曲线数据",
    "moduleName": "device",
    "functionName": "getMonitor",
    "confidence": "high",
    "reason": "需求要求展示24小时趋势图，seriesData 是图表系列数据源，device.getMonitor 返回监测数据"
  }
]

## 置信度说明
- high: 需求文档描述与 API summary 高度匹配
- medium: 部分匹配（函数名相关但不确定）
- low: 勉强匹配，可能有更好选择
- none: API 目录中无匹配接口

请直接返回 JSON 数组，不要有任何额外文字。`;
  }

  /**
   * 调用 LLM（支持 OpenAI 兼容端点和 Anthropic）
   */
  private async callLLM(prompt: string, aiConfig?: any): Promise<string> {
    const apiKey = (
      aiConfig?.textApiKey ||
      process.env.MC_GEN_TEXT_API_KEY ||
      process.env.TEXT_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      ''
    ).trim();
    const baseURL = (
      aiConfig?.textBaseURL ||
      process.env.MC_GEN_TEXT_ENDPOINT ||
      process.env.TEXT_BASE_URL ||
      process.env.ANTHROPIC_BASE_URL ||
      ''
    ).trim();
    const model = (
      aiConfig?.textModel ||
      process.env.MC_GEN_TEXT_MODEL ||
      process.env.TEXT_MODEL ||
      process.env.ANTHROPIC_MODEL ||
      ''
    ).trim();

    if (!apiKey || !baseURL) {
      throw new BadRequestException(
        'AI 配置缺失：请在前端设置面板配置文本 API Key 和 Base URL，或在请求中传入 aiConfig',
      );
    }

    // 判断是否为 OpenAI 兼容端点
    const isOpenAICompatible = isOpenAICompatibleBaseURL(baseURL);

    if (isOpenAICompatible) {
      // OpenAI 兼容 HTTP 调用
      this.logger.debug(`[DocAnalyzer] 使用 OpenAI 兼容端点: ${baseURL}, model: ${model}`);
      const url = buildChatUrl(baseURL);

      let response;
      try {
        response = await executeModelRequest({
          context: 'vue3-doc-analyzer',
          provider: 'openai-compatible',
          model,
          operation: ({ signal, requestPolicy }) =>
            axios.post(
              url,
              {
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 4096,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                timeout: requestPolicy.requestTimeoutMs,
                signal,
              },
            ),
        });
      } catch (err: any) {
        const status = err?.response?.status;
        const body = err?.response?.data;
        const bodyStr =
          typeof body === 'string' ? body : body ? JSON.stringify(body).slice(0, 400) : err.message;
        this.logger.error(`[DocAnalyzer] LLM 调用失败 (HTTP ${status}): ${bodyStr}`);
        if (status === 401) {
          throw new BadRequestException(
            'AI 调用返回 401：API Key 无效或缺少权限。请检查当前 Base URL 对应的 Key 是否正确。',
          );
        }
        if (status === 404) {
          throw new BadRequestException(
            `AI 调用返回 404：模型 "${model}" 在 ${baseURL} 上不存在或端点路径错误。请确认 Model 名称与该 Base URL 对应的服务商匹配（如 DashScope 用 qwen-plus/qwen-max；若 qwen3.7-plus 在别的服务商可用，请把 Base URL 改成那个服务商的地址）。`,
          );
        }
        if (status === 429) {
          throw new BadRequestException(
            'AI 调用返回 429：API Key 额度已用尽，请更换 Key 或稍后重试。',
          );
        }
        throw new BadRequestException(
          `AI 调用失败 (HTTP ${status || '网络错误'})：${bodyStr || err.message}`,
        );
      }
      return response.data.choices[0].message.content;
    } else {
      // Anthropic 端点 — 动态导入 LangChain
      this.logger.debug(`[DocAnalyzer] 使用 Anthropic 端点: ${baseURL}, model: ${model}`);
      const llm = attachUnifiedInvoke(
        new ChatAnthropic({
          modelName: model,
          anthropicApiKey: apiKey,
          anthropicApiUrl: baseURL || undefined,
          temperature: 0.3,
          maxTokens: 4096,
          streaming: true,
        }),
        {
          context: 'vue3-doc-analyzer',
          provider: 'anthropic',
          model,
        },
      );

      const response = await llm.invoke([new HumanMessage({ content: prompt })], {
        __mvgoRequestOptions: {
          context: 'vue3-doc-analyzer',
          model,
        },
      });

      return coerceLLMText(response.content);
    }
  }

  /**
   * 解析 LLM 返回的 JSON
   */
  private parseLLMResponse(raw: string): DocBindingSuggestion[] {
    // 去除可能的 markdown 代码围栏
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    // 尝试提取 JSON 数组
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      cleaned = arrayMatch[0];
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed as DocBindingSuggestion[];
      }
      this.logger.warn(`[DocAnalyzer] LLM 返回非数组: ${typeof parsed}`);
      return [];
    } catch (err) {
      this.logger.error(`[DocAnalyzer] JSON 解析失败: ${err.message}`);
      this.logger.debug(`[DocAnalyzer] 原始返回: ${raw.substring(0, 500)}`);
      // 返回空数组，不阻塞流程
      return [];
    }
  }
}
