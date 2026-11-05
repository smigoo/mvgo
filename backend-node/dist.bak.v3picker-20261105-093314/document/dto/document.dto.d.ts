export declare class CreateDocumentDto {
    title: string;
    content: string;
    type?: string;
    tags?: string[];
}
export declare class UpdateDocumentDto {
    title?: string;
    content?: string;
    tags?: string[];
    status?: string;
}
