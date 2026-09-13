import {
  buildResourceUsageCorpus,
  isResourceUsedInCorpus,
  injectResourceImports,
  healUnavailableResourceRefs,
} from './resource-import-guard.js';

/**
 * 资源使用语料清洗回归测试（缺口②，2026-09-01）。
 *
 * 事故实证 mc-max-1788186816558-fb3a1a7b（last-good = r-4e644c37）：
 * 入口 package/index.vue 写 `<img :src="icon1" style="display:none" alt="" />` ——
 * 变量名确实出现在代码里，RES-UNUSED 判定因此认定「已使用」，但该图标**永远不渲染**，
 * 本质是用隐藏元素充数规避门禁（同一 revision 里 5 张 bg 则是真·未使用，两者都被放过）。
 *
 * 修复落在**语料层**（buildResourceUsageCorpus → sanitizeUsageCorpus）而非各个判定点：
 * 所有基于 corpus 的消费者（resource-mounter / resource-attribution-validator /
 * microcode-engineer）自动生效，不新增并行实现。
 *
 * 每组都带负面对照：确认剔除的是「假绑定」，正常渲染与条件显示（可能被 JS 切为可见）
 * 一律保留。
 */

const used = (files: Record<string, string>, m: any) =>
  isResourceUsedInCorpus(buildResourceUsageCorpus(files), m);

const icon1 = {
  assignedVarName: 'icon1',
  resourceFile: '../resources/images/icon1.png',
};

const bg = {
  assignedVarName: 'bg1',
  resourceFile: '../resources/images/bg-7890.png',
};

describe('buildResourceUsageCorpus 剔除不可见元素的假绑定', () => {
  it('display:none 的 img 引用 → 判为未使用（Task2 icon1 实锤形态）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <img :src="icon1" alt="" style="display:none" />
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(false);
  });

  it('visibility:hidden 的 img 引用 → 判为未使用', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <img :src="icon1" style="visibility:hidden" />
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(false);
  });

  it('v-show="false" 容器内的 img → 判为未使用（正则锚点陷阱回归）', () => {
    // ⚠️ 本用例专门锁一个实现陷阱：删除隐藏元素时若把正则写成「匹配任意标签 + 回调里
    // 判属性」，最外层非隐藏的 <template> 会先被匹配，lastIndex 直接跳过整段，
    // 嵌套在内的 <div v-show="false"> 永远等不到匹配 → 假绑定照样逃逸。
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <template v-if="true">
      <div v-show="false">
        <img :src="icon1" alt="" />
      </div>
    </template>
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(false);
  });

  it('v-show="false" 的单标签 → 判为未使用', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <img :src="icon1" v-show="false" />
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(false);
  });

  it('负面对照：正常可见的 img 引用 → 仍判为已使用', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <img :src="icon1" alt="icon" />
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(true);
  });

  it('负面对照：删隐藏元素不得误伤同文件其它可见引用（icon1 隐藏 / icon2 可见）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <img :src="icon1" style="display:none" />
    <img :src="icon2" alt="visible" />
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(false);
    expect(used(files, { assignedVarName: 'icon2' })).toBe(true);
  });

  it('负面对照：class 名为 hidden-box（可能由 JS 切为可见）不删除 → 仍判为已使用', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="hidden-box">
    <img :src="icon1" alt="icon" />
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(true);
  });
});

describe('buildResourceUsageCorpus 剔除注释引用', () => {
  it('HTML 注释里的引用 → 判为未使用', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <!-- <img :src="icon1" alt="" /> -->
  </div>
</template>`,
    };
    expect(used(files, icon1)).toBe(false);
  });

  it('LESS 块注释里的 url() 引用 → 判为未使用', () => {
    const files = {
      'resources/styles/common.less': `.c-monitor-root {
  /* background-image: url(../images/bg-7890.png); */
  width: 100%;
}`,
    };
    expect(used(files, bg)).toBe(false);
  });

  it('负面对照：LESS 里真实 url() 引用（文件名级兜底）→ 判为已使用', () => {
    const files = {
      'resources/styles/common.less': `.c-monitor-root {
  background-image: url(../images/bg-7890.png);
}`,
    };
    expect(used(files, bg)).toBe(true);
  });

  it('负面对照：不误删 `//` 行注释里的 http:// URL 文本', () => {
    // sanitize 刻意不处理 `//` 行注释——会误伤 `http://` 之类的 URL 文本
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <img :src="icon1" alt="icon" />
  </div>
</template>
<script setup>
// 参考 http://example.com/icon1 规范
</script>`,
    };
    expect(used(files, icon1)).toBe(true);
  });
});

describe('buildResourceUsageCorpus 剥离 import 声明行', () => {
  it('仅出现在 import 声明行的资源 → 判为未使用（不自证）', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root"></div>
</template>
<script setup>
import icon1 from '../resources/images/icon1.png'
</script>`,
    };
    expect(used(files, icon1)).toBe(false);
  });

  it('负面对照：import + 模板真实使用 → 判为已使用', () => {
    const files = {
      'package/index.vue': `<template>
  <div class="c-monitor-root">
    <img :src="icon1" alt="icon" />
  </div>
</template>
<script setup>
import icon1 from '../resources/images/icon1.png'
</script>`,
    };
    expect(used(files, icon1)).toBe(true);
  });
});

/**
 * W2：同资源双名别名转发（2026-09-01 事故 5 · mc-max-1788239096135-c19dfe56）。
 *
 * 实锤：bg-tab-active 同时有 assignedVarName='bg2' 与 semanticVarName='bgtabActive'。
 * LLM 在 index.vue 里两个名字都用了，指向同一张 bg-tab-active-7891.png。
 * 旧逻辑「同一 resourceFile 只 import 一次，保留首个命中」（P0-1b 去重）让 bg2 先命中，
 * bgtabActive 被跳过 → 该名字在 implicitlyDeclared 白名单里被门禁放行 → 运行时 undefined
 * → Tab 高亮背景静默丢失（对应日志「1 个文件存在未解析资源占位符」）。
 *
 * 修法：首个命中仍生成 import，后续同资源别名生成 `const alias = primary` 转发声明。
 */
describe('injectResourceImports 同资源双名别名转发', () => {
  const dualNameMapping: any[] = [
    {
      name: 'bg-tab-active',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg2',
      semanticVarName: 'bgtabActive',
      resourceFile: '../resources/images/bg-tab-active-7891.png',
      downloadStatus: 'success',
    },
    {
      name: 'icon',
      previewAnalysisRole: 'icon',
      assignedVarName: 'icon1',
      resourceFile: '../resources/images/icon-7941.png',
      downloadStatus: 'success',
    },
  ];

  const sfc = (templateBody: string) => `<template>
  <div class="c-root">
${templateBody}
  </div>
</template>
<script setup>
import MonitorTabs from './components/MonitorTabs.vue'
</script>`;

  it('模板同时用 bg2 与 bgtabActive（同资源双名）→ 两个名字都必须有绑定', () => {
    const out = injectResourceImports(
      sfc('    <MonitorTabs :bgtab-active="bgtabActive" />\n    <Chart :bg2="bg2" />'),
      dualNameMapping,
      '../resources/images/',
    );
    // 主名仍由 import 提供
    expect(out).toMatch(/import bg2 from '\.\.\/resources\/images\/bg-tab-active-7891\.png'/);
    // 别名必须由 const 转发提供，否则运行时 undefined → 背景静默丢失
    expect(out).toMatch(/const bgtabActive = bg2/);
  });

  it('负面对照：不同资源各自独立 import，不产生别名声明', () => {
    const out = injectResourceImports(
      sfc('    <img :src="icon1" />\n    <Chart :bg2="bg2" />'),
      dualNameMapping,
      '../resources/images/',
    );
    expect(out).toMatch(/import icon1 from '\.\.\/resources\/images\/icon-7941\.png'/);
    expect(out).toMatch(/import bg2 from '\.\.\/resources\/images\/bg-tab-active-7891\.png'/);
    expect(out).not.toMatch(/const bgtabActive/);
  });

  it('幂等：重复注入不产生重复 const 别名声明', () => {
    const once = injectResourceImports(
      sfc('    <MonitorTabs :bgtab-active="bgtabActive" />\n    <Chart :bg2="bg2" />'),
      dualNameMapping,
      '../resources/images/',
    );
    const twice = injectResourceImports(once, dualNameMapping, '../resources/images/');
    const aliasCount = (twice.match(/const bgtabActive = bg2/g) || []).length;
    expect(aliasCount).toBe(1);
  });
});

/**
 * 防御性审计（2026-09-01，W2 落地后的自查）：
 *
 * W2 让「同一资源可声明多个名字」（主名 import + 别名 const 转发），声明点数量从
 * 1 个/资源 涨到 N 个/资源 —— 撞名风险随之放大。而既有去重预处理（清除已有 import /
 * `const|let X =`）只覆盖三种形态，漏网三类：
 *   ① 解构声明 `const { bgtabActive } = defineProps(...)`
 *   ② 无赋值声明 `let bgtabActive;`
 *   ③ `var` 声明 `var bgtabActive = 1`（清理正则只写了 const|let）
 * 任一漏网 + 注入的 `const bgtabActive = bg2` → 重复声明 → SyntaxError，
 * 比原来的「静默 undefined」更糟（整块 SFC 编译失败）。
 *
 * 修法：清理后按 collectDeclaredBindings(cleanedCode) 复核，仍被声明的名字不再注入。
 * 顺带一并保护主名 import（该类撞名在 W2 之前就已存在，属同族隐患）。
 */
describe('injectResourceImports 注入声明不与既有声明撞名', () => {
  const dualNameMapping: any[] = [
    {
      name: 'bg-tab-active',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg2',
      semanticVarName: 'bgtabActive',
      resourceFile: '../resources/images/bg-tab-active-7891.png',
      downloadStatus: 'success',
    },
  ];

  /** 统计 script 段内对某名字的「声明语句」条数（>1 即重复声明 → SyntaxError） */
  const countDeclarations = (code: string, name: string) => {
    const script = code.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
    let n = 0;
    n += (script.match(new RegExp(`^\\s*import\\s+${name}\\s*(?:,|from)`, 'gm')) || [])
      .length;
    for (const m of script.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      if (m[1].split(',').some((s) => s.trim() === name)) n += 1;
    }
    for (const line of script.split('\n')) {
      const head = line.match(/^\s*(?:const|let|var)\s+(.*)$/);
      if (!head) continue;
      const rest = head[1];
      const destr = rest.match(/^\{([^}]*)\}/);
      if (destr) {
        if (
          destr[1]
            .split(',')
            .some((s) => s.trim().split(':').pop()!.trim() === name)
        ) {
          n += 1;
        }
        continue;
      }
      for (const decl of rest.split(',')) {
        if (new RegExp(`^\\s*${name}\\s*(?:=|;|$)`).test(decl)) n += 1;
      }
    }
    return n;
  };

  const sfcWith = (declLine: string) => `<template>
  <div class="c-root">
    <MonitorTabs :bgtab-active="bgtabActive" />
    <Chart :bg2="bg2" />
  </div>
</template>
<script setup>
import MonitorTabs from './components/MonitorTabs.vue'
${declLine}
</script>`;

  it('① 解构声明 const { bgtabActive } = ... → 不再注入别名（避免重复声明）', () => {
    const out = injectResourceImports(
      sfcWith('const { bgtabActive } = defineProps({ bgtabActive: String })'),
      dualNameMapping,
      '../resources/images/',
    );
    expect(countDeclarations(out, 'bgtabActive')).toBe(1);
    // LLM 自己的声明必须保留（不是被清掉再替换）
    expect(out).toMatch(/const \{ bgtabActive \} = defineProps/);
  });

  it('② 无赋值声明 let bgtabActive; → 不再注入别名', () => {
    const out = injectResourceImports(
      sfcWith('let bgtabActive;'),
      dualNameMapping,
      '../resources/images/',
    );
    expect(countDeclarations(out, 'bgtabActive')).toBe(1);
  });

  it('③ var bgtabActive = 1 → 不再注入别名（清理正则原本只写 const|let）', () => {
    const out = injectResourceImports(
      sfcWith('var bgtabActive = 1'),
      dualNameMapping,
      '../resources/images/',
    );
    expect(countDeclarations(out, 'bgtabActive')).toBe(1);
  });

  it('④ 多声明符第二位 const a = 1, bgtabActive = 2 → 不再注入别名', () => {
    const out = injectResourceImports(
      sfcWith('const a = 1, bgtabActive = 2'),
      dualNameMapping,
      '../resources/images/',
    );
    expect(countDeclarations(out, 'bgtabActive')).toBe(1);
  });

  it('主名同理：var bg2 = 1 时不再注入 import bg2（W2 之前的同族隐患一并修）', () => {
    const out = injectResourceImports(
      sfcWith('var bg2 = 1'),
      dualNameMapping,
      '../resources/images/',
    );
    expect(countDeclarations(out, 'bg2')).toBe(1);
  });

  it('负面对照：无同名声明时别名照常注入（不得过度防御）', () => {
    const out = injectResourceImports(sfcWith(''), dualNameMapping, '../resources/images/');
    expect(out).toMatch(/import bg2 from '\.\.\/resources\/images\/bg-tab-active-7891\.png'/);
    expect(out).toMatch(/const bgtabActive = bg2/);
    expect(countDeclarations(out, 'bgtabActive')).toBe(1);
  });

  it('负面对照：同名业务变量在模板而非 script 声明 → 不阻止注入', () => {
    const out = injectResourceImports(
      sfcWith('const chartTitle = 1'),
      dualNameMapping,
      '../resources/images/',
    );
    expect(out).toMatch(/const bgtabActive = bg2/);
    // 业务变量本身不受影响
    expect(out).toMatch(/const chartTitle = 1/);
  });
});

/**
 * W1：不可用资源变量引用自愈（2026-09-01 事故 5 · mc-max-1788239096135-c19dfe56）。
 *
 * 实锤：Figma 节点 tabs-icon 是资源容器（FRAME 含 2 个 icon 子节点）→ 容器拆分导出后
 * 自身不产出图片 → downloadStatus='missing'。LLM 从结构树看到节点名，无视 prompt 给出的
 * bg1/icon1/icon2 编号名，自行拼出驼峰变量 icontabsIcon 写进模板 → 该名字不在
 * buildVarToMapping（只收 success）也不在语义门禁白名单 → 判「模板引用未声明变量」
 * → fail-closed。而下一轮 LLM 看到的仍是同一棵结构树 → 确定性复现同一臆造
 * （两轮报错逐字相同）→ 重试预算纯浪费、任务必失败。
 *
 * 修法：落盘前确定性剔除这类「注定拿不到绑定的资源变量」引用，让门禁放行。
 */
describe('healUnavailableResourceRefs 剔除不可用资源变量引用', () => {
  // 与事故任务 resource-dom-mapping.json 同构（7 条精简为 5 条）
  const accidentMapping: any[] = [
    {
      name: 'bg',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg1',
      resourceFile: '../resources/images/bg-7890.png',
      downloadStatus: 'success',
    },
    {
      name: 'bg-tab-active',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg2',
      semanticVarName: 'bgtabActive',
      resourceFile: '../resources/images/bg-tab-active-7891.png',
      downloadStatus: 'success',
    },
    {
      name: 'tabs-icon',
      previewAnalysisRole: 'icon',
      semanticVarName: 'icontabsIcon',
      downloadStatus: 'missing',
    },
    {
      name: 'icon',
      previewAnalysisRole: 'icon',
      assignedVarName: 'icon1',
      resourceFile: '../resources/images/icon-7941.png',
      downloadStatus: 'success',
    },
    {
      name: 'icon',
      previewAnalysisRole: 'icon',
      assignedVarName: 'icon2',
      resourceFile: '../resources/images/icon-7945.png',
      downloadStatus: 'success',
    },
  ];

  it('missing 容器资源的臆造语义名（icontabsIcon）→ 剔除该属性绑定', () => {
    const files = {
      'package/index.vue': `<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <MonitorTabs
        :bg1="bg1"
        :bgtab-active="bgtabActive"
        :icontabs-icon="icontabsIcon"
        :icon1="icon1"
      />
    </div>
  </base-panel>
</template>
<script setup>
import MonitorTabs from './components/MonitorTabs.vue'
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, accidentMapping);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].vars).toContain('icontabsIcon');
    // 死变量引用被剔除
    expect(files['package/index.vue']).not.toMatch(/icontabsIcon/);
    // 健康绑定必须原样保留
    expect(files['package/index.vue']).toMatch(/:bg1="bg1"/);
    expect(files['package/index.vue']).toMatch(/:bgtab-active="bgtabActive"/);
    expect(files['package/index.vue']).toMatch(/:icon1="icon1"/);
  });

  it('负面对照：success 资源变量（bg1 / bgtabActive）引用不被剔除', () => {
    const files = {
      'package/index.vue': `<template>
  <div>
    <MonitorTabs :bg1="bg1" :bgtab-active="bgtabActive" />
  </div>
</template>
<script setup>
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, accidentMapping);
    expect(fixes).toHaveLength(0);
    expect(files['package/index.vue']).toMatch(/:bgtab-active="bgtabActive"/);
    expect(files['package/index.vue']).toMatch(/:bg1="bg1"/);
  });

  it('url(${deadVar}) 出现在三元/对象插值内 → 替换为 none（不删整条属性）', () => {
    const files = {
      'package/index.vue': `<template>
  <div :style="active === tab ? { backgroundImage: \`url(\${icontabsIcon})\` } : {}"></div>
</template>
<script setup>
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, accidentMapping);
    expect(fixes).toHaveLength(1);
    expect(files['package/index.vue']).not.toMatch(/\$\{icontabsIcon\}/);
    // 插值整段降级为 CSS 合法的 `none`（而非留下 url(undefined) 这类坏值）
    expect(files['package/index.vue']).toMatch(/backgroundImage: `none`/);
    // 三元结构本身保留
    expect(files['package/index.vue']).toMatch(/active === tab \?/);
  });

  it('臆造编号（bg9，映射中不存在）→ 剔除绑定', () => {
    const files = {
      'package/index.vue': `<template>
  <div :bg9="bg9"></div>
</template>
<script setup>
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, accidentMapping);
    expect(fixes).toHaveLength(1);
    expect(files['package/index.vue']).not.toMatch(/bg9/);
  });

  it('负面对照：script 中已声明的同名变量 → 视为业务变量，不处理', () => {
    const files = {
      'package/index.vue': `<template>
  <div :bg9="bg9"></div>
</template>
<script setup>
const bg9 = 'some-business-value'
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, accidentMapping);
    expect(fixes).toHaveLength(0);
    expect(files['package/index.vue']).toMatch(/:bg9="bg9"/);
  });

  it('W1.1 边界：defineProps({ bg2 }) 声明的业务 prop → 不误杀（mapping 无 bg2）', () => {
    // 业务 prop 恰好叫 bg2（编号形态），但 mapping 里没有 bg2 这个资源名。
    // collectDeclaredBindings 若不识别 defineProps，bg2 会被当成臆造编号剥掉模板引用。
    const mapping = [
      { name: 'icon', previewAnalysisRole: 'icon', assignedVarName: 'icon1', resourceFile: 'icon1.png', downloadStatus: 'success' },
    ];
    const files = {
      'package/index.vue': `<template>
  <img :src="bg2" />
</template>
<script setup>
const props = defineProps({ bg2: String })
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, mapping);
    expect(fixes).toHaveLength(0);
    expect(files['package/index.vue']).toMatch(/:src="bg2"/);
  });

  it('W1.1 边界：臆造变量 ${X} 裸插值（非 url）→ 剥成空，避免语义门禁 fail-closed', () => {
    // `:src="\`/assets/\${bg9}.png\`"` 这种形态：a（非纯变量）/b（无 url）/c（无 url）/d（非 {{ }}）
    // 四种模式都剥不掉，但 sfc-semantics 会把 ${bg9} 里的 bg9 识别为「未声明变量」→ fail-closed。
    const files = {
      'package/index.vue': `<template>
  <img :src="\`/assets/\${bg9}.png\`" />
</template>
<script setup>
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, accidentMapping);
    expect(fixes).toHaveLength(1);
    expect(files['package/index.vue']).not.toMatch(/\$\{bg9\}/);
  });

  it('W1.1 反例固化：下划线变量名 sub_bg1 → numberedPattern 不误命中', () => {
    // `_` 是 \w，`sub_bg1` 的 bg1 前无单词边界 → \b(bg|icon|img)(\d+)\b 不应命中。
    // 固化为反例，防止未来把 \b 边界去掉导致误伤下划线变量名。
    const files = {
      'package/index.vue': `<template>
  <div :class="sub_bg1"></div>
</template>
<script setup>
</script>`,
    };
    const fixes = healUnavailableResourceRefs(files, accidentMapping);
    expect(fixes).toHaveLength(0);
    expect(files['package/index.vue']).toMatch(/:class="sub_bg1"/);
  });
});

/**
 * P0 幂等性回归（2026-09-02 事故 mc-max-1788349718313-24e63b7c / mc-max-1788345051113-d22deaea）。
 *
 * 症状：生成过程中预览正常（echarts 已渲染），终态产物却报 `echarts is not defined` ——
 * 「一开始好、最后坏」。
 *
 * 根因：去重正则尾段 `\s*;?\s*.*$` 中的 `\s` **匹配换行符**，删除「重复的资源 import」时越过空行，
 * 再由 `.*$` 把**紧随其后的下一条 import 整行吞掉**。于是每调用一次 injectResourceImports 就吃掉
 * 一行运行库 import（实测：第 2 次丢 vue、第 3 次丢 echarts）。当天新增的「资源 import 终验兜底注入」
 * （microcode-engineer.js:5546-5570）制造了第二次调用 → 幂等性被破坏 → 好产物被改坏。
 *
 * 本组把「重复注入 N 次仍不丢运行库 import」固化成契约，防止正则再次放宽回 `\s` / `.*$`。
 */
describe('injectResourceImports 幂等性：重复注入不得误删紧随其后的运行库 import', () => {
  const iconMapping = [
    { assignedVarName: 'icon3', resourceFile: '../resources/images/icon-3561.png', downloadStatus: 'success' },
  ];
  const REL = '../../resources/images/';

  /** 事故现场形态：icon3 在首行，紧随其后是 vue（单行具名）+ echarts（默认导入） */
  const withIcon = (extra = '') => `<template>
  <div class="c-monitor-flow-prediction-root"><img :src="icon3" alt="" /></div>
</template>
<script setup>
import icon3 from '../../resources/images/icon-3561.png'

import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
${extra}
const chart = ref(null);
onMounted(() => { chart.value = echarts.init(document.getElementById('x')); });
</script>
<style scoped>
.root { width: 100%; }
</style>`;

  const count = (code: string) => ({
    vue: (code.match(/^import[^\n]*from\s*['"]vue['"]/gm) || []).length,
    echarts: (code.match(/import\s*\*\s*as\s+echarts/g) || []).length,
    icon: (code.match(/^import\s+icon3\s+from/gm) || []).length,
  });

  it('首次注入：补上 icon3，vue / echarts 保持不动', () => {
    const src = withIcon().replace(/^import icon3 from[^\n]*\n\n/m, '');
    const out = injectResourceImports(src, iconMapping, REL);
    expect(count(out)).toEqual({ vue: 1, echarts: 1, icon: 1 });
  });

  it('P0：第二次注入（终验兜底）不得丢掉紧随其后的 vue import', () => {
    const once = injectResourceImports(withIcon(), iconMapping, REL);
    expect(count(once)).toEqual({ vue: 1, echarts: 1, icon: 1 });
    const twice = injectResourceImports(once, iconMapping, REL);
    expect(count(twice)).toEqual({ vue: 1, echarts: 1, icon: 1 });
  });

  it('P0：第二次与第三次注入结果完全一致（幂等契约）', () => {
    const once = injectResourceImports(withIcon(), iconMapping, REL);
    const twice = injectResourceImports(once, iconMapping, REL);
    const third = injectResourceImports(twice, iconMapping, REL);
    expect(third).toBe(twice);
    expect(count(third)).toEqual({ vue: 1, echarts: 1, icon: 1 });
  });

  it('多行具名 import 形态同样不被吞', () => {
    const src = `<template><div :class="icon3"></div></template>
<script setup>
import icon3 from '../../resources/images/icon-3561.png'

import {
  ref,
  onMounted
} from 'vue'
const a = ref(1);
onMounted(() => {});
</script>`;
    const out = injectResourceImports(src, iconMapping, REL);
    expect(count(out).vue).toBe(1);
    expect(count(out).icon).toBe(1);
  });

  it('负面对照：确实重复的旧资源 import 仍被去重（不得过度防御）', () => {
    const src = `<template><div :class="icon3"></div></template>
<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import icon3 from './somewhere-else/icon-3561.png'
const x = 1;
</script>`;
    const out = injectResourceImports(src, iconMapping, REL);
    expect(count(out).icon).toBe(1);
    expect(out).toMatch(/import icon3 from '\.\.\/\.\.\/resources\/images\/icon-3561\.png'/);
    expect(out).not.toMatch(/somewhere-else/);
  });
});

/**
 * #478 覆盖丢失类 · 门禁检测「bg 被 gradient 替代」（2026-09-01）—— 已整体移除。
 *
 * 移除背景（2026-09-01 · mc-max-1788252098143-12469472 实锤）：findGradientBgSubstitute 用
 * `[^{}]*${mountTarget}[^{}]*\{...\}` 无边界子串正则定位选择器规则块，mountTarget 为单字符
 * （如 Figma 图层名 't'）时匹配过宽，误伤一切含该字符的选择器 → RESOURCE-003 误报 BLOCK
 * （被咬中的渐变是 Figma 渐变文字「流量监测」的正确还原，非 bg 替代），L0-B 重试 3 轮逐字
 * 复现耗尽 → 生成失败。判定已从 L0-B 门禁与 adversarial-checker 全量移除。
 */

describe('刀 7e：注释里的资源变量名不得触发注入（device 主内容区 CODE-022 治本）', () => {
  const mapping: any[] = [
    {
      name: 'bg-main',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg1',
      resourceFile: '../resources/images/bg-8788.png',
      downloadStatus: 'success',
    },
    {
      name: 'icon-panel',
      previewAnalysisRole: 'icon',
      assignedVarName: 'icon1',
      resourceFile: '../resources/images/icon-8817.png',
      downloadStatus: 'success',
    },
    {
      name: 'bg-card',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg4',
      resourceFile: '../resources/images/bg-8439.png',
      downloadStatus: 'success',
    },
  ];

  it('负面对照：仅在注释里枚举 bg1/icon1 → 不注入（旧实现误注 → CODE-022）', () => {
    const sfc = `<template>
  <div :style="{ backgroundImage: \`url(\${bg4})\` }" />
</template>
<script setup>
// 系统自动注入 bg1~bg14、icon1~icon14，无需手写 import
const x = 1
</script>`;
    const out = injectResourceImports(sfc, mapping, '../resources/images/');
    // bg4 真使用 → 注入；bg1/icon1 仅注释提及 → 不得注入
    expect(out).toMatch(/import bg4 from '\.\.\/resources\/images\/bg-8439\.png'/);
    expect(out).not.toMatch(/import bg1 /);
    expect(out).not.toMatch(/import icon1 /);
  });

  it('正面对照：真实引用仍注入', () => {
    const sfc = `<template>
  <img :src="icon1" />
</template>
<script setup>
const x = 1
</script>`;
    const out = injectResourceImports(sfc, mapping, '../resources/images/');
    expect(out).toMatch(/import icon1 from '\.\.\/resources\/images\/icon-8817\.png'/);
  });
});
