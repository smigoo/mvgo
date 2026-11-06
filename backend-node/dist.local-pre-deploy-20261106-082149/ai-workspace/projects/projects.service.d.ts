import { Model } from 'mongoose';
import { AiProjectDocument } from '../schemas/ai-project.schema';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
export declare class AiProjectsService {
    private projectModel;
    private readonly logger;
    constructor(projectModel: Model<AiProjectDocument>);
    findAll(userId: string): Promise<AiProjectDocument[]>;
    findById(id: string, userId?: string): Promise<AiProjectDocument | null>;
    create(dto: CreateProjectDto, userId: string): Promise<AiProjectDocument>;
    update(id: string, dto: UpdateProjectDto, userId?: string): Promise<AiProjectDocument | null>;
    archive(id: string, userId?: string): Promise<AiProjectDocument | null>;
}
