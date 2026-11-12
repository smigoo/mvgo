import { ProgressService } from '../progress/progress.service';
import { TasksService } from '../tasks/tasks.service';
import { Phase2Service } from '../phase2/phase2.service';
import { AiConfigService } from '../config/config.service';
export declare class WorkflowService {
    private readonly progressService;
    private readonly tasksService;
    private readonly phase2Service;
    private readonly aiConfigService;
    private readonly logger;
    private readonly nodeSnapshotStore;
    private readonly workflowsDir;
    constructor(progressService: ProgressService, tasksService: TasksService, phase2Service: Phase2Service, aiConfigService: AiConfigService);
    getHandlers(): {
        skills: {
            'figma-connector': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
            'hello-agent': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {
                    greeting: {
                        type: string;
                        label: string;
                        default: string;
                        help: string;
                    };
                };
            };
            'url-parser-agent': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'layout-refiner': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'style-refiner': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'layout-style-refiner': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'vue3-engineer': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
            };
            'screenshot-renderer': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
            };
            'visual-comparator': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
            };
            'subcomponent-planner': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
            };
        };
        handlers: {
            'figma-connector': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
                inputs: string[];
                outputs: string[];
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
            'hello-agent': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {
                    greeting: {
                        type: string;
                        label: string;
                        default: string;
                        help: string;
                    };
                };
            };
            'url-parser-agent': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'layout-refiner': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'style-refiner': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'layout-style-refiner': {
                label: string;
                description: string;
                category: string;
                inputs: string[];
                outputs: string[];
                configSchema: {};
            };
            'vue3-engineer': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
            };
            'screenshot-renderer': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
            };
            'visual-comparator': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
            };
            'subcomponent-planner': {
                label: string;
                description: string;
                category: string;
                configSchema: {};
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
        gate: {
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
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        data?: undefined;
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
        figmaUrl?: string;
        inputs?: Record<string, any>;
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
    getNodeSnapshots(sessionId: string): any[];
}
