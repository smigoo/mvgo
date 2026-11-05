/**
 * 文档解析模式库（外置配置 — 新文档风格只改配置不改代码）
 * 铁律：解析器零业务词表，所有模式均为结构/语义通用规则
 */

// 章节标题同义词库（标题模糊匹配，不按章节号）
const SECTION_TITLES = {
  microcodeDesign: ['微码组件设计', '组件设计', '微码设计'],
  apiConfig: ['接口配置', '接口设计', 'API配置', '数据接口', '接口说明'],
  pageElements: ['页面元素', '元素清单', '界面元素', '组件元素'],
  interactions: ['交互设计', '交互说明', '交互事件', '交互逻辑'],
  initParams: ['初始化参数', '初始参数', '启动参数', '模块参数'],
  businessEvents: ['businessEvents', '业务事件'],
  businessStatuses: ['businessStatuses', '业务状态'],
  businessConfig: ['businessConfig', '业务配置'],
  cssVarConfig: ['cssVariableConfig', 'CSS变量配置', 'css变量'],
  funcDesc: ['功能说明', '功能描述', '概述'],
};

// 表格列名 → 语义归类（通用表格解析用）
const COLUMN_SEMANTICS = {
  fieldBinding: ['数据绑定', '绑定字段', '字段', '数据字段', '绑定'],
  controlType: ['控件类型', '元素类型', '组件类型'],
  description: ['说明', '描述', '备注'],
  paramName: ['参数名', '字段名', '名称', '元素名称', '事件 ID', '事件ID', '状态 ID', '状态ID', 'key', '接口编码'],
  paramType: ['类型', '参数类型', 'type'],
  paramDefault: ['默认值', '默认', 'default'],
  paramRequired: ['必填', '是否必填'],
};

// 控件类型词表（元素匹配归一化，可扩展）
const CONTROL_TYPE_VOCABULARY = {
  stat: ['数字卡片', '统计卡', '指标卡', '数值卡'],
  table: ['表格', '列表', '数据表'],
  chart: ['图表', '柱状图', '折线图', '饼图', '趋势图'],
  panel: ['折叠面板', '面板组', '手风琴'],
  tag: ['状态标签', '标签', '徽标'],
  form: ['表单', '输入框', '选择器'],
};

// 设计师注释文本过滤规则（与管线 pruneRedundantFields 同源）
const ANNOTATION_PREFIXES = ['*', '#'];

// 条件元素识别（描述含 "xxx > 0 时显示" 等条件式）
const CONDITIONAL_ELEMENT_RE = /[\w\u4e00-\u9fa5]+\s*[><=]+\s*\d+[\s\S]{0,20}(显示|展示|出现)/;

// req-d 工具链标记（mvgo 兼容，命中则四配置信任度最高）
const REQ_D_GENERATED_RE = /<!--\s*req-d-generated:\s*true\s*-->/;
const REQ_D_MERGE_RE = /<!--\s*req-d-last-merge:\s*(.+?)\s*-->/;

module.exports = {
  SECTION_TITLES,
  COLUMN_SEMANTICS,
  CONTROL_TYPE_VOCABULARY,
  ANNOTATION_PREFIXES,
  CONDITIONAL_ELEMENT_RE,
  REQ_D_GENERATED_RE,
  REQ_D_MERGE_RE,
};
