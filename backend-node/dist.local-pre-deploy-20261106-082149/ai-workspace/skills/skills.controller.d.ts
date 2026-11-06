import { AiSkillsService } from './skills.service';
export declare class AiSkillsController {
    private readonly skillsService;
    private readonly logger;
    constructor(skillsService: AiSkillsService);
    findAll(): Promise<{
        data: import("../schemas/ai-skill.schema").AiSkillDocument[];
    }>;
}
