import { TasksService } from '../tasks/tasks.service';
import { ComponentService } from '../component/component.service';
import { TaskStatsService } from '../task-stats/task-stats.service';
import { DemoService } from '../demo/demo.service';
import { ApiBindingService } from '../vue3/api-binding.service';
import { SlotAnalyzerService } from '../vue3/slot-analyzer.service';
import { ApifoxService } from '../apifox/apifox.service';
import { WorkflowService } from '../workflow/workflow.service';
import { GitlabPushService } from '../component/gitlab-push.service';
import { Phase2Service } from '../phase2/phase2.service';
import { LiteService } from '../lite/lite.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentAnalysisService } from '../component/component-analysis.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';
export declare const WORKBENCH_TOOLS: ({
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                imageUrl: {
                    type: string;
                    description: string;
                };
                componentName: {
                    type: string;
                    description: string;
                };
                target: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                tier: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                figmaUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                figmaUrl: {
                    type: string;
                    description: string;
                };
                componentName: {
                    type: string;
                    description: string;
                };
                target: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                tier: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                imageUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                componentId: {
                    type: string;
                    description: string;
                };
                modification: {
                    type: string;
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                status: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                    default: number;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: never[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                componentId: {
                    type: string;
                    description: string;
                };
                apiPath: {
                    type: string;
                    description: string;
                };
                slotName: {
                    type: string;
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                componentIds: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                branch: {
                    type: string;
                    description: string;
                    default: string;
                };
                commitMessage: {
                    type: string;
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                filter: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                    default: number;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                status?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: never[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                timeRange: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: never[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                items: {
                    type: string;
                    items: {
                        type: string;
                        properties: {
                            source: {
                                type: string;
                                description: string;
                            };
                            name: {
                                type: string;
                                description: string;
                            };
                        };
                    };
                    description: string;
                };
                target: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                workflowId: {
                    type: string;
                    description: string;
                };
                params: {
                    type: string;
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                componentId?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                componentId: {
                    type: string;
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
                revision?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                componentId: {
                    type: string;
                    description: string;
                };
                revision: {
                    type: string;
                    description: string;
                };
                imageUrl?: undefined;
                componentName?: undefined;
                target?: undefined;
                tier?: undefined;
                figmaUrl?: undefined;
                modification?: undefined;
                status?: undefined;
                limit?: undefined;
                apiPath?: undefined;
                slotName?: undefined;
                componentIds?: undefined;
                branch?: undefined;
                commitMessage?: undefined;
                filter?: undefined;
                timeRange?: undefined;
                items?: undefined;
                workflowId?: undefined;
                params?: undefined;
            };
            required: string[];
        };
    };
})[];
export interface ToolContext {
    userId: string;
    tasksService: TasksService;
    componentService: ComponentService;
    taskStatsService: TaskStatsService;
    demoService: DemoService;
    apiBindingService: ApiBindingService;
    slotAnalyzer: SlotAnalyzerService;
    apifoxService: ApifoxService;
    workflowService: WorkflowService;
    gitlabPushService: GitlabPushService;
    phase2Service: Phase2Service;
    liteService: LiteService;
    queueService: TaskQueueService;
    progressService: ProgressService;
    componentAnalysisService: ComponentAnalysisService;
    taskCodeSnapshotService: TaskCodeSnapshotService;
    gitlabToken?: string;
    gitlabProjectUrl?: string;
}
export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    card?: {
        type: string;
        data: Record<string, any>;
    };
}
export declare const TOOL_EXECUTORS: Record<string, (args: any, ctx: ToolContext) => Promise<ToolResult>>;
export declare function executeTool(toolName: string, args: any, ctx: ToolContext): Promise<ToolResult>;
