"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelfHealingService = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("../tasks/tasks.service");
let SelfHealingService = class SelfHealingService {
    tasksService;
    constructor(tasksService) {
        this.tasksService = tasksService;
    }
    analyzeFailure(sessionId) {
        const task = this.tasksService.getTask(sessionId);
        if (!task || task.status !== 'failed') {
            return null;
        }
        const error = task.error || '';
        const errorLower = error.toLowerCase();
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
        if (this.isAuthError(errorLower)) {
            return {
                category: 'auth_error',
                reason: 'API Key 认证失败',
                suggestion: 'API Key 无效或已过期。请检查配置中的 API Key 是否正确。',
                actionable: false,
            };
        }
        if (this.isValidationError(errorLower)) {
            return {
                category: 'validation_error',
                reason: '质量校验未通过',
                suggestion: '生成的组件未通过质量门禁检查。建议调整生成参数，或手动修复后重新生成。',
                actionable: false,
            };
        }
        return {
            category: 'unknown',
            reason: '未知错误',
            suggestion: '发生了未预期的错误。请查看任务日志获取详细信息，或联系管理员。',
            actionable: false,
        };
    }
    isCompileError(error) {
        return (error.includes('compile') ||
            error.includes('syntax') ||
            error.includes('type error') ||
            error.includes('typescript') ||
            error.includes('parsing') ||
            error.includes('unexpected token'));
    }
    isResourceError(error) {
        return (error.includes('resource') ||
            error.includes('404') ||
            error.includes('not found') ||
            error.includes('image') ||
            error.includes('font') ||
            error.includes('failed to load'));
    }
    isModelCapabilityError(error) {
        return (error.includes('capability') ||
            error.includes('too complex') ||
            error.includes('incomplete') ||
            error.includes('truncated') ||
            error.includes('model failed'));
    }
    isTimeoutError(error) {
        return (error.includes('timeout') ||
            error.includes('timed out') ||
            error.includes('exceeded'));
    }
    isRateLimitError(error) {
        return (error.includes('rate limit') ||
            error.includes('too many requests') ||
            error.includes('429'));
    }
    isAuthError(error) {
        return (error.includes('auth') ||
            error.includes('unauthorized') ||
            error.includes('401') ||
            error.includes('invalid api key') ||
            error.includes('forbidden'));
    }
    isValidationError(error) {
        return (error.includes('validation') ||
            error.includes('gate') ||
            error.includes('check failed') ||
            error.includes('quality'));
    }
};
exports.SelfHealingService = SelfHealingService;
exports.SelfHealingService = SelfHealingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], SelfHealingService);
//# sourceMappingURL=self-healing.service.js.map