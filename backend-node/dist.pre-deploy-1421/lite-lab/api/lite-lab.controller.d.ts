import { LiteLabService } from './lite-lab.service';
import { RunLabDto } from './dto/run-lab.dto';
export declare class LiteLabController {
    private readonly service;
    private readonly logger;
    constructor(service: LiteLabService);
    run(dto: RunLabDto, req: any): Promise<{
        sessionId: string;
        fileKey: string;
        nodeId: string;
        componentType: "microcode" | "vue3";
        progressUrl: string;
        message: string;
        success: boolean;
    }>;
    report(sessionId: string, req: any): Promise<{
        success: boolean;
        report: import("./lite-lab.service").LabReportSummary & {
            edits?: any;
        };
    }>;
    artifact(sessionId: string, relPath: string, req: any, res: any): Promise<void>;
}
