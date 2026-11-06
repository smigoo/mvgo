import { ComponentService } from './component.service';
export type CommitType = 'feat' | 'fix' | 'refactor' | 'test' | 'word' | 'conf';
export interface GitCommitInfo {
    code: string;
    reqcode: string;
    type: CommitType;
    note: string;
    aiCoding?: boolean;
}
export interface PushToGitLabOptions {
    identifier: string;
    userId: string;
    repoUrl: string;
    branch: string;
    accessToken: string;
    commitMessage?: string;
    commit?: GitCommitInfo;
}
export declare class GitlabPushService {
    private readonly componentService;
    private readonly logger;
    private readonly http;
    constructor(componentService: ComponentService);
    pushComponent(options: PushToGitLabOptions): Promise<{
        success: boolean;
        message: string;
        data: {
            projectPath: string;
            branch: string;
            componentId: string;
            files: number;
            commitId: string;
            commitMessage: string;
            webUrl: string;
        };
    }>;
    private resolveComponentDir;
    private _listTempGroupIds;
    private _findTempComponentDir;
    private collectFiles;
    private parseRepoUrl;
    private resolveProjectId;
    private gitlabGet;
    private gitlabPost;
    private throwGitlabError;
    private branchExists;
    private createBranch;
    proxyGitLabGet(accessToken: string, endpoint: string): Promise<any>;
    listProjects(accessToken: string): Promise<{
        id: number;
        name: string;
        pathWithNamespace: string;
        httpUrlToRepo: string;
    }[]>;
    listBranches(accessToken: string, repoUrl: string): Promise<{
        name: string;
        isDefault: boolean;
    }[]>;
    private listTree;
}
