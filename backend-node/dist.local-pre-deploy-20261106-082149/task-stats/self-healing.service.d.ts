import { TasksService } from '../tasks/tasks.service';
export type FailCategory = 'compile_error' | 'resource_missing' | 'model_capability' | 'timeout' | 'rate_limit' | 'auth_error' | 'validation_error' | 'unknown';
export interface FailureAnalysis {
    category: FailCategory;
    reason: string;
    suggestion: string;
    actionable: boolean;
    actionType?: 'retry' | 'change_model' | 'simplify' | 'check_url';
    actionPayload?: any;
}
export declare class SelfHealingService {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    analyzeFailure(sessionId: string): FailureAnalysis | null;
    private isCompileError;
    private isResourceError;
    private isModelCapabilityError;
    private isTimeoutError;
    private isRateLimitError;
    private isAuthError;
    private isValidationError;
}
