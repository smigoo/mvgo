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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskCodeSnapshotService = exports.collectMissingVueImports = exports.resolveRelativeModulePath = exports.extractRelativeVueImports = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path_1 = require("path");
const backend_root_1 = require("../config/backend-root");
const rename_with_copy_fallback_js_1 = require("../ai-engine/utils/rename-with-copy-fallback.js");
const MAX_FILE_COUNT = 200;
const MAX_SINGLE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp|svg)$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SAFE_REVISION = /^r-[a-f0-9-]{36}$/;
function countLines(content) {
    const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
    if (text.length === 0)
        return 0;
    let lines = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n')
            lines++;
    }
    if (!text.endsWith('\n'))
        lines++;
    return lines;
}
const STRIP_STYLE_FENCE_RE = /^[ \t]*```[^\r\n]*$/gm;
function sanitizeStyleFenceLeak(path, content) {
    if (/\.(?:less|css)$/i.test(path)) {
        const text = content.toString('utf-8');
        const stripped = text.replace(STRIP_STYLE_FENCE_RE, '');
        return stripped === text ? content : Buffer.from(stripped, 'utf-8');
    }
    if (/\.vue$/i.test(path)) {
        const text = content.toString('utf-8');
        const lines = text.split('\n');
        const closeRe = /^[ \t]*<\/(?:template|script|style)>[ \t]*$/;
        let lastClose = -1;
        for (let i = 0; i < lines.length; i++) {
            if (closeRe.test(lines[i]))
                lastClose = i;
        }
        if (lastClose >= 0 && lastClose < lines.length - 1) {
            const tail = lines.slice(lastClose + 1).join('\n').trim();
            if (tail && !/^<!--[\s\S]*-->$/.test(tail)) {
                return Buffer.from(lines.slice(0, lastClose + 1).join('\n') + '\n', 'utf-8');
            }
        }
    }
    return content;
}
const vue_import_closure_js_1 = require("../ai-engine/utils/vue-import-closure.js");
var vue_import_closure_js_2 = require("../ai-engine/utils/vue-import-closure.js");
Object.defineProperty(exports, "extractRelativeVueImports", { enumerable: true, get: function () { return vue_import_closure_js_2.extractRelativeVueImports; } });
Object.defineProperty(exports, "resolveRelativeModulePath", { enumerable: true, get: function () { return vue_import_closure_js_2.resolveRelativeModulePath; } });
Object.defineProperty(exports, "collectMissingVueImports", { enumerable: true, get: function () { return vue_import_closure_js_2.collectMissingVueImports; } });
let TaskCodeSnapshotService = class TaskCodeSnapshotService {
    root = (0, path_1.resolve)(backend_root_1.tempComponentsDir, '.task-code-snapshots');
    constructor() {
        (0, fs_1.mkdirSync)(this.root, { recursive: true });
    }
    createCandidate(input) {
        this.assertSafeId(input.sessionId, 'sessionId');
        this.assertSafeId(input.componentId, 'componentId');
        if (input.groupId)
            this.assertSafeId(input.groupId, 'groupId');
        const entries = Object.entries(input.files);
        if (entries.length === 0)
            throw new Error('候选快照没有可保存的文件');
        if (entries.length > MAX_FILE_COUNT) {
            throw new Error(`候选快照文件数超过限制：${entries.length}/${MAX_FILE_COUNT}`);
        }
        const revision = `r-${(0, crypto_1.randomUUID)()}`;
        const sessionDir = this.getSessionDir(input.sessionId);
        const revisionsDir = (0, path_1.resolve)(sessionDir, 'revisions');
        const tempDir = (0, path_1.resolve)(revisionsDir, `.tmp-${revision}-${(0, crypto_1.randomUUID)()}`);
        const revisionDir = (0, path_1.resolve)(revisionsDir, revision);
        (0, fs_1.mkdirSync)(tempDir, { recursive: true });
        const files = [];
        let totalBytes = 0;
        try {
            for (const [rawPath, rawContent] of entries) {
                const path = this.normalizeRelativePath(rawPath);
                const rawBuffer = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent, 'utf8');
                const content = sanitizeStyleFenceLeak(path, rawBuffer);
                const isImage = IMAGE_EXT_RE.test(path);
                const sizeLimit = isImage ? MAX_IMAGE_FILE_BYTES : MAX_SINGLE_FILE_BYTES;
                if (content.byteLength > sizeLimit) {
                    throw new Error(`文件超过单文件限制：${path} (${(content.byteLength / 1024 / 1024).toFixed(2)}MB > ${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`);
                }
                totalBytes += content.byteLength;
                if (totalBytes > MAX_TOTAL_BYTES)
                    throw new Error('候选快照总大小超过限制');
                const absolutePath = this.resolveInside(tempDir, path);
                (0, fs_1.mkdirSync)((0, path_1.dirname)(absolutePath), { recursive: true });
                (0, fs_1.writeFileSync)(absolutePath, content, { flag: 'wx' });
                files.push({
                    path,
                    size: content.byteLength,
                    hash: (0, crypto_1.createHash)('sha256').update(content).digest('hex'),
                    lines: countLines(content),
                });
            }
            files.sort((a, b) => a.path.localeCompare(b.path));
            const lastGoodRevision = this.readPointer(input.sessionId, 'last-good')?.revision;
            const manifest = {
                version: 1,
                sessionId: input.sessionId,
                componentId: input.componentId,
                groupId: input.groupId,
                target: input.target,
                revision,
                status: 'candidate',
                createdAt: new Date().toISOString(),
                stage: input.stage,
                files,
                validation: {
                    semantics: 'pending',
                    sfc: 'pending',
                    less: 'pending',
                    runtime: 'pending',
                },
                lastGoodRevision,
            };
            (0, fs_1.writeFileSync)((0, path_1.resolve)(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), {
                encoding: 'utf8',
                flag: 'wx',
            });
            (0, rename_with_copy_fallback_js_1.renameWithCopyFallback)(tempDir, revisionDir, { label: '候选快照 revision 落名' });
            this.writePointer(input.sessionId, 'candidate', revision);
            return manifest;
        }
        catch (error) {
            try {
                (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
            }
            catch { }
            throw error;
        }
    }
    getCandidateManifest(sessionId) {
        const pointer = this.readPointer(sessionId, 'candidate');
        if (!pointer)
            return null;
        const manifest = this.getManifest(sessionId, pointer.revision);
        return manifest.status === 'candidate' || manifest.status === 'validating'
            ? manifest
            : null;
    }
    getLatestManifest(sessionId) {
        return this.getCandidateManifest(sessionId) || this.getLastGoodManifest(sessionId);
    }
    getLastGoodManifest(sessionId) {
        const pointer = this.readPointer(sessionId, 'last-good');
        return pointer ? this.getManifest(sessionId, pointer.revision) : null;
    }
    isRenderableRevision(sessionId, revision) {
        try {
            const manifest = this.getManifest(sessionId, revision);
            const idx = manifest.files.find((f) => f.path === 'package/index.vue');
            if (!idx)
                return false;
            const revisionDir = this.getRevisionDir(sessionId, revision);
            const absolutePath = this.resolveInside(revisionDir, 'package/index.vue');
            if (!(0, fs_1.existsSync)(absolutePath))
                return false;
            const content = (0, fs_1.readFileSync)(absolutePath, 'utf-8');
            if (!/<template[\s>]/.test(content))
                return false;
            return this.isVueImportClosureComplete(revisionDir, manifest, 'package/index.vue');
        }
        catch {
            return false;
        }
    }
    isVueImportClosureComplete(revisionDir, manifest, entryPath) {
        const known = new Set((manifest.files || []).map((f) => f.path));
        const readFile = (path) => {
            if (!known.has(path))
                return null;
            try {
                return (0, fs_1.readFileSync)(this.resolveInside(revisionDir, path), 'utf-8');
            }
            catch {
                return null;
            }
        };
        return (0, vue_import_closure_js_1.collectMissingVueImports)(entryPath, readFile).length === 0;
    }
    resolvePreviewRevision(sessionId, revision) {
        if (this.isRenderableRevision(sessionId, revision))
            return revision;
        const lastGood = this.getLastGoodManifest(sessionId);
        if (lastGood && this.isRenderableRevision(sessionId, lastGood.revision)) {
            return lastGood.revision;
        }
        return revision;
    }
    resolvePublishSourceDir(sessionId) {
        const order = ['candidate', 'partial', 'last-good'];
        for (const type of order) {
            const pointer = this.readPointer(sessionId, type);
            if (!pointer?.revision)
                continue;
            try {
                const dir = this.getRevisionDir(sessionId, pointer.revision);
                if ((0, fs_1.existsSync)((0, path_1.resolve)(dir, 'package', 'index.vue'))) {
                    return { dir, revision: pointer.revision };
                }
            }
            catch {
            }
        }
        return null;
    }
    getManifest(sessionId, revision) {
        const revisionDir = this.getRevisionDir(sessionId, revision);
        const manifestPath = (0, path_1.resolve)(revisionDir, 'manifest.json');
        if (!(0, fs_1.existsSync)(manifestPath))
            throw new Error('代码快照不存在');
        const stat = (0, fs_1.lstatSync)(manifestPath);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error('代码快照清单非法');
        const manifest = JSON.parse((0, fs_1.readFileSync)(manifestPath, 'utf8'));
        if (manifest.sessionId !== sessionId || manifest.revision !== revision) {
            throw new Error('代码快照清单与请求不匹配');
        }
        return manifest;
    }
    hasManifest(sessionId, revision) {
        try {
            this.getManifest(sessionId, revision);
            return true;
        }
        catch {
            return false;
        }
    }
    readPreviewFile(sessionId, revision, rawPath) {
        const effective = this.resolvePreviewRevision(sessionId, revision);
        const manifest = this.getManifest(sessionId, effective);
        if (!['candidate', 'validating', 'last-good', 'partial'].includes(manifest.status)) {
            throw new Error('该代码快照未通过预览状态校验');
        }
        return this.readFileContentOrFallback(sessionId, effective, rawPath);
    }
    readFile(sessionId, revision, rawPath) {
        const effective = this.resolvePreviewRevision(sessionId, revision);
        const manifest = this.getManifest(sessionId, effective);
        return this.readFileContentOrFallback(sessionId, effective, rawPath);
    }
    readFileContentOrFallback(sessionId, revision, rawPath) {
        const manifest = this.getManifest(sessionId, revision);
        try {
            return this.readManifestFile(manifest, sessionId, revision, rawPath);
        }
        catch (err) {
            const msg = String(err?.message || '');
            if (/快照文件不存在|文件不存在/.test(msg)) {
                const ws = this.resolveWorkspaceFile(sessionId, revision, rawPath);
                if (ws) {
                    console.warn(`[TaskCodeSnapshot] 预览文件在快照中缺失，回退 workspace 同路径：${sessionId}/${revision}/${rawPath}`);
                    return ws;
                }
            }
            throw err;
        }
    }
    resolveWorkspaceFile(sessionId, revision, rawPath) {
        try {
            const manifest = this.getManifest(sessionId, revision);
            const componentId = manifest.componentId;
            if (!componentId)
                return null;
            const rel = this.normalizeRelativePath(rawPath);
            const baseDir = (0, path_1.resolve)(backend_root_1.customComponentsDir, componentId);
            const abs = (0, path_1.resolve)(baseDir, ...rel.split('/'));
            if (!`${abs}${path_1.sep}`.startsWith(`${(0, path_1.resolve)(baseDir)}${path_1.sep}`))
                return null;
            if (!(0, fs_1.existsSync)(abs))
                return null;
            const stat = (0, fs_1.lstatSync)(abs);
            if (!stat.isFile() || stat.isSymbolicLink())
                return null;
            return (0, fs_1.readFileSync)(abs);
        }
        catch {
            return null;
        }
    }
    exportRevisionFiles(sessionId, revision) {
        this.reconcileRevisionIntegrity(sessionId, revision);
        const manifest = this.getManifest(sessionId, revision);
        const result = {};
        for (const file of manifest.files || []) {
            result[file.path] = this
                .readManifestFile(manifest, sessionId, revision, file.path)
                .toString('utf-8');
        }
        return result;
    }
    updateValidation(sessionId, revision, validation, rejectionReason) {
        return this.updateManifest(sessionId, revision, {
            validation,
            rejectionReason: rejectionReason ? rejectionReason.slice(0, 1000) : undefined,
        });
    }
    readManifestFile(manifest, sessionId, revision, rawPath) {
        const path = this.normalizeRelativePath(rawPath);
        if (!manifest.files.some((file) => file.path === path))
            throw new Error('快照文件不存在');
        const revisionDir = this.getRevisionDir(sessionId, revision);
        const absolutePath = this.resolveInside(revisionDir, path);
        const stat = (0, fs_1.lstatSync)(absolutePath);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error('快照文件非法');
        const content = (0, fs_1.readFileSync)(absolutePath);
        const expected = manifest.files.find((file) => file.path === path);
        if (!expected)
            throw new Error('快照文件不存在');
        const actualHash = (0, crypto_1.createHash)('sha256').update(content).digest('hex');
        if (expected.hash !== actualHash) {
            this.repairFileEntry(sessionId, revision, path, content.byteLength, actualHash);
        }
        return content;
    }
    reconcileRevisionIntegrity(sessionId, revision) {
        const manifest = this.getManifest(sessionId, revision);
        const revisionDir = this.getRevisionDir(sessionId, revision);
        const drifted = [];
        const nextFiles = (manifest.files || []).map((file) => {
            let absolutePath;
            try {
                absolutePath = this.resolveInside(revisionDir, file.path);
            }
            catch {
                return file;
            }
            if (!(0, fs_1.existsSync)(absolutePath))
                return file;
            let content;
            try {
                const stat = (0, fs_1.lstatSync)(absolutePath);
                if (!stat.isFile() || stat.isSymbolicLink())
                    return file;
                content = (0, fs_1.readFileSync)(absolutePath);
            }
            catch {
                return file;
            }
            const hash = (0, crypto_1.createHash)('sha256').update(content).digest('hex');
            if (hash === file.hash && content.byteLength === file.size)
                return file;
            drifted.push(`${file.path}(${file.size}->${content.byteLength})`);
            return { ...file, size: content.byteLength, hash };
        });
        if (drifted.length === 0)
            return [];
        console.warn(`[TaskCodeSnapshot] 完整性漂移已对账（以磁盘为准回写 manifest）：${sessionId}/${revision} :: ${drifted.join(', ')}`);
        this.updateManifest(sessionId, revision, { files: nextFiles });
        return drifted;
    }
    refreshRevisionFilesFromDisk(sessionId, revision, outputPath, relPaths) {
        const manifest = this.getManifest(sessionId, revision);
        const revisionDir = this.getRevisionDir(sessionId, revision);
        const refreshed = [];
        const files = [...(manifest.files || [])];
        for (const rel of relPaths) {
            let srcAbs;
            let dstAbs;
            try {
                srcAbs = this.resolveInside(outputPath, rel);
                dstAbs = this.resolveInside(revisionDir, rel);
            }
            catch {
                continue;
            }
            if (!(0, fs_1.existsSync)(srcAbs))
                continue;
            let content;
            try {
                const stat = (0, fs_1.lstatSync)(srcAbs);
                if (!stat.isFile() || stat.isSymbolicLink())
                    continue;
                content = (0, fs_1.readFileSync)(srcAbs);
            }
            catch {
                continue;
            }
            const hash = (0, crypto_1.createHash)('sha256').update(content).digest('hex');
            const idx = files.findIndex((f) => f.path === rel);
            if (idx >= 0 &&
                files[idx].hash === hash &&
                files[idx].size === content.byteLength) {
                continue;
            }
            (0, fs_1.mkdirSync)((0, path_1.dirname)(dstAbs), { recursive: true });
            (0, fs_1.writeFileSync)(dstAbs, content);
            const entry = {
                path: rel,
                size: content.byteLength,
                hash,
                lines: countLines(content),
            };
            if (idx >= 0)
                files[idx] = entry;
            else
                files.push(entry);
            refreshed.push(rel);
        }
        if (refreshed.length > 0) {
            this.updateManifest(sessionId, revision, { files });
            console.warn(`[TaskCodeSnapshot] 终态同源刷新（以磁盘为准）：${sessionId}/${revision} :: ${refreshed.join(', ')}`);
        }
        return refreshed;
    }
    repairFileEntry(sessionId, revision, filePath, size, hash) {
        try {
            const manifest = this.getManifest(sessionId, revision);
            const nextFiles = (manifest.files || []).map((file) => file.path === filePath ? { ...file, size, hash } : file);
            console.warn(`[TaskCodeSnapshot] 索引漂移自愈：${sessionId}/${revision}/${filePath}（size=${size}）已按磁盘内容回写 manifest`);
            this.updateManifest(sessionId, revision, { files: nextFiles });
        }
        catch (err) {
            console.warn(`[TaskCodeSnapshot] 索引漂移回写失败（非致命）：${err?.message || err}`);
        }
    }
    markValidating(sessionId, revision, validation) {
        return this.updateManifest(sessionId, revision, {
            status: 'validating',
            validation,
        });
    }
    publishLastGood(sessionId, revision, validation) {
        const manifest = this.updateManifest(sessionId, revision, {
            status: 'last-good',
            validation,
            lastGoodRevision: revision,
            rejectionReason: undefined,
        });
        this.writePointer(sessionId, 'last-good', revision);
        this.clearPointer(sessionId, 'candidate', revision);
        this.clearPointer(sessionId, 'partial', revision);
        return manifest;
    }
    markCandidateDegraded(sessionId, revision, reason, validation) {
        const lastGoodRevision = this.readPointer(sessionId, 'last-good')?.revision;
        return this.updateManifest(sessionId, revision, {
            status: 'candidate',
            validation,
            lastGoodRevision,
            rejectionReason: reason.slice(0, 1000),
        });
    }
    rejectCandidate(sessionId, revision, reason, validation) {
        const lastGoodRevision = this.readPointer(sessionId, 'last-good')?.revision;
        const manifest = this.updateManifest(sessionId, revision, {
            status: 'rejected',
            validation,
            lastGoodRevision,
            rejectionReason: reason.slice(0, 1000),
        });
        this.clearPointer(sessionId, 'partial', revision);
        return manifest;
    }
    markPartial(sessionId, revision, reason, validation) {
        const lastGoodRevision = this.readPointer(sessionId, 'last-good')?.revision;
        const current = this.getManifest(sessionId, revision);
        const existingPaths = new Set((current.files || []).map((f) => f.path));
        const requiredFiles = current.target === 'vue3'
            ? ['package/index.vue']
            : ['declare.json', 'package/index.vue'];
        const missingFiles = requiredFiles.filter((f) => !existingPaths.has(f));
        const manifest = this.updateManifest(sessionId, revision, {
            status: 'partial',
            validation,
            lastGoodRevision,
            rejectionReason: reason.slice(0, 1000),
            missingFiles,
        });
        this.writePointer(sessionId, 'partial', revision);
        return manifest;
    }
    getPartialManifest(sessionId) {
        const pointer = this.readPointer(sessionId, 'partial');
        if (!pointer)
            return null;
        const manifest = this.getManifest(sessionId, pointer.revision);
        return manifest.status === 'partial' ? manifest : null;
    }
    listRevisions(sessionId) {
        this.assertSafeId(sessionId, 'sessionId');
        const revisionsDir = (0, path_1.resolve)(this.getSessionDir(sessionId), 'revisions');
        if (!(0, fs_1.existsSync)(revisionsDir))
            return [];
        const entries = (0, fs_1.readdirSync)(revisionsDir, { withFileTypes: true });
        const manifests = [];
        for (const entry of entries) {
            if (!entry.isDirectory() || !SAFE_REVISION.test(entry.name))
                continue;
            try {
                manifests.push(this.getManifest(sessionId, entry.name));
            }
            catch {
            }
        }
        manifests.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return manifests;
    }
    rollbackToRevision(sessionId, revision) {
        const manifest = this.getManifest(sessionId, revision);
        if (!['candidate', 'validating', 'last-good', 'partial'].includes(manifest.status)) {
            throw new Error('该版本已拒绝或不可预览，无法回滚');
        }
        if (!this.isRenderableRevision(sessionId, revision)) {
            throw new Error('该版本产物不完整（缺 index.vue 或子组件 import 悬空），无法回滚');
        }
        this.writePointer(sessionId, 'last-good', revision);
        this.clearPointer(sessionId, 'candidate');
        this.clearPointer(sessionId, 'partial');
        return this.updateManifest(sessionId, revision, {
            status: 'last-good',
            lastGoodRevision: revision,
            rejectionReason: undefined,
        });
    }
    createEditedCandidate(sessionId, revision, filePath, content, editSource = 'playground') {
        this.assertSafeId(sessionId, 'sessionId');
        const source = this.getManifest(sessionId, revision);
        if (!['candidate', 'partial', 'validating', 'last-good'].includes(source.status)) {
            throw new Error('该代码快照当前不可编辑');
        }
        const normalizedPath = this.normalizeRelativePath(filePath);
        if (!source.files.some((file) => file.path === normalizedPath)) {
            throw new Error('只能编辑当前快照中已存在的文件');
        }
        const files = {};
        for (const file of source.files) {
            files[file.path] = this.readManifestFile(source, sessionId, revision, file.path);
        }
        files[normalizedPath] = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
        const next = this.createCandidate({
            sessionId,
            componentId: source.componentId,
            groupId: source.groupId,
            target: source.target,
            stage: 'playground-edit',
            files,
        });
        return this.updateManifest(sessionId, next.revision, {
            parentRevision: revision,
            editSource: String(editSource || 'playground').slice(0, 100),
            rejectionReason: undefined,
        });
    }
    createOverlayCandidate(sessionId, overlayFiles, opts) {
        this.assertSafeId(sessionId, 'sessionId');
        const base = opts.baseRevision
            ? this.getManifest(sessionId, opts.baseRevision)
            : this.getLatestManifest(sessionId);
        if (!base)
            return null;
        const files = {};
        for (const file of base.files) {
            files[file.path] = this.readFile(sessionId, base.revision, file.path);
        }
        for (const [rawPath, content] of Object.entries(overlayFiles)) {
            files[rawPath] = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
        }
        const next = this.createCandidate({
            sessionId,
            componentId: base.componentId,
            groupId: base.groupId,
            target: base.target,
            stage: opts.stage,
            files,
        });
        return this.updateManifest(sessionId, next.revision, {
            parentRevision: base.revision,
            editSource: String(opts.editSource || '').slice(0, 100),
        });
    }
    updateManifest(sessionId, revision, patch) {
        const manifest = this.getManifest(sessionId, revision);
        const next = { ...manifest, ...patch, revision, sessionId };
        const manifestPath = (0, path_1.resolve)(this.getRevisionDir(sessionId, revision), 'manifest.json');
        const tempPath = `${manifestPath}.tmp-${(0, crypto_1.randomUUID)()}`;
        (0, fs_1.writeFileSync)(tempPath, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'wx' });
        (0, rename_with_copy_fallback_js_1.renameWithCopyFallback)(tempPath, manifestPath, { label: '快照 manifest 原子写' });
        return next;
    }
    getSessionDir(sessionId) {
        this.assertSafeId(sessionId, 'sessionId');
        return (0, path_1.resolve)(this.root, sessionId);
    }
    getRevisionDir(sessionId, revision) {
        if (!SAFE_REVISION.test(revision))
            throw new Error('revision 格式非法');
        return (0, path_1.resolve)(this.getSessionDir(sessionId), 'revisions', revision);
    }
    readPointer(sessionId, type) {
        const pointerPath = (0, path_1.resolve)(this.getSessionDir(sessionId), `${type}.json`);
        if (!(0, fs_1.existsSync)(pointerPath))
            return null;
        const stat = (0, fs_1.lstatSync)(pointerPath);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error('快照指针非法');
        const pointer = JSON.parse((0, fs_1.readFileSync)(pointerPath, 'utf8'));
        if (!SAFE_REVISION.test(pointer.revision))
            throw new Error('快照指针 revision 非法');
        return pointer;
    }
    writePointer(sessionId, type, revision) {
        if (!SAFE_REVISION.test(revision))
            throw new Error('revision 格式非法');
        const sessionDir = this.getSessionDir(sessionId);
        (0, fs_1.mkdirSync)(sessionDir, { recursive: true });
        const pointerPath = (0, path_1.resolve)(sessionDir, `${type}.json`);
        const tempPath = `${pointerPath}.tmp-${(0, crypto_1.randomUUID)()}`;
        (0, fs_1.writeFileSync)(tempPath, JSON.stringify({ revision, updatedAt: new Date().toISOString() }, null, 2), { encoding: 'utf8', flag: 'wx' });
        (0, rename_with_copy_fallback_js_1.renameWithCopyFallback)(tempPath, pointerPath, { label: '快照 pointer 原子写' });
    }
    clearPointer(sessionId, type, expectedRevision) {
        const pointerPath = (0, path_1.resolve)(this.getSessionDir(sessionId), `${type}.json`);
        if (!(0, fs_1.existsSync)(pointerPath))
            return;
        const current = this.readPointer(sessionId, type);
        if (expectedRevision && current?.revision !== expectedRevision)
            return;
        try {
            (0, fs_1.rmSync)(pointerPath, { force: true });
        }
        catch (err) {
            console.warn(`[TaskCodeSnapshot] clearPointer 非致命：删除 ${pointerPath} 失败 - ${err?.message || err}`);
        }
    }
    assertSafeId(value, label) {
        if (!SAFE_ID.test(value))
            throw new Error(`${label} 格式非法`);
    }
    normalizeRelativePath(rawPath) {
        const path = String(rawPath || '').replaceAll('\\', '/').trim();
        if (!path || path.includes('\0') || (0, path_1.isAbsolute)(path))
            throw new Error('快照文件路径非法');
        const normalized = path_1.posix.normalize(path);
        if (normalized === '.' ||
            normalized === '..' ||
            normalized.startsWith('../') ||
            normalized.startsWith('/') ||
            normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
            throw new Error(`快照文件路径越界：${rawPath}`);
        }
        return normalized;
    }
    resolveInside(root, relativePath) {
        const normalizedRoot = `${(0, path_1.resolve)(root)}${path_1.sep}`;
        const absolutePath = (0, path_1.resolve)(root, ...relativePath.split('/'));
        if (!`${absolutePath}${path_1.sep}`.startsWith(normalizedRoot)) {
            throw new Error(`快照文件路径越界：${relativePath}`);
        }
        return absolutePath;
    }
};
exports.TaskCodeSnapshotService = TaskCodeSnapshotService;
exports.TaskCodeSnapshotService = TaskCodeSnapshotService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], TaskCodeSnapshotService);
//# sourceMappingURL=task-code-snapshot.service.js.map