export declare class InspectProjectDto {
    projectDir: string;
}
export declare class ScanProjectDto extends InspectProjectDto {
    note?: string;
}
export declare class FreezeProjectDto {
    runId: string;
}
export declare class SaveDecisionsDto {
    runId: string;
    entries: Array<{
        conflictId: string;
        choice: string;
        note?: string;
    }>;
}
