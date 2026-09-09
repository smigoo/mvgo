/**
 * 🛡️ 容错 JSON 提取/修复（治本 2026-09-03）：模型（尤 qwen3.7-plus）偶发「完成但 JSON 中部含非法字符」，
 * 严格 JSON.parse 直接抛错。这里做确定性后处理、而非依赖模型重生成：
 *   1. 剥离 ```json / ``` 围栏；2. 截取最外层平衡 {…}（吞掉前后废文本）；
 *   3. 去除 JSON 规范外的控制字符（中部非法字符主因）；4. 修复尾随逗号等常见语法损伤。
 * 修复后仍解析失败返回 null（交由上层回退）。
 *
 * 抽成零依赖纯函数：① 可被 jest 单测直接覆盖（避免拖入 LiteService 的重依赖与 import.meta 链）；
 * ② lite.service.ts 的 parseBrief / extractMicrocodeOutput 共用，行为单一可信源。
 */
export function repairJson(text: string): any | null {
  if (!text || typeof text !== 'string') return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  let raw = (fence ? fence[1] : text).trim();
  if (!raw) return null;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
  // 去除控制字符（保留 \t \n \r），模型偶发的裸控制符是 JSON 中部损坏主因
  raw = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  // 尾随逗号修复：}, ] 前的逗号
  raw = raw.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
