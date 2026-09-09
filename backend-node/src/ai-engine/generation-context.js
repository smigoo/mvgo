/**
 * 🏗️ GenerationContext + 生成流水线统一入口（P2-7 / P2-8，2026-08-28）
 *
 * 背景：此前一次组件生成涉及的状态散落在 generateCode 的局部变量、
 * state 图对象、input 参数、文件系统快照里——同一份信息多处副本，
 * 改一处漏一处，正是「清洗在写盘、校验在生成」这类时机错位的温床。
 *
 * GenerationContext 把一次生成所需的**全部上下文**收敛到一个对象：
 *   componentName / outputPath / resourceDomMapping / figmaNodeData / input / logger / onProgress
 * 流水线各阶段只依赖它，不再各自去 input 里掏字段。
 *
 * runGenerationPipeline 是正式的分层编排入口，明确固定顺序：
 *   ① 清洗（CLEAN）           —— 永远最先，剥掉模型输出的夹带
 *   ② 确定性修复（其余阶段）   —— 规则能修的，绝不麻烦模型
 *   ③ 视觉真值校验（VISUAL）   —— 拿 Figma 设计值比对，仅告警
 * 这三步的顺序本身就是本次全部故障的核心教训，集中在此处固化，避免再次漂移。
 */

import { CodeFixPipeline } from './validators/code-fix-pipeline.js';
import { registerBuiltinFixRules } from './validators/code-fix-rules.js';
import { validateVisualTruth } from './validators/visual-truth-validator.js';

/**
 * 一次组件生成的统一上下文
 */
export class GenerationContext {
  /**
   * @param {Object} init
   * @param {string} init.componentName
   * @param {string} init.outputPath
   * @param {Array}  [init.resourceDomMapping]
   * @param {Object} [init.figmaNodeData]
   * @param {Object} [init.input]
   * @param {Object} [init.logger]
   * @param {Function} [init.onProgress]
   */
  constructor(init = {}) {
    this.componentName = init.componentName || '';
    this.outputPath = init.outputPath || '';
    this.resourceDomMapping = init.resourceDomMapping || [];
    this.figmaNodeData = init.figmaNodeData || null;
    this.input = init.input || {};
    this.logger = init.logger || null;
    this.onProgress =
      typeof init.onProgress === 'function' ? init.onProgress : null;

    /** 各阶段产出，便于观测与排障 */
    this.stages = {
      clean: null,
      fix: null,
      visual: null,
    };
  }

  /** 从 prompt 入参（input）便捷构造 */
  static fromInput(input, extra = {}) {
    return new GenerationContext({
      componentName: input?.componentName,
      outputPath: input?.outputPath,
      resourceDomMapping: input?.resourceDomMapping,
      figmaNodeData: input?.figmaNodeData,
      input,
      logger: extra.logger || input?.logger,
      onProgress: extra.onProgress || input?.onProgress,
      ...extra,
    });
  }

  _logWarn(msg, extra) {
    this.logger?.warn?.(msg, extra);
  }
  _logInfo(msg, extra) {
    this.logger?.info?.(msg, extra);
  }
  _progress(payload) {
    try {
      this.onProgress?.(payload);
    } catch {
      /* 进度回调失败不影响生成 */
    }
  }
}

/**
 * 构建一条装好内置规则的流水线
 * @param {GenerationContext} ctx
 * @param {Object} engineer 规则实现宿主（MicrocodeEngineer / Vue3Engineer 实例）
 * @returns {CodeFixPipeline}
 */
export function createFixPipeline(ctx, engineer) {
  const pipeline = new CodeFixPipeline({
    logger: ctx.logger,
    context: {
      componentName: ctx.componentName,
      outputPath: ctx.outputPath,
    },
  });
  registerBuiltinFixRules(pipeline, engineer, {
    componentName: ctx.componentName,
    outputPath: ctx.outputPath,
    resourceDomMapping: ctx.resourceDomMapping,
    input: ctx.input,
  });
  return pipeline;
}

/**
 * 运行生成流水线：清洗 → 确定性修复 → 视觉真值校验
 *
 * 任何一步异常都不阻断后续步骤，也不抛出——确定性处理是「尽力而为」，
 * 最终质量由下游校验（validateAndFixGeneratedFiles / validateVueSfc）把关。
 *
 * @param {Object} files        路径 → 内容（模型产出）
 * @param {GenerationContext} ctx
 * @param {Object} engineer
 * @returns {{ files: Object<string,string>, ctx: GenerationContext }}
 */
export async function runGenerationPipeline(files, ctx, engineer) {
  let current = { ...(files || {}) };

  // ── ① 清洗：永远最先 ──
  try {
    const pipeline = createFixPipeline(ctx, engineer);
    const res = pipeline.applyCleanOnly(current, {
      componentName: ctx.componentName,
      outputPath: ctx.outputPath,
    });
    current = res.files;
    ctx.stages.clean = res.applied;
    if (res.applied.length > 0) {
      ctx._logWarn(`🧹 清洗层剥离了 ${res.applied.length} 处模型输出夹带`, {
        detail: res.applied,
      });
      ctx._progress({
        stage: '代码清洗',
        message: `🧹 已剥离 ${res.applied.length} 处模型输出夹带（说明性文本）`,
        status: 'warning',
        details: res.applied,
      });
    }
  } catch (err) {
    ctx._logWarn('清洗层执行失败（非阻断）', {
      error: err?.message || String(err),
    });
    ctx.stages.clean = [];
  }

  // ── ② 确定性修复：规则能修的，不麻烦模型 ──
  try {
    const pipeline = createFixPipeline(ctx, engineer);
    const res = pipeline.apply(current, {
      componentName: ctx.componentName,
      outputPath: ctx.outputPath,
    });
    current = res.files;
    ctx.stages.fix = res.applied;
    if (res.applied.length > 0) {
      const byPhase = res.applied.reduce((acc, a) => {
        acc[a.phase] = (acc[a.phase] || 0) + 1;
        return acc;
      }, {});
      ctx._logInfo(`🔧 确定性修复完成（${res.applied.length} 处）`, { byPhase });
      ctx._progress({
        stage: '确定性修复',
        message: `🔧 已应用 ${res.applied.length} 处确定性修复`,
        status: 'warning',
        details: res.applied,
      });
    }
  } catch (err) {
    ctx._logWarn('确定性修复执行失败（非阻断）', {
      error: err?.message || String(err),
    });
    ctx.stages.fix = [];
  }

  // ── ③ 视觉真值校验：仅告警 ──
  try {
    const res = validateVisualTruth(ctx.figmaNodeData, current);
    ctx.stages.visual = res.issues;
    if (res.issues.length > 0) {
      ctx._logWarn(`⚠️ 视觉真值校验发现 ${res.issues.length} 处偏差`, {
        issues: res.issues.map((i) => `${i.id}: ${i.message}`),
      });
      ctx._progress({
        stage: '视觉真值校验',
        message: `⚠️ ${res.issues.length} 处样式与 Figma 设计值存在偏差`,
        status: 'warning',
        details: res.issues,
      });
    }
  } catch (err) {
    ctx._logWarn('视觉真值校验执行失败（非阻断）', {
      error: err?.message || String(err),
    });
    ctx.stages.visual = [];
  }

  return { files: current, ctx };
}

export default {
  GenerationContext,
  createFixPipeline,
  runGenerationPipeline,
};
