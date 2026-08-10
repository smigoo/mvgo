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
var MicrocodeDocController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrocodeDocController = void 0;
const common_1 = require("@nestjs/common");
const microcode_doc_service_1 = require("./microcode-doc.service");
const generate_doc_configs_dto_1 = require("./dto/generate-doc-configs.dto");
let MicrocodeDocController = MicrocodeDocController_1 = class MicrocodeDocController {
    docService;
    logger = new common_1.Logger(MicrocodeDocController_1.name);
    constructor(docService) {
        this.docService = docService;
    }
    async generateConfigs(dto) {
        this.logger.log(`收到文档配置生成请求，文档长度: ${dto.document?.length || 0}`);
        const result = await this.docService.generateConfigs(dto.document);
        if (!result.success) {
            this.logger.warn(`配置生成失败: ${result.error}`);
        }
        else {
            this.logger.log(`配置生成成功，合并后文档长度: ${result.merged?.length || 0}`);
        }
        return result;
    }
};
exports.MicrocodeDocController = MicrocodeDocController;
__decorate([
    (0, common_1.Post)('generate-configs'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_doc_configs_dto_1.GenerateDocConfigsDto]),
    __metadata("design:returntype", Promise)
], MicrocodeDocController.prototype, "generateConfigs", null);
exports.MicrocodeDocController = MicrocodeDocController = MicrocodeDocController_1 = __decorate([
    (0, common_1.Controller)('microcode/doc'),
    __metadata("design:paramtypes", [microcode_doc_service_1.MicrocodeDocService])
], MicrocodeDocController);
//# sourceMappingURL=microcode-doc.controller.js.map