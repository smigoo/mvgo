/**
 * 脱敏工具函数（剥离密钥类字段）
 * 用途：日志输出、SSE 广播、配置快照持久化等场景，避免敏感信息泄露
 */

const SECRET_KEY_REGEX = /(token|apikey|secret|password|authorization|access[_-]?token)/i;

/** 循环引用占位（保证结果可被 JSON.stringify 序列化，不因循环而丢整条快照） */
const CIRCULAR = '[Circular]';

/** 数组/对象容器构造（保持原类型，数组保长度） */
function makeContainer(src: any): any {
  return Array.isArray(src) ? new Array(src.length) : {};
}

/**
 * 递归脱敏对象中的密钥字段。
 *
 * 🛡️ 治本（2026-09-18 · 任务成功后进程崩溃实锤 autosave/persist）：
 *   旧实现是「纯递归」，一旦入参存在**循环引用**（内存态 task.result / progress
 *   details 可能含回指父对象的引用）就无限展开 → `RangeError: Maximum call stack
 *   size exceeded`。JSON.stringify 会拒绝循环结构（先报错、被上层 catch），但
 *   redactSecrets 不设防 → 在 `ProgressService.sendComplete`（无 try/catch）中
 *   抛出未捕获异常，**直接杀掉后端进程**（b58918b5 / 80648377 / 9967c679 /
 *   c2026822 四轮复现，任务本身均已成功、产物完整）。
 *
 * 现改为**迭代式（显式栈）**遍历：
 *   ① 用「当前递归路径」WeakSet 做循环检测（兄弟节点共享同一引用不算循环，
 *      不误伤 DAG 复用；只有真正的祖先回指才判循环）；
 *   ② 循环引用替换为 `'[Circular]'` 占位 → 结果永远可序列化，任务快照不再整条丢失；
 *   ③ 遍历深度受堆内存约束，不再受调用栈约束 → 任意深度都不爆栈。
 *
 * 语义与旧实现保持一致：仅「键名命中密钥正则且值为字符串」才替换为 replacement，
 * Date/RegExp 等无自有可枚举键的对象仍产出 `{}`（不做额外类型还原）。
 *
 * @param value 待脱敏的值
 * @param replacement 替换文本，默认 '***REDACTED***'
 * @returns 脱敏后的深拷贝（循环引用处为 '[Circular]' 占位）
 */
export function redactSecrets(value: any, replacement = '***REDACTED***'): any {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  const path = new WeakSet<object>();
  const result = makeContainer(value);
  /** 待处理栈帧：{ src 源容器, dst 目标容器, keys 待遍历键, idx 游标 } */
  const stack: Array<{ src: any; dst: any; keys: string[]; idx: number }> = [
    { src: value, dst: result, keys: Object.keys(value), idx: 0 },
  ];
  path.add(value);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.idx >= frame.keys.length) {
      path.delete(frame.src); // 离开该节点：移出当前路径
      stack.pop();
      continue;
    }
    const key = frame.keys[frame.idx++];
    const child = frame.src[key];

    if (child === null || typeof child !== 'object') {
      frame.dst[key] =
        SECRET_KEY_REGEX.test(key) && typeof child === 'string' ? replacement : child;
      continue;
    }
    if (path.has(child)) {
      frame.dst[key] = CIRCULAR; // 祖先回指 → 占位，保证可序列化
      continue;
    }
    const childOut = makeContainer(child);
    frame.dst[key] = childOut;
    path.add(child);
    stack.push({ src: child, dst: childOut, keys: Object.keys(child), idx: 0 });
  }

  return result;
}

/**
 * 循环安全 JSON 序列化：仅把「祖先回指」替换为 `'[Circular]'` 占位，保证**永不抛错**。
 *
 * 🛡️ 治本（2026-09-29 · SSE 重连分支整条事件丢失实锤）：
 *   `ProgressService#sendEvent` 等**出口**若直接 `JSON.stringify(data)`，一旦载荷含循环引用
 *   （生成期 `microcode-engineer.js:5578` 注入的 `__parent` 反链 × `children`）就抛
 *   `Converting circular structure to JSON` ⇒ 该次推送**整条丢失**、只剩一行 WARN。
 *   实测 **18 次**、跨三代进程，且 `stripParentRefs`（REST 详情/列表）与
 *   `sendComplete#redactSecrets` 已各修一轮，仍**漏掉 SSE 重连分支**
 *   ⇒ 与其在每个调用点各自剥离（出口有 6 类：REST 列表/详情 + SSE 首连/重连 + 落库 + 日志），
 *   不如在**序列化这一单点**兜底，任何调用路径都不会再因循环丢事件。
 *
 * 与 `redactSecrets` 的分工（**循环判定口径同源**：只判祖先回指，兄弟共享同一引用不误伤）：
 *   - `redactSecrets` = 深拷贝 + 密钥脱敏（Date/RegExp 因无自有可枚举键会退化为 `{}`）；
 *   - 本函数 = **replacer 原地遍历**，保留 Date/RegExp/数字/布尔的原生序列化语义，只处理循环。
 *
 * @param value 任意待序列化值
 * @param space 同 `JSON.stringify` 的缩进参数
 */
export function safeJsonStringify(value: any, space?: string | number): string {
  // 路径栈：只保留「根 → 当前节点」的祖先链，离开该分支即弹出
  const ancestors: any[] = [];
  return (
    JSON.stringify(
      value,
      function (this: any, _key: string, val: any) {
        if (typeof val !== 'object' || val === null) return val;
        // replacer 的 `this` = 直接持有 val 的容器 ⇒ 用它把栈回退到当前路径
        while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
          ancestors.pop();
        }
        if (ancestors.includes(val)) return CIRCULAR;
        ancestors.push(val);
        return val;
      },
      space,
    ) ?? ''
  );
}
