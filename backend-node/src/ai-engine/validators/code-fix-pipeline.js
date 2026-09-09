/**
 * 🛡️ 确定性修复流水线（P1-4，2026-08-28）
 *
 * 背景（今日三类故障的共性根因）：
 *  - 模式A 修复时机错位：能救的清理放在下游（写盘），判死的校验在上游（生成），
 *    校验先炸，清理永远等不到执行机会（mc-max-1787908432082 实锤）。
 *  - 模式B 清洗覆盖不全：中间泄漏（</template>~<script>）已修，末尾泄漏（</style> 之后）漏网。
 *  - 模式C 职责边界模糊：机械性错误本可用规则 100% 修好，却依赖 LLM 生成正确。
 *
 * 目标：把散落在 microcode-engineer 各处的 20+ 个确定性修复，纳入「声明式注册表 + 阶段化编排」，
 * 保证：①清洗永远最先；②执行顺序集中可见；③每条规则可独立回滚；④新增规则只需注册。
 *
 * 设计取舍：规则实现仍留在 microcode-engineer（多依赖 this 的其它方法），
 * 本模块只做「编排」不搬移实现，把改动面与回归风险压到最低。
 */

/** 执行阶段（顺序即数组顺序，不可调换） */
export const FIX_PHASE = {
  /** 清洗：剥离模型输出的「夹带」（围栏 / 闭合标签后的说明文本 / thinking）。永远最先。 */
  CLEAN: 'clean',
  /** 结构：标签闭合、裸键引号、双前缀坍缩、虚假换行 */
  STRUCTURE: 'structure',
  /** 命名：实例 ID 前缀剥离、根容器 ID 注入 */
  NAMING: 'naming',
  /** 资源：import 注入、背景/图标挂载兜底 */
  RESOURCE: 'resource',
  /** 样式：less import、背景图尺寸、变量归一化 */
  STYLE: 'style',
  /** 精修：插槽保障、头部结构等 */
  POLISH: 'polish',
};

const PHASE_ORDER = [
  FIX_PHASE.CLEAN,
  FIX_PHASE.STRUCTURE,
  FIX_PHASE.NAMING,
  FIX_PHASE.RESOURCE,
  FIX_PHASE.STYLE,
  FIX_PHASE.POLISH,
];

/**
 * 单条规则声明
 * @typedef {Object} FixRule
 * @property {string}           id        唯一标识（用于回滚开关 FIX_<ID_UPPER>=false 与日志）
 * @property {string}           name      人类可读名称
 * @property {string}           phase     所属阶段（FIX_PHASE.*）
 * @property {RegExp|null}      applyTo   适用的文件路径正则，null 表示全部文件
 * @property {(content:string, ctx:Object)=>string} fix 修复函数，返回新内容（未改动请原样返回）
 * @property {(ctx:Object)=>boolean} [enabled] 是否启用（默认启用）
 */

export class CodeFixPipeline {
  /**
   * @param {Object} options
   * @param {Object} [options.logger] 日志器（需 warn/info）
   * @param {Object} [options.context] 传给每条规则的上下文（files / componentName / outputPath 等）
   */
  constructor(options = {}) {
    this.logger = options.logger || null;
    this.context = options.context || {};
    /** @type {FixRule[]} */
    this.rules = [];
    this.appliedLog = [];
  }

  /**
   * 注册一条规则
   * @param {FixRule} rule
   */
  register(rule) {
    // 🛡️ P1-6（2026-08-29）：规则有两类 API —— fix(单文件) / fixFiles(文件集)，
    // 旧校验只认 fix，导致 6 条 fixFiles 规则（auto-mount-backgrounds / auto-mount-icons /
    // normalize-style-less-vars / clamp-oversize-min-height / prune-dangling-sub-component-imports /
    // ensure-vertical-text-writing-mode）被静默丢弃，每轮刷 6 条「忽略无效规则」告警。
    // 其中后 3 条在别处无直接调用点 → 等于完全死代码（它们要修的 bug 一直没被修）。
    const hasFix = rule && typeof rule.fix === 'function';
    const hasFixFiles = rule && typeof rule.fixFiles === 'function';
    if (!rule || !rule.id || (!hasFix && !hasFixFiles)) {
      this._warn('忽略无效规则（缺少 id，或 fix/fixFiles 都不是函数）', {
        id: rule?.id,
        hasFix,
        hasFixFiles,
      });
      return this;
    }
    if (this.rules.some((r) => r.id === rule.id)) {
      this._warn('规则 id 重复，后者覆盖前者', { id: rule.id });
      this.rules = this.rules.filter((r) => r.id !== rule.id);
    }
    this.rules.push({ phase: FIX_PHASE.POLISH, applyTo: null, ...rule });
    return this;
  }

  /** 批量注册 */
  registerAll(rules) {
    for (const r of rules || []) this.register(r);
    return this;
  }

  _warn(msg, extra) {
    if (this.logger && typeof this.logger.warn === 'function') {
      this.logger.warn(`[CodeFixPipeline] ${msg}`, extra);
    }
  }

  _info(msg, extra) {
    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(`[CodeFixPipeline] ${msg}`, extra);
    }
  }

  /**
   * 判断规则是否启用。
   * 优先级：显式 enabled() > 环境变量回滚开关 FIX_<ID>=false > 默认启用
   */
  _isEnabled(rule, ctx) {
    if (typeof rule.enabled === 'function') {
      try {
        return !!rule.enabled(ctx);
      } catch {
        return true;
      }
    }
    const envKey = `FIX_${String(rule.id)
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .toUpperCase()}`;
    return process.env[envKey] !== 'false';
  }

  /**
   * 按阶段顺序执行全部规则
   * @param {Object<string,string>} files 路径 → 内容
   * @param {Object} [extraContext] 追加上下文
   * @returns {{ files: Object<string,string>, applied: Array<{phase:string,id:string,path:string}> }}
   */
  apply(files, extraContext = {}) {
    const ctx = { ...this.context, ...extraContext, files };
    /** @type {Object<string,string>} */
    const out = { ...files };
    const applied = [];

    for (const phase of PHASE_ORDER) {
      const phaseRules = this.rules.filter((r) => r.phase === phase);
      if (phaseRules.length === 0) continue;

      // 先跑「文件集级」规则（跨文件协同，如资源挂载、样式变量归一化），
      // 再跑「单文件」规则——保证单文件规则看到的是跨文件处理之后的内容。
      for (const rule of phaseRules) {
        if (typeof rule.fixFiles !== 'function') continue;
        if (!this._isEnabled(rule, ctx)) continue;
        let nextFiles = null;
        try {
          nextFiles = rule.fixFiles(out, { ...ctx });
        } catch (err) {
          this._warn(`文件集规则执行异常已跳过: ${rule.id}`, {
            error: err?.message || String(err),
          });
          continue;
        }
        if (nextFiles && typeof nextFiles === 'object') {
          for (const [p, c] of Object.entries(nextFiles)) {
            if (typeof c === 'string' && c !== out[p]) {
              out[p] = c;
              applied.push({ phase, id: rule.id, path: p });
            }
          }
        }
      }

      for (const rule of phaseRules) {
        if (typeof rule.fix !== 'function') continue;
        if (!this._isEnabled(rule, ctx)) continue;

        for (const path of Object.keys(out)) {
          const content = out[path];
          if (typeof content !== 'string' || content.length === 0) continue;
          if (rule.applyTo && !rule.applyTo.test(path)) continue;

          let next = null;
          try {
            next = rule.fix(content, { ...ctx, path });
          } catch (err) {
            // 单条规则失败不得阻断整条流水线——确定性修复是「尽力而为」，失败交由下游校验兜底
            this._warn(`规则执行异常已跳过: ${rule.id}`, {
              path,
              error: err?.message || String(err),
            });
            continue;
          }

          if (typeof next === 'string' && next !== content) {
            out[path] = next;
            applied.push({ phase, id: rule.id, path });
          }
        }
      }
    }

    if (applied.length > 0) {
      this._info(`确定性修复完成（${applied.length} 处）`, {
        byPhase: applied.reduce((acc, a) => {
          acc[a.phase] = (acc[a.phase] || 0) + 1;
          return acc;
        }, {}),
      });
    }

    return { files: out, applied };
  }

  /**
   * 只执行清洗阶段（CLEAN）。
   * 用于「模型输出解析后立刻清洗」——这是修复时机错位的关键入口：
   * 清洗必须早于任何注入/修复/校验，否则模型输出夹带的说明文本会污染后续所有环节。
   * @param {Object<string,string>} files
   * @param {Object} [extraContext]
   */
  applyCleanOnly(files, extraContext = {}) {
    const ctx = { ...this.context, ...extraContext, files };
    const out = { ...files };
    const applied = [];

    for (const rule of this.rules.filter((r) => r.phase === FIX_PHASE.CLEAN)) {
      if (typeof rule.fix !== 'function') continue;
      if (!this._isEnabled(rule, ctx)) continue;
      for (const path of Object.keys(out)) {
        const content = out[path];
        if (typeof content !== 'string' || content.length === 0) continue;
        if (rule.applyTo && !rule.applyTo.test(path)) continue;
        let next = null;
        try {
          next = rule.fix(content, { ...ctx, path });
        } catch (err) {
          this._warn(`清洗规则执行异常已跳过: ${rule.id}`, {
            path,
            error: err?.message || String(err),
          });
          continue;
        }
        if (typeof next === 'string' && next !== content) {
          out[path] = next;
          applied.push({ phase: FIX_PHASE.CLEAN, id: rule.id, path });
        }
      }
    }

    return { files: out, applied };
  }
}

export default CodeFixPipeline;
