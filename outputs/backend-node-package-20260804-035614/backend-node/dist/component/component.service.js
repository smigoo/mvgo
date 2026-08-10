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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const component_schema_1 = require("../schemas/component.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const workspace_config_1 = require("../config/workspace.config");
const tasks_service_1 = require("../tasks/tasks.service");
let ComponentService = class ComponentService {
    componentModel;
    groupMemberModel;
    tasksService;
    constructor(componentModel, groupMemberModel, tasksService) {
        this.componentModel = componentModel;
        this.groupMemberModel = groupMemberModel;
        this.tasksService = tasksService;
    }
    async createComponent(name, description, groupId, creatorId, metadata) {
        const component = new this.componentModel({
            componentId: metadata?.componentId || metadata?.sessionId,
            taskId: metadata?.taskId || metadata?.sessionId,
            target: metadata?.target || (metadata?.type === 'vue3' ? 'vue3' : 'microcode'),
            name,
            description,
            groupId: mongoose_2.Types.ObjectId.isValid(groupId) ? new mongoose_2.Types.ObjectId(groupId) : groupId,
            creatorId: mongoose_2.Types.ObjectId.isValid(creatorId) ? new mongoose_2.Types.ObjectId(creatorId) : creatorId,
            metadata,
        });
        await component.save();
        return component;
    }
    async getGroupComponents(groupId, userId) {
        const filter = { groupId };
        if (userId) {
            filter.creatorId = mongoose_2.Types.ObjectId.isValid(userId)
                ? new mongoose_2.Types.ObjectId(userId)
                : userId;
        }
        return this.componentModel.find(filter).sort({ createdAt: -1 }).exec();
    }
    async listComponents(query, userId) {
        const { groupId, search, creator = 'all', sortBy = 'lastEdited', page = 1, pageSize = 12, } = query;
        const filter = {};
        if (userId) {
            filter.creatorId = mongoose_2.Types.ObjectId.isValid(userId)
                ? new mongoose_2.Types.ObjectId(userId)
                : userId;
        }
        if (groupId) {
            filter.groupId = mongoose_2.Types.ObjectId.isValid(groupId)
                ? new mongoose_2.Types.ObjectId(groupId)
                : groupId;
        }
        if (creator === 'me' && userId && !filter.creatorId) {
            filter.creatorId = userId;
        }
        if (search) {
            filter.name = { $regex: search, $options: 'i' };
        }
        const sortOptions = {};
        if (sortBy === 'lastEdited') {
            sortOptions.updatedAt = -1;
        }
        else if (sortBy === 'created') {
            sortOptions.createdAt = -1;
        }
        else if (sortBy === 'name') {
            sortOptions.name = 1;
        }
        const safePageSize = Math.min(Math.max(pageSize, 1), 60);
        const safePage = Math.max(page, 1);
        const skip = (safePage - 1) * safePageSize;
        const [components, total] = await Promise.all([
            this.componentModel
                .find(filter)
                .select('_id componentId taskId target name groupId creatorId metadata createdAt updatedAt')
                .populate('creatorId', 'username email')
                .sort(sortOptions)
                .skip(skip)
                .limit(safePageSize)
                .lean()
                .exec(),
            this.componentModel.countDocuments(filter).exec(),
        ]);
        return {
            components: components.map((component) => this.toLibraryListItem(component)),
            total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.ceil(total / safePageSize),
        };
    }
    toLibraryListItem(component) {
        const metadata = component?.metadata || {};
        const componentId = component.componentId || metadata.componentId || metadata.sessionId || component._id?.toString();
        const target = component.target || metadata.target || (metadata.type === 'vue3' ? 'vue3' : 'microcode');
        const quality = this.extractComponentQuality(component, metadata);
        const groupId = component.groupId?.toString?.() || component.groupId;
        return {
            _id: component._id?.toString?.() || component._id,
            componentId,
            taskId: component.taskId || metadata.taskId || metadata.sessionId,
            target,
            name: component.name,
            groupId,
            creatorId: component.creatorId,
            qualityGate: quality.qualityGate,
            qualityScore: quality.qualityScore,
            runtimePass: quality.runtimePass,
            visualPass: quality.visualPass,
            previewUrl: this.buildStandardPreviewUrl(componentId),
            metadata: {
                componentId,
                sessionId: metadata.sessionId,
                target,
                type: metadata.type,
            },
            createdAt: component.createdAt,
            updatedAt: component.updatedAt,
        };
    }
    extractComponentQuality(component, metadata) {
        const quality = metadata?.quality || {};
        const taskId = component.taskId || metadata?.taskId || metadata?.sessionId;
        const task = taskId ? this.tasksService.getTask(taskId) : undefined;
        const result = task?.result || metadata?.result || {};
        const checkResult = result?.checkResult || metadata?.checkResult || {};
        const runtimeGate = result?.runtimeGate || metadata?.runtimeGate;
        const visualReport = result?.visualComparisonReport || metadata?.visualComparisonReport;
        return {
            qualityGate: task?.qualityGate || metadata?.qualityGate || quality.qualityGate || 'warned',
            qualityScore: quality.qualityScore ?? metadata?.qualityScore ?? checkResult?.qualityScore ?? result?.finalQualityScore,
            runtimePass: quality.runtimePass ?? metadata?.runtimePass ?? (runtimeGate ? runtimeGate.status === 'PASS' : undefined),
            visualPass: quality.visualPass ?? metadata?.visualPass ?? (visualReport ? visualReport.pass === true : undefined),
        };
    }
    buildStandardPreviewUrl(componentId) {
        if (!componentId)
            return undefined;
        return '/api/component/' + encodeURIComponent(componentId) + '/file?path=resources/images/mc-preview.png&raw=1';
    }
    async getComponentById(componentId, userId) {
        if (!mongoose_2.Types.ObjectId.isValid(componentId)) {
            throw new common_1.NotFoundException('组件不存在');
        }
        const component = await this.componentModel.findById(componentId);
        if (!component) {
            throw new common_1.NotFoundException('组件不存在');
        }
        if (userId) {
            await this.checkComponentAccess(component, userId);
        }
        return component;
    }
    async getComponentBySessionId(sessionId, userId) {
        const filter = {
            $or: [
                { componentId: sessionId },
                { taskId: sessionId },
                { 'metadata.componentId': sessionId },
                { 'metadata.sessionId': sessionId },
            ],
        };
        if (userId) {
            filter.creatorId = mongoose_2.Types.ObjectId.isValid(userId)
                ? new mongoose_2.Types.ObjectId(userId)
                : userId;
        }
        const component = await this.componentModel.findOne(filter);
        if (component) {
            return component;
        }
        const task = this.tasksService.getTask(sessionId);
        if (task && (!task.userId || task.userId === userId)) {
            return {
                componentId: task.componentId || task.sessionId,
                taskId: task.sessionId,
                target: task.target === 'vue3' ? 'vue3' : 'microcode',
                name: task.componentName || task.componentId || task.sessionId,
                description: '',
                groupId: task.groupId,
                creatorId: task.userId,
                metadata: {
                    componentId: task.componentId || task.sessionId,
                    sessionId: task.sessionId,
                    taskId: task.sessionId,
                    target: task.target === 'vue3' ? 'vue3' : 'microcode',
                    fallback: true,
                },
            };
        }
        throw new common_1.NotFoundException('未找到该 sessionId 对应的组件记录');
    }
    async resolveAuthorizedComponent(identifier, userId, mode) {
        let component = null;
        if (mongoose_2.Types.ObjectId.isValid(identifier)) {
            component = await this.componentModel.findById(identifier);
        }
        if (!component) {
            component = await this.componentModel.findOne({
                $or: [
                    { componentId: identifier },
                    { taskId: identifier },
                    { 'metadata.componentId': identifier },
                    { 'metadata.sessionId': identifier },
                ],
            });
        }
        if (component) {
            if (mode === 'write') {
                await this.checkComponentPermission(component, userId);
            }
            else {
                await this.checkComponentAccess(component, userId);
            }
            return {
                component,
                componentId: component.componentId || component.metadata?.componentId ||
                    component.metadata?.sessionId || identifier,
                groupId: component.groupId?.toString(),
                target: component.target || component.metadata?.target ||
                    (component.metadata?.type === 'vue3' ? 'vue3' : 'microcode'),
            };
        }
        const task = this.tasksService.getTaskByComponentId(identifier);
        if (task && task.userId === userId) {
            return {
                componentId: task.componentId,
                groupId: task.groupId,
                target: task.target,
            };
        }
        throw new common_1.ForbiddenException('无权访问此组件或组件尚未登记归属');
    }
    async authorizeWorkspaceComponent(identifier, userId, mode = 'read') {
        return this.resolveAuthorizedComponent(identifier, userId, mode);
    }
    async updateComponent(componentId, name, description, metadata, userId) {
        if (!mongoose_2.Types.ObjectId.isValid(componentId)) {
            throw new common_1.NotFoundException('组件不存在');
        }
        const component = await this.componentModel.findById(componentId);
        if (!component) {
            throw new common_1.NotFoundException('组件不存在');
        }
        await this.checkComponentPermission(component, userId);
        component.name = name;
        component.description = description;
        component.metadata = metadata;
        await component.save();
        return component;
    }
    async deleteComponent(componentId, userId) {
        if (!mongoose_2.Types.ObjectId.isValid(componentId)) {
            throw new common_1.NotFoundException('组件不存在');
        }
        const component = await this.componentModel.findById(componentId);
        if (!component) {
            throw new common_1.NotFoundException('组件不存在');
        }
        await this.checkComponentPermission(component, userId);
        await this.tasksService.removeComponentCascade(componentId, userId);
        await this.componentModel.findByIdAndDelete(componentId);
    }
    async batchDeleteComponents(componentIds, userId) {
        let deleted = 0;
        let failed = 0;
        for (const componentId of componentIds) {
            try {
                if (!mongoose_2.Types.ObjectId.isValid(componentId)) {
                    failed++;
                    continue;
                }
                const component = await this.componentModel.findById(componentId);
                if (!component) {
                    failed++;
                    continue;
                }
                await this.checkComponentPermission(component, userId);
                await this.tasksService.removeComponentCascade(componentId, userId);
                await this.componentModel.findByIdAndDelete(componentId);
                deleted++;
            }
            catch {
                failed++;
            }
        }
        return { deleted, failed };
    }
    async checkGroupMembership(groupId, userId) {
        const membership = await this.groupMemberModel.findOne({ groupId, userId });
        if (!membership) {
            throw new common_1.ForbiddenException('您不是该群组成员');
        }
    }
    async checkComponentPermission(component, userId) {
        const groupId = component.groupId.toString();
        const creatorId = component.creatorId.toString();
        if (creatorId === userId) {
            return;
        }
        const membership = await this.groupMemberModel.findOne({ groupId, userId });
        if (!membership || membership.role !== 'admin') {
            throw new common_1.ForbiddenException('只有创建者或管理员可以修改组件');
        }
    }
    async checkComponentAccess(component, userId) {
        const creatorId = component.creatorId?.toString();
        if (creatorId === userId) {
            return;
        }
        const groupId = component.groupId?.toString();
        if (groupId) {
            const membership = await this.groupMemberModel.findOne({ groupId, userId });
            if (membership && membership.role === 'admin') {
                return;
            }
        }
        throw new common_1.ForbiddenException('无权访问此组件');
    }
    async resolveComponentBaseDirs(componentId, location) {
        const dirs = [];
        if (location?.target === 'vue3' && location.groupId) {
            dirs.push((0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', location.groupId, componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', location.groupId, componentId));
        }
        if (location?.target === 'microcode') {
            dirs.push((0, path_1.join)(process.cwd(), 'workspace', 'custom-components', componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', componentId));
        }
        const task = this.tasksService.getTaskByComponentId(componentId);
        if (task?.outputPath) {
            const allowedTempRoots = [
                (0, path_1.join)(process.cwd(), 'temp-components'),
                (0, path_1.join)(process.cwd(), '..', 'temp-components'),
            ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`);
            const normalizedOutputPath = `${(0, path_1.resolve)(task.outputPath)}${path_1.sep}`;
            if (allowedTempRoots.some((root) => normalizedOutputPath.startsWith(root))) {
                dirs.push(task.outputPath);
            }
        }
        dirs.push((0, path_1.join)(process.cwd(), 'workspace', 'custom-components', componentId));
        try {
            const tempBase = (0, path_1.join)(process.cwd(), 'temp-components');
            const groups = await (0, promises_1.readdir)(tempBase, { withFileTypes: true });
            for (const group of groups) {
                if (group.isDirectory()) {
                    const componentDir = (0, path_1.join)(tempBase, group.name, componentId);
                    try {
                        await (0, promises_1.stat)(componentDir);
                        dirs.push(componentDir);
                    }
                    catch {
                    }
                }
            }
        }
        catch {
        }
        try {
            const vue3Base = (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components');
            const groups = await (0, promises_1.readdir)(vue3Base, { withFileTypes: true });
            for (const group of groups) {
                if (group.isDirectory()) {
                    const componentDir = (0, path_1.join)(vue3Base, group.name, componentId);
                    try {
                        await (0, promises_1.stat)(componentDir);
                        dirs.push(componentDir);
                    }
                    catch {
                    }
                }
            }
        }
        catch {
        }
        const frontendBase = (0, workspace_config_1.resolveFrontendWorkspace)();
        try {
            const fwCustomDir = (0, path_1.join)(frontendBase, 'custom-components', componentId);
            try {
                await (0, promises_1.stat)(fwCustomDir);
                dirs.push(fwCustomDir);
            }
            catch {
            }
            const fwVue3Base = (0, path_1.join)(frontendBase, 'vue3-components');
            try {
                const groups = await (0, promises_1.readdir)(fwVue3Base, { withFileTypes: true });
                for (const group of groups) {
                    if (group.isDirectory()) {
                        const componentDir = (0, path_1.join)(fwVue3Base, group.name, componentId);
                        try {
                            await (0, promises_1.stat)(componentDir);
                            dirs.push(componentDir);
                        }
                        catch {
                        }
                    }
                }
            }
            catch {
            }
        }
        catch {
        }
        return dirs;
    }
    resolveSafeFilePath(baseDir, filePath) {
        const resolvedBase = (0, path_1.resolve)(baseDir);
        const resolvedPath = (0, path_1.resolve)(resolvedBase, filePath);
        if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path_1.sep}`)) {
            throw new common_1.ForbiddenException('非法文件路径');
        }
        return resolvedPath;
    }
    async getComponentFiles(componentId, userId) {
        const authorized = userId
            ? await this.resolveAuthorizedComponent(componentId, userId, 'read')
            : { componentId };
        const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
        const merged = new Map();
        for (const baseDir of baseDirs) {
            try {
                const files = [];
                await this.traverseDirectory(baseDir, '', files);
                for (const f of files) {
                    merged.set(f.path, f);
                }
            }
            catch {
            }
        }
        return Array.from(merged.values());
    }
    async traverseDirectory(dirPath, basePath, files) {
        const entries = await (0, promises_1.readdir)(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = (0, path_1.join)(dirPath, entry.name);
            const relativePath = basePath
                ? `${basePath}/${entry.name}`
                : entry.name;
            if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                continue;
            }
            if (entry.isDirectory()) {
                await this.traverseDirectory(fullPath, relativePath, files);
            }
            else {
                const ext = (0, path_1.extname)(entry.name).toLowerCase();
                let fileType = 'text';
                if (ext === '.vue')
                    fileType = 'vue';
                else if (ext === '.js' || ext === '.ts')
                    fileType = 'javascript';
                else if (ext === '.json')
                    fileType = 'json';
                else if (ext === '.md')
                    fileType = 'markdown';
                else if (ext === '.less' || ext === '.css')
                    fileType = 'css';
                else if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext))
                    fileType = 'image';
                files.push({
                    name: entry.name,
                    path: relativePath,
                    type: fileType,
                });
            }
        }
    }
    normalizeVue3Entry(baseDirs, filePath) {
        if (filePath !== 'index.vue')
            return filePath;
        for (const dir of baseDirs) {
            if ((0, fs_1.existsSync)((0, path_1.join)(dir, 'package', 'index.vue')))
                return 'package/index.vue';
        }
        return filePath;
    }
    async resolveComponentFilePath(componentId, filePath, userId) {
        const authorized = userId
            ? await this.resolveAuthorizedComponent(componentId, userId, 'read')
            : { componentId };
        const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
        const normalizedPath = this.normalizeVue3Entry(baseDirs, filePath);
        const candidates = baseDirs.map((dir) => this.resolveSafeFilePath(dir, normalizedPath));
        for (const fullPath of candidates) {
            try {
                const fileStat = await (0, promises_1.stat)(fullPath);
                if (fileStat.isFile())
                    return fullPath;
            }
            catch {
            }
        }
        throw new common_1.NotFoundException(`文件不存在: ${filePath}`);
    }
    async getFileContent(componentId, filePath, userId) {
        const fullPath = await this.resolveComponentFilePath(componentId, filePath, userId);
        return (0, promises_1.readFile)(fullPath, 'utf-8');
    }
    async saveFileContent(componentId, filePath, content, userId) {
        const authorized = userId
            ? await this.resolveAuthorizedComponent(componentId, userId, 'write')
            : { componentId };
        const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
        const normalizedPath = this.normalizeVue3Entry(baseDirs, filePath);
        let saved = false;
        let lastError = null;
        for (const baseDir of baseDirs) {
            if (baseDir.includes('temp-components'))
                continue;
            try {
                await (0, promises_1.stat)(baseDir);
                const fullPath = this.resolveSafeFilePath(baseDir, normalizedPath);
                await (0, promises_1.mkdir)((0, path_1.dirname)(fullPath), { recursive: true });
                await (0, promises_1.writeFile)(fullPath, content, 'utf-8');
                saved = true;
            }
            catch (error) {
                lastError = error;
            }
        }
        if (!saved) {
            throw new common_1.NotFoundException(`文件保存失败: ${normalizedPath}`);
        }
    }
    async getComponentDeclare(componentId, userId) {
        const authorized = userId
            ? await this.resolveAuthorizedComponent(componentId, userId, 'read')
            : { componentId };
        const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
        for (const baseDir of baseDirs) {
            try {
                const declarePath = (0, path_1.join)(baseDir, 'declare.json');
                const content = await (0, promises_1.readFile)(declarePath, 'utf-8');
                return JSON.parse(content);
            }
            catch {
            }
        }
        throw new common_1.NotFoundException(`未找到 declare.json: ${componentId}`);
    }
};
exports.ComponentService = ComponentService;
exports.ComponentService = ComponentService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(component_schema_1.Component.name)),
    __param(1, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        tasks_service_1.TasksService])
], ComponentService);
//# sourceMappingURL=component.service.js.map