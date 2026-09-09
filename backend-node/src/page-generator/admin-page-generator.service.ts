import { Injectable } from '@nestjs/common';
import { AdminPageConfigDto, SearchFieldConfigDto } from './dto/admin-page.dto';

@Injectable()
export class AdminPageGeneratorService {
  generateVueComponent(config: AdminPageConfigDto): string {
    const template = this.buildTemplate(config);
    const script = this.buildScript(config);
    const style = this.buildStyle(config.primaryColor, config.striped ? config.stripeColor : undefined);
    const header = this.buildHeader(config);
    return `<!--
${header}
-->\n\n<template>\n${template}\n</template>\n\n<script setup>\n${script}\n</script>\n\n<style lang="less" scoped>\n${style}\n</style>`;
  }

  generateApiService(config: AdminPageConfigDto): string {
    const name = this.toPascalCase(config.name);
    const baseUrl = config.dataSource.url.replace(/\/(list|page|search)$/i, '');
    const method = (config.dataSource.method || 'GET').toLowerCase();
    const httpMethod = method === 'list' ? 'get' : method;
    const chainCall = httpMethod === 'get' ? `.get('${config.dataSource.url}')` : `.${httpMethod}('${config.dataSource.url}')`;

    const needCreate = config.enableCreate !== false;
    const needEdit = config.enableEdit !== false;
    const needView = config.actionView !== false;
    const needBatchDelete = !!config.enableBatchDelete;

    let api = `import { createRequest } from 'microvideo-request'

/**
 * ${config.title} 接口请求
 * @description 自动生成 - ${config.name} 管理页面 API 层
 * @author smigoo
 */

// #region 获取${config.title}列表
export function get${name}List(params) {
  return createRequest('BASE_SERVER')
    .setParameters(params)
    ${chainCall}
}
// #endregion

// #region 删除${config.title}
export function delete${name}(id) {
  return createRequest('BASE_SERVER')
    .setParameters({ id })
    .delete('${baseUrl}/' + id)
}
// #endregion
`;

    if (needCreate) {
      api += `
// #region 新建${config.title}
export function create${name}(data) {
  return createRequest('BASE_SERVER')
    .setParameters(data)
    .post('${baseUrl}')
}
// #endregion
`;
    }

    if (needEdit || needView) {
      api += `
// #region 获取${config.title}详情
export function get${name}Detail(id) {
  return createRequest('BASE_SERVER')
    .setParameters({ id })
    .get(\`${baseUrl}/\${id}\`)
}
// #endregion
`;
    }

    if (needEdit) {
      api += `
// #region 更新${config.title}
export function update${name}(id, data) {
  return createRequest('BASE_SERVER')
    .setParameters({ id, ...data })
    .put(\`${baseUrl}/\${id}\`)
}
// #endregion
`;
    }

    if (needBatchDelete) {
      api += `
// #region 批量删除${config.title}
export function batchDelete${name}(ids) {
  return createRequest('BASE_SERVER')
    .setParameters({ ids })
    .delete('${baseUrl}/batch')
}
// #endregion
`;
    }

    return api;
  }

  private buildHeader(config: AdminPageConfigDto): string {
    const today = new Date().toISOString().slice(0, 10);
    return ` * @Description: ${config.title} 管理页面（自动生成）
 * @Author: smigoo(xsmigoo@gmail.com)
 * @Date: ${today}
 * @LastEditors: smigoo(xsmigoo@gmail.com)
 * @LastEditTime: ${today}
 * @Copyright: © 2026 Microvideo`;
  }

  private buildTemplate(config: AdminPageConfigDto): string {
    const themeClass =
      config.pageTheme === 'dark' ? 'admin-theme-dark' : config.pageTheme === 'none' ? 'admin-theme-none' : 'admin-theme-light';
    const needModal = config.enableCreate !== false || config.enableEdit !== false || config.actionView !== false;
    let template = `  <div class="admin-page ${themeClass}">\n`;
    // 标题区域（可选）
    if (config.showTitle !== false) {
      template += `    <h2 class="admin-page-title">${config.title}</h2>\n`;
    }
    // 搜索区域
    template += '    <!-- 搜索区域 -->\n';
    const labelColAttr = config.searchLayout === 'horizontal' && config.labelWidth
      ? ` :label-col="{ style: { width: '${config.labelWidth}px' } }" :wrapper-col="{ style: { flex: 1 } }"`
      : '';
    template += `    <a-form :model="searchForm" layout="${config.searchLayout || 'inline'}" :colon="${config.labelColon !== false}"${labelColAttr} @finish="handleSearch">\n`;
    // 按布局渲染搜索字段
    if (config.searchLayout === 'horizontal') {
      const perRow = config.fieldsPerRow || 3;
      const base = Math.floor(24 / perRow);
      const extra = 24 - base * perRow;
      for (let i = 0; i < config.searchFields.length; i += perRow) {
        const rowFields = config.searchFields.slice(i, i + perRow);
        template += `    <a-row :gutter="12"${config.formWrap ? ' :wrap="true"' : ''}>\n`;
        rowFields.forEach((field, j) => {
          const reqAttr = field.required ? ' required' : '';
          const span = i + j < extra ? base + 1 : base;
          const vif = field.linkageEnabled ? ` v-if="!hiddenFields.has('${field.name}')"` : '';
          template += `      <a-col :span="${span}">\n`;
          template += `        <a-form-item label="${field.label}" name="${field.name}"${reqAttr}${vif}>\n`;
          template += `          ${this.buildFormField(field)}\n`;
          template += '        </a-form-item>\n';
          template += '      </a-col>\n';
        });
        template += '    </a-row>\n';
      }
    } else {
      config.searchFields.forEach((field) => {
        const reqAttr = field.required ? ' required' : '';
        const vif = field.linkageEnabled ? ` v-if="!hiddenFields.has('${field.name}')"` : '';
        template += `      <a-form-item label="${field.label}" name="${field.name}"${reqAttr}${vif}>\n`;
        template += `        ${this.buildFormField(field)}\n`;
        template += '      </a-form-item>\n';
      });
    }
    template += '    <a-form-item>\n';
    template += '        <a-button type="primary" html-type="submit" :loading="isSearching">搜索</a-button>\n';
    template += '        <a-button :disabled="isSearching" @click="handleReset">重置</a-button>\n';
    if (config.enableCreate !== false) {
      template += '        <a-button type="primary" ghost @click="handleCreate">新建</a-button>\n';
    }
    if (config.enableExport) {
      template += '        <a-button @click="handleExport">导出</a-button>\n';
    }
    if (config.enableBatchDelete) {
      template += '        <a-popconfirm title="确定批量删除？" @confirm="handleBatchDelete">\n';
      template += '          <a-button danger :disabled="!selectedRowKeys.length">批量删除</a-button>\n';
      template += '        </a-popconfirm>\n';
    }
    template += '      </a-form-item>\n';
    template += '    </a-form>\n\n';
    // 表格区域
    template += '    <!-- 表格区域 -->\n';
    template += '    <a-table\n';
    template += '      :columns="columns"\n';
    template += '      :data-source="tableData"\n';
    template += '      :loading="isLoading"\n';
    if (config.showPagination !== false) {
      template += '      :pagination="pagination"\n';
    } else {
      template += '      :pagination="false"\n';
    }
    if (config.enableBatchDelete) {
      template += '      :row-selection="rowSelection"\n';
    }
    if (config.scrollX || config.scrollY) {
      const parts: string[] = [];
      if (config.scrollX) parts.push(`x: ${config.scrollX}`);
      if (config.scrollY) parts.push(`y: ${config.scrollY}`);
      template += `      :scroll="{ ${parts.join(', ')} }"\n`;
    }
    if (config.striped) {
      template += '      :row-class-name="rowClassName"\n';
    }
    template += `      row-key="${config.dataSource.responseMapping.idField}"\n`;
    template += '      @change="handleTableChange"\n';
    template += '    >\n';
    config.tableColumns.forEach((col) => {
      if (col.dataIndex === 'action') return;
      if (col.renderType === 'tag') {
        template += `      <template #${col.dataIndex}="{ record }">\n`;
        template += `        <a-tag :color="getTagColor('${col.dataIndex}', record.${col.dataIndex})">{{ getTagText('${col.dataIndex}', record.${col.dataIndex}) }}</a-tag>\n`;
        template += '      </template>\n';
      } else if (col.renderType === 'switch') {
        template += `      <template #${col.dataIndex}="{ record }">\n`;
        template += `        <a-switch :checked="!!record.${col.dataIndex}" @change="(val) => handleSwitchChange(record, '${col.dataIndex}', val)" />\n`;
        template += '      </template>\n';
      } else if (col.customRender) {
        template += `      <template #${col.dataIndex}="{ record }">\n`;
        template += `        {{ record.${col.dataIndex} }}\n`;
        template += '      </template>\n';
      }
    });
    // 操作列（可选）
    if (config.showActionColumn !== false) {
      const btnType = config.actionBtnType || 'link';
      const btnSize = config.actionBtnSize || 'small';
      const delType = config.actionDeleteType === 'danger' ? 'link' : btnType;
      const delDanger = config.actionDeleteType === 'danger' ? ' danger' : '';
      template += '      <template #action="{ record }">\n';
      template += '        <a-space>\n';
      if (config.actionView !== false) {
        template += `          <a-button type="${btnType}" size="${btnSize}" @click="handleView(record)">查看</a-button>\n`;
      }
      if (config.actionEdit !== false) {
        template += `          <a-button type="${btnType}" size="${btnSize}" @click="handleEdit(record)">编辑</a-button>\n`;
      }
      if (config.actionDelete !== false) {
        template += '          <a-popconfirm title="确定要删除吗？" @confirm="handleDelete(record.' + config.dataSource.responseMapping.idField + ')">\n';
        template += `            <a-button type="${delType}"${delDanger} size="${btnSize}" :disabled="isDeleting">删除</a-button>\n`;
        template += '          </a-popconfirm>\n';
      }
      template += '        </a-space>\n';
      template += '      </template>\n';
    }
    template += '    </a-table>\n';

    // 新建/编辑/查看弹窗
    if (needModal) {
      const modalWidth = config.modalWidth || 600;
      const canEdit = config.enableEdit !== false;
      template += '\n    <!-- 新建/编辑/查看弹窗 -->\n';
      template += `    <a-modal\n`;
      template += `      v-model:open="modalVisible"\n`;
      template += `      :title="modalTitle"\n`;
      template += `      :width="${modalWidth}"\n`;
      template += `      :confirm-loading="isSubmitting"\n`;
      template += `      :mask-closable="false"\n`;
      if (canEdit) {
        template += `      ok-text="确定"\n`;
        template += `      cancel-text="取消"\n`;
        template += `      @ok="handleSubmit"\n`;
      } else {
        template += `      :footer="null"\n`;
      }
      template += `    >\n`;
      template += `      <a-form :model="editForm" layout="horizontal" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">\n`;
      config.searchFields.forEach((field) => {
        const reqAttr = field.required ? ' required' : '';
        const disabledAttr = canEdit ? '' : ' disabled';
        template += `        <a-form-item label="${field.label}" name="${field.name}"${reqAttr}>\n`;
        template += `          ${this.buildFormField(field, 'editForm', canEdit ? '' : 'disabled')}\n`;
        template += `        </a-form-item>\n`;
      });
      template += `      </a-form>\n`;
      template += `    </a-modal>\n`;
    }

    template += '  </div>';
    return template;
  }

  private buildScript(config: AdminPageConfigDto): string {
    const name = this.toPascalCase(config.name);
    const optionFields = config.searchFields.filter(
      (f) => ['select', 'radio', 'checkbox'].includes(f.type) && f.options && f.options.length
    );
    const linkageEnabledFields = config.searchFields.filter((f) => f.linkageEnabled);
    const linkageFields = config.searchFields.filter((f) => f.linkageEnabled && f.linkageSource);
    const tagColumns = config.tableColumns.filter((c) => c.renderType === 'tag');
    const switchColumns = config.tableColumns.filter((c) => c.renderType === 'switch');
    const dateFields = config.searchFields.filter((f) => ['date', 'datetime', 'time', 'range'].includes(f.type));
    const needModal = config.enableCreate !== false || config.enableEdit !== false || config.actionView !== false;
    const canCreate = config.enableCreate !== false;
    const canEdit = config.enableEdit !== false;
    const canView = config.actionView !== false;

    let script = '// #region 1. 引入\n';
    script += `import { ref, onMounted, watch } from 'vue';\n`;
    script += `import { message } from 'ant-design-vue';\n`;
    // 按需引入 API
    const apiImports: string[] = [`get${name}List`, `delete${name}`];
    if (canCreate) apiImports.push(`create${name}`);
    if (canEdit || canView) apiImports.push(`get${name}Detail`);
    if (canEdit) apiImports.push(`update${name}`);
    if (config.enableBatchDelete) apiImports.push(`batchDelete${name}`);
    script += `import { ${apiImports.join(', ')} } from './api';\n`;
    if (dateFields.length) {
      script += `import dayjs from 'dayjs';\n`;
    }
    script += '// #endregion\n\n';

    script += '// #region 2. 响应式状态\n';
    script += 'const searchForm = ref({\n';
    config.searchFields.forEach((field) => {
      if (field.type === 'checkbox') {
        const arr = field.defaultValue
          ? field.defaultValue.split(',').map((v) => `'${String(v).trim()}'`).join(', ')
          : '';
        script += `  ${field.name}: [${arr}],\n`;
      } else {
        const def = field.defaultValue !== undefined && field.defaultValue !== '' ? `'${field.defaultValue}'` : "''";
        script += `  ${field.name}: ${def},\n`;
      }
    });
    script += '});\n';
    script += 'const tableData = ref([]);\n';
    script += 'const isLoading = ref(false);\n';
    script += 'const isSearching = ref(false);\n';
    script += 'const isDeleting = ref(false);\n';
    script += `const pagination = ref({\n  current: 1,\n  pageSize: ${config.pageSize || 10},\n  total: 0\n});\n`;
    if (optionFields.length) {
      const map: Record<string, { label: string; value: string }[]> = {};
      optionFields.forEach((f) => {
        map[f.name] = (f.options || []).map((o) => ({ label: o.label, value: String(o.value) }));
      });
      script += 'const fieldOptionsOrigin = ' + JSON.stringify(map) + ';\n';
      script += 'const fieldOptions = ref(JSON.parse(JSON.stringify(fieldOptionsOrigin)));\n';
    }
    if (linkageEnabledFields.length) {
      script += 'const hiddenFields = ref(new Set());\n';
    }
    if (config.enableExport || config.enableBatchDelete) {
      script += 'const selectedRowKeys = ref([]);\n';
      const selType = config.rowSelectionType || 'checkbox';
      script += `const rowSelection = ref({\n  type: '${selType}',\n  selectedRowKeys: selectedRowKeys.value,\n  onChange: (keys) => { selectedRowKeys.value = keys; }\n});\n`;
    }
    // 弹窗状态
    if (needModal) {
      script += '\n// 弹窗状态\n';
      script += 'const modalVisible = ref(false);\n';
      script += 'const modalTitle = ref(\'\');\n';
      script += 'const isEditMode = ref(false);\n';
      script += 'const isReadOnly = ref(false);\n';
      script += 'const isSubmitting = ref(false);\n';
      script += 'const editingId = ref(null);\n';
      script += 'const editForm = ref({\n';
      config.searchFields.forEach((field) => {
        if (field.type === 'checkbox') {
          script += `  ${field.name}: [],\n`;
        } else {
          script += `  ${field.name}: '',\n`;
        }
      });
      script += '});\n';
    }
    script += '// #endregion\n\n';

    script += '// #region 3. 计算属性\n';
    script += 'const columns = [\n';
    config.tableColumns.forEach((col) => {
      if (col.dataIndex === 'action') return;
      script += '  {\n';
      script += `    dataIndex: '${col.dataIndex}',\n`;
      script += `    title: '${col.title}',\n`;
      if (col.width) script += `    width: ${col.width},\n`;
      if (col.fixed) script += `    fixed: '${col.fixed}',\n`;
      if (col.align) script += `    align: '${col.align}',\n`;
      if (col.ellipsis) script += `    ellipsis: true,\n`;
      if (col.sortable) script += `    sorter: true,\n`;
      if (col.filters && col.filters.length) {
        const filtersArr = col.filters.map((f) => `{ text: '${f.text}', value: '${f.value}' }`).join(', ');
        script += `    filters: [${filtersArr}],\n`;
        script += `    onFilter: (val, record) => String(record.${col.dataIndex}) === String(val),\n`;
      }
      if (col.renderType === 'tag' || col.renderType === 'switch' || col.customRender)
        script += `    slots: { customRender: '${col.dataIndex}' },\n`;
      script += '  },\n';
    });
    if (config.showActionColumn !== false) {
      script += "  { title: '操作', key: 'action', dataIndex: 'action', width: 160, fixed: 'right' },\n";
    }
    script += '];\n';
    if (tagColumns.length) {
      const tagMap: Record<string, Record<string, { color: string; text: string }>> = {};
      tagColumns.forEach((c) => {
        tagMap[c.dataIndex] = c.tagOptions || {};
      });
      script += 'const tagOptionsMap = ' + JSON.stringify(tagMap) + ';\n';
      script +=
        'const getTagColor = (field, val) => {\n' +
        '  const m = tagOptionsMap[field];\n' +
        "  return (m && m[String(val)] && m[String(val)].color) || 'default';\n" +
        '};\n';
      script +=
        'const getTagText = (field, val) => {\n' +
        '  const m = tagOptionsMap[field];\n' +
        '  return (m && m[String(val)] && m[String(val)].text) || String(val);\n' +
        '};\n';
    }
    script += '// #endregion\n\n';

    // 斑马纹
    if (config.striped) {
      script += "const rowClassName = (record, index) => (index % 2 === 0 ? '' : 'admin-stripe-row');\n\n";
    }

    // 日期格式化辅助
    if (dateFields.length) {
      script += '// #region 3.5 日期格式化\n';
      script += 'const formatDateValue = (field, val) => {\n';
      script += '  if (!val) return val;\n';
      script += '  if (field.type === \'date\') return dayjs(val).format(\'YYYY-MM-DD\');\n';
      script += '  if (field.type === \'datetime\') return dayjs(val).format(\'YYYY-MM-DD HH:mm:ss\');\n';
      script += '  if (field.type === \'time\') return dayjs(val).format(\'HH:mm:ss\');\n';
      script += '  if (field.type === \'range\' && Array.isArray(val) && val.length === 2) {\n';
      script += '    return [dayjs(val[0]).format(\'YYYY-MM-DD\'), dayjs(val[1]).format(\'YYYY-MM-DD\')];\n';
      script += '  }\n';
      script += '  return val;\n';
      script += '};\n';
      script += 'const formatSearchParams = (params) => {\n';
      script += '  const formatted = { ...params };\n';
      dateFields.forEach((field) => {
        script += `  if (formatted.${field.name} !== undefined && formatted.${field.name} !== null) {\n`;
        script += `    formatted.${field.name} = formatDateValue({ type: '${field.type}' }, formatted.${field.name});\n`;
        script += '  }\n';
      });
      script += '  return formatted;\n';
      script += '};\n';
      script += '// #endregion\n\n';
    }

    script += '// #region 4. 方法\n';
    script += 'const fetchData = async () => {\n';
    script += '  isLoading.value = true;\n';
    script += '  try {\n';
    if (dateFields.length) {
      script += '    const params = formatSearchParams({\n';
      script += '      ...searchForm.value,\n';
      script += '      page: pagination.value.current,\n';
      script += '      pageSize: pagination.value.pageSize\n';
      script += '    });\n';
    } else {
      script += '    const params = {\n';
      script += '      ...searchForm.value,\n';
      script += '      page: pagination.value.current,\n';
      script += '      pageSize: pagination.value.pageSize\n';
      script += '    };\n';
    }
    script += `    const response = await get${name}List(params);\n`;
    script += `    tableData.value = response?.${config.dataSource.responseMapping.listField} ?? [];\n`;
    script += `    pagination.value.total = response?.${config.dataSource.responseMapping.totalField} ?? 0;\n`;
    script += "  } catch (error) {\n";
    script += "    message.error('获取数据失败，请重试');\n";
    script += '  } finally {\n';
    script += '    isLoading.value = false;\n';
    script += '  }\n';
    script += '};\n\n';

    script += 'const handleSearch = async () => {\n';
    script += '  if (isSearching.value) return;\n';
    script += '  isSearching.value = true;\n';
    script += '  pagination.value.current = 1;\n';
    script += '  try {\n';
    script += '    await fetchData();\n';
    script += '  } finally {\n';
    script += '    isSearching.value = false;\n';
    script += '  }\n';
    script += '};\n\n';

    script += 'const handleReset = () => {\n';
    config.searchFields.forEach((field) => {
      if (field.type === 'checkbox') {
        const arr = field.defaultValue
          ? field.defaultValue.split(',').map((v) => `'${String(v).trim()}'`).join(', ')
          : '';
        script += `  searchForm.value.${field.name} = [${arr}];\n`;
      } else {
        const def = field.defaultValue !== undefined && field.defaultValue !== '' ? `'${field.defaultValue}'` : "''";
        script += `  searchForm.value.${field.name} = ${def};\n`;
      }
    });
    script += '  pagination.value.current = 1;\n';
    script += '  fetchData();\n';
    script += '};\n\n';

    script += 'const handleTableChange = (pager) => {\n';
    script += '  pagination.value = pager;\n';
    script += '  fetchData();\n';
    script += '};\n\n';

    // 弹窗方法
    if (needModal) {
      script += 'const resetEditForm = () => {\n';
      config.searchFields.forEach((field) => {
        if (field.type === 'checkbox') {
          script += `  editForm.value.${field.name} = [];\n`;
        } else {
          script += `  editForm.value.${field.name} = '';\n`;
        }
      });
      script += '  editingId.value = null;\n';
      script += '};\n\n';

      if (canCreate) {
        script += 'const handleCreate = () => {\n';
        script += '  resetEditForm();\n';
        script += "  isEditMode.value = true;\n";
        script += "  isReadOnly.value = false;\n";
        script += "  modalTitle.value = '新建';\n";
        script += '  modalVisible.value = true;\n';
        script += '};\n\n';
      }

      if (canView) {
        script += 'const handleView = async (record) => {\n';
        script += '  resetEditForm();\n';
        script += "  isEditMode.value = false;\n";
        script += "  isReadOnly.value = true;\n";
        script += "  modalTitle.value = '查看';\n";
        script += '  modalVisible.value = true;\n';
        script += '  try {\n';
        script += `    const detail = await get${name}Detail(record.${config.dataSource.responseMapping.idField});\n`;
        script += '    Object.keys(editForm.value).forEach((key) => {\n';
        script += '      if (detail && detail[key] !== undefined) editForm.value[key] = detail[key];\n';
        script += '    });\n';
        script += '  } catch (error) {\n';
        script += "    message.error('获取详情失败');\n";
        script += '  }\n';
        script += '};\n\n';
      } else {
        script += 'const handleView = () => {};\n\n';
      }

      if (canEdit) {
        script += 'const handleEdit = async (record) => {\n';
        script += '  resetEditForm();\n';
        script += "  isEditMode.value = true;\n";
        script += "  isReadOnly.value = false;\n";
        script += "  modalTitle.value = '编辑';\n";
        script += '  modalVisible.value = true;\n';
        script += '  try {\n';
        script += `    const detail = await get${name}Detail(record.${config.dataSource.responseMapping.idField});\n`;
        script += '    Object.keys(editForm.value).forEach((key) => {\n';
        script += '      if (detail && detail[key] !== undefined) editForm.value[key] = detail[key];\n';
        script += '    });\n';
        script += '  } catch (error) {\n';
        script += "    message.error('获取详情失败');\n";
        script += '  }\n';
        script += '};\n\n';

        script += 'const handleSubmit = async () => {\n';
        script += '  if (isSubmitting.value) return;\n';
        script += '  isSubmitting.value = true;\n';
        script += '  try {\n';
        script += '    const data = { ...editForm.value };\n';
        script += '    if (editingId.value !== null) {\n';
        script += `      await update${name}(editingId.value, data);\n`;
        script += "      message.success('编辑成功');\n";
        script += '    } else {\n';
        script += `      await create${name}(data);\n`;
        script += "      message.success('新建成功');\n";
        script += '    }\n';
        script += '    modalVisible.value = false;\n';
        script += '    await fetchData();\n';
        script += '  } catch (error) {\n';
        script += "    message.error('提交失败，请重试');\n";
        script += '  } finally {\n';
        script += '    isSubmitting.value = false;\n';
        script += '  }\n';
        script += '};\n\n';
      } else {
        script += 'const handleEdit = () => {};\n\n';
      }
    } else {
      script += 'const handleView = () => {};\n\n';
      script += 'const handleEdit = () => {};\n\n';
    }

    script += 'const handleDelete = async (id) => {\n';
    script += '  if (isDeleting.value) return;\n';
    script += '  isDeleting.value = true;\n';
    script += '  try {\n';
    script += `    await delete${name}(id);\n`;
    script += "    message.success('删除成功');\n";
    script += '    await fetchData();\n';
    script += '  } catch (error) {\n';
    script += "    message.error('删除失败，请重试');\n";
    script += '  } finally {\n';
    script += '    isDeleting.value = false;\n';
    script += '  }\n';
    script += '};\n\n';

    // switch 可编辑：调 update API
    if (switchColumns.length && canEdit) {
      script += 'const handleSwitchChange = async (record, field, val) => {\n';
      script += '  record[field] = val;\n';
      script += '  try {\n';
      script += `    await update${name}(record.${config.dataSource.responseMapping.idField}, { [field]: val });\n`;
      script += "    message.success('状态已更新');\n";
      script += '  } catch (error) {\n';
      script += "    message.error('更新失败');\n";
      script += '    record[field] = !val;\n';
      script += '  }\n';
      script += '};\n\n';
    }

    if (config.enableExport) {
      script +=
        'const handleExport = () => {\n' +
        "  const header = columns.filter((c) => c.dataIndex !== 'action').map((c) => c.title);\n" +
        "  const rows = tableData.value.map((r) => columns.filter((c) => c.dataIndex !== 'action').map((c) => r[c.dataIndex]));\n" +
        '  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\\n");\n' +
        "  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });\n" +
        "  const a = document.createElement('a');\n" +
        '  a.href = URL.createObjectURL(blob);\n' +
        `  a.download = '${config.name}.csv';\n` +
        '  a.click();\n' +
        '  URL.revokeObjectURL(a.href);\n' +
        "  message.success('导出成功');\n" +
        '};\n\n';
    }

    if (config.enableBatchDelete) {
      script +=
        'const handleBatchDelete = async () => {\n' +
        '  if (!selectedRowKeys.value.length) return;\n' +
        '  try {\n' +
        `    await batchDelete${name}(selectedRowKeys.value);\n` +
        "    message.success('已批量删除 ' + selectedRowKeys.value.length + ' 条');\n" +
        '    selectedRowKeys.value = [];\n' +
        '    await fetchData();\n' +
        '  } catch (e) {\n' +
        "    message.error('批量删除失败');\n" +
        '  }\n' +
        '};\n\n';
    }

    script += '// #endregion\n\n';

    if (linkageFields.length) {
      script += '// #region 5. 联动逻辑\n';
      const cfg = linkageFields.map((f) => ({
        target: f.name,
        source: f.linkageSource,
        type: f.linkageType || 'filterOptions',
        maps: (f.linkageValueMaps || []).map((m) => ({ sourceVal: String(m.sourceVal), targetVal: String(m.targetVal) }))
      }));
      script += 'const linkageConfig = ' + JSON.stringify(cfg) + ';\n';
      script += 'linkageConfig.forEach((lc) => {\n';
      script += '  watch(() => searchForm.value[lc.source], (val) => {\n';
      script += '    if (lc.type === "valueMap") {\n';
      script += '      const m = lc.maps.find((x) => String(x.sourceVal) === String(val));\n';
      script += '      if (m) searchForm.value[lc.target] = m.targetVal;\n';
      script += '    } else if (lc.type === "filterOptions") {\n';
      script += '      const allow = lc.maps.filter((x) => String(x.sourceVal) === String(val)).map((x) => x.targetVal);\n';
      script +=
        '      fieldOptions.value[lc.target] = (fieldOptionsOrigin[lc.target] || []).filter((o) => allow.includes(String(o.value)));\n';
      script += '    } else if (lc.type === "visible") {\n';
      script += '      const show = lc.maps.some((x) => String(x.sourceVal) === String(val));\n';
      script += '      if (show) hiddenFields.value.delete(lc.target); else hiddenFields.value.add(lc.target);\n';
      script += '      hiddenFields.value = new Set(hiddenFields.value);\n';
      script += '    }\n';
      script += '  }, { immediate: true });\n';
      script += '});\n';
      script += '// #endregion\n\n';
    }

    script += '// #region 6. 生命周期\n';
    script += 'onMounted(() => {\n';
    script += '  fetchData();\n';
    script += '});\n';
    script += '// #endregion\n';
    return script;
  }

  private buildStyle(primaryColor?: string, stripeColor?: string): string {
    const pc = primaryColor || '#1677ff';
    // 生成 hover/active 变体（简单 lighten/darken，无需额外依赖）
    const hover = this.lightenHex(pc, 15);
    const active = this.darkenHex(pc, 10);
    return `.admin-page {
  /* 主题色 CSS 变量 */
  --admin-primary: ${pc};
  --admin-primary-hover: ${hover};
  --admin-primary-active: ${active};

  padding: 16px 0;
}

/* 覆盖 Ant Design 主色 */
.admin-page .ant-btn-primary { background-color: var(--admin-primary); border-color: var(--admin-primary); }
.admin-page .ant-btn-primary:hover { background-color: var(--admin-primary-hover) !important; border-color: var(--admin-primary-hover) !important; }
.admin-page .ant-btn-primary:active { background-color: var(--admin-primary-active) !important; border-color: var(--admin-primary-active) !important; }
.admin-page .ant-switch-checked { background-color: var(--admin-primary) !important; }
.admin-page .ant-tag { border-color: var(--admin-primary); color: var(--admin-primary); }
.admin-page .ant-pagination .ant-pagination-item-active { border-color: var(--admin-primary); }
.admin-page .ant-pagination .ant-pagination-item-active a { color: var(--admin-primary); }
.admin-page .ant-checkbox-checked .ant-checkbox-inner { background-color: var(--admin-primary); border-color: var(--admin-primary); }
.admin-page .ant-radio-checked .ant-radio-inner { border-color: var(--admin-primary); }
.admin-page .ant-radio-checked .ant-radio-inner::after { background-color: var(--admin-primary); }
.admin-page .ant-select-focused .ant-select-selector { border-color: var(--admin-primary) !important; box-shadow: 0 0 0 2px ${pc}19 !important; }
.admin-page .ant-input:focus, .admin-page .ant-input-focused { border-color: var(--admin-primary); box-shadow: 0 0 0 2px ${pc}19; }
.admin-page .ant-input-number-focused { border-color: var(--admin-primary); box-shadow: 0 0 0 2px ${pc}19; }
.admin-page .ant-picker-focused { border-color: var(--admin-primary); box-shadow: 0 0 0 2px ${pc}19; }

.admin-page-title {
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1f1f1f;
}

/* 整体主题 */
.admin-theme-light { background: #fafafa; padding: 16px 0; }
.admin-theme-dark {
  background: #141414; color: rgba(255,255,255,0.85); padding: 16px 0;
}
.admin-theme-dark .admin-page-title { color: #fff; }
.admin-theme-dark .ant-form-item-label > label { color: rgba(255,255,255,0.85); }
.admin-theme-dark .ant-table-thead > tr > th { background: #262626; color: rgba(255,255,255,0.85); border-bottom-color: #434343; }
.admin-theme-dark .ant-table-tbody > tr > td { border-bottom-color: #303030; color: rgba(255,255,255,0.85); }
.admin-theme-none { background: transparent; padding: 8px 0; }

.admin-page .ant-form { margin-bottom: 16px; }

/* 斑马纹 */
.admin-stripe-row { background: ${stripeColor || '#fafafa'}; }
.admin-theme-dark .admin-stripe-row { background: ${stripeColor || '#1f1f1f'}; }`;
  }

  private buildFormField(field: SearchFieldConfigDto, modelPrefix = 'searchForm', disabledAttr = ''): string {
    const ph = field.placeholder || `请${field.type === 'select' ? '选择' : '输入'}${field.label}`;
    const dis = disabledAttr ? ` ${disabledAttr}` : '';
    switch (field.type) {
      case 'text':
        return `<a-input v-model:value="${modelPrefix}.${field.name}" placeholder="${ph}"${dis} />`;
      case 'number': {
        let n = `<a-input-number v-model:value="${modelPrefix}.${field.name}" placeholder="${ph}"`;
        if (field.min !== undefined) n += ` :min="${field.min}"`;
        if (field.max !== undefined) n += ` :max="${field.max}"`;
        return n + `${dis} />`;
      }
      case 'select':
        return `<a-select v-model:value="${modelPrefix}.${field.name}" :options="fieldOptions['${field.name}']" placeholder="${ph}"${dis} />`;
      case 'radio':
        return `<a-radio-group v-model:value="${modelPrefix}.${field.name}" :options="fieldOptions['${field.name}']"${dis} />`;
      case 'checkbox':
        return `<a-checkbox-group v-model:value="${modelPrefix}.${field.name}" :options="fieldOptions['${field.name}']"${dis} />`;
      case 'date':
        return `<a-date-picker v-model:value="${modelPrefix}.${field.name}" placeholder="${ph}"${dis} />`;
      case 'datetime':
        return `<a-date-picker v-model:value="${modelPrefix}.${field.name}" show-time placeholder="${ph}"${dis} />`;
      case 'time':
        return `<a-date-picker v-model:value="${modelPrefix}.${field.name}" picker="time" placeholder="${ph}"${dis} />`;
      case 'range':
        return `<a-range-picker v-model:value="${modelPrefix}.${field.name}"${dis} />`;
      default:
        return `<a-input v-model:value="${modelPrefix}.${field.name}" placeholder="${ph}"${dis} />`;
    }
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  /** 十六进制颜色变亮 percent% */
  private lightenHex(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent));
    const b = Math.min(255, (num & 0xff) + Math.round(2.55 * percent));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /** 十六进制颜色变暗 percent% */
  private darkenHex(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
    const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(2.55 * percent));
    const b = Math.max(0, (num & 0xff) - Math.round(2.55 * percent));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
}
