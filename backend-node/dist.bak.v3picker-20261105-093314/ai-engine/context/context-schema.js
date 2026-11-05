export const GENERATION_INPUT_SCHEMA_VERSION = 1

export const CONTEXT_LIMITS = Object.freeze({
  totalBytes: 30 * 1024,
  designFactsBytes: 12 * 1024,
  componentPlanBytes: 8 * 1024,
  resourceManifestBytes: 30 * 1024,
  currentIssuesBytes: 4 * 1024,
  maxIssues: 20,
})

export const TRUST_LEVELS = Object.freeze({
  TRUSTED: 'trusted',
  RESTRICTED: 'restricted',
  BLOCKED: 'blocked',
})

export const GENERATION_INPUT_FIELDS = Object.freeze([
  'schemaVersion',
  'designFacts',
  'componentPlan',
  'resourceManifest',
  'currentIssues',
  'trustVerdict',
  'contextManifest',
])

export const RAW_CONTEXT_FIELDS = Object.freeze([
  'figmaData',
  'figmaNodeData',
  'figmaStyleTree',
  'visualAnalysis',
  'visualElements',
  'reviewResult',
  'styleMappings',
  'previousCritiques',
])

export function assertGenerationInputShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('generationInput 必须是对象')
  }

  const unexpected = Object.keys(input).filter((key) => !GENERATION_INPUT_FIELDS.includes(key))
  if (unexpected.length > 0) {
    throw new Error(`generationInput 含未声明字段: ${unexpected.join(', ')}`)
  }

  const leakedRawFields = RAW_CONTEXT_FIELDS.filter((field) => Object.hasOwn(input, field))
  if (leakedRawFields.length > 0) {
    throw new Error(`generationInput 泄漏原始上下文字段: ${leakedRawFields.join(', ')}`)
  }

  if (input.schemaVersion !== GENERATION_INPUT_SCHEMA_VERSION) {
    throw new Error(`generationInput schemaVersion 不支持: ${input.schemaVersion}`)
  }

  if (!Object.values(TRUST_LEVELS).includes(input.trustVerdict?.level)) {
    throw new Error(`generationInput trustVerdict.level 无效: ${input.trustVerdict?.level}`)
  }

  return input
}
