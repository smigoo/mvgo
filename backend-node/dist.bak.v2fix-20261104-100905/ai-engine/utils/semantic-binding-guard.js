/**
 * 🛡️ 语义元素归属校验（SEMANTIC-BINDING，2026-09-07）
 *
 * 事故实证 mc-max-1788306653919-a57e4409（设备监测）：
 *   左侧竖排 tab 的"监控"项右上角有角标 `3/3740`（Frame 2136638920），
 *   但竖排 tabs 整列丢失后，LLM 把这个角标数据错误绑定到隧道大卡的 `progress` 字段
 *   （ViewSwitch.vue:40: `progress: '3/3740'`）→ 语义错绑（角标出现在进度条位置）。
 *
 * 本模块检测「角标数据出现在不合理语义字段」的错绑：
 *   - 角标模式：数字+斜杠+数字（如 `3/3740`、`12/100`）
 *   - 语义字段：progress/percent/percentage/ratio/rate（进度/比例/百分比）
 *   - 错绑判定：角标模式数据出现在 progress 等字段 → BLOCK
 *
 * 防误伤约束（宁可漏报，不可误伤）：
 *   - 只检测明确的角标模式（数字+斜杠），避免误杀普通数字文本；
 *   - 只检测明确的语义字段（progress/percent 等），避免误杀其他字段名；
 *   - 检测器自身异常走 fail-open（WARN，不阻断）。
 */

/**
 * 角标模式正则：数字+斜杠+数字（如 `3/3740`、`12/100`）
 */
const BADGE_SLASH_PATTERN = /['"`](\d{1,4}\/\d{1,4})['"`]/g;

/**
 * 语义字段模式：进度/比例/百分比相关
 */
const PROGRESS_FIELDS = ['progress', 'percent', 'percentage', 'ratio', 'rate'];

/**
 * 从 Vue SFC 提取 <script setup> 内容
 * @param {string} content Vue 文件内容
 * @returns {string} script 内容
 */
function extractScript(content) {
  if (!content || typeof content !== 'string') return '';
  const match = content.match(/<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/i);
  return match ? match[1] : '';
}

/**
 * 检测角标数据是否出现在不合理的语义字段
 *
 * @param {Array<{path:string, content:string}>} files 文件集
 * @param {object} [options] 选项
 * @param {object} [options.logger] 日志器
 * @returns {Array<{severity:string, file:string, message:string, line?:number}>} 问题列表
 */
export function detectSemanticBindingErrors(files, options = {}) {
  const logger = options.logger;
  const issues = [];

  if (!Array.isArray(files) || files.length === 0) {
    return issues;
  }

  try {
    for (const file of files) {
      if (!file || !file.path || !file.content) continue;
      if (!file.path.endsWith('.vue')) continue;

      const script = extractScript(file.content);
      if (!script) continue;

      // 1) 提取所有角标数据（数字+斜杠+数字模式）
      const badgeDataMatches = [];
      let badgeMatch;
      while ((badgeMatch = BADGE_SLASH_PATTERN.exec(script)) !== null) {
        badgeDataMatches.push({
          text: badgeMatch[1], // 捕获组 1：数字/数字
          index: badgeMatch.index,
          fullMatch: badgeMatch[0],
        });
      }

      if (badgeDataMatches.length === 0) continue;

      // 2) 检查每个角标数据是否出现在 progress 等语义字段
      for (const badge of badgeDataMatches) {
        for (const field of PROGRESS_FIELDS) {
          // 匹配形如：progress: '3/3740' / progress = "3/3740" / progress: `3/3740`
          const fieldPattern = new RegExp(
            `\\b${field}\\b\\s*[:=]\\s*['"\`]${escapeRegExp(badge.text)}['"\`]`,
            'i',
          );

          const match = script.match(fieldPattern);
          if (match) {
            issues.push({
              severity: 'BLOCK',
              file: file.path,
              message: `语义元素错绑：角标数据 "${badge.text}" 被绑定到 ${field} 字段（应出现在角标/徽标位置，而非进度/比例字段）`,
              line: extractLineNumber(script, match.index),
            });
            break; // 一个角标只报一次
          }
        }
      }
    }
  } catch (err) {
    logger?.warn('🛡️ SEMANTIC-BINDING 检测异常（fail-open）', { error: err?.message || String(err) });
    return []; // 异常时返回空，不阻断
  }

  return issues;
}

/**
 * 转义正则特殊字符
 * @param {string} str 字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 script 内容提取匹配位置的行号
 * @param {string} script script 内容
 * @param {number} matchIndex 匹配位置的索引
 * @returns {number|undefined} 行号（从 1 开始）
 */
function extractLineNumber(script, matchIndex) {
  if (!script || matchIndex === undefined || matchIndex < 0) return undefined;

  const beforeMatch = script.slice(0, matchIndex);
  const lines = beforeMatch.split('\n');
  return lines.length;
}
