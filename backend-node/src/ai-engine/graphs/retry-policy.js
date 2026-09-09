/**
 * 🛡️ 重试策略表（P1-5，2026-08-28）
 *
 * 背景（旧实现的三个缺陷）：
 *  1. 白名单式：只有「语义不完整」「资源未使用」两类可重试，SFC 语法错误直接 fail-closed，
 *     尽管 LLM 修语法错误的成功率很高（mc-max-1787908432082 实锤）。
 *  2. 条件边需为每类错误各写一个分支（_semanticRetried / _resourceRetried ...），
 *     新增可重试类型时若漏改条件边，重试标记将无处消费 → 直接进校验器 → fail-closed。
 *     这是「最容易被漏掉的一步」。
 *  3. 不区分可自愈与不可自愈：max_tokens 截断类错误重试无用（同样长度还会截断），
 *     应当加大预算或增分块，而非原样重试。
 *
 * 重构目标：
 *  - 集中声明：新增可重试类型只需往 RETRY_POLICIES 加一项，图与条件边零改动。
 *  - 预算制：每类错误独立配额，不再「一次性用完就没」。
 *  - 统一消费：条件边只认 _pendingRetry 一个标记，杜绝漏配。
 *  - 可自愈判定：selfHealable=false 的类别直接放弃重试，避免无意义开销。
 */

/**
 * @typedef {Object} RetryPolicy
 * @property {string}   id            唯一标识（同时作为预算键与日志键）
 * @property {string}   name          人类可读名称
 * @property {(msg:string)=>boolean} match 错误匹配（按顺序取首个命中）
 * @property {number}   budget        预算次数（0 表示不重试）
 * @property {boolean}  selfHealable  是否可自愈（false 表示重试无意义，如输出截断）
 * @property {(msg:string)=>string} guidance 生成回退指导，null 表示无指导
 */

/** @type {RetryPolicy[]} 顺序敏感：不可自愈的判定（如截断）应优先于具体类型 */
export const RETRY_POLICIES = [
  {
    // ⚠️ 必须排在最前：截断导致的语法错误，重试同样会截断，唯一解是加大预算/增分块
    id: 'truncation',
    name: '输出被截断',
    match: (msg) =>
      /max_tokens|max tokens|length limit|maximum (?:context )?length|被截断|incomplete|unexpected end of/i.test(
        msg,
      ),
    budget: 0,
    selfHealable: false,
    guidance: null,
  },
  {
    id: 'sfc-syntax',
    name: 'Vue SFC 编译错误',
    match: (msg) =>
      msg.includes('Vue SFC 编译错误') ||
      msg.includes('SFC:') ||
      /Element is missing end tag|Unexpected token|Invalid end tag/i.test(msg),
    // 🛡️ #3 预算 1→2（mc-max-1787920512973 实锤，2026-08-28）：复杂组件首轮失败后
    // 断点续跑+重生成仍可能因同族问题再失败（模型行为非随机），单次重试容错不足；
    // 对齐 l0MaxRetry=2。注：确定性可修复的「尾部说明泄漏」已在门禁前剥离放行，
    // 不再消耗本预算；烧预算的是真语法错误（模型重写可修复）。
    budget: 2,
    selfHealable: true,
    guidance: (msg) => {
      // 🆕 提取具体的错误位置信息
      const lineMatch = msg.match(/(\w+\.vue):(\d+):(\d+)/);
      const fileInfo = lineMatch ? `\n⚠️ **错误文件**: ${lineMatch[1]}` : '';
      const lineInfo = lineMatch
        ? `\n⚠️ **错误位置**: 第 ${lineMatch[2]} 行，第 ${lineMatch[3]} 列`
        : '';
      const lineNum = lineMatch ? lineMatch[2] : null;

      // 🆕 根据错误类型提供精确提示
      let specificHint = '';
      if (msg.includes('Element is missing end tag')) {
        specificHint =
          `\n🎯 **问题类型**: 标签未闭合\n` +
          `   - 请检查第 ${lineNum || '错误'} 行附近是否有未闭合的 HTML 标签\n` +
          `   - 常见：<div>、<template>、<span>、<section> 等忘记写 </${lineNum ? '对应标签' : '标签'}>\n` +
          `   - 特别注意 v-if/v-for 的 <template> 标签配对\n`;
      } else if (msg.includes('Unexpected token')) {
        specificHint =
          `\n🎯 **问题类型**: 意外的 token\n` +
          `   - 可能是 :class/:style 中对象的键名含连字符但未加引号\n` +
          `   - 或者模板中有未转义的特殊字符\n`;
      }

      return (
        `\n\n🔴 上次生成的代码**未通过 Vue SFC 编译**，必须修复语法错误：\n\n${msg}${fileInfo}${lineInfo}${specificHint}\n\n` +
        `修复清单：\n` +
        `1. **仔细检查错误位置附近的代码**${lineNum ? `（第 ${lineNum} 行前后 10 行）` : ''}\n` +
        `2. 逐行检查每个开始标签是否有对应的结束标签：<div> → </div>\n` +
        `3. 检查嵌套结构的缩进，确保层级清晰\n` +
        `4. v-if/v-for 的 <template> 标签必须闭合\n` +
        `5. :class/:style 对象的键名若含连字符必须用引号：{ 'c-monitor-active': x }\n` +
        `6. 不要在 </template> 和 <script> 之间、或 </style> 之后写任何说明文字\n` +
        `7. 直接输出完整代码，不要附加「关键说明」等 Markdown 文本\n\n` +
        `⚠️ **重要**: 请完整输出整个文件，不要省略任何部分。\n`
      );
    },
  },
  {
    id: 'resource-unused',
    name: '资源未使用',
    match: (msg) => msg.includes('L0-B BLOCK: 资源未使用'),
    budget: 2,
    selfHealable: true,
    guidance: (msg) =>
      `\n\n🔴 上次生成未通过「资源归属校验」：以下资源已成功下载，但代码中没有任何引用，本轮必须使用：\n\n${msg}\n\n` +
      `请为每个未使用资源补上真实引用（不能只出现在 import 行，必须在模板中实际使用）：\n` +
      `- icon / img：用 <img :src="变量名" /> 插入对应容器\n` +
      `- bg：用 :style 绑定 backgroundImage，值为 url(变量名)，并补 backgroundSize: 100% 100%\n`,
  },
  {
    id: 'semantic-incomplete',
    name: '组件文件语义不完整',
    match: (msg) => msg.includes('组件文件语义不完整'),
    budget: 1,
    selfHealable: true,
    guidance: (msg) =>
      `\n\n🔴 上次生成未通过「模板引用 script 未声明变量/组件」语义校验，必须修复：\n\n${msg}\n\n` +
      `请重新检查每个 .vue 文件的 <script>：确保 <template> 中 v-for / @click / :attr / {{ }} 引用的每个变量，` +
      `都在 <script> 中通过 import 或 const/let/var 明确声明（尤其注意不要丢失 ` +
      `\`const xxx = ref([...])\` 这类声明行，只留数组内容）。`,
  },
];

/** 按策略表顺序取首个命中的策略 */
export function matchRetryPolicy(errMsg) {
  if (!errMsg || typeof errMsg !== 'string') return null;
  for (const policy of RETRY_POLICIES) {
    try {
      if (policy.match(errMsg)) return policy;
    } catch {
      /* 单条 match 异常不应影响其它策略 */
    }
  }
  return null;
}

/**
 * 判断某策略在当前状态下是否还有重试预算
 * @param {Object} state 图状态（读取 state._retryBudget）
 * @param {RetryPolicy} policy
 * @returns {boolean}
 */
export function hasRetryBudget(state, policy) {
  if (!policy || !policy.selfHealable) return false;
  if (!policy.budget || policy.budget <= 0) return false;
  const used = state?._retryBudget?.[policy.id] || 0;
  return used < policy.budget;
}

/**
 * 消耗一次预算，返回新的预算表（不修改入参）
 * @param {Object} state
 * @param {RetryPolicy} policy
 * @returns {Object<string, number>}
 */
export function consumeRetryBudget(state, policy) {
  const budget = { ...(state?._retryBudget || {}) };
  budget[policy.id] = (budget[policy.id] || 0) + 1;
  return budget;
}

/**
 * 统一决策：给定错误消息与当前状态，判断是否可重试。
 * 可重试时返回 { policy, guidance, budget }；否则返回 { policy, reason }。
 *
 * @param {string} errMsg
 * @param {Object} state
 * @returns {{ok:boolean, policy?:RetryPolicy, guidance?:string, budget?:Object, reason?:string}}
 */
export function decideRetry(errMsg, state) {
  const policy = matchRetryPolicy(errMsg);
  if (!policy) {
    return { ok: false, reason: '无匹配策略（未纳入可重试类别）' };
  }
  if (!policy.selfHealable) {
    return {
      ok: false,
      policy,
      reason: `不可自愈（${policy.name}）：重试无意义，应调整生成参数`,
    };
  }
  if (!hasRetryBudget(state, policy)) {
    return {
      ok: false,
      policy,
      reason: `重试预算耗尽（${policy.name}: ${state?._retryBudget?.[policy.id] || 0}/${policy.budget}）`,
    };
  }
  const budget = consumeRetryBudget(state, policy);
  const guidance =
    typeof policy.guidance === 'function' ? policy.guidance(errMsg) : '';
  return { ok: true, policy, guidance, budget };
}

export default {
  RETRY_POLICIES,
  matchRetryPolicy,
  hasRetryBudget,
  consumeRetryBudget,
  decideRetry,
};
