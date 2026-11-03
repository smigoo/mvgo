import { TasksService } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { ComponentService } from '../component/component.service';
import { TokenTrackerService } from '../token-usage/token-tracker.service';
import { GenerateVue3Dto } from './dto/generate-vue3.dto';
import { AiConfigService } from '../config/config.service';
import { Model } from 'mongoose';
import { GroupMemberDocument } from '../schemas/group-member.schema';
import { QuotaService } from '../quota/quota.service';
export declare class Vue3Service {
    private readonly tasksService;
    private readonly progressService;
    private readonly componentService;
    private readonly tokenTrackerService;
    private readonly aiConfigService;
    private readonly quotaService;
    private groupMemberModel;
    private readonly logger;
    constructor(tasksService: TasksService, progressService: ProgressService, componentService: ComponentService, tokenTrackerService: TokenTrackerService, aiConfigService: AiConfigService, quotaService: QuotaService, groupMemberModel: Model<GroupMemberDocument>);
    startGeneration(sessionId: string, dto: GenerateVue3Dto, groupId: string, userId?: string): Promise<void>;
    private executeGeneration;
    private copyToWorkspaceVue3;
    private resolveFigmaToken;
    private ensurePreviewImage;
    private validateVue3Less;
}
