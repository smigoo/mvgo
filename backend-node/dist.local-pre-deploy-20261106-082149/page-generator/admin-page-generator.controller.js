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
exports.AdminPageGeneratorController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_1 = require("../auth/session.guard");
const { ZipArchive } = require('archiver');
const admin_page_generator_service_1 = require("./admin-page-generator.service");
const admin_page_dto_1 = require("./dto/admin-page.dto");
let AdminPageGeneratorController = class AdminPageGeneratorController {
    adminPageGeneratorService;
    constructor(adminPageGeneratorService) {
        this.adminPageGeneratorService = adminPageGeneratorService;
    }
    generateAdminPage(config) {
        try {
            const vueComponent = this.adminPageGeneratorService.generateVueComponent(config);
            const apiService = this.adminPageGeneratorService.generateApiService(config);
            return {
                success: true,
                message: '页面生成成功',
                files: {
                    [`src/views/generated/${config.name}/index.vue`]: vueComponent,
                    [`src/views/generated/${config.name}/api.js`]: apiService
                }
            };
        }
        catch (error) {
            return {
                success: false,
                message: '页面生成失败: ' + error.message,
                files: {}
            };
        }
    }
    downloadAdminPage(config, res) {
        try {
            const vueComponent = this.adminPageGeneratorService.generateVueComponent(config);
            const apiService = this.adminPageGeneratorService.generateApiService(config);
            const base = `src/views/generated/${config.name}`;
            const archive = new ZipArchive({ zlib: { level: 9 } });
            archive.on('warning', (err) => {
                if (err.code !== 'ENOENT')
                    res.destroy(err);
            });
            archive.on('error', (err) => res.destroy(err));
            archive.pipe(res);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(config.name)}.zip"`);
            archive.append(vueComponent, { name: `${base}/index.vue` });
            archive.append(apiService, { name: `${base}/api.js` });
            archive.finalize();
        }
        catch (error) {
            res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: '打包失败: ' + error.message
            });
        }
    }
};
exports.AdminPageGeneratorController = AdminPageGeneratorController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_page_dto_1.AdminPageConfigDto]),
    __metadata("design:returntype", void 0)
], AdminPageGeneratorController.prototype, "generateAdminPage", null);
__decorate([
    (0, common_1.Post)('download'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_page_dto_1.AdminPageConfigDto, Object]),
    __metadata("design:returntype", void 0)
], AdminPageGeneratorController.prototype, "downloadAdminPage", null);
exports.AdminPageGeneratorController = AdminPageGeneratorController = __decorate([
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [admin_page_generator_service_1.AdminPageGeneratorService])
], AdminPageGeneratorController);
//# sourceMappingURL=admin-page-generator.controller.js.map