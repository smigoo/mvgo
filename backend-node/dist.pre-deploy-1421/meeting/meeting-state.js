"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_STATES = exports.CONFIRM_STATES = exports.TEMPLATE_SCHEMAS = exports.CONSENT_TRANSITIONS = exports.CONSENT_STATUS = exports.RUN_TRANSITIONS = exports.RUN_STATUS = void 0;
exports.canTransition = canTransition;
exports.canConsentTransition = canConsentTransition;
exports.requiredFieldsOf = requiredFieldsOf;
exports.schemaOf = schemaOf;
exports.RUN_STATUS = ['排队中', '处理中', '待确认', '已定稿', '失败'];
exports.RUN_TRANSITIONS = Object.freeze({
    排队中: ['处理中', '失败'],
    处理中: ['待确认', '失败'],
    待确认: ['已定稿', '失败'],
    已定稿: [],
    失败: ['处理中'],
});
function canTransition(from, to) {
    return (exports.RUN_TRANSITIONS[from] || []).includes(to);
}
exports.CONSENT_STATUS = ['未发起', '征集中', '已通过', '已阻断', '已撤回'];
exports.CONSENT_TRANSITIONS = Object.freeze({
    未发起: ['征集中'],
    征集中: ['已通过', '已阻断', '已撤回'],
    已通过: ['已阻断', '已撤回'],
    已阻断: ['已撤回', '征集中'],
    已撤回: ['征集中'],
});
function canConsentTransition(from, to) {
    return (exports.CONSENT_TRANSITIONS[from] || []).includes(to);
}
exports.TEMPLATE_SCHEMAS = Object.freeze({
    progress_review: {
        id: 'progress_review',
        version: 'v1',
        label: '工作进度会',
        required: Object.freeze(['topic_context', 'progress_summary', 'milestone_status', 'open_issues']),
    },
    requirement_review: {
        id: 'requirement_review',
        version: 'v1',
        label: '需求方案会',
        required: Object.freeze(['topic_context', 'options', 'conclusion', 'open_questions']),
    },
    other: {
        id: 'other',
        version: 'v1',
        label: '其他会议',
        required: Object.freeze(['topic_context', 'progress_summary', 'open_issues']),
    },
});
function requiredFieldsOf(meetingType) {
    return (exports.TEMPLATE_SCHEMAS[meetingType] || exports.TEMPLATE_SCHEMAS.other).required ?? [];
}
function schemaOf(meetingType) {
    return exports.TEMPLATE_SCHEMAS[meetingType] || exports.TEMPLATE_SCHEMAS.other;
}
exports.CONFIRM_STATES = ['未确认', '编辑中', '已确认', '已驳回'];
exports.SOURCE_STATES = ['from_meeting', 'from_background', 'unconfirmed'];
//# sourceMappingURL=meeting-state.js.map