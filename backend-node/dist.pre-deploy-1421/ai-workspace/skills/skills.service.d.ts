import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { AiSkillDocument } from '../schemas/ai-skill.schema';
export declare class AiSkillsService implements OnModuleInit {
    private skillModel;
    private readonly logger;
    constructor(skillModel: Model<AiSkillDocument>);
    onModuleInit(): Promise<void>;
    seedPresetSkills(): Promise<void>;
    findAll(): Promise<AiSkillDocument[]>;
    findById(id: string): Promise<AiSkillDocument | null>;
}
