/**
 * GenerationContext - 生成上下文值对象
 * 
 * 让档位/类型/资源映射成为一等公民字段，不再靠 sessionId 正则反推。
 * 
 * 设计目标：
 * - 消灭"漏传/漂移"类 bug（编译期可检查）
 * - 加新档位只改此类一处
 * - 工程师类从 ctx 读取配置，不再从散字段推断
 */

import { TierProfile } from './tier-profile.js'

export class GenerationContext {
  /**
   * @param {Object} params
   * @param {'max'|'lite'|'dev'|'pro'} params.tier - 生成档位
   * @param {'microcode'|'vue3'|'html'} params.componentType - 组件类型
   * @param {string} params.componentId - 组件 ID
   * @param {Array} params.resourceDomMapping - 资源映射表
   * @param {string} params.outputPath - 输出路径
   * @param {Array} params.previousCritiques - 历史审查记录
   * @param {string} params.sessionId - 会话 ID
   * @param {string} params.groupId - 群组 ID（Vue3 workspace 定位）
   * @param {string} params.sourceType - 输入来源：screenshot|figma|html
   * @param {Object} params.configSnapshot - 配置快照
   */
  constructor({
    tier,
    componentType,
    componentId,
    resourceDomMapping,
    outputPath,
    previousCritiques,
    sessionId,
    groupId,
    sourceType,
    configSnapshot,
    tierProfile = null
  }) {
    this.tier = tier;
    this.componentType = componentType;
    this.componentId = componentId;
    this.resourceDomMapping = resourceDomMapping || [];
    this.outputPath = outputPath;
    this.previousCritiques = previousCritiques || [];
    this.sessionId = sessionId;
    this.groupId = groupId;
    this.sourceType = sourceType;
    this.configSnapshot = configSnapshot;
    this.tierProfile = tierProfile || GenerationContext.resolveTierProfile(tier);
  }

  /**
   * 按档位解析 TierProfile（委托 TierProfile.resolve，fail-safe）
   * @param {'max'|'lite'|'dev'|'pro'} tier
   * @returns {TierProfile}
   */
  static resolveTierProfile(tier) {
    return TierProfile.resolve(tier);
  }

  /**
   * 从旧式 task 元数据构造（兼容过渡期）
   * @param {Object} taskMeta - 旧式 task 元数据
   * @returns {GenerationContext}
   */
  static fromTaskMeta(taskMeta) {
    return new GenerationContext({
      tier: taskMeta.generationTier,
      componentType: taskMeta.target || 'microcode',
      componentId: taskMeta.componentId,
      resourceDomMapping: taskMeta.resourceDomMapping,
      outputPath: taskMeta.outputPath,
      previousCritiques: taskMeta.previousCritiques,
      sessionId: taskMeta.sessionId,
      groupId: taskMeta.groupId,
      sourceType: taskMeta.sourceType,
      configSnapshot: taskMeta.configSnapshot,
      tierProfile: GenerationContext.resolveTierProfile(taskMeta.generationTier)
    });
  }

  /**
   * 转换为旧式 task 元数据（兼容过渡期）
   * @returns {Object}
   */
  toTaskMeta() {
    return {
      generationTier: this.tier,
      target: this.componentType,
      componentId: this.componentId,
      resourceDomMapping: this.resourceDomMapping,
      outputPath: this.outputPath,
      previousCritiques: this.previousCritiques,
      sessionId: this.sessionId,
      groupId: this.groupId,
      sourceType: this.sourceType,
      configSnapshot: this.configSnapshot,
      tierProfile: this.tierProfile
    };
  }

  /**
   * 是否为 lite 档位
   */
  isLite() {
    return this.tier === 'lite';
  }

  /**
   * 是否为 max 档位
   */
  isMax() {
    return this.tier === 'max';
  }

  /**
   * 是否为微码组件
   */
  isMicrocode() {
    return this.componentType === 'microcode';
  }

  /**
   * 是否为 Vue3 组件
   */
  isVue3() {
    return this.componentType === 'vue3';
  }

  /**
   * 获取档位标签（用于日志/调试）
   */
  getTierLabel() {
    const labels = {
      max: 'Max',
      lite: 'Lite',
      dev: 'Dev',
      pro: 'Pro'
    };
    return labels[this.tier] || this.tier;
  }

  /**
   * 获取组件类型标签（用于日志/调试）
   */
  getComponentTypeLabel() {
    const labels = {
      microcode: '微码',
      vue3: 'Vue3',
      html: 'HTML'
    };
    return labels[this.componentType] || this.componentType;
  }
}
