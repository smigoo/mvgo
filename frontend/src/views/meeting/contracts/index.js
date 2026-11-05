// S3 / S4 契约层统一入口
export {
  CONTRACT_VERSION,
  SOURCE_STATES,
  CONFIRM_STATES,
  DRAFT_TOP_LEVEL,
  FIELD_REQUIRED,
  TEMPLATE_SCHEMAS,
  schemaOf,
  validateFieldShape,
  validateDraftShape,
  selfCheckContracts
} from './draft-schema.js'

export {
  OUTPUT_TARGETS,
  BACKEND_ENDPOINTS,
  RUN_STATUS,
  RUN_TRANSITIONS,
  canTransition,
  assertTransition,
  CONSENT_STATUS,
  CONSENT_TRANSITIONS,
  canConsentTransition,
  DB_TABLES,
  BACKEND_DEPENDENCIES,
  backendReadiness,
  consentRetentionContractCheck,
  selfCheckApiContract
} from './api-contract.js'
