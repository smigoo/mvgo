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
exports.AdminPageConfigDto = exports.TableColumnConfigDto = exports.SearchFieldConfigDto = exports.LinkageValueMapDto = exports.SelectOptionDto = exports.DataSourceConfigDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class DataSourceConfigDto {
    url;
    method;
    headers;
    responseMapping;
}
exports.DataSourceConfigDto = DataSourceConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DataSourceConfigDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['GET', 'POST']),
    __metadata("design:type", String)
], DataSourceConfigDto.prototype, "method", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], DataSourceConfigDto.prototype, "headers", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], DataSourceConfigDto.prototype, "responseMapping", void 0);
class SelectOptionDto {
    label;
    value;
    disabled;
}
exports.SelectOptionDto = SelectOptionDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SelectOptionDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SelectOptionDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SelectOptionDto.prototype, "disabled", void 0);
class LinkageValueMapDto {
    sourceVal;
    targetVal;
}
exports.LinkageValueMapDto = LinkageValueMapDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LinkageValueMapDto.prototype, "sourceVal", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LinkageValueMapDto.prototype, "targetVal", void 0);
class SearchFieldConfigDto {
    id;
    name;
    label;
    type;
    required;
    placeholder;
    defaultValue;
    min;
    max;
    options;
    linkageEnabled;
    linkageSource;
    linkageType;
    linkageValueMaps;
}
exports.SearchFieldConfigDto = SearchFieldConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "id", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['text', 'number', 'select', 'radio', 'checkbox', 'date', 'datetime', 'time', 'range']),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SearchFieldConfigDto.prototype, "required", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "placeholder", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "defaultValue", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchFieldConfigDto.prototype, "min", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchFieldConfigDto.prototype, "max", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => SelectOptionDto),
    __metadata("design:type", Array)
], SearchFieldConfigDto.prototype, "options", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SearchFieldConfigDto.prototype, "linkageEnabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "linkageSource", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['filterOptions', 'visible', 'valueMap']),
    __metadata("design:type", String)
], SearchFieldConfigDto.prototype, "linkageType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => LinkageValueMapDto),
    __metadata("design:type", Array)
], SearchFieldConfigDto.prototype, "linkageValueMaps", void 0);
class TableColumnConfigDto {
    dataIndex;
    title;
    width;
    fixed;
    customRender;
    renderType;
    tagOptions;
    sortable;
    filters;
    align;
    ellipsis;
}
exports.TableColumnConfigDto = TableColumnConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TableColumnConfigDto.prototype, "dataIndex", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TableColumnConfigDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TableColumnConfigDto.prototype, "width", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['left', 'right']),
    __metadata("design:type", String)
], TableColumnConfigDto.prototype, "fixed", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TableColumnConfigDto.prototype, "customRender", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TableColumnConfigDto.prototype, "renderType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], TableColumnConfigDto.prototype, "tagOptions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TableColumnConfigDto.prototype, "sortable", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], TableColumnConfigDto.prototype, "filters", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['left', 'center', 'right']),
    __metadata("design:type", String)
], TableColumnConfigDto.prototype, "align", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TableColumnConfigDto.prototype, "ellipsis", void 0);
class AdminPageConfigDto {
    name;
    title;
    showTitle;
    showPagination;
    searchLayout;
    labelColon;
    formWrap;
    fieldsPerRow;
    pageTheme;
    primaryColor;
    dataSource;
    searchFields;
    tableColumns;
    enableExport;
    enableBatchDelete;
    enableCreate;
    enableEdit;
    modalWidth;
    showActionColumn;
    actionBtnType;
    actionBtnSize;
    actionDeleteType;
    actionView;
    actionEdit;
    actionDelete;
    pageSize;
    scrollX;
    scrollY;
    striped;
    stripeColor;
    rowSelectionType;
    labelWidth;
}
exports.AdminPageConfigDto = AdminPageConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "showTitle", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "showPagination", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['inline', 'horizontal', 'vertical']),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "searchLayout", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "labelColon", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "formWrap", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AdminPageConfigDto.prototype, "fieldsPerRow", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['light', 'dark', 'none', 'custom']),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "pageTheme", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "primaryColor", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DataSourceConfigDto),
    __metadata("design:type", DataSourceConfigDto)
], AdminPageConfigDto.prototype, "dataSource", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => SearchFieldConfigDto),
    __metadata("design:type", Array)
], AdminPageConfigDto.prototype, "searchFields", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TableColumnConfigDto),
    __metadata("design:type", Array)
], AdminPageConfigDto.prototype, "tableColumns", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "enableExport", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "enableBatchDelete", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "enableCreate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "enableEdit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AdminPageConfigDto.prototype, "modalWidth", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "showActionColumn", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['link', 'text', 'primary', 'dashed']),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "actionBtnType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['small', 'middle']),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "actionBtnSize", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['danger', 'default']),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "actionDeleteType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "actionView", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "actionEdit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "actionDelete", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AdminPageConfigDto.prototype, "pageSize", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AdminPageConfigDto.prototype, "scrollX", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AdminPageConfigDto.prototype, "scrollY", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPageConfigDto.prototype, "striped", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "stripeColor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['checkbox', 'radio']),
    __metadata("design:type", String)
], AdminPageConfigDto.prototype, "rowSelectionType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AdminPageConfigDto.prototype, "labelWidth", void 0);
//# sourceMappingURL=admin-page.dto.js.map