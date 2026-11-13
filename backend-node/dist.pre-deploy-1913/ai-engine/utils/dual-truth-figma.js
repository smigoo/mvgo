/**
 * 双主题 Figma 输入 —— 主副稿解析与副稿拉取（2026-10-10）
 *
 * 契约（对应需求 D1/D3/D8）：
 *  - 主稿（primary）决定**结构 / 几何 / 文案**，走完整 Figma + Vision 分析；
 *  - 副稿（secondary）**只贡献色板**，只调 `getNode`（不调 `exportImage`、
 *    不做结构分析、不进 Vision）；
 *  - 副稿拉取失败**直接阻断**（D3），不降级为派生。
 *
 * 为什么副稿不调 exportImage：
 *  ① 副稿只取色板，截图无用；
 *  ② 现有限流槽 `maxConcurrency=1` + 429 冷却 30s（封顶 120s），少一次导出
 *    就少一次排队，是 R1（限流不恶化）的关键。
 *
 * 纯函数优先：解析与错误归类都是无副作用的，便于离线验证（配套
 * `scripts/verify-dual-truth-secondary.mjs`）。
 */

/** 副稿错误码（与现有 LiteErrorCode 命名风格一致，前端按 code 分文案） */
export const SECONDARY_ERROR_CODES = {
  MISSING_NODE_ID: 'SECONDARY_FIGMA_MISSING_NODE_ID',
  INVALID_URL: 'SECONDARY_FIGMA_INVALID_URL',
  FETCH_FAILED: 'SECONDARY_FIGMA_FETCH_FAILED',
  FORBIDDEN: 'SECONDARY_FIGMA_FORBIDDEN',
  RATE_LIMITED: 'SECONDARY_FIGMA_RATE_LIMITED',
  NODE_NOT_FOUND: 'SECONDARY_FIGMA_NODE_NOT_FOUND',
  BRIGHTNESS_MISMATCH: 'SECONDARY_FIGMA_BRIGHTNESS_MISMATCH',
};

/** 错误码 → 用户可读文案（指明是副稿 + 原因 + 处置） */
const ERROR_MESSAGES = {
  [SECONDARY_ERROR_CODES.MISSING_NODE_ID]: {
    title: '深色设计稿缺少节点 ID',
    hint: '请粘贴带 ?node-id= 的完整 Figma 节点链接（复制「复制选中内容的链接」即可）。',
  },
  [SECONDARY_ERROR_CODES.INVALID_URL]: {
    title: '深色设计稿链接无效',
    hint: '请检查链接是否以 figma.com 开头，且包含 file key。',
  },
  [SECONDARY_ERROR_CODES.FETCH_FAILED]: {
    title: '深色设计稿拉取失败',
    hint: '请检查 Figma Token 是否有该文件的访问权限，或稍后重试。',
  },
  [SECONDARY_ERROR_CODES.FORBIDDEN]: {
    title: '深色设计稿无访问权限',
    hint: '当前 Figma Token 无权访问该文件，请在 Figma 中分享权限给该账号，或换用有权限的 Token。',
  },
  [SECONDARY_ERROR_CODES.RATE_LIMITED]: {
    title: 'Figma 接口限流',
    hint: '请求过于频繁，请等待约 30 秒后重试。',
  },
  [SECONDARY_ERROR_CODES.NODE_NOT_FOUND]: {
    title: '深色设计稿节点不存在',
    hint: '设计稿可能已被删除或移动，请重新复制节点链接。',
  },
  [SECONDARY_ERROR_CODES.BRIGHTNESS_MISMATCH]: {
    title: '深色设计稿实际是浅色',
    hint: '请交换主副稿，或粘贴真正深色主题的设计稿链接。',
  },
};

/**
 * 把 Figma API 错误归类到副稿错误码。
 * ⚠️ 只做**错误归类**，不重试 —— 重试由 figma-client 的既有 429 退避负责，
 *    这里再包一层会掩盖真实限流信息。
 *
 * @param {Error|any} err
 * @param {number} [status] HTTP 状态码（err.status / err.response.status 兜底）
 * @returns {{code:string, title:string, hint:string}}
 */
export function classifySecondaryFigmaError(err, status) {
  const s =
    status ??
    err?.status ??
    err?.response?.status ??
    err?.statusCode ??
    // ⚠️ FigmaConnector.fetchNodeData 把 HTTP 状态挂在 `figStatus`（L339/352），
    //    不在 axios 惯用的 status/response.status 上 —— 漏读会让 403/429 全部
    //    退化成「未知拉取失败」，用户拿不到「无权限 / 限流」的可操作提示。
    err?.figStatus ??
    err?.cause?.status ??
    undefined;
  const msg = String(err?.message || err || '');
  let code = SECONDARY_ERROR_CODES.FETCH_FAILED;
  if (s === 403 || s === 401) code = SECONDARY_ERROR_CODES.FORBIDDEN;
  else if (s === 429) code = SECONDARY_ERROR_CODES.RATE_LIMITED;
  else if (s === 404) code = SECONDARY_ERROR_CODES.NODE_NOT_FOUND;
  // ⚠️ 消息里的 `HTTP <code>` 是 FigmaConnector.fetchNodeData 的既有格式（L350），
  //    figStatus 在部分分支丢失，只能从消息反解。
  else {
    const httpInMsg = msg.match(/\bHTTP\s*(\d{3})\b/i);
    const hs = httpInMsg ? Number(httpInMsg[1]) : null;
    if (hs === 403 || hs === 401) code = SECONDARY_ERROR_CODES.FORBIDDEN;
    else if (hs === 429) code = SECONDARY_ERROR_CODES.RATE_LIMITED;
    else if (hs === 404) code = SECONDARY_ERROR_CODES.NODE_NOT_FOUND;
  }
  if (code === SECONDARY_ERROR_CODES.FETCH_FAILED) {
    if (/not\s*found|does not exist|无法找到/i.test(msg)) {
      code = SECONDARY_ERROR_CODES.NODE_NOT_FOUND;
    } else if (/rate.?limit|429|限流/i.test(msg)) {
      code = SECONDARY_ERROR_CODES.RATE_LIMITED;
    } else if (/token|unauthor|forbidden|permission|权限/i.test(msg)) {
      code = SECONDARY_ERROR_CODES.FORBIDDEN;
    }
  }
  const m = ERROR_MESSAGES[code];
  return { code, title: m.title, hint: m.hint };
}

/** 构造阻断错误（带 code/title/hint，供上层映射为任务失败） */
export function buildSecondaryFigmaError(code, detail) {
  const m = ERROR_MESSAGES[code] || ERROR_MESSAGES[SECONDARY_ERROR_CODES.FETCH_FAILED];
  const err = new Error(detail ? `${m.title}：${detail}` : m.title);
  err.code = code;
  err.title = m.title;
  err.hint = m.hint;
  err.isSecondaryFigmaError = true;
  return err;
}

/**
 * 解析主副稿角色（D1：显式选择，默认预选第一个）。
 *
 * @param {{fileKey:string, nodeId:string}} firstInput  第一个填入的链接（解析后）
 * @param {{fileKey:string, nodeId:string}|null} secondInput 第二个填入的链接（解析后）
 * @param {'first'|'second'} [primaryRole='first']
 * @returns {{primary:Object, secondary:Object|null, primaryRole:string}}
 */
export function resolvePrimarySecondary(firstInput, secondInput, primaryRole = 'first') {
  if (!secondInput) {
    return { primary: firstInput, secondary: null, primaryRole: 'first' };
  }
  if (primaryRole === 'second') {
    return { primary: secondInput, secondary: firstInput, primaryRole: 'second' };
  }
  return { primary: firstInput, secondary: secondInput, primaryRole: 'first' };
}

/**
 * 校验主副稿合法性：不得为同一节点（否则两稿同源，双真值无意义）。
 * @returns {{ok:boolean, code?:string, detail?:string}}
 */
export function validatePrimarySecondary(primary, secondary) {
  if (!secondary) return { ok: true };
  if (!secondary.fileKey || !secondary.nodeId) {
    return {
      ok: false,
      code: SECONDARY_ERROR_CODES.MISSING_NODE_ID,
      detail: secondary.fileKey ? '缺少 node-id' : '缺少 file key',
    };
  }
  if (
    primary &&
    primary.fileKey === secondary.fileKey &&
    String(primary.nodeId) === String(secondary.nodeId)
  ) {
    return {
      ok: false,
      code: SECONDARY_ERROR_CODES.INVALID_URL,
      detail: '主稿与副稿是同一个 Figma 节点，请提供真正深浅两份设计稿',
    };
  }
  return { ok: true };
}

/**
 * 校验副稿实测明暗与「深色稿」角色是否矛盾（D3 阻断项之一）。
 *
 * 背景：用户可能把浅色稿误填进「深色设计稿」输入框。若不校验，双真值会让
 * 两个槽位拿到**同侧**色板（看起来"生成成功"但主题切换无效），属最隐蔽的失败模式。
 *
 * @param {'light'|'dark'} secondaryBrightness 实测明暗
 * @param {'light'|'dark'} secondaryExpect     角色期望明暗
 * @returns {{ok:boolean, code?:string, detail?:string}}
 */
export function validateSecondaryBrightness(secondaryBrightness, secondaryExpect) {
  if (!secondaryBrightness || !secondaryExpect) return { ok: true };
  if (secondaryBrightness === secondaryExpect) return { ok: true };
  return {
    ok: false,
    code: SECONDARY_ERROR_CODES.BRIGHTNESS_MISMATCH,
    detail: `副稿实测为${secondaryBrightness === 'dark' ? '深色' : '浅色'}，但被标注为${
      secondaryExpect === 'dark' ? '深色' : '浅色'
    }稿`,
  };
}

/**
 * 组装 styleTokens 的 dualTruth 入参。
 *
 * 关键设计：**按实测明暗归位**，而不是按「主稿/副稿」硬绑 light/dark。
 * 原因：副稿角色由用户标注，可能标反（已由 validateSecondaryBrightness 拦），
 * 但主稿本身的实测明暗才是权威 —— 双真值要的是「浅色槽位拿浅色稿」，
 * 而不是「light 槽位拿副稿」。
 *
 * @param {Object} primaryNodeData 主稿节点树（已 getNode）
 * @param {Object} secondaryNodeData 副稿节点树（已 getNode）
 * @param {'light'|'dark'} primaryBrightness 主稿实测明暗
 * @param {'light'|'dark'} secondaryBrightness 副稿实测明暗
 * @param {function} resolveBrightness (nodeData, fallback) => 'light'|'dark'
 * @returns {{lightNodeData:Object|null, darkNodeData:Object|null}}
 */
export function assembleDualTruthNodes(
  primaryNodeData,
  secondaryNodeData,
  primaryBrightness,
  secondaryBrightness,
  resolveBrightness,
) {
  const pB = resolveBrightness(primaryNodeData, primaryBrightness);
  const sB = resolveBrightness(secondaryNodeData, secondaryBrightness);
  return {
    primaryBrightness: pB,
    secondaryBrightness: sB,
    lightNodeData: pB === 'light' ? primaryNodeData : secondaryNodeData,
    darkNodeData: pB === 'light' ? secondaryNodeData : primaryNodeData,
  };
}