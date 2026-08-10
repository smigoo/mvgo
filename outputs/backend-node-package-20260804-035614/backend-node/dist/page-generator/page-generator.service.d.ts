import { TasksService } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentService } from '../component/component.service';
import { GeneratePageDto } from './dto/generate-page.dto';
export declare class PageGeneratorService {
    private readonly tasksService;
    private readonly progressService;
    private readonly componentService;
    private readonly logger;
    constructor(tasksService: TasksService, progressService: ProgressService, componentService: ComponentService);
    startPageGeneration(sessionId: string, dto: GeneratePageDto, groupId: string, userId?: string): Promise<void>;
    private executePageGeneration;
    retryGeneration(originalSessionId: string, config?: {
        model?: string;
        endpoint?: string;
        apiKey?: string;
    }, userId?: string): Promise<{
        success: boolean;
        sessionId: string;
        originalSessionId: string;
        message: string;
    }>;
    private executeRetry;
    private generateSingleComponent;
    analyzePage(fileKey: string, nodeId: string, config?: any): Promise<any>;
    private precompileCss;
    private copyToWorkspace;
}
