import { Injectable } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';

/**
 * 任务失败自愈提示服务
 * 
 * 分析任务失败原因，生成修复建议，帮助用户快速解决问题。
 */

export type FailCategory = 
  | 'compile_error'      // 编译失败（语法错误、类型错误）
  | 'resource_missing'   // 资源加载失败（图片/字体 404）
  | 'model_capability'   // 模型能力不足（生成内容不完整）
  | 'timeout'            // 超时（Figma 限流、网络问题）
  | 'rate_limit'         // 速率限制（API 调用频率过高）
  | 'auth_error'         // 认证错误（API Key 无效）
  | 'validation_error'   // 校验失败（门禁未通过）
  | 'unknown';           // 未知错误

export interface FailureAnalysis {
  category: FailCategory;
  reason: string;
  suggestion: string;
  actionable: boolean;  // 是否可以一键执行（如换模型重试）
  actionType?: 'retry' | 'change_model' | 'simplify' | 'check_url';
  actionPayload?: any;
}

@Injectable()
export class SelfHealingService {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * 分析任务失败原因
   */
  analyzeFailure(sessionId: string): FailureAnalysis | null {
    const task = this.tasksService.getTask(sessionId);
    if (!task || task.status !== 'failed') {
      return null;
    }

    const error = task.error || '';
    const errorLower = error.toLowerCase();

    // 1. 编译错误
    if (this.isCompileError(errorLower)) {
      return {
        category: 'compile_error',
        reason: '代码编译失败',
        suggestion: '生成的代码存在语法或类型错误。建议切换到更强的模型（如 qwen3.7-plus 或 claude-sonnet-5），或简化组件结构。',
        actionable: true,
        actionType: 'change_model',
        actionPayload: {
          recommendedModels: ['qwen3.7-plus', 'claude-sonnet-5'],
          message: '使用推荐模型重试',
        },
      };
    }

    // 2. 资源加载失败
    if (this.isResourceError(errorLower)) {
      return {
        category: 'resource_missing',
        reason: '资源加载失败',
        suggestion: '设计稿中的图片或字体链接无法访问。请检查 Figma 设计稿中的资源链接是否可访问，或尝试使用本地资源。',
        actionable: true,
        actionType: 'check_url',
        actionPayload: {
          message: '检查 Figma URL',
        },
      };
    }

    // 3. 模型能力不足
    if (this.isModelCapabilityError(errorLower)) {
      return {
        category: 'model_capability',
        reason: '模型能力不足',
        suggestion: '当前模型无法完成复杂的组件生成。建议切换到 Max 模式，或使用更强的模型。',
        actionable: true,
        actionType: 'change_model',
        actionPayload: {
          recommendedModels: ['qwen3.7-plus', 'claude-sonnet-5', 'gpt-5.6-luna'],
          message: '使用更强模型重试',
        },
      };
    }

    // 4. 超时
    if (this.isTimeoutError(errorLower)) {
      return {
        category: 'timeout',
        reason: '任务执行超时',
        suggestion: '任务执行时间过长导致超时。可能是 Figma 设计稿过于复杂，或网络延迟较高。建议稍后重试，或简化设计稿。',
        actionable: true,
        actionType: 'retry',
        actionPayload: {
          message: '稍后重试',
        },
      };
    }

    // 5. 速率限制
    if (this.isRateLimitError(errorLower)) {
      return {
        category: 'rate_limit',
        reason: 'API 调用频率过高',
        suggestion: 'API 调用触发了速率限制。请等待几分钟后重试，或降低并发请求数。',
        actionable: true,
        actionType: 'retry',
        actionPayload: {
          message: '等待后重试',
          delayMinutes: 5,
        },
      };
    }

    // 6. 认证错误
    if (this.isAuthError(errorLower)) {
      return {
        category: 'auth_error',
        reason: 'API Key 认证失败',
        suggestion: 'API Key 无效或已过期。请检查配置中的 API Key 是否正确。',
        actionable: false,
      };
    }

    // 7. 校验失败
    if (this.isValidationError(errorLower)) {
      return {
        category: 'validation_error',
        reason: '质量校验未通过',
        suggestion: '生成的组件未通过质量门禁检查。建议调整生成参数，或手动修复后重新生成。',
        actionable: false,
      };
    }

    // 8. 未知错误
    return {
      category: 'unknown',
      reason: '未知错误',
      suggestion: '发生了未预期的错误。请查看任务日志获取详细信息，或联系管理员。',
      actionable: false,
    };
  }

  private isCompileError(error: string): boolean {
    return (
      error.includes('compile') ||
      error.includes('syntax') ||
      error.includes('type error') ||
      error.includes('typescript') ||
      error.includes('parsing') ||
      error.includes('unexpected token')
    );
  }

  private isResourceError(error: string): boolean {
    return (
      error.includes('resource') ||
      error.includes('404') ||
      error.includes('not found') ||
      error.includes('image') ||
      error.includes('font') ||
      error.includes('failed to load')
    );
  }

  private isModelCapabilityError(error: string): boolean {
    return (
      error.includes('capability') ||
      error.includes('too complex') ||
      error.includes('incomplete') ||
      error.includes('truncated') ||
      error.includes('model failed')
    );
  }

  private isTimeoutError(error: string): boolean {
    return (
      error.includes('timeout') ||
      error.includes('timed out') ||
      error.includes('exceeded')
    );
  }

  private isRateLimitError(error: string): boolean {
    return (
      error.includes('rate limit') ||
      error.includes('too many requests') ||
      error.includes('429')
    );
  }

  private isAuthError(error: string): boolean {
    return (
      error.includes('auth') ||
      error.includes('unauthorized') ||
      error.includes('401') ||
      error.includes('invalid api key') ||
      error.includes('forbidden')
    );
  }

  private isValidationError(error: string): boolean {
    return (
      error.includes('validation') ||
      error.includes('gate') ||
      error.includes('check failed') ||
      error.includes('quality')
    );
  }
}
