import { Model } from 'mongoose';
import { OperationLogDocument } from './operation-log.schema';
export declare class OperationLogService {
    private readonly model;
    private readonly logger;
    constructor(model: Model<OperationLogDocument>);
    record(entry: {
        userId?: string | null;
        method: string;
        path: string;
        query?: Record<string, any>;
        body?: Record<string, any>;
        statusCode: number;
        ip?: string;
        durationMs: number;
        userAgent?: string;
        errorMessage?: string;
    }): Promise<void>;
}
