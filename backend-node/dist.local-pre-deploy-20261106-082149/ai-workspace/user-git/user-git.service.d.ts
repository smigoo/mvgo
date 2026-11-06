import { Model } from 'mongoose';
import { AiGitCredentialDocument } from '../schemas/ai-git-credential.schema';
import { SaveGitCredentialDto } from './dto/user-git.dto';
export declare class AiUserGitService {
    private credentialModel;
    private readonly logger;
    constructor(credentialModel: Model<AiGitCredentialDocument>);
    getStatus(userId: string): Promise<{
        configured: boolean;
        type?: undefined;
        description?: undefined;
        updatedAt?: undefined;
    } | {
        configured: boolean;
        type: string;
        description: string;
        updatedAt: any;
    }>;
    getToken(userId: string): Promise<{
        configured: boolean;
        token: string;
    }>;
    save(userId: string, dto: SaveGitCredentialDto): Promise<{
        configured: boolean;
        type: string;
    }>;
    delete(userId: string): Promise<{
        configured: boolean;
    }>;
}
