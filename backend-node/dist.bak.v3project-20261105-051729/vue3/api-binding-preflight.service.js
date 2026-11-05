"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_BARE_MODULES = exports.ApiBindingPreflightService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const typescript_1 = __importDefault(require("typescript"));
const ALLOWED_BARE_MODULES = new Set(['vue', 'echarts', 'microvideo-request']);
exports.ALLOWED_BARE_MODULES = ALLOWED_BARE_MODULES;
let ApiBindingPreflightService = class ApiBindingPreflightService {
    validate(componentDir) {
        const entryPath = this.resolveEntryPath(componentDir);
        if (!entryPath) {
            throw new common_1.BadRequestException({
                code: 'API_BINDING_PREFLIGHT_FAILED',
                message: 'API 绑定发布前检查失败',
                errors: [`${componentDir}: 缺少 package/index.vue 或 index.vue`],
            });
        }
        const sfc = (0, fs_1.readFileSync)(entryPath, 'utf-8');
        const errors = [];
        this.validateSfc(componentDir, entryPath, sfc, errors);
        const apiDir = this.resolveApiDir(entryPath);
        if ((0, fs_1.existsSync)(apiDir)) {
            this.walk(apiDir, (filePath) => {
                if (!['.js', '.mjs'].includes((0, path_1.extname)(filePath)))
                    return;
                const source = (0, fs_1.readFileSync)(filePath, 'utf-8');
                this.validateModule(componentDir, filePath, source, errors);
            });
        }
        if (errors.length > 0) {
            throw new common_1.BadRequestException({
                code: 'API_BINDING_PREFLIGHT_FAILED',
                message: 'API 绑定发布前检查失败',
                errors,
            });
        }
    }
    resolveEntryPath(componentDir) {
        const candidates = [(0, path_1.join)(componentDir, 'package', 'index.vue'), (0, path_1.join)(componentDir, 'index.vue')];
        return candidates.find((candidate) => (0, fs_1.existsSync)(candidate)) || null;
    }
    resolveApiDir(entryPath) {
        return (0, path_1.join)(entryPath, '..', 'api');
    }
    validateSfc(componentDir, entryPath, sfc, errors) {
        const hasTemplate = /<template(?:\s|>)[\s\S]*<\/template>/i.test(sfc);
        const scriptMatch = sfc.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/i);
        if (!hasTemplate)
            errors.push(`${entryPath}: 缺少完整的 <template>`);
        if (!scriptMatch) {
            errors.push(`${entryPath}: 缺少 <script setup>`);
            return;
        }
        const parseResult = typescript_1.default.transpileModule(scriptMatch[1], {
            compilerOptions: {
                module: typescript_1.default.ModuleKind.ESNext,
                target: typescript_1.default.ScriptTarget.ES2022,
                allowJs: true,
            },
            fileName: entryPath,
            reportDiagnostics: true,
        });
        for (const diagnostic of parseResult.diagnostics || []) {
            if (diagnostic.category === typescript_1.default.DiagnosticCategory.Error) {
                errors.push(`${entryPath}: ${typescript_1.default.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
            }
        }
        this.validateImports(entryPath, scriptMatch[1], errors, componentDir);
    }
    validateModule(componentDir, filePath, source, errors) {
        const parseResult = typescript_1.default.transpileModule(source, {
            compilerOptions: {
                module: typescript_1.default.ModuleKind.ESNext,
                target: typescript_1.default.ScriptTarget.ES2022,
                allowJs: true,
            },
            fileName: filePath,
            reportDiagnostics: true,
        });
        for (const diagnostic of parseResult.diagnostics || []) {
            if (diagnostic.category === typescript_1.default.DiagnosticCategory.Error) {
                errors.push(`${filePath}: ${typescript_1.default.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
            }
        }
        this.validateImports(filePath, source, errors, componentDir);
    }
    validateImports(filePath, source, errors, componentDir) {
        const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = importPattern.exec(source)) !== null) {
            const specifier = match[1];
            if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
                if (!ALLOWED_BARE_MODULES.has(specifier)) {
                    errors.push(`${filePath}: 不允许导入裸模块 "${specifier}"`);
                }
                continue;
            }
            if (specifier.startsWith('/')) {
                errors.push(`${filePath}: 不允许使用绝对导入 "${specifier}"`);
                continue;
            }
            const resolved = (0, path_1.join)(filePath, '..', specifier.split('?')[0].split('#')[0]);
            if (componentDir) {
                const rel = (0, path_1.relative)(componentDir, resolved);
                if (rel === '..' || rel.startsWith(`..${path_1.sep}`)) {
                    errors.push(`${filePath}: 相对导入越过组件目录 "${specifier}"`);
                }
            }
            if (!this.moduleExists(resolved)) {
                errors.push(`${filePath}: 导入文件不存在 "${specifier}"`);
            }
        }
    }
    moduleExists(basePath) {
        return [basePath, `${basePath}.mjs`, `${basePath}.js`, `${basePath}.json`]
            .some((candidate) => {
            try {
                return (0, fs_1.statSync)(candidate).isFile();
            }
            catch {
                return false;
            }
        });
    }
    walk(dir, visit) {
        for (const name of (0, fs_1.readdirSync)(dir)) {
            const filePath = (0, path_1.join)(dir, name);
            const stat = (0, fs_1.statSync)(filePath);
            if (stat.isDirectory())
                this.walk(filePath, visit);
            else
                visit(filePath);
        }
    }
};
exports.ApiBindingPreflightService = ApiBindingPreflightService;
exports.ApiBindingPreflightService = ApiBindingPreflightService = __decorate([
    (0, common_1.Injectable)()
], ApiBindingPreflightService);
//# sourceMappingURL=api-binding-preflight.service.js.map