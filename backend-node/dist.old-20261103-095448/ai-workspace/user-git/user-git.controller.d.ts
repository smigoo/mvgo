import { AiUserGitService } from './user-git.service';
import { SaveGitCredentialDto } from './dto/user-git.dto';
export declare class AiUserGitController {
    private readonly userGitService;
    constructor(userGitService: AiUserGitService);
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
    save(dto: SaveGitCredentialDto, userId: string): Promise<{
        configured: boolean;
        type: string;
    }>;
    delete(userId: string): Promise<{
        configured: boolean;
    }>;
}
