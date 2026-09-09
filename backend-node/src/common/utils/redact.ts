/**
 * 脱敏工具函数（递归剥离密钥类字段）
 * 用途：日志输出、SSE 广播、配置快照持久化等场景，避免敏感信息泄露
 */

const SECRET_KEY_REGEX = /(token|apikey|secret|password|authorization|access[_-]?token)/i;

/**
 * 递归脱敏对象中的密钥字段
 * @param value 待脱敏的值
 * @param replacement 替换文本，默认 '***REDACTED***'
 * @returns 脱敏后的深拷贝
 */
export function redactSecrets(value: any, replacement = '***REDACTED***'): any {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, replacement));
  }
  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY_REGEX.test(k) && typeof v === 'string') {
      out[k] = replacement;
    } else {
      out[k] = redactSecrets(v, replacement);
    }
  }
  return out;
}
