import { Model } from 'mongoose';
import { GenerationMetricDocument, GenerationMetricStatus } from '../schemas/generation-metric.schema';
import { UserDocument } from '../schemas/user.schema';
import type { Task } from './tasks.service';
export declare function rootDomainOf(url?: string): string | undefined;
export declare class PipelineMetricsService {
    private readonly metricModel?;
    private readonly userModel?;
    private readonly logger;
    constructor(metricModel?: Model<GenerationMetricDocument> | undefined, userModel?: Model<UserDocument> | undefined);
    private excludedUids;
    recordTerminal(task: Task, status: GenerationMetricStatus, opts?: {
        cancelReason?: string;
    }): void;
    recordRevert(sessionId: string): void;
    private write;
}
