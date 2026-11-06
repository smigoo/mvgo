"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var GitlabPushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitlabPushService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const promises_1 = require("fs/promises");
const path_1 = require("path");
const component_service_1 = require("./component.service");
const backend_root_1 = require("../config/backend-root");
const fs_1 = require("fs");
const component_resolver_js_1 = require("../ai-engine/utils/component-resolver.js");
function buildCommitMessage(commit) {
    const lines = [
        `#code#${commit.code || '0'}`,
        `#reqcode#${commit.reqcode || '0'}`,
        `#note#[${commit.type}] ${commit.note || ''}`,
        commit.aiCoding ? '#ai-coding#' : '',
    ].filter(Boolean);
    return lines.join('\n');
}
const SKIP_DIRS = new Set(['.checkpoint', '.mc-gen', '.cache', '.git', 'node_modules']);
const BINARY_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.zip', '.pdf', '.mp4', '.mp3', '.docx', '.xlsx', '.pptx',
]);
const TREE_PAGE_SIZE = 100;
let GitlabPushService = GitlabPushService_1 = class GitlabPushService {
    componentService;
    logger = new common_1.Logger(GitlabPushService_1.name);
    http;
    constructor(componentService) {
        this.componentService = componentService;
        this.http = axios_1.default.create({ timeout: 30_000, proxy: false });
    }
    async pushComponent(options) {
        const { identifier, userId, repoUrl, branch, accessToken, commitMessage } = options;
        if (!repoUrl?.trim() || !branch?.trim() || !accessToken?.trim()) {
            throw new common_1.HttpException('仓库URL、分支名称、Access Token 均为必填项', common_1.HttpStatus.BAD_REQUEST);
        }
        const authorized = await this.componentService.authorizeWorkspaceComponent(identifier, userId, 'read');
        const { componentId, groupId, target } = authorized;
        const workspacePath = await this.resolveComponentDir(componentId, groupId, target);
        if (!workspacePath) {
            throw new common_1.HttpException(`组件产物目录不存在: ${componentId}`, common_1.HttpStatus.NOT_FOUND);
        }
        const files = await this.collectFiles(workspacePath);
        if (files.length === 0) {
            throw new common_1.HttpException('组件目录为空，无文件可推送', common_1.HttpStatus.BAD_REQUEST);
        }
        const { apiBase, projectPath } = this.parseRepoUrl(repoUrl);
        const headers = { 'PRIVATE-TOKEN': accessToken.trim() };
        const projectId = await this.resolveProjectId(apiBase, projectPath, headers);
        const encodedProject = String(projectId);
        const projectInfo = await this.gitlabGet(`${apiBase}/projects/${encodedProject}`, headers);
        const defaultBranch = projectInfo?.default_branch || 'main';
        const targetBranch = branch.trim() || defaultBranch;
        const branchExists = await this.branchExists(apiBase, encodedProject, targetBranch, headers);
        if (!branchExists) {
            await this.createBranch(apiBase, encodedProject, targetBranch, defaultBranch, headers);
            this.logger.log(`自动创建分支 ${projectPath}#${targetBranch}（基于 ${defaultBranch}）`);
        }
        const existingFiles = new Set(await this.listTree(apiBase, encodedProject, targetBranch, headers));
        const actions = [];
        for (const file of files) {
            const filePath = `${componentId}/${file.relative}`;
            const buf = await (0, promises_1.readFile)(file.fullPath);
            const isBinary = BINARY_EXTS.has((0, path_1.extname)(file.fullPath).toLowerCase());
            actions.push({
                action: existingFiles.has(filePath) ? 'update' : 'create',
                file_path: filePath,
                ...(isBinary
                    ? { content: buf.toString('base64'), encoding: 'base64' }
                    : { content: buf.toString('utf-8') }),
            });
        }
        let resolvedCommitMessage;
        if (options.commit) {
            resolvedCommitMessage = buildCommitMessage(options.commit);
        }
        else {
            resolvedCommitMessage = commitMessage?.trim() || `feat: 新增组件 ${componentId}\n\n#code#0\n#reqcode#0\n#note#[feat] 新增组件 ${componentId}\n#ai-coding#`;
        }
        let commit;
        try {
            commit = await this.gitlabPost(`${apiBase}/projects/${encodedProject}/repository/commits`, headers, {
                branch: targetBranch,
                commit_message: resolvedCommitMessage,
                actions,
            });
        }
        catch (error) {
            const message = error instanceof common_1.HttpException ? error.message : String(error);
            throw new common_1.HttpException(`GitLab 提交失败: ${message}（若提示请求体过大，请压缩组件资源或改用本地 git 推送）`, common_1.HttpStatus.BAD_GATEWAY);
        }
        this.logger.log(`组件 ${componentId} 已推送到 ${projectPath}#${targetBranch}，共 ${files.length} 个文件`);
        return {
            success: true,
            message: `已推送到 ${projectPath}#${targetBranch}（${files.length} 个文件）`,
            data: {
                projectPath,
                branch: targetBranch,
                componentId,
                files: files.length,
                commitId: commit?.id ? commit.id.slice(0, 8) : '',
                commitMessage: commit?.title || resolvedCommitMessage,
                webUrl: commit?.web_url || projectInfo?.web_url || '',
            },
        };
    }
    async resolveComponentDir(componentId, groupId, target) {
        const strict = await (0, component_resolver_js_1.resolveComponentDirStrict)(componentId);
        if (strict &&
            ((0, fs_1.existsSync)((0, path_1.join)(strict, 'package', 'index.vue')) || (0, fs_1.existsSync)((0, path_1.join)(strict, 'declare.json')))) {
            return strict;
        }
        const bases = target === 'vue3' && groupId
            ? [
                (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, componentId),
                (0, path_1.join)((0, backend_root_1.frontendVue3ComponentsDir)(), groupId, componentId),
            ]
            : [
                (0, path_1.join)(backend_root_1.customComponentsDir, componentId),
                (0, path_1.join)((0, backend_root_1.frontendCustomComponentsDir)(), componentId),
            ];
        for (const base of bases) {
            try {
                if ((await (0, promises_1.stat)(base)).isDirectory())
                    return base;
            }
            catch {
            }
        }
        if ((0, fs_1.existsSync)(backend_root_1.tempComponentsDir)) {
            const groupIds = groupId ? [groupId] : await this._listTempGroupIds();
            for (const gid of groupIds) {
                const tempDir = await this._findTempComponentDir(backend_root_1.tempComponentsDir, gid, componentId);
                if (tempDir)
                    return tempDir;
            }
        }
        return null;
    }
    async _listTempGroupIds() {
        try {
            const entries = await (0, promises_1.readdir)(backend_root_1.tempComponentsDir, { withFileTypes: true });
            return entries
                .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_shared-cache')
                .map((entry) => entry.name);
        }
        catch {
            return [];
        }
    }
    async _findTempComponentDir(baseTemp, groupId, componentId) {
        const groupDir = (0, path_1.join)(baseTemp, groupId);
        const exact = (0, path_1.join)(groupDir, componentId);
        if ((0, fs_1.existsSync)(exact))
            return exact;
        try {
            const entries = await (0, promises_1.readdir)(groupDir, { withFileTypes: true });
            const match = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${componentId}-`));
            return match ? (0, path_1.join)(groupDir, match.name) : null;
        }
        catch {
            return null;
        }
    }
    async collectFiles(root) {
        const out = [];
        const walk = async (dir, rel) => {
            let entries;
            try {
                entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name))
                    continue;
                if (entry.name.includes('quality-backup'))
                    continue;
                const full = (0, path_1.join)(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(full, rel ? `${rel}/${entry.name}` : entry.name);
                }
                else {
                    if (entry.name === '_figma-size.json')
                        continue;
                    out.push({
                        relative: rel ? `${rel}/${entry.name}` : entry.name,
                        fullPath: full,
                    });
                }
            }
        };
        await walk(root, '');
        return out.sort((a, b) => a.relative.localeCompare(b.relative));
    }
    parseRepoUrl(repoUrl) {
        const trimmed = repoUrl.trim();
        let host = '';
        let path = '';
        let m;
        if ((m = trimmed.match(/^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+?)(?:\.git)?$/))) {
            host = m[1];
            path = m[2];
        }
        else if ((m = trimmed.match(/^https?:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?$/))) {
            host = m[1];
            path = m[2];
        }
        else if ((m = trimmed.match(/^(?:[^@/]+@)?([^/:]+):(.+?)(?:\.git)?$/))) {
            host = m[1];
            path = m[2];
        }
        else {
            throw new common_1.HttpException(`无法解析仓库地址: ${repoUrl}（支持 ssh://、https://、git@host:path 三种格式）`, common_1.HttpStatus.BAD_REQUEST);
        }
        path = path.replace(/\/+$/, '');
        if (!path || !path.includes('/')) {
            throw new common_1.HttpException(`仓库地址缺少项目路径（需含组，如 opensource/mvgo/components）: ${repoUrl}`, common_1.HttpStatus.BAD_REQUEST);
        }
        let apiBase;
        if (host === 'scm.microvideo.cn') {
            apiBase = `https://scm.microvideo.cn/gitlab/api/v4`;
            if (path.startsWith('gitlab/'))
                path = path.slice('gitlab/'.length);
        }
        else if (path.startsWith('gitlab/')) {
            apiBase = `https://${host}/gitlab/api/v4`;
            path = path.slice('gitlab/'.length);
        }
        else {
            apiBase = `https://${host}/api/v4`;
        }
        return { apiBase, projectPath: path };
    }
    async resolveProjectId(apiBase, projectPath, headers) {
        try {
            const info = await this.gitlabGet(`${apiBase}/projects/${encodeURIComponent(projectPath)}`, headers);
            return info.id;
        }
        catch (error) {
            if (!(error instanceof common_1.HttpException && error.getStatus() === common_1.HttpStatus.NOT_FOUND)) {
                throw error;
            }
        }
        const idx = projectPath.lastIndexOf('/');
        if (idx > 0) {
            const groupPath = projectPath.slice(0, idx);
            const repoName = projectPath.slice(idx + 1);
            const groupName = groupPath.slice(groupPath.lastIndexOf('/') + 1);
            const groups = await this.gitlabGet(`${apiBase}/groups?search=${encodeURIComponent(groupName)}&per_page=50`, headers);
            const group = (groups || []).find((g) => g.full_path === groupPath);
            if (group?.id) {
                const items = await this.gitlabGet(`${apiBase}/groups/${group.id}/projects?search=${encodeURIComponent(repoName)}&simple=true&per_page=50`, headers);
                const hit = (items || []).find((p) => p.path_with_namespace === projectPath);
                if (hit)
                    return hit.id;
            }
        }
        throw new common_1.HttpException(`GitLab 项目不存在或无访问权限: ${projectPath}（请检查 Token 与仓库路径）`, common_1.HttpStatus.BAD_REQUEST);
    }
    async gitlabGet(url, headers) {
        try {
            const res = await this.http.get(url, { headers });
            return res.data;
        }
        catch (error) {
            this.throwGitlabError(error, url);
        }
    }
    async gitlabPost(url, headers, body) {
        try {
            const res = await this.http.post(url, body, { headers });
            return res.data;
        }
        catch (error) {
            this.throwGitlabError(error, url);
        }
    }
    throwGitlabError(error, url) {
        const status = error?.response?.status;
        const detail = error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            '未知错误';
        const message = Array.isArray(detail) ? detail.join('; ') : detail;
        if (status === 404) {
            throw new common_1.HttpException(`GitLab 资源不存在(404): ${url}`, common_1.HttpStatus.NOT_FOUND);
        }
        if (status === 401 || status === 403) {
            throw new common_1.HttpException(`GitLab 鉴权失败(${status}): Token 无效或无权限，${message}`, common_1.HttpStatus.BAD_REQUEST);
        }
        throw new common_1.HttpException(`GitLab 请求失败(${status || '网络'}): ${message}`, status ? common_1.HttpStatus.BAD_GATEWAY : common_1.HttpStatus.GATEWAY_TIMEOUT);
    }
    async branchExists(apiBase, encodedProject, branch, headers) {
        const items = await this.gitlabGet(`${apiBase}/projects/${encodedProject}/repository/branches?search=${encodeURIComponent(branch)}&per_page=100`, headers);
        return (items || []).some((b) => b.name === branch);
    }
    async createBranch(apiBase, encodedProject, branch, ref, headers) {
        try {
            await this.gitlabPost(`${apiBase}/projects/${encodedProject}/repository/branches`, headers, { branch, ref });
        }
        catch (error) {
            if (await this.branchExists(apiBase, encodedProject, branch, headers))
                return;
            throw error;
        }
    }
    async proxyGitLabGet(accessToken, endpoint) {
        if (!accessToken?.trim() || !endpoint?.trim()) {
            throw new common_1.HttpException('Access Token 和 endpoint 必填', common_1.HttpStatus.BAD_REQUEST);
        }
        const headers = { 'PRIVATE-TOKEN': accessToken.trim() };
        const apiBase = 'https://scm.microvideo.cn/gitlab/api/v4';
        return await this.gitlabGet(`${apiBase}${endpoint}`, headers);
    }
    async listProjects(accessToken) {
        if (!accessToken?.trim()) {
            throw new common_1.HttpException('Access Token 必填', common_1.HttpStatus.BAD_REQUEST);
        }
        const headers = { 'PRIVATE-TOKEN': accessToken.trim() };
        const apiBase = 'https://scm.microvideo.cn/gitlab/api/v4';
        const projects = await this.gitlabGet(`${apiBase}/projects?membership=true&per_page=100&order_by=last_activity_at`, headers);
        return (projects || []).map((p) => ({
            id: p.id,
            name: p.name,
            pathWithNamespace: p.path_with_namespace,
            httpUrlToRepo: p.http_url_to_repo,
        }));
    }
    async listBranches(accessToken, repoUrl) {
        if (!accessToken?.trim() || !repoUrl?.trim()) {
            throw new common_1.HttpException('Access Token 和 项目 URL 必填', common_1.HttpStatus.BAD_REQUEST);
        }
        const { apiBase, projectPath } = this.parseRepoUrl(repoUrl);
        const headers = { 'PRIVATE-TOKEN': accessToken.trim() };
        const projectId = await this.resolveProjectId(apiBase, projectPath, headers);
        const branches = await this.gitlabGet(`${apiBase}/projects/${projectId}/repository/branches?per_page=100`, headers);
        return (branches || []).map((b) => ({
            name: b.name,
            isDefault: !!b.default,
        }));
    }
    async listTree(apiBase, encodedProject, branch, headers) {
        const paths = [];
        let page = 1;
        for (;;) {
            const url = `${apiBase}/projects/${encodedProject}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=${TREE_PAGE_SIZE}&page=${page}`;
            const items = await this.gitlabGet(url, headers);
            for (const item of items) {
                if (item?.path)
                    paths.push(item.path);
            }
            if (items.length < TREE_PAGE_SIZE)
                break;
            page += 1;
        }
        return paths;
    }
};
exports.GitlabPushService = GitlabPushService;
exports.GitlabPushService = GitlabPushService = GitlabPushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [component_service_1.ComponentService])
], GitlabPushService);
//# sourceMappingURL=gitlab-push.service.js.map