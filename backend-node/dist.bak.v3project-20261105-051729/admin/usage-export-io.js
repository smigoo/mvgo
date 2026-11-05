"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slimTaskModels = slimTaskModels;
exports.slimDuration = slimDuration;
exports.readJsonArrayObjects = readJsonArrayObjects;
exports.loadSlimComponentTasks = loadSlimComponentTasks;
exports.loadSlimApiTasks = loadSlimApiTasks;
const fs_1 = require("fs");
const path_1 = require("path");
const backend_root_1 = require("../config/backend-root");
function firstModel(raw) {
    const parts = String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return parts[0];
}
function slimTaskModels(obj) {
    const cm = obj?.completionModels || {};
    const cs = obj?.configSnapshot || {};
    const unified = cs.modelMode === 'unified';
    const textModel = firstModel(cm.textModel) || firstModel(unified ? cs.unifiedModel : cs.textModel);
    const visionModel = firstModel(cm.visionModel) || firstModel(unified ? cs.unifiedModel : cs.visionModel);
    return { textModel, visionModel };
}
function slimDuration(obj) {
    const stored = Number(obj?.duration);
    if (Number.isFinite(stored) && stored > 0)
        return stored;
    const start = Number(obj?.startTime);
    const end = Number(obj?.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start)
        return end - start;
    return undefined;
}
function slimComponent(obj) {
    const models = slimTaskModels(obj);
    return {
        userId: obj?.userId,
        taskType: obj?.taskType,
        target: obj?.target,
        status: obj?.status,
        startTime: obj?.startTime,
        duration: slimDuration(obj),
        textModel: models.textModel,
        visionModel: models.visionModel,
    };
}
async function readJsonArrayObjects(filePath, map) {
    if (!(0, fs_1.existsSync)(filePath))
        return [];
    try {
        const list = JSON.parse((0, fs_1.readFileSync)(filePath, 'utf-8'));
        if (!Array.isArray(list))
            return [];
        return list.map(map);
    }
    catch {
        return [];
    }
}
async function loadSlimComponentTasks() {
    const p = (0, path_1.join)(backend_root_1.dataDir, 'tasks.json');
    return readJsonArrayObjects(p, slimComponent);
}
function loadSlimApiTasks() {
    const p = (0, path_1.join)(backend_root_1.dataDir, 'apifox-tasks.json');
    if (!(0, fs_1.existsSync)(p))
        return [];
    try {
        const list = JSON.parse((0, fs_1.readFileSync)(p, 'utf-8'));
        if (!Array.isArray(list))
            return [];
        return list.map((t) => ({
            ownerId: t?.ownerId,
            createdAt: t?.createdAt,
            apiCount: t?.apiCount,
        }));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=usage-export-io.js.map