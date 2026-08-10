import { ProgressService } from '../progress/progress.service';
import { TasksService } from '../tasks/tasks.service';
export declare class WorkflowService {
    private readonly progressService;
    private readonly tasksService;
    private readonly logger;
    private readonly workflowsDir;
    constructor(progressService: ProgressService, tasksService: TasksService);
    getHandlers(): {
        'figma-connector': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
        'visual-parser': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
        'layout-reviewer': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
        'style-mapper': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
        'microcode-engineer': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
                maxTokens: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
        'adversarial-checker': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
        'doc-analyzer': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
        'config-generator': {
            label: string;
            description: string;
            category: string;
            configSchema: {
                model: {
                    type: string;
                    label: string;
                    default: string;
                };
                temperature: {
                    type: string;
                    label: string;
                    default: number;
                    min: number;
                    max: number;
                    help: string;
                };
            };
        };
    };
    getNodeTypes(): {
        agent: {
            label: string;
            color: string;
            description: string;
        };
        condition: {
            label: string;
            color: string;
            description: string;
        };
        start: {
            label: string;
            color: string;
            description: string;
        };
        end: {
            label: string;
            color: string;
            description: string;
        };
    };
    getGraphTopology(type: string): {
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            name: string;
            label: string;
            description: string;
            isOriginal: boolean;
            entryNode: string;
            nodes: {
                id: string;
                label: string;
                type: string;
                handler: string;
                position: {
                    x: number;
                    y: number;
                };
                config: {};
            }[];
            edges: ({
                id: string;
                source: string;
                target: string;
                condition?: undefined;
                label?: undefined;
            } | {
                id: string;
                source: string;
                target: string;
                condition: string;
                label: string;
            })[];
        };
        error?: undefined;
    };
    list(): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    get(name: string): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    save(workflow: any): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
    }>;
    delete(name: string): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
    }>;
    run(name: string, params: {
        componentName: string;
        fileKey: string;
        nodeId: string;
        config?: Record<string, any>;
    }, userId?: string): Promise<{
        success: boolean;
        error: string;
        sessionId?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        sessionId: string;
        message: string;
        error?: undefined;
    }>;
    private executeWorkflow;
}
