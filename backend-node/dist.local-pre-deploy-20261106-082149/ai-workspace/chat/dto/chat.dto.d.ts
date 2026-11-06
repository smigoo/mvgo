export declare class CreateSessionDto {
    projectId: string;
    title?: string;
    skillId?: string;
    modelProvider?: string;
    modelName?: string;
}
export declare class SaveMessageDto {
    sessionId: string;
    documentId?: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    generatedContent: string;
    skills?: string[];
    modelProvider?: string;
    modelName?: string;
}
export declare class UpdateSessionDto {
    title?: string;
}
