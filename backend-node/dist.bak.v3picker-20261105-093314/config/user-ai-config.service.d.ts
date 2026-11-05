import { Model } from 'mongoose';
import { UserAiConfigDocument } from '../schemas/user-ai-config.schema';
export declare class UserAiConfigService {
    private readonly model;
    private readonly logger;
    constructor(model: Model<UserAiConfigDocument>);
    saveUserConfig(userId: string, input: Record<string, any>): Promise<void>;
    findAll(): Promise<UserAiConfigDocument[]>;
    getUserConfig(userId: string): Promise<Record<string, any> | null>;
    getModelVerifications(userId: string): Promise<Record<string, {
        text: boolean;
        vision: boolean;
        at: number;
    }>>;
    recordModelVerification(userId: string, bindKey: string, result: {
        text: boolean;
        vision: boolean;
    }): Promise<void>;
}
