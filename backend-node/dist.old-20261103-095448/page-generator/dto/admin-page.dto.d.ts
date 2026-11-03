export declare class DataSourceConfigDto {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    responseMapping: {
        totalField: string;
        listField: string;
        idField: string;
    };
}
export declare class SelectOptionDto {
    label: string;
    value: string;
    disabled?: boolean;
}
export declare class LinkageValueMapDto {
    sourceVal: string;
    targetVal: string;
}
export declare class SearchFieldConfigDto {
    id: string;
    name: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'datetime' | 'time' | 'range';
    required?: boolean;
    placeholder?: string;
    defaultValue?: string;
    min?: number;
    max?: number;
    options?: SelectOptionDto[];
    linkageEnabled?: boolean;
    linkageSource?: string;
    linkageType?: 'filterOptions' | 'visible' | 'valueMap';
    linkageValueMaps?: LinkageValueMapDto[];
}
export declare class TableColumnConfigDto {
    dataIndex: string;
    title: string;
    width?: number;
    fixed?: 'left' | 'right';
    customRender?: boolean;
    renderType?: 'text' | 'tag' | 'switch' | 'actions';
    tagOptions?: Record<string, {
        color: string;
        text: string;
    }>;
    sortable?: boolean;
    filters?: {
        text: string;
        value: string;
    }[];
    align?: 'left' | 'center' | 'right';
    ellipsis?: boolean;
}
export declare class AdminPageConfigDto {
    name: string;
    title: string;
    showTitle?: boolean;
    showPagination?: boolean;
    searchLayout?: 'inline' | 'horizontal' | 'vertical';
    labelColon?: boolean;
    formWrap?: boolean;
    fieldsPerRow?: number;
    pageTheme?: 'light' | 'dark' | 'none' | 'custom';
    primaryColor?: string;
    dataSource: DataSourceConfigDto;
    searchFields: SearchFieldConfigDto[];
    tableColumns: TableColumnConfigDto[];
    enableExport?: boolean;
    enableBatchDelete?: boolean;
    enableCreate?: boolean;
    enableEdit?: boolean;
    modalWidth?: number;
    showActionColumn?: boolean;
    actionBtnType?: 'link' | 'text' | 'primary' | 'dashed';
    actionBtnSize?: 'small' | 'middle';
    actionDeleteType?: 'danger' | 'default';
    actionView?: boolean;
    actionEdit?: boolean;
    actionDelete?: boolean;
    pageSize?: number;
    scrollX?: number;
    scrollY?: number;
    striped?: boolean;
    stripeColor?: string;
    rowSelectionType?: 'checkbox' | 'radio';
    labelWidth?: number;
}
