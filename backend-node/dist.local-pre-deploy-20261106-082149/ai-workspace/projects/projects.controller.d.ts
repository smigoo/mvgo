import { AiProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
export declare class AiProjectsController {
    private readonly projectsService;
    private readonly logger;
    constructor(projectsService: AiProjectsService);
    findAll(userId: string): Promise<{
        data: import("../schemas/ai-project.schema").AiProjectDocument[];
    }>;
    findOne(id: string, userId: string): Promise<{
        data: import("../schemas/ai-project.schema").AiProjectDocument;
    }>;
    create(dto: CreateProjectDto, userId: string): Promise<{
        data: import("../schemas/ai-project.schema").AiProjectDocument;
    }>;
    update(id: string, dto: UpdateProjectDto, userId: string): Promise<{
        data: import("../schemas/ai-project.schema").AiProjectDocument;
    }>;
    archive(id: string, userId: string): Promise<{
        success: boolean;
    }>;
}
