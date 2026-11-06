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
var RecipesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipesService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const fs_2 = require("fs");
const backend_root_1 = require("../config/backend-root");
const builtin_recipes_1 = require("./builtin-recipes");
const recipesDir = (0, path_1.join)(backend_root_1.configDir, 'recipes');
const NAME_RE = /^[a-z][a-z0-9-]{2,31}$/;
let RecipesService = RecipesService_1 = class RecipesService {
    logger = new common_1.Logger(RecipesService_1.name);
    constructor() {
        if (!(0, fs_2.existsSync)(recipesDir))
            (0, fs_2.mkdirSync)(recipesDir, { recursive: true });
    }
    async list() {
        const out = builtin_recipes_1.BUILTIN_RECIPES.map((r) => this.pick(r));
        try {
            const files = await fs_1.promises.readdir(recipesDir);
            for (const f of files.filter((x) => x.endsWith('.json'))) {
                try {
                    const rec = JSON.parse(await fs_1.promises.readFile((0, path_1.join)(recipesDir, f), 'utf-8'));
                    if (rec?.name)
                        out.push(this.pick(rec));
                }
                catch { }
            }
        }
        catch { }
        return out;
    }
    pick(r) {
        return {
            name: r.name,
            label: r.label,
            description: r.description || '',
            scenario: r.scenario || '通用',
            source: r.source || 'user',
            author: r.author,
            version: r.version || 1,
            nodeCount: r.workflow?.nodes?.length || 0,
        };
    }
    async get(name) {
        const builtin = builtin_recipes_1.BUILTIN_RECIPES.find((r) => r.name === name);
        if (builtin)
            return builtin;
        try {
            const rec = JSON.parse(await fs_1.promises.readFile((0, path_1.join)(recipesDir, `${name}.json`), 'utf-8'));
            if (rec?.name)
                return rec;
        }
        catch { }
        throw new common_1.NotFoundException(`配方不存在: ${name}`);
    }
    async saveRecipe(dto, userId) {
        if (!NAME_RE.test(dto.name)) {
            throw new common_1.BadRequestException(`配方标识不合法: "${dto.name}"，要求小写字母开头、a-z0-9-、3~32 位`);
        }
        if (builtin_recipes_1.BUILTIN_RECIPES.some((r) => r.name === dto.name)) {
            throw new common_1.BadRequestException(`配方 "${dto.name}" 为内置配方，不可覆盖，请换一个标识`);
        }
        if (!dto.workflow?.nodes?.length) {
            throw new common_1.BadRequestException('配方需要包含节点拓扑');
        }
        const record = {
            name: dto.name,
            label: (dto.label || dto.name).slice(0, 40),
            description: (dto.description || '').slice(0, 200),
            scenario: (dto.scenario || '通用').slice(0, 20),
            source: 'user',
            author: userId || 'anonymous',
            workflow: dto.workflow,
            version: 1,
            createdAt: Date.now(),
        };
        await fs_1.promises.writeFile((0, path_1.join)(recipesDir, `${dto.name}.json`), JSON.stringify(record, null, 2), 'utf-8');
        this.logger.log(`📦 配方另存为模板: ${dto.name} (${record.workflow.nodes.length} 节点)`);
        return { success: true, data: this.pick(record) };
    }
    async remove(name, userId) {
        if (builtin_recipes_1.BUILTIN_RECIPES.some((r) => r.name === name)) {
            throw new common_1.BadRequestException('内置配方不可删除');
        }
        try {
            const rec = JSON.parse(await fs_1.promises.readFile((0, path_1.join)(recipesDir, `${name}.json`), 'utf-8'));
            if (rec.author && rec.author !== 'anonymous' && userId && rec.author !== userId) {
                throw new common_1.BadRequestException('只能删除自己保存的配方');
            }
        }
        catch (e) {
            if (e instanceof common_1.BadRequestException)
                throw e;
            throw new common_1.NotFoundException(`配方不存在: ${name}`);
        }
        await fs_1.promises.unlink((0, path_1.join)(recipesDir, `${name}.json`)).catch(() => { });
        return { success: true };
    }
};
exports.RecipesService = RecipesService;
exports.RecipesService = RecipesService = RecipesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RecipesService);
//# sourceMappingURL=recipes.service.js.map