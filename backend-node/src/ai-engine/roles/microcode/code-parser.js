/**
 * 代码解析模块（Code Parser）
 * 
 * 职责：LLM 输出的解析、清洗、完整性校验
 * - 支持分隔符格式（// === filePath ===）和 JSON 格式
 * - 截断检测与完整性校验
 * - 尾部垃圾剥离（闭合标签后的说明性文本）
 * - 块间散文剥离
 * - 原始文本恢复（兜底）
 * 
 * 从 microcode-engineer.js 拆分（2026-08-30）
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coerceLLMText } from '../../utils/model-config.js';
import { robustJSONParse } from '../../utils/json-parser.js';
import { stripLlmTailGarbageFromFiles } from '../../utils/llm-tail-garbage.js';
import { safeLogger } from '../../logger/safe-logger.js';

const dataDir = join(process.cwd(), 'data');

/**
 * 解析代码输出（统一入口）
 * 🛡️ #1 解析层治本：LLM 分块输出常在「文件内容结束后」追加 ``` 尾围栏 + Markdown 说明文字，
 * 分隔符/JSON 解析只认边界不截断尾部说明段 → 垃圾随文件内容落盘 → SFC 门禁把说明文字当 template 解析
 * 
 * @param {string|object} rawOutput - LLM 原始输出
 * @param {object} logger - 日志实例
 * @returns {object} { files: { path: content } }
 */
export function parseCodeOutput(rawOutput, logger) {
  // 🔒 入口归一化（见 logger.js safeLogger）：调用方漏传 logger 时降级为 no-op，
  // 避免 catch 块内 `logger.error` 抛 TypeError 掩盖真实的解析错误。
  const log = safeLogger(logger);
  const result = parseCodeOutputInner(rawOutput, log);
  if (result && typeof result === 'object' && result.files) {
    const { files, strippedFiles } = stripLlmTailGarbageFromFiles(
      result.files,
      (msg) => log.info(msg),
    );
    if (strippedFiles.length > 0) {
      result.files = files;
    }
  }
  return result;
}

/**
 * 内部解析逻辑
 */
function parseCodeOutputInner(rawOutput, logger) {
  try {
    // 1. 先用 coerceLLMText 规整（兼容 Anthropic 数组式 content）
    const text = coerceLLMText(rawOutput);

    // 2. 如果规整后已经是合法的代码生成结果（含 files 字段），直接返回
    if (text && typeof text === 'object' && !Array.isArray(text) && text.files) {
      return text;
    }

    // 3. 规整为字符串
    const textStr = typeof text === 'string' ? text : JSON.stringify(text);

    // 4. 优先尝试新格式（分隔符格式）
    const delimitedResult = parseDelimitedFormat(textStr, logger);
    if (delimitedResult) {
      logger.info('✅ 分隔符格式解析成功', {
        fileCount: Object.keys(delimitedResult.files).length,
        files: Object.keys(delimitedResult.files),
      });

      // 截断检测
      const truncationIssues = detectFileTruncation(delimitedResult.files);
      if (truncationIssues.length > 0) {
        logger.warn('⚠️ 检测到文件可能被截断', {
          issues: truncationIssues,
        });
      }

      return delimitedResult;
    }

    // 5. 回退到旧格式（JSON）
    logger.info('分隔符格式未匹配，回退到 JSON 解析');

    // 提取 JSON（从 markdown 代码块中）
    const jsonMatches = [...textStr.matchAll(/```json\s*\n?([\s\S]*?)\n?\s*```/g)];
    let jsonString = textStr;
    let parsed = null;

    if (jsonMatches.length > 0) {
      for (const match of jsonMatches) {
        try {
          const candidate = JSON.parse(match[1]);
          if (candidate && typeof candidate === 'object' && candidate.files) {
            parsed = candidate;
            logger.info('✅ 从 ```json 代码块中解析到含 files 的 JSON', {
              codeBlockIndex: jsonMatches.indexOf(match),
              hasFiles: true,
            });
            break;
          }
        } catch {
          /* 忽略单个代码块解析失败 */
        }
      }

      if (!parsed) {
        jsonString = jsonMatches[jsonMatches.length - 1][1];
        logger.info('未找到含 files 的 ```json 代码块，使用最后一个回退', {
          totalBlocks: jsonMatches.length,
        });
      }
    }

    // 如果上面的循环已找到含 files 的 JSON，直接做截断检测并返回
    if (parsed && parsed.files) {
      const truncationIssues = detectFileTruncation(parsed.files);
      if (truncationIssues.length > 0) {
        logger.warn('⚠️ 检测到文件可能被截断', {
          issues: truncationIssues,
        });
      }
      return parsed;
    }

    // 6. 先尝试解析完整的 JSON
    try {
      parsed = JSON.parse(jsonString);
      logger.info('✅ 完整 JSON 解析成功', {
        size: jsonString.length,
        hasFiles: !!parsed.files,
      });

      if (parsed.files) {
        const truncationIssues = detectFileTruncation(parsed.files);
        if (truncationIssues.length > 0) {
          logger.warn('⚠️ 检测到文件可能被截断', {
            issues: truncationIssues,
          });
        }
      }
    } catch (directError) {
      logger.warn('完整 JSON 解析失败，尝试截断', {
        reason: directError.message.substring(0, 100),
        originalSize: jsonString.length,
      });
      const trimmedJSON = extractValidJSON(jsonString, logger);

      try {
        parsed = JSON.parse(trimmedJSON);
        logger.info('✅ 截断后 JSON 解析成功', {
          originalSize: jsonString.length,
          trimmedSize: trimmedJSON.length,
          hasFiles: !!parsed.files,
        });
      } catch (trimError) {
        // 7. 截断后仍失败，用 robustJSONParse 统一修复
        logger.warn('截断后仍解析失败，用 robustJSONParse 统一修复');
        parsed = robustJSONParse(trimmedJSON, {
          enablePartialExtract: true,
          fallback: { files: {} },
          criticalFields: ['files'],
          _context: 'microcode-engineer',
        });
        logger.info('✅ robustJSONParse 修复后解析成功');
      }
    }

    // 8. 最终验证
    // 🛡️ #B（2026-09-01 事故 mc-max-1788248984779-862c6b29）：第 7 步 robustJSONParse 失败
    // 返回 fallback `{ files: {} }`（空对象），而空对象是 truthy → 旧条件 `!parsed.files` 为
    // false → 跳过下方 recoverFilesFromRawText 兜底恢复（本可从 ```vue 代码围栏重建 index.vue）
    // → chunk 静默返回空 files → 写盘无 package/index.vue → L0-B EMPTY_ARTIFACT → 重试空转耗预算。
    // 修复：显式把「空 files」也算作「未解析到产物」，走兜底恢复（救回或 throw，而非静默丢弃）。
    if (!parsed || !parsed.files || Object.keys(parsed.files || {}).length === 0) {
      // declare chunk 的 LLM 输出是业务字段片段 JSON（无 files 字段）
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        (Object.prototype.hasOwnProperty.call(parsed, 'componentName') ||
          Object.prototype.hasOwnProperty.call(parsed, 'panelKey') ||
          Object.prototype.hasOwnProperty.call(parsed, 'businessEvents') ||
          Object.prototype.hasOwnProperty.call(parsed, 'businessStatuses') ||
          Object.prototype.hasOwnProperty.call(parsed, 'cssVariableConfig') ||
          Object.prototype.hasOwnProperty.call(parsed, 'businessConfig'))
      ) {
        logger.info('✅ 识别为 declare.json 业务片段（无 files 字段），原样透传', {
          keys: Object.keys(parsed),
        });
        return { files: { 'declare.json': JSON.stringify(parsed, null, 2) } };
      }

      // 兜底恢复
      const recovered = recoverFilesFromRawText(textStr, logger);
      if (recovered && Object.keys(recovered).length > 0) {
        const result =
          parsed && typeof parsed === 'object'
            ? { ...parsed, files: recovered }
            : { files: recovered };
        logger.warn('⚠️ 未直接解析到 files，已从原始文本恢复代码文件', {
          recoveredFiles: Object.keys(recovered),
        });
        validateFilesIntegrity(result, logger);
        return result;
      }

      logger.error('解析后的 JSON 缺少 files 字段', {
        keys: parsed ? Object.keys(parsed) : 'null',
      });
      dumpRawOutput(rawOutput, logger);
      throw new Error('LLM 返回的 JSON 缺少 files 字段');
    }

    // 完整性校验
    validateFilesIntegrity(parsed, logger);

    return parsed;
  } catch (error) {
    logger.error('解析代码输出失败', {
      error: error.message,
      rawOutputLength: safeSerializeLLMOutput(rawOutput).length,
      rawOutputSample: safeSerializeLLMOutput(rawOutput).substring(0, 500),
      errorStack: error.stack,
    });
    throw new Error(`Failed to parse code output: ${error.message}`);
  }
}

/**
 * 检测文件是否被截断
 * @param {object} files - { path: content }
 * @returns {string[]} issues - 空数组表示无问题
 */
export function detectFileTruncation(files) {
  const issues = [];

  for (const [filePath, content] of Object.entries(files)) {
    if (!content || typeof content !== 'string') continue;

    // .vue 文件：检查闭合标签
    if (filePath.endsWith('.vue')) {
      if (content.includes('<script') && !content.includes('</script>')) {
        issues.push(`${filePath}: <script> 标签未闭合（输出被截断）`);
      }
      if (content.includes('<style') && !content.includes('</style>')) {
        issues.push(`${filePath}: <style> 标签未闭合（输出被截断）`);
      }
      if (content.includes('<template>') && !content.includes('</template>')) {
        issues.push(`${filePath}: <template> 标签未闭合（输出被截断）`);
      }
    }

    // .json 文件：检查合法性
    if (filePath.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (e) {
        issues.push(
          `${filePath}: JSON 解析失败（可能被截断）- ${e.message.substring(0, 80)}`,
        );
      }
    }

    // .less 文件：检查括号平衡
    if (filePath.endsWith('.less')) {
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        issues.push(
          `${filePath}: 大括号不匹配（{=${openBraces} }=${closeBraces}），可能被截断`,
        );
      }
      const openComment = (content.match(/\/\*/g) || []).length;
      const closeComment = (content.match(/\*\//g) || []).length;
      if (openComment !== closeComment) {
        issues.push(
          `${filePath}: 注释块不匹配（/*=${openComment} */=${closeComment}），可能被截断`,
        );
      }
    }
  }

  return issues;
}

/**
 * 解析后强校验，截断文件直接拒绝不写盘
 */
export function validateFilesIntegrity(parsed, logger) {
  logger = safeLogger(logger);
  if (!parsed || !parsed.files) return;

  const truncationIssues = detectFileTruncation(parsed.files);
  if (truncationIssues.length === 0) return;

  logger.warn('⚠️ 检测到文件完整性问题，将拒绝写盘触发重试', {
    issues: truncationIssues,
  });

  throw new Error(
    `文件输出不完整（被截断）：\n${truncationIssues.map((i) => `- ${i}`).join('\n')}\n\n将自动重试，请稍候。`,
  );
}

/**
 * 解析分隔符格式输出
 * 格式：// === filePath ===\n<file content>\n// === filePath ===\n...
 */
function parseDelimitedFormat(text, logger) {
  logger = safeLogger(logger);
  const hasDelimiters = /(?:^|\n)\s*\/\/\s*={2,3}\s+[^\n=]+?\s*={2,3}/.test(text);
  if (!hasDelimiters) return null;

  const files = {};
  const pattern =
    /(?:^|\n)(\s*\/\/\s*={2,3}\s+([^\n=]+?)\s*={2,3}\s*)\n([\s\S]*?)(?=\n\s*\/\/\s*={2,3}\s+|$)/g;
  let match;
  let currentPath = null;
  let reattached = 0;

  while ((match = pattern.exec(text)) !== null) {
    const delimiterLine = (match[1] || '').trim();
    const rawPath = match[2].trim();
    const fileContent = match[3] || '';

    if (!isValidFilePath(rawPath)) {
      // 非法文件名 ⇒ 分节注释，回填给当前文件
      if (currentPath) {
        const keepComment = /\.(vue|js|mjs|cjs|ts|less|css|scss)$/i.test(currentPath);
        files[currentPath] +=
          (keepComment ? '\n' + delimiterLine + '\n' : '\n') + fileContent;
        reattached++;
      } else {
        logger.warn(`分隔符格式：跳过非法文件名（无归属文件）`, { rawPath });
      }
      continue;
    }

    if (rawPath) {
      files[rawPath] = fileContent;
      currentPath = rawPath;
    }
  }

  if (reattached > 0) {
    logger.info('分隔符格式：分节注释已回填为文件内容（非文件分隔符）', {
      reattached,
    });
  }

  // 末尾清理
  for (const key of Object.keys(files)) {
    files[key] = files[key].trim();
    if (!files[key]) delete files[key];
  }

  if (Object.keys(files).length === 0) return null;

  return { files };
}

/**
 * 兜底恢复：从原始文本中按分隔符 / 代码围栏重建 files
 */
function recoverFilesFromRawText(text, logger) {
  logger = safeLogger(logger);
  const files = {};

  // 1. 分隔符格式
  try {
    const delimited = parseDelimitedFormat(text, logger);
    if (delimited && delimited.files && Object.keys(delimited.files).length > 0) {
      Object.assign(files, delimited.files);
    }
  } catch {
    /* 忽略 */
  }

  // 2. 代码围栏
  const langToFile = {
    vue: 'package/index.vue',
    html: 'package/index.vue',
    less: 'package/index.less',
    css: 'package/index.css',
    json: 'declare.json',
  };
  const fencePattern = /```(\w+)?\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = fencePattern.exec(text)) !== null) {
    const lang = (m[1] || '').toLowerCase();
    const content = m[2].trim();
    if (!content) continue;
    const target = langToFile[lang];
    if (target) {
      if (lang === 'json' && !/componentId/.test(content)) continue;
      files[target] = content;
    }
  }

  return Object.keys(files).length > 0 ? files : null;
}

/**
 * 将解析失败的原始 LLM 输出落盘
 * 🛡️ 2026-08-31 修复：rawOutput 为对象（响应对象）时 String() 得到 "[object Object]"，
 * dump 无诊断价值（全部 dump 15 字节实锤）——改为安全 JSON 序列化。
 */
function dumpRawOutput(rawOutput, logger) {
  logger = safeLogger(logger);
  try {
    const dir = dataDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fp = join(dir, `microcode-parse-fail-${ts}.txt`);
    writeFileSync(fp, safeSerializeLLMOutput(rawOutput));
    logger.error('已落盘失败原始输出', { path: fp });
  } catch (e) {
    logger.warn('落盘失败原始输出失败', { error: e.message });
  }
}

/** 安全序列化 LLM 输出：字符串原样、对象 JSON.stringify、失败兜底 String() */
function safeSerializeLLMOutput(rawOutput) {
  if (typeof rawOutput === 'string') return rawOutput;
  try {
    return JSON.stringify(rawOutput, null, 2);
  } catch (_) {
    return String(rawOutput);
  }
}

/**
 * 从文本中提取有效的 JSON（去除闭合括号后的额外文本）
 */
function extractValidJSON(text, logger) {
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return text;
  let jsonPart = text.substring(startIdx);

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let endIdx = -1;

  for (let i = 0; i < jsonPart.length; i++) {
    const ch = jsonPart[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  if (endIdx > 0 && endIdx < jsonPart.length) {
    logger.info('检测到 JSON 后有额外内容，已截断', {
      original: jsonPart.length,
      trimmed: endIdx,
    });
    return jsonPart.substring(0, endIdx);
  }

  return jsonPart;
}

/**
 * 验证文件路径是否有效
 */
function isValidFilePath(path) {
  if (!path || typeof path !== 'string') return false;
  if (!/\.[a-zA-Z0-9]+$/.test(path)) return false;
  if (/[一-龥]/.test(path)) return false;
  if (/\s/.test(path)) return false;
  if (path.startsWith('/') || path.includes('..')) return false;
  return true;
}

/**
 * 判断文本是否为 LLM 说明性散文
 */
export function looksLikeLlmProse(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;

  const markers = [
    /```/,
    /^\s*#{1,6}\s+\S/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /\*\*[^*]+\*\*/,
    /^\s*---+\s*$/m,
    /`<\/?(?:script|style|template|div|span)\b/,
    /说明|注意|关键|如下|以上|总结|提示|备注/,
    /Explanation|Note:|NOTE:|Summary:/i,
  ];
  return markers.some((re) => re.test(t));
}

/**
 * 剥离最后一个块闭合标签之后的尾部垃圾
 */
export function stripTrailingGarbageAfterLastBlock(content, filePath = '', logger) {
  if (!content || typeof content !== 'string') return content;

  const tags = ['</style>', '</script>', '</template>'];
  let lastIdx = -1;
  let lastTag = '';
  for (const tag of tags) {
    const idx = content.lastIndexOf(tag);
    if (idx > lastIdx) {
      lastIdx = idx;
      lastTag = tag;
    }
  }
  if (lastIdx < 0) return content;

  const tail = content.slice(lastIdx + lastTag.length);
  if (!tail.trim()) return content;

  const isVue = /\.vue$/i.test(filePath || '');
  if (isVue || looksLikeLlmProse(tail)) {
    if (logger) {
      logger.info('🛡️ 清洗：剥离闭合标签之后的说明性文本', {
        file: filePath || '(unknown)',
        tag: lastTag,
        removedChars: tail.length,
        preview: tail.trim().slice(0, 60).replace(/\s+/g, ' '),
      });
    }
    return content.slice(0, lastIdx + lastTag.length);
  }
  return content;
}

/**
 * 剥离块与块之间的 LLM 说明性散文
 */
export function stripInterBlockProse(content, filePath = '', logger) {
  if (!content || typeof content !== 'string') return content;

  const lastTplEnd = content.lastIndexOf('</template>');
  if (lastTplEnd < 0) return content;

  const nextBlockMatch = content.slice(lastTplEnd).match(/<(?:script|style)\s/i);
  if (!nextBlockMatch) return content;

  const nextBlockStart = lastTplEnd + nextBlockMatch.index;
  const between = content.slice(lastTplEnd + '</template>'.length, nextBlockStart);
  if (!between.trim()) return content;
  if (!looksLikeLlmProse(between)) return content;

  const lines = between.split('\n');
  const codeLines = lines.filter((l) =>
    /^\s*(import|export|const|let|var|function|class|<|\/|[{}\]]|@|\/\/|\/\*)/.test(l),
  );
  if (codeLines.length >= lines.length * 0.3) return content;

  if (logger) {
    logger.info('🛡️ 清洗：剥离块间说明性文本', {
      file: filePath || '(unknown)',
      removedLines: lines.length,
      preview: between.trim().slice(0, 60).replace(/\s+/g, ' '),
    });
  }
  return (
    content.slice(0, lastTplEnd + '</template>'.length) +
    '\n' +
    content.slice(nextBlockStart)
  );
}
