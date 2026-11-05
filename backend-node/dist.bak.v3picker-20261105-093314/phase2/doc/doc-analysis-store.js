/**
 * doc-analysis 存储器
 * 职责：schema 轻量校验 + .mc-doc/ 落盘 + 缓存读取（docHash 命中）
 * 存储位置：组件目录/.mc-doc/{source-requirement.md, doc-analysis.json}
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA = require('./doc-analysis.schema.js');

/** 轻量 schema 校验（不引入 ajv，覆盖 required/type/enum 主路径） */
function validate(analysis) {
  const errors = [];
  const checkType = (val, type, field) => {
    if (val === undefined) return;
    const t = Array.isArray(val) ? 'array' : typeof val;
    const ok = Array.isArray(type) ? type.includes(t) : t === type || (type === 'object' && t === 'object' && val !== null);
    if (!ok) errors.push(`${field}: 期望 ${type}，实际 ${t}`);
  };
  const walk = (obj, schema, prefix) => {
    if (!schema || !schema.properties) return;
    for (const req of schema.required || []) {
      if (obj[req] === undefined) errors.push(`${prefix}${req}: 缺失必填字段`);
    }
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (obj[k] === undefined) continue;
      checkType(obj[k], sub.type, `${prefix}${k}`);
      if (sub.enum && obj[k] !== undefined && !sub.enum.includes(obj[k])) {
        errors.push(`${prefix}${k}: 值 ${obj[k]} 不在枚举 ${sub.enum.join('/')}`);
      }
      if (sub.type === 'object' && typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        walk(obj[k], sub, `${prefix}${k}.`);
      }
      if (sub.type === 'array' && Array.isArray(obj[k]) && sub.items) {
        obj[k].forEach((item, i) => {
          if (sub.items.required && typeof item === 'object') {
            for (const req of sub.items.required) {
              if (item[req] === undefined) errors.push(`${prefix}${k}[${i}].${req}: 缺失必填字段`);
            }
          }
        });
      }
    }
  };
  walk(analysis, SCHEMA, '');
  return { valid: errors.length === 0, errors };
}

/** 组件 .mc-doc/ 目录 */
function mcDocDir(componentDir) {
  const dir = path.join(componentDir, '.mc-doc');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 落盘：原文 + 分析产物 */
function save(componentDir, docMarkdown, analysis) {
  const v = validate(analysis);
  if (!v.valid) {
    const err = new Error(`doc-analysis schema 校验失败: ${v.errors.join('; ')}`);
    err.validationErrors = v.errors;
    throw err;
  }
  const dir = mcDocDir(componentDir);
  fs.writeFileSync(path.join(dir, 'source-requirement.md'), docMarkdown, 'utf-8');
  fs.writeFileSync(path.join(dir, 'doc-analysis.json'), JSON.stringify(analysis, null, 2), 'utf-8');
  return { dir, files: ['source-requirement.md', 'doc-analysis.json'] };
}

/** 读取缓存（docHash 命中即复用） */
function loadCached(componentDir, md) {
  const file = path.join(componentDir, '.mc-doc', 'doc-analysis.json');
  if (!fs.existsSync(file)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const hash = crypto.createHash('sha256').update(md).digest('hex');
    if (cached.docHash === hash) return cached;
    return { stale: true, cached };
  } catch {
    return null;
  }
}

module.exports = { validate, save, loadCached, mcDocDir, SCHEMA };
