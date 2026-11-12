/**
 * 文档分析编排器（D0 → D1 → D2 串联）
 * 输入 markdown + 可选 invokeLLM，输出 doc-analysis.json（六维）
 * 铁律：Schema 固定、内容自由；无 invokeLLM 时 D2 跳过（降级不阻塞）
 */
const structureDetector = require('./structure-detector');
const detParser = require('./deterministic-parser');
const llmExtractor = require('./llm-extractor');

/** D1 逐章节确定性装配 */
function assembleDeterministic(ranges) {
  const out = { deterministicFields: 0, llmNeeded: [] };
  const analysis = {};

  // businessEvents（表格）
  if (ranges.businessEvents) {
    const tables = detParser.parseMarkdownTable(ranges.businessEvents.content);
    if (tables.length) {
      analysis.events = detParser.tableToObjects(tables[0]).map((r) => ({
        eventId: r.paramName || Object.values(r)[0],
        description: r.description || '',
        payload: r.Payload || r.payload || '',
        confidence: 'high',
      }));
      out.deterministicFields += analysis.events.length;
    }
  }

  // businessStatuses（表格）— 对外可调用方法（名称+参数+行为）
  if (ranges.businessStatuses) {
    const tables = detParser.parseMarkdownTable(ranges.businessStatuses.content);
    if (tables.length) {
      analysis.statuses = detParser.tableToObjects(tables[0]).map((r) => ({
        statusId: r.paramName || Object.values(r)[0],
        description: r.description || '',
        params: r['参数'] || r.params || '',
        confidence: 'high',
      }));
      out.deterministicFields += analysis.statuses.length;
    }
  }

  // businessConfig（JSON 块 → 表格兜底）
  if (ranges.businessConfig) {
    const r = detParser.parseConfigSection(ranges.businessConfig.content);
    analysis.businessConfig = r.items;
    analysis.extractionMeta = { ...(analysis.extractionMeta || {}), businessConfigChannel: r.channel };
    out.deterministicFields += r.items.length;
  }

  // cssVariableConfig（JSON 块 → 表格兜底）
  if (ranges.cssVarConfig) {
    const r = detParser.parseConfigSection(ranges.cssVarConfig.content);
    analysis.cssVariableConfig = r.items;
    analysis.extractionMeta = { ...(analysis.extractionMeta || {}), cssVarChannel: r.channel };
    out.deterministicFields += r.items.length;
  }

  // initParams（JSON 默认值 + 参数表）
  if (ranges.initParams) {
    const blocks = detParser.extractJsonBlocks(ranges.initParams.content);
    const tables = detParser.parseMarkdownTable(ranges.initParams.content);
    analysis.initParams = {
      jsonDefaults: blocks.find((b) => b.ok)?.data || null,
      paramTable: tables.length ? detParser.tableToObjects(tables[0]) : [],
    };
    out.deterministicFields += analysis.initParams.paramTable.length || 1;
  }

  // apiConfig（接口表 + 参数表 + 响应示例）
  if (ranges.apiConfig) {
    const tables = detParser.parseMarkdownTable(ranges.apiConfig.content);
    const blocks = detParser.extractJsonBlocks(ranges.apiConfig.content);
    const apiRows = tables.length ? detParser.tableToObjects(tables[0]) : [];
    analysis.apis = apiRows.map((row) => {
      const ep = detParser.extractEndpoint(row) || {};
      return {
        apiCode: row.paramName || Object.values(row)[0],
        endpoint: Object.values(row).find((v) => /(GET|POST|PUT|DELETE)/i.test(v)) || '',
        method: ep.method || null,
        path: ep.path || null,
        usage: row['用途'] || row.description || '',
        responseExample: blocks.find((b) => b.ok)?.data || null,
      };
    });
    analysis.apiParamTables = tables.slice(1).map((t) => detParser.tableToObjects(t));
    out.deterministicFields += analysis.apis.length;
  }

  // pageElements（表格，列角色分工：paramName 匹配用 / description 证据用）
  if (ranges.pageElements) {
    const tables = detParser.parseMarkdownTable(ranges.pageElements.content);
    if (tables.length) {
      analysis.uiElements = detParser.tableToObjects(tables[0]).map((r, i) => ({
        seq: r['序号'] || i + 1,
        name: r.paramName || Object.values(r)[1] || '',
        paramName: r.paramName,
        control: r.controlType || '',
        field: (r.fieldBinding || '').replace(/`/g, ''),
        api: (r.fieldBinding || '').match(/（(.+?)）/)?.[1] || null,
        description: r.description || '',
        conditional: /[><=]+\s*\d+/.test(r.description || ''),
      }));
      out.deterministicFields += analysis.uiElements.length;
    }
  }

  // interactions / funcDesc → 标记需 LLM
  if (ranges.interactions) out.llmNeeded.push('interactions');
  if (ranges.funcDesc) out.llmNeeded.push('funcDesc');

  return { analysis, ...out };
}

/** 从功能说明提取模块信息（确定性辅助） */
function extractModuleInfo(md, ranges) {
  const info = {};
  // 首个一级/四级标题中的中文名（"4.2.5.1 设备总览（F_UC...）"）
  const titleMatch = md.match(/^#{1,6}\s*[\d.]*\s*([^\s（(]+)[（(]([A-Z0-9_]+)[)）]/m);
  if (titleMatch) { info.moduleName = titleMatch[1]; info.moduleCode = titleMatch[2]; }
  const userMatch = md.match(/\*\*目标用户\*\*[：:]\s*(.+)/);
  if (userMatch) info.targetUser = userMatch[1].trim();
  const dsMatch = md.match(/\*\*数据来源\*\*[：:]\s*(.+)/);
  if (dsMatch) info.dataSource = dsMatch[1].trim();
  return info;
}

/** 字段映射（pageElements 的 fieldBinding → fieldMappings） */
function buildFieldMappings(uiElements) {
  return (uiElements || [])
    .filter((el) => el.field)
    .map((el) => ({
      element: el.name,
      control: el.control,
      field: el.field.split('（')[0],
      api: el.api,
      condition: el.conditional ? el.description : undefined,
    }));
}

/**
 * 主入口
 * @param {string} md - 文档原文
 * @param {object} options - { invokeLLM?: (prompt)=>Promise<string>, source?: 'upload'|'paste'|'file' }
 */
async function analyze(md, options = {}) {
  const d0 = structureDetector.detect(md);
  const { analysis, deterministicFields, llmNeeded } = assembleDeterministic(d0.ranges);

  // D2（可选，无 invokeLLM 时降级跳过）
  let d2 = { interactions: [], funcDesc: null, llmUsed: [] };
  if (options.invokeLLM && (d0.ranges.interactions || d0.ranges.funcDesc)) {
    d2 = await llmExtractor.extract(
      {
        interactions: d0.ranges.interactions?.content,
        funcDesc: d0.ranges.funcDesc?.content,
      },
      options.invokeLLM,
    );
  }

  const result = {
    docHash: d0.docHash,
    analyzedAt: new Date().toISOString(),
    source: options.source || 'paste',
    trustLevel: d0.trustLevel,
    moduleInfo: extractModuleInfo(md, d0.ranges),
    events: analysis.events || [],
    statuses: analysis.statuses || [],
    dataBinding: {
      apis: analysis.apis || [],
      fieldMappings: buildFieldMappings(analysis.uiElements),
    },
    businessConfig: analysis.businessConfig || [],
    cssVariableConfig: analysis.cssVariableConfig || [],
    initParams: analysis.initParams || null,
    onloadFlow: {
      initCalls: (analysis.apis || []).map((a) => a.apiCode),
      firstRender: [],
      polling: analysis.initParams?.jsonDefaults?.pollInterval
        ? { intervalFrom: 'config.pollInterval', default: analysis.initParams.jsonDefaults.pollInterval }
        : null,
    },
    uiElements: analysis.uiElements || [],
    interactions: d2.interactions,
    funcDesc: d2.funcDesc,
    dimensions: {
      events: !!(analysis.events || []).length,
      dataBinding: !!(analysis.apis || []).length || !!(analysis.uiElements || []).some((e) => e.field),
      config: !!(analysis.businessConfig || []).length || !!(analysis.cssVariableConfig || []).length,
      onload: true,
      ui: !!(analysis.uiElements || []).length,
      interactions: !!d2.interactions.length,
    },
    sectionHashes: Object.fromEntries(Object.entries(d0.ranges).map(([k, v]) => [k, v.hash])),
    extractionMeta: {
      ...(analysis.extractionMeta || {}),
      fullConfigDetected: !!(analysis.events && analysis.businessConfig && analysis.cssVariableConfig),
      deterministicFields,
      llmNeeded,
      llmUsed: d2.llmUsed,
      headingsFound: d0.found.length,
      headingsMissed: d0.missed,
    },
  };
  return result;
}

module.exports = { analyze, assembleDeterministic, extractModuleInfo, buildFieldMappings };
